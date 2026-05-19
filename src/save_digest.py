#!/usr/bin/env python3
"""
Daily Digest - 保存群聊日报到仓库
由 cron job 调用，将生成的日报 JSON 保存到指定目录
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

# 仓库路径
REPO_DIR = Path("~/.hermes/web/daily-digest-site").expanduser()
DATA_DIR = REPO_DIR / "data"

# 群聊映射
GROUP_MAP = {
    "sanyuan": "三元 Agent 课程群",
    "sitor": "Sitor AI 产品用户群"
}


def save_digest(group_id: str, digest_data: dict):
    """
    保存群聊日报到仓库
    
    Args:
        group_id: 群聊标识 (sanyuan / sitor)
        digest_data: 日报数据字典
    """
    if group_id not in GROUP_MAP:
        raise ValueError(f"Unknown group_id: {group_id}. Must be one of: {list(GROUP_MAP.keys())}")
    
    # 创建目录
    group_dir = DATA_DIR / group_id
    group_dir.mkdir(parents=True, exist_ok=True)
    
    # 生成文件名 (YYYYMMDD.json)
    today = datetime.now().strftime("%Y%m%d")
    file_path = group_dir / f"{today}.json"
    
    # 确保数据包含必要字段
    digest_data.setdefault("id", today)
    digest_data.setdefault("group", GROUP_MAP[group_id])
    
    # 写入 JSON
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(digest_data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Saved digest to {file_path}")
    return file_path


def save_digest_from_string(group_id: str, json_string: str):
    """
    从 JSON 字符串保存日报
    
    Args:
        group_id: 群聊标识
        json_string: JSON 字符串
    """
    data = json.loads(json_string)
    return save_digest(group_id, data)


def main():
    """CLI 入口"""
    if len(sys.argv) < 3:
        print("Usage: python save_digest.py <group_id> <json_file_or_string>")
        print(f"  group_id: sanyuan | sitor")
        sys.exit(1)
    
    group_id = sys.argv[1]
    input_data = sys.argv[2]
    
    # 判断是文件路径还是 JSON 字符串
    if Path(input_data).exists():
        with open(input_data, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.loads(input_data)
    
    save_digest(group_id, data)


if __name__ == "__main__":
    main()
