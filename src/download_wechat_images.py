#!/usr/bin/env python3
"""
Download WeChat chat-log images and keep the largest locally available copy.

Sources, in priority order:
1. Nearby files in the local WeChat attach/Img directory that share the same base id
   (plain id, _h, _t variants; choose the largest decodable image).
2. wechatlog's http://127.0.0.1:5030/image/... endpoint as a fallback.

Outputs:
- images/{wechatlog_hash}.{ext}: best display/original image used by the site.
- images/manifest.json: maps each wechatlog hash to its actual extension/source/size.

This script does not shrink or recompress images. If WeChat only has a thumbnail cached,
the thumbnail is preserved, but whenever a larger _h/plain original exists it wins.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image
except Exception:  # pragma: no cover - pillow is expected on the local machine
    Image = None

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
IMAGES_DIR = BASE_DIR / "images"
MANIFEST_PATH = IMAGES_DIR / "manifest.json"
WECHAT_FILES_ROOT = (
    Path.home()
    / "Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files"
)
IMAGE_RE = re.compile(r"!\[[^\]]*\]\((http://127\.0\.0\.1:5030/image/([^,]+),([^\)]+))\)")
SAFE_HASH_RE = re.compile(r"^[A-Fa-f0-9]{32,64}$")
ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}


@dataclass
class ImageRef:
    hash: str
    rel_path: str
    url: str
    data_file: Path


def is_safe_hash(img_hash: str) -> bool:
    return bool(SAFE_HASH_RE.fullmatch(str(img_hash or "")))


def is_relative_safe_path(rel_path: str) -> bool:
    rel = Path(str(rel_path or ""))
    if rel.is_absolute():
        return False
    return all(part not in {"", ".", ".."} for part in rel.parts)


def is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def iter_image_refs(groups: list[str] | None = None, dates: list[str] | None = None) -> Iterable[ImageRef]:
    date_set = set(dates or [])
    group_dirs = [DATA_DIR / g for g in groups] if groups else [p for p in DATA_DIR.iterdir() if p.is_dir()]
    seen: set[str] = set()
    for group_dir in group_dirs:
        if not group_dir.exists():
            continue
        for json_file in sorted(group_dir.glob("*_raw.json")):
            digest_id = json_file.stem.removesuffix("_raw")
            if date_set and digest_id not in date_set:
                continue
            text = json_file.read_text(encoding="utf-8")
            for match in IMAGE_RE.finditer(text):
                url, img_hash, rel_path = match.groups()
                if not is_safe_hash(img_hash):
                    print(f"skip unsafe image hash in {json_file}: {img_hash!r}", file=sys.stderr)
                    continue
                if not is_relative_safe_path(rel_path):
                    print(f"skip unsafe image rel_path in {json_file}: {rel_path!r}", file=sys.stderr)
                    continue
                # The same hash can appear multiple times; download once.
                if img_hash in seen:
                    continue
                seen.add(img_hash)
                yield ImageRef(hash=img_hash, rel_path=rel_path, url=url, data_file=json_file)


def sniff_ext(path: Path) -> str | None:
    try:
        header = path.read_bytes()[:16]
    except Exception:
        return None
    if header.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "webp"
    if header.startswith(b"BM"):
        return "bmp"
    return None


def image_dimensions(path: Path) -> tuple[int, int] | None:
    if Image is None:
        return None
    try:
        with Image.open(path) as img:
            return img.size
    except Exception:
        return None


def is_decodable_image(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size == 0:
        return False
    if Image is not None:
        return image_dimensions(path) is not None
    return sniff_ext(path) is not None


def score(path: Path) -> tuple[int, int, int]:
    """Prefer largest area, then byte size, then high/plain variants over thumbnails."""
    dims = image_dimensions(path) or (0, 0)
    area = dims[0] * dims[1]
    name = path.name
    variant_bonus = 2 if "_h." in name or "_h_" in name else (1 if not "_t." in name and not "_t_" in name else 0)
    return area, path.stat().st_size, variant_bonus


def candidate_paths(ref: ImageRef) -> list[Path]:
    # rel_path example: msg/attach/.../2026-05/Img/abc123
    if not is_relative_safe_path(ref.rel_path):
        return []
    rel = Path(ref.rel_path)
    base_name = rel.name
    rel_parent = rel.parent
    suffixes = ["", "_h", "_t"]
    # Favor explicit image files before encrypted .dat placeholders. Some _h.png
    # files sit next to undecodable _h.dat files with nearly identical sizes.
    exts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", "", ".dat"]
    names = [base_name + suffix + ext for suffix in suffixes for ext in exts]

    roots: list[Path] = []
    # Most URLs are relative to xwechat_files/{account}/.
    if WECHAT_FILES_ROOT.exists():
        roots.extend(p for p in WECHAT_FILES_ROOT.iterdir() if p.is_dir())
    # Also try absolute-ish fallback under the configured root in case layout changes.
    roots.append(WECHAT_FILES_ROOT)

    candidates: list[Path] = []
    for root in roots:
        parent = root / rel_parent
        for name in names:
            p = parent / name
            if p.exists() and is_under(p, WECHAT_FILES_ROOT):
                candidates.append(p)
    # Deduplicate while preserving order.
    result = []
    seen = set()
    for p in candidates:
        key = str(p.resolve())
        if key not in seen:
            seen.add(key)
            result.append(p)
    return result


def copy_best_local(ref: ImageRef, out_dir: Path) -> dict | None:
    if not is_safe_hash(ref.hash):
        return None
    candidates = [p for p in candidate_paths(ref) if is_decodable_image(p)]
    if not candidates:
        return None
    best = max(candidates, key=score)
    ext = sniff_ext(best) or best.suffix.lstrip(".").lower() or "jpg"
    if ext == "jpeg":
        ext = "jpg"
    dest = out_dir / f"{ref.hash}.{ext}"
    shutil.copy2(best, dest)
    dims = image_dimensions(dest)
    return {
        "file": dest.name,
        "source": "wechat-local",
        "source_path": str(best),
        "bytes": dest.stat().st_size,
        "width": dims[0] if dims else None,
        "height": dims[1] if dims else None,
        "sha256": sha256(dest),
    }


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_via_wechatlog(ref: ImageRef, out_dir: Path) -> dict | None:
    if not is_safe_hash(ref.hash):
        return None
    try:
        req = urllib.request.Request(ref.url, headers={"User-Agent": "HermesImageDownloader/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return None
            data = resp.read()
    except Exception:
        return None
    if not data:
        return None
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        if not is_decodable_image(tmp_path):
            return None
        ext = sniff_ext(tmp_path) or "jpg"
        dest = out_dir / f"{ref.hash}.{ext}"
        shutil.move(str(tmp_path), dest)
        dims = image_dimensions(dest)
        return {
            "file": dest.name,
            "source": "wechatlog-endpoint",
            "source_path": ref.url,
            "bytes": dest.stat().st_size,
            "width": dims[0] if dims else None,
            "height": dims[1] if dims else None,
            "sha256": sha256(dest),
        }
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def remove_old_variants(img_hash: str, keep_file: str | None = None) -> None:
    if not is_safe_hash(img_hash):
        return
    for p in IMAGES_DIR.glob(f"{img_hash}.*"):
        if not is_under(p, IMAGES_DIR):
            continue
        if p.name == keep_file or p.name == "manifest.json":
            continue
        if p.suffix.lower() in ALLOWED_IMAGE_SUFFIXES:
            p.unlink()


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        try:
            return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download WeChat images with best local-original preference")
    parser.add_argument("--group", action="append", help="Group id to process; can be repeated")
    parser.add_argument("--date", action="append", help="Digest date YYYYMMDD to process; can be repeated")
    parser.add_argument("--force", action="store_true", help="Re-evaluate and overwrite existing images")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N images")
    args = parser.parse_args()

    IMAGES_DIR.mkdir(exist_ok=True)
    refs = list(iter_image_refs(args.group, args.date))
    if args.limit:
        refs = refs[: args.limit]
    manifest = load_manifest()

    stats = {"total": len(refs), "skipped": 0, "local": 0, "endpoint": 0, "failed": 0}
    for ref in refs:
        existing = manifest.get(ref.hash)
        if existing and not args.force and existing.get("status") == "ok" and (IMAGES_DIR / existing.get("file", "")).exists():
            stats["skipped"] += 1
            continue

        info = copy_best_local(ref, IMAGES_DIR)
        if info:
            stats["local"] += 1
        else:
            info = download_via_wechatlog(ref, IMAGES_DIR)
            if info:
                stats["endpoint"] += 1

        if info:
            remove_old_variants(ref.hash, info["file"])
            info.update({"status": "ok", "hash": ref.hash, "rel_path": ref.rel_path, "data_file": str(ref.data_file.relative_to(BASE_DIR))})
            manifest[ref.hash] = info
            print(f"✓ {ref.hash} -> {info['file']} {info.get('width')}x{info.get('height')} {info['bytes']} bytes [{info['source']}]")
        else:
            stats["failed"] += 1
            manifest[ref.hash] = {
                "status": "failed",
                "hash": ref.hash,
                "rel_path": ref.rel_path,
                "data_file": str(ref.data_file.relative_to(BASE_DIR)),
                "reason": "not found in local WeChat files and wechatlog endpoint returned no decodable image",
            }
            print(f"✗ {ref.hash} failed ({ref.rel_path})", file=sys.stderr)

    save_manifest(manifest)
    print("\nSummary:", json.dumps(stats, ensure_ascii=False))
    print(f"Manifest: {MANIFEST_PATH}")
    return 0 if stats["failed"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
