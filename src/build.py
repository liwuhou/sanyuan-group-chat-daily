#!/usr/bin/env python3
"""
Daily Digest - Static Site Generator v3.0
生成纯静态网站，可部署到 Vercel
新增：图表统计、标签筛选、面包屑导航
"""

import json
import os
import shutil
import re
from pathlib import Path
from datetime import datetime
import html
import hashlib
from urllib.parse import quote, urlparse


def h(value):
    """Escape a dynamic value for safe HTML text/attribute insertion."""
    return html.escape(str(value or ""), quote=True)


def render_plain_text_block(value):
    """Render plain-text push content safely while preserving line breaks."""
    text = str(value or "").strip()
    if not text:
        return ""
    return h(text).replace("\n", "<br>")


def safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_page_id(value):
    value = str(value or "")
    return value if re.fullmatch(r"\d{8}", value) else ""


def safe_group_id(value):
    value = str(value or "")
    return value if value in GROUPS else ""


def safe_topics(digest):
    topics = digest.get("topics") if isinstance(digest, dict) else None
    if not isinstance(topics, dict):
        return {}
    return topics


def safe_tags_from_topics(topics):
    tags = topics.get("tags", []) if isinstance(topics, dict) else []
    if not isinstance(tags, list):
        return []
    return [str(tag) for tag in tags if isinstance(tag, (str, int, float))]


def safe_stats(digest):
    stats = digest.get("stats") if isinstance(digest, dict) else None
    return stats if isinstance(stats, dict) else {}


def safe_local_image_url(value):
    value = str(value or "")
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return ""
    if not value.startswith("/images/"):
        return ""
    return value if re.fullmatch(r"/images/[A-Za-z0-9_.-]+", value) else ""


def safe_external_image_url(value):
    value = str(value or "")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        return ""
    if not parsed.netloc:
        return ""
    return value


AVATAR_COLORS = [
    ("#8B5E3C", "#F8EFE5"),
    ("#7C6A42", "#F6F0DD"),
    ("#6C7A58", "#F2F6EA"),
    ("#3F716B", "#E8F5F2"),
    ("#456D8A", "#EAF2F7"),
    ("#5E5C8A", "#EFEEF8"),
    ("#8A5C78", "#F8EEF4"),
    ("#9A5A4F", "#F8ECE8"),
    ("#9A6A3A", "#F8F0E5"),
    ("#61745A", "#EFF5EA"),
]


def stable_avatar_colors(user):
    digest = hashlib.sha256(str(user or "?").encode("utf-8")).digest()
    return AVATAR_COLORS[digest[0] % len(AVATAR_COLORS)]


def avatar_initial(user):
    user = str(user or "?").strip()
    if not user:
        return "?"
    for char in user:
        if not char.isspace():
            return char.upper() if char.isascii() else char
    return "?"


def safe_avatar_url(value):
    value = str(value or "")
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return ""
    if not value.startswith("/avatars/"):
        return ""
    return value if re.fullmatch(r"/avatars/[A-Za-z0-9_.-]+", value) else ""


def render_chat_avatar(user, avatar_url=""):
    safe_avatar = safe_avatar_url(avatar_url)
    initial = h(avatar_initial(user))
    label = h(f"{user or '未知用户'} 的头像")
    bg, fg = stable_avatar_colors(user)
    fallback_attrs = f'style="--avatar-bg: {bg}; --avatar-fg: {fg};"'
    if safe_avatar:
        return (
            f'<div class="chat-avatar chat-avatar-real" {fallback_attrs}>'
            f'<img src="{h(safe_avatar)}" alt="{label}" loading="lazy" '
            f'onerror="this.parentElement.classList.add(\'avatar-load-failed\')">'
            f'<span class="chat-avatar-fallback" aria-hidden="true">{initial}</span>'
            f'</div>'
        )
    return (
        f'<div class="chat-avatar" {fallback_attrs} '
        f'aria-hidden="true">{initial}</div>'
    )


def render_chat_link(match):
    url = match.group(0)
    escaped_url = h(url)
    return f'<a href="{escaped_url}" target="_blank" rel="noopener noreferrer" class="chat-link">{escaped_url}</a>'


def format_digest_date_from_id(digest_id):
    if isinstance(digest_id, str) and len(digest_id) == 8 and digest_id.isdigit():
        return f"{digest_id[:4]}年{digest_id[4:6]}月{digest_id[6:8]}日"
    return ""

BASE_DIR = Path(__file__).parent.parent
DIST_DIR = BASE_DIR / "dist"
DATA_DIR = BASE_DIR / "data"
SITE_URL = "https://sy-digest.vercel.app"

IMAGES_DIR = BASE_DIR / "images"
IMAGE_MANIFEST_PATH = IMAGES_DIR / "manifest.json"
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")


def load_image_manifest():
    """Load downloaded WeChat image metadata, including actual file extensions."""
    if IMAGE_MANIFEST_PATH.exists():
        try:
            with open(IMAGE_MANIFEST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: failed to read image manifest: {e}")
    return {}


IMAGE_MANIFEST = load_image_manifest()


def resolve_chat_image(hash_value):
    """Return the best local URL for a WeChat image hash.

    New image downloads may be png/webp/bmp instead of blindly renamed .jpg, so
    the generated HTML must use the manifest or probe existing files.
    """
    info = IMAGE_MANIFEST.get(hash_value, {})
    file_name = info.get("file")
    if file_name and (IMAGES_DIR / file_name).exists():
        return f"/images/{file_name}"
    for ext in IMAGE_EXTENSIONS:
        candidate = IMAGES_DIR / f"{hash_value}{ext}"
        if candidate.exists():
            return f"/images/{candidate.name}"
    return None

# 群聊配置
GROUPS = {
    "sanyuan": {
        "name": "三元 Agent 课程群",
        "icon": "🤖",
        "color": "#4A90A4",
        "description": "Agent 课程学习交流群"
    },
    "sitor": {
        "name": "Sitor AI 产品用户群",
        "icon": "🚀",
        "color": "#8B7355",
        "description": "Sitor AI 产品用户交流群"
    }
}


def digest_page_id(data):
    """Return the canonical page/raw id for a loaded digest.

    Historical cron runs sometimes wrote a file like 20260523.json whose
    internal JSON still said id=20260522. The static site should use the actual
    data file stem when available, otherwise links point to the wrong page/raw
    file and users see empty/missing records.
    """
    return safe_page_id(data.get("_file") or data.get("id", ""))


def load_group_data(group_id):
    """加载群聊数据"""
    group_dir = DATA_DIR / group_id
    digests = []
    
    if not group_dir.exists():
        return digests
    
    for json_file in sorted(group_dir.glob("*.json"), reverse=True):
        # 跳过原始消息文件
        if "_raw" in json_file.stem:
            continue
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["_file"] = json_file.stem
                digests.append(data)
        except Exception as e:
            print(f"Error reading {json_file}: {e}")
    
    return digests


def get_all_tags(digests):
    """获取所有标签"""
    tags = {}
    for digest in digests:
        for tag in safe_tags_from_topics(safe_topics(digest)):
            tags[tag] = tags.get(tag, 0) + 1
    return tags


def generate_nav(current_page="home"):
    """生成导航栏"""
    return f"""
        <nav class="navbar">
            <a href="/" class="brand">Daily Digest</a>
            <div class="nav-links">
                <a href="/" class="nav-link" {'style="color: var(--accent); font-weight: 600;"' if current_page == "home" else ''}>首页</a>
                <a href="/archive.html" class="nav-link" {'style="color: var(--accent); font-weight: 600;"' if current_page == "archive" else ''}>归档</a>
                <a href="/rss.xml" class="nav-link" target="_blank">RSS</a>
                <button id="themeToggle" class="theme-toggle" title="切换主题">
                    <span class="theme-icon">🌙</span>
                </button>
            </div>
        </nav>
    """


def generate_footer():
    """生成页脚"""
    return """
        <footer class="footer">
            <div class="footer-brand">群聊日报</div>
            <div class="footer-meta">Generated by Hermes Agent</div>
            <div class="footer-links">
                <a href="/" class="footer-link">首页</a>
                <a href="/archive.html" class="footer-link">归档</a>
                <a href="/rss.xml" class="footer-link">RSS</a>
            </div>
        </footer>
    """


def generate_breadcrumb(group_name, date_str):
    """生成面包屑导航"""
    group_name = h(group_name)
    date_str = h(date_str)
    return f"""
        <nav class="breadcrumb" aria-label="breadcrumb">
            <ol class="breadcrumb-list">
                <li class="breadcrumb-item"><a href="/">首页</a></li>
                <li class="breadcrumb-separator">/</li>
                <li class="breadcrumb-item">{group_name}</li>
                <li class="breadcrumb-separator">/</li>
                <li class="breadcrumb-item active">{date_str}</li>
            </ol>
        </nav>
    """


def generate_html(data, group_id):
    """生成日报 HTML"""
    page_id = digest_page_id(data)
    if not page_id:
        return ""
    display_date = h(format_digest_date_from_id(page_id) or data.get('date', ''))
    group = GROUPS.get(group_id, {})
    group_name = h(data.get('group') or group.get('name', '群聊日报'))
    issue = h(data.get('issue', '001'))
    topics = safe_topics(data)
    stats = safe_stats(data)
    messages = safe_int(stats.get("messages", 0))
    active = safe_int(stats.get("active", 0))
    texts = safe_int(stats.get("texts", 0))
    summary = h(topics.get('summary', ''))
    tags_html = "".join([f'<span class="tag">{h(tag)}</span>' for tag in safe_tags_from_topics(topics)])
    
    points_html = "".join([
        f'<li><strong>{h(p.get("title", ""))}</strong> — {h(p.get("desc", ""))}</li>'
        for p in data.get("points", [])
        if isinstance(p, dict)
    ]) if data.get("points") else "<li>暂无数据</li>"
    
    infos_html = "".join([
        f'<li><strong>{h(i.get("user", ""))}</strong> {h(i.get("content", ""))}</li>'
        for i in data.get("infos", [])
        if isinstance(i, dict)
    ]) if data.get("infos") else "<li>暂无数据</li>"
    
    actions_html = "".join([
        f'<li>{h(a)}</li>'
        for a in data.get("actions", [])
    ]) if data.get("actions") else "<li>暂无数据</li>"

    wechat_push_text = data.get("wechat_push_text") or data.get("push_text") or data.get("wechat_text")
    wechat_push_html = render_plain_text_block(wechat_push_text)
    if wechat_push_html:
        main_content_html = f"""
        <section class="content-section wechat-push-section">
            <div class="content-section-header">
                <div class="content-section-number">✦</div>
                <h2 class="content-section-title">微信推送原文</h2>
                <div class="content-section-line"></div>
            </div>
            <div class="content-section-body">
                <div class="wechat-push-text">{wechat_push_html}</div>
            </div>
        </section>
        """
    else:
        main_content_html = f"""
        <section class="content-section">
            <div class="content-section-header">
                <div class="content-section-number">1</div>
                <h2 class="content-section-title">统计周期核心话题</h2>
                <div class="content-section-line"></div>
            </div>
            <div class="content-section-body">
                <p class="lead-text">{summary}</p>
                <div class="tag-list">
                    {tags_html}
                </div>
            </div>
        </section>

        <section class="content-section">
            <div class="content-section-header">
                <div class="content-section-number">2</div>
                <h2 class="content-section-title">核心要点</h2>
                <div class="content-section-line"></div>
            </div>
            <div class="content-section-body">
                <ul class="point-list">
                    {points_html}
                </ul>
            </div>
        </section>

        <section class="content-section">
            <div class="content-section-header">
                <div class="content-section-number">3</div>
                <h2 class="content-section-title">有价值信息</h2>
                <div class="content-section-line"></div>
            </div>
            <div class="content-section-body">
                <ul class="info-list">
                    {infos_html}
                </ul>
            </div>
        </section>

        <section class="content-section">
            <div class="content-section-header">
                <div class="content-section-number">4</div>
                <h2 class="content-section-title">行动建议</h2>
                <div class="content-section-line"></div>
            </div>
            <div class="content-section-body">
                <ul class="action-list">
                    {actions_html}
                </ul>
            </div>
        </section>
        """
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>{group_name} · 每日精选</title>
    <meta name="description" content="{summary[:100]}...">
    <meta property="og:title" content="{group_name} · 每日精选">
    <meta property="og:description" content="{summary[:100]}...">
    <meta property="og:type" content="article">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="alternate" type="application/rss+xml" title="群聊日报 RSS" href="/rss.xml">
</head>
<body data-page-type="digest" data-group-name="{group_name}" data-digest-date="{display_date}" data-issue="{issue}">
    <div class="page">
        {generate_nav("detail")}
        
        {generate_breadcrumb(group_name, display_date)}
        
        <header class="digest-header">
            <div class="header-top">
                <div class="brand">Daily Digest</div>
                <div class="issue-badge">
                    <span class="dot"></span>
                    <span class="issue-number">Issue No.{issue}</span>
                </div>
            </div>

            <h1 class="digest-title">{group_name} · 每日精选</h1>
            <p class="digest-subtitle">Curated conversations from the community</p>

            <div class="meta-bar">
                <div class="meta-item">
                    <span class="meta-label">DATE</span>
                    <span class="meta-value">{display_date}</span>
                </div>
                <div class="meta-divider"></div>
                <div class="meta-item">
                    <span class="meta-label">MESSAGES</span>
                    <span class="meta-value">{messages}</span>
                </div>
                <div class="meta-divider"></div>
                <div class="meta-item">
                    <span class="meta-label">ACTIVE</span>
                    <span class="meta-value">{active}</span>
                </div>
                <div class="meta-divider"></div>
                <div class="meta-item">
                    <span class="meta-label">TEXTS</span>
                    <span class="meta-value">{texts}</span>
                </div>
            </div>
        </header>

        {main_content_html}
        
        <div class="share-section">
            <a href="/{group_id}/{digest_page_id(data)}_chat.html" class="view-chat-btn">💬 查看完整对话</a>
            <button id="shareBtn" class="share-btn" type="button">🎨 生成分享海报</button>
        </div>

        {generate_footer()}
    </div>
    <script src="/vendor/qrcode.js"></script>
    <script src="/main.js"></script>
</body>
</html>
"""


def generate_index(digests_by_group):
    """生成首页"""
    
    def generate_cards(group_id):
        digests = digests_by_group.get(group_id, [])
        if not digests:
            return '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-title">暂无数据</div><div class="empty-state-desc">该群聊暂无日报数据</div></div>'
        
        cards_html = ""
        for i, digest in enumerate(digests[:3]):  # 只显示最近3条
            # 从页面 id (YYYYMMDD) 解析日期
            digest_id = digest_page_id(digest)
            if not digest_id:
                continue
            if len(digest_id) == 8 and digest_id.isdigit():
                day = digest_id[6:8]  # 日
                month = digest_id[4:6]  # 月
            else:
                date_str = digest.get('date', '')
                parts = date_str.replace('年', '-').replace('月', '-').replace('日', '').split('-')
                if len(parts) >= 3:
                    month, day = parts[1], parts[2]
                else:
                    month, day = "--", "--"
            
            safe_tags = ','.join(h(tag) for tag in safe_tags_from_topics(safe_topics(digest)))
            safe_group_name = h(GROUPS[group_id]['name'])
            safe_meta_date = h(format_digest_date_from_id(digest_id) or digest.get('date', ''))
            safe_weekday = h(digest.get('weekday', ''))
            messages = safe_int(safe_int(safe_stats(digest).get('messages', 0)))
            active = safe_int(safe_int(safe_stats(digest).get('active', 0)))
            cards_html += f"""
                <a href="/{group_id}/{digest_id}.html" class="history-card {group_id}" data-group="{h(group_id)}" data-date="{h(digest_id)}" data-tags="{safe_tags}">
                    <div class="history-date">
                        <span class="day">{h(day)}</span>
                        <span class="month">{h(month)}月</span>
                    </div>
                    <div class="history-info">
                        <div class="title">{safe_group_name} · 每日精选</div>
                        <div class="meta">{safe_meta_date} · {safe_weekday}</div>
                    </div>
                    <div class="history-stats">
                        <span>💬 {messages}</span>
                        <span>👥 {active}</span>
                    </div>
                </a>
            """
        
        # 添加"查看全部"链接
        cards_html += f"""
            <a href="/archive.html" class="view-all-link">
                <span>查看全部 {len(digests)} 条记录 →</span>
            </a>
        """
        
        return cards_html
    
    # 收集所有标签
    all_digests = []
    for group_digests in digests_by_group.values():
        all_digests.extend(group_digests)
    
    tags = get_all_tags(all_digests)
    tags_html = "".join([f'<a href="/archive.html?tag={quote(str(tag))}" class="tag">{h(tag)} ({safe_int(count)})</a>' for tag, count in sorted(tags.items(), key=lambda x: -x[1])[:10]])
    
    # 计算统计数据
    total_digests = len(all_digests)
    total_messages = sum(safe_int(safe_stats(d).get('messages', 0)) for d in all_digests)
    total_active = sum(safe_int(safe_stats(d).get('active', 0)) for d in all_digests)
    
    # 生成图表数据
    chart_data = generate_chart_data(digests_by_group)
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>群聊日报 - Daily Digest</title>
    <meta name="description" content="自动聚合微信群聊精华，每日精选社区讨论内容">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="alternate" type="application/rss+xml" title="群聊日报 RSS" href="/rss.xml">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="page">
        {generate_nav("home")}
        
        <header class="header-section">
            <h1 class="digest-title">群聊日报</h1>
            <p class="digest-subtitle">Curated conversations from the community</p>
        </header>
        
        <div class="search-box">
            <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input type="text" class="search-input" placeholder="搜索日报内容..." id="searchInput">
        </div>
        
        <section class="section">
            <div class="section-header">
                <div class="section-number">📊</div>
                <h2 class="section-title">数据概览</h2>
                <div class="section-line"></div>
            </div>
            <div class="stats-summary">
                <div class="stat-item">
                    <div class="stat-value">{total_digests}</div>
                    <div class="stat-label">日报期数</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">{total_messages}</div>
                    <div class="stat-label">总消息数</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">{total_active}</div>
                    <div class="stat-label">总活跃人数</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">{len(tags)}</div>
                    <div class="stat-label">标签数量</div>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="trendChart" height="200"></canvas>
            </div>
        </section>
        
        <section class="section">
            <div class="section-header">
                <div class="section-number">🏷️</div>
                <h2 class="section-title">热门标签</h2>
                <div class="section-line"></div>
            </div>
            <div class="tag-list">
                {tags_html}
            </div>
        </section>
        
        <section class="section">
            <div class="section-header">
                <div class="section-number">1</div>
                <h2 class="section-title">三元 Agent 课程群</h2>
                <div class="section-line"></div>
            </div>
            <div class="section-content">
                {generate_cards('sanyuan')}
            </div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="section-number">2</div>
                <h2 class="section-title">Sitor AI 产品用户群</h2>
                <div class="section-line"></div>
            </div>
            <div class="section-content">
                {generate_cards('sitor')}
            </div>
        </section>
        
        {generate_footer()}
    </div>
    
    <script src="/search.js"></script>
    <script src="/vendor/qrcode.js"></script>
    <script src="/main.js"></script>
    <script>
        // 趋势图表
        {chart_data}
    </script>
</body>
</html>
"""


def generate_chart_data(digests_by_group):
    """生成图表数据"""
    all_digests = []
    for group_id, digests in digests_by_group.items():
        for digest in digests:
            digest["_group_id"] = group_id
            all_digests.append(digest)
    
    # 按日期排序
    all_digests.sort(key=lambda x: digest_page_id(x))
    
    if len(all_digests) < 2:
        return "// 数据不足，无法生成图表"
    
    # 准备数据
    labels = []
    sanyuan_data = []
    sitor_data = []
    
    for digest in all_digests:
        digest_id = digest_page_id(digest)
        if not digest_id:
            continue
        if len(digest_id) == 8:
            date_label = f"{digest_id[4:6]}/{digest_id[6:8]}"
        else:
            date_label = digest_id
        
        if date_label not in labels:
            labels.append(date_label)
        
        group_id = digest.get("_group_id", "")
        messages = safe_int(safe_stats(digest).get('messages', 0))
        
        if group_id == "sanyuan":
            sanyuan_data.append(messages)
        elif group_id == "sitor":
            sitor_data.append(messages)
    
    labels_json = json.dumps(labels, ensure_ascii=False)
    sanyuan_json = json.dumps(sanyuan_data)
    sitor_json = json.dumps(sitor_data)
    
    return f"""
        document.addEventListener('DOMContentLoaded', function() {{
            var ctx = document.getElementById('trendChart');
            if (!ctx) return;
            
            new Chart(ctx, {{
                type: 'line',
                data: {{
                    labels: {labels_json},
                    datasets: [
                        {{
                            label: '三元 Agent 课程群',
                            data: {sanyuan_json},
                            borderColor: '#4A90A4',
                            backgroundColor: 'rgba(74, 144, 164, 0.1)',
                            tension: 0.4,
                            fill: true
                        }},
                        {{
                            label: 'Sitor AI 产品用户群',
                            data: {sitor_json},
                            borderColor: '#8B7355',
                            backgroundColor: 'rgba(139, 115, 85, 0.1)',
                            tension: 0.4,
                            fill: true
                        }}
                    ]
                }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {{
                        legend: {{
                            position: 'top',
                            labels: {{
                                usePointStyle: true,
                                padding: 20
                            }}
                        }},
                        title: {{
                            display: true,
                            text: '消息数量趋势',
                            font: {{ size: 16, weight: 'bold' }}
                        }}
                    }},
                    scales: {{
                        y: {{
                            beginAtZero: true,
                            grid: {{
                                color: 'rgba(0, 0, 0, 0.05)'
                            }}
                        }},
                        x: {{
                            grid: {{
                                display: false
                            }}
                        }}
                    }}
                }}
            }});
        }});
    """


def generate_archive(digests_by_group):
    """生成归档页面"""
    
    # 按群聊分组生成归档
    archive_html = ""
    
    for group_id, digests in digests_by_group.items():
        if not digests:
            continue
        
        safe_group_icon = h(GROUPS[group_id]['icon'])
        safe_group_name = h(GROUPS[group_id]['name'])
        archive_html += f"""
            <div class="archive-group">
                <h3 class="archive-group-title">{safe_group_icon} {safe_group_name}</h3>
        """
        
        # 按月份分组
        months = {}
        for digest in digests:
            digest_id = digest_page_id(digest)
            if not digest_id:
                continue
            if len(digest_id) == 8:
                year_month = f"{digest_id[:4]}年{digest_id[4:6]}月"
            else:
                year_month = "未知日期"
            
            if year_month not in months:
                months[year_month] = []
            months[year_month].append(digest)
        
        for month, month_digests in sorted(months.items(), reverse=True):
            archive_html += f"""
                <div class="archive-month">
                    <h4 class="archive-month-title">{month}</h4>
            """
            
            for digest in sorted(month_digests, key=lambda x: digest_page_id(x), reverse=True):
                digest_id = digest_page_id(digest)
                if not digest_id:
                    continue
                
                if len(digest_id) == 8:
                    day = digest_id[6:8]
                    month_num = digest_id[4:6]
                else:
                    day = "--"
                    month_num = "--"
                
                safe_meta_date = h(format_digest_date_from_id(digest_id) or digest.get('date', ''))
                safe_weekday = h(digest.get('weekday', ''))
                messages = safe_int(safe_int(safe_stats(digest).get('messages', 0)))
                active = safe_int(safe_int(safe_stats(digest).get('active', 0)))
                archive_html += f"""
                    <a href="/{group_id}/{digest_id}.html" class="history-card {group_id}">
                        <div class="history-date">
                            <span class="day">{h(day)}</span>
                            <span class="month">{h(month_num)}月</span>
                        </div>
                        <div class="history-info">
                            <div class="title">{safe_group_name} · 每日精选</div>
                            <div class="meta">{safe_meta_date} · {safe_weekday}</div>
                        </div>
                        <div class="history-stats">
                            <span>💬 {messages}</span>
                            <span>👥 {active}</span>
                        </div>
                    </a>
                """
            
            archive_html += "</div>"
        
        archive_html += "</div>"
    
    if not archive_html:
        archive_html = '<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-title">暂无归档</div><div class="empty-state-desc">还没有日报数据</div></div>'
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>归档 - 群聊日报</title>
    <meta name="description" content="群聊日报历史归档">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="alternate" type="application/rss+xml" title="群聊日报 RSS" href="/rss.xml">
</head>
<body>
    <div class="page">
        {generate_nav("archive")}
        
        <header class="archive-header">
            <h1 class="archive-title">归档</h1>
            <p class="archive-subtitle">历史日报汇总</p>
        </header>
        
        <div class="archive-list">
            {archive_html}
        </div>
        
        {generate_footer()}
    </div>
    <script src="/vendor/qrcode.js"></script>
    <script src="/main.js"></script>
</body>
</html>
"""


def generate_rss(digests_by_group):
    """生成 RSS feed"""
    
    items = []
    all_digests = []
    for group_id, digests in digests_by_group.items():
        for digest in digests:
            digest["_group_id"] = group_id
            all_digests.append(digest)
    
    # 按日期排序，取最近20条
    all_digests.sort(key=lambda x: digest_page_id(x), reverse=True)
    
    for digest in all_digests[:20]:
        group_id = digest.get("_group_id", "")
        digest_id = digest_page_id(digest)
        if not digest_id:
            continue
        
        # 构建描述
        topics = safe_topics(digest)
        description = str(topics.get("summary", "") or "")
        points = digest.get("points", [])
        if not isinstance(points, list):
            points = []
        if points:
            description += "\n\n核心要点：\n"
            for p in points[:3]:
                if isinstance(p, dict):
                    description += f"- {p.get('title', '')}\n"
        
        # 转义 XML 特殊字符
        description = description.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
        display_date = format_digest_date_from_id(digest_id) or digest.get('date', '')
        title = f"{digest.get('group', '群聊日报')} · {display_date}"
        title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        
        items.append(f"""
    <item>
      <title>{title}</title>
      <link>{SITE_URL}/{group_id}/{digest_id}.html</link>
      <guid>{SITE_URL}/{group_id}/{digest_id}.html</guid>
      <description>{description}</description>
      <pubDate>{display_date}</pubDate>
    </item>
        """)
    
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>群聊日报 - Daily Digest</title>
    <link>{SITE_URL}</link>
    <description>自动聚合微信群聊精华，每日精选社区讨论内容</description>
    <language>zh-CN</language>
    <lastBuildDate>{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</lastBuildDate>
    {''.join(items)}
  </channel>
</rss>
"""


def generate_chat_page(data, group_id):
    """生成对话页面 HTML"""
    import re
    
    digest_id = digest_page_id(data)
    if not digest_id:
        return None
    raw_file = DATA_DIR / group_id / f"{digest_id}_raw.json"
    display_date = h(format_digest_date_from_id(digest_id) or data.get('date', ''))
    group_name = h(data.get('group', '群聊'))
    
    if not raw_file.exists():
        return None
    
    try:
        with open(raw_file, "r", encoding="utf-8") as f:
            raw_messages = json.load(f)
        if not isinstance(raw_messages, list):
            raw_messages = []
    except Exception as e:
        print(f"Error reading {raw_file}: {e}")
        return None
    
    # 生成消息 HTML
    messages_html = ""
    if not raw_messages:
        messages_html = """
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-title">暂无聊天记录</div>
                <div class="empty-state-desc">该日期的原始聊天记录未保留</div>
            </div>
        """
    else:
        for msg in raw_messages:
            if not isinstance(msg, dict):
                continue
            user = str(msg.get('user') or '未知用户')
            content = str(msg.get('content') or '')
            time = str(msg.get('time') or '')
            
            # 转义 HTML（但保留图片标签）
            # 先处理 Markdown 图片
            images = []
            def save_image(match):
                alt, src = match.group(1), match.group(2)
                images.append((alt, src))
                return f"__IMG_{len(images)-1}__"
            
            content = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', save_image, content)
            
            # 先转义 HTML
            content = h(content)
            
            # 再高亮链接
            content = re.sub(r'https?://[^\s<]+', render_chat_link, content)
            
            # 最后恢复图片标签（本地图片映射到下载的图片）
            for i, (alt, src) in enumerate(images):
                if "127.0.0.1" in src or "localhost" in src:
                    # 提取 hash
                    hash_match = re.search(r'/image/([^,]+)', src)
                    if hash_match:
                        img_hash = hash_match.group(1)
                        local_img_path = safe_local_image_url(resolve_chat_image(img_hash))
                        escaped_alt = h(alt)
                        if local_img_path:
                            escaped_img_src = h(local_img_path)
                            # Use the locally stored best-available image for both inline view and overlay.
                            content = content.replace(
                                f"__IMG_{i}__",
                                f'<img src="{escaped_img_src}" alt="{escaped_alt}" class="chat-image" loading="lazy" onerror="this.style.display=\'none\'" data-original="{escaped_img_src}">'
                            )
                        else:
                            content = content.replace(f"__IMG_{i}__", '<span class="chat-image-placeholder">[图片暂不可用]</span>')
                    else:
                        content = content.replace(f"__IMG_{i}__", '<span class="chat-image-placeholder">[图片]</span>')
                else:
                    safe_src = safe_external_image_url(src)
                    if safe_src:
                        content = content.replace(f"__IMG_{i}__", f'<img src="{h(safe_src)}" alt="{h(alt)}" class="chat-image" loading="lazy" onerror="this.style.display=\'none\'">')
                    else:
                        content = content.replace(f"__IMG_{i}__", '<span class="chat-image-placeholder">[图片地址无效]</span>')
            
            avatar_html = render_chat_avatar(user, msg.get('avatar') or msg.get('avatar_url') or '')
            messages_html += f"""
                <div class="chat-message">
                    {avatar_html}
                    <div class="chat-bubble">
                        <div class="chat-header">
                            <span class="chat-user">{h(user)}</span>
                            <span class="chat-time">{h(time)}</span>
                        </div>
                        <div class="chat-content">{content}</div>
                    </div>
                </div>
            """
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>{group_name} · 完整对话</title>
    <meta name="description" content="{display_date} 的完整聊天记录">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="page">
        {generate_nav("detail")}
        
        {generate_breadcrumb(group_name, display_date + ' 完整对话')}
        
        <header class="chat-page-header">
            <h1 class="chat-page-title">💬 完整对话</h1>
            <p class="chat-page-subtitle">{group_name} · {display_date}</p>
            <a href="/{group_id}/{digest_id}.html" class="back-to-digest">← 返回日报</a>
        </header>
        
        <div class="chat-container">
            {messages_html}
        </div>
        
        {generate_footer()}
    </div>
    <script src="/vendor/qrcode.js"></script>
    <script src="/main.js"></script>
</body>
</html>
"""


def build():
    """构建静态网站"""
    print("🏗️  Building static site...")
    
    # 创建输出目录
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(exist_ok=True)
    
    # 复制 CSS
    css_source = BASE_DIR / "src" / "style.css"
    if css_source.exists():
        with open(css_source, "r") as f:
            css_content = f.read()
        with open(DIST_DIR / "style.css", "w") as f:
            f.write(css_content)
        print("✓ CSS copied")
    
    # 复制 JS
    for js_file in ["search.js", "main.js", "charts.js"]:
        js_source = BASE_DIR / "src" / js_file
        if js_source.exists():
            shutil.copy2(js_source, DIST_DIR / js_file)
            print(f"✓ {js_file} copied")

    vendor_source = BASE_DIR / "src" / "vendor"
    if vendor_source.exists():
        vendor_dest = DIST_DIR / "vendor"
        if vendor_dest.exists():
            shutil.rmtree(vendor_dest)
        shutil.copytree(vendor_source, vendor_dest)
        print("✓ vendor assets copied")
    
    # 复制图片（preserve original extensions; these are best-available WeChat originals）
    images_dir = BASE_DIR / "images"
    if images_dir.exists():
        dist_images = DIST_DIR / "images"
        dist_images.mkdir(exist_ok=True)
        copied = 0
        for img_file in images_dir.iterdir():
            if img_file.is_file() and img_file.suffix.lower() in IMAGE_EXTENSIONS:
                shutil.copy2(img_file, dist_images / img_file.name)
                copied += 1
        if (images_dir / "manifest.json").exists():
            shutil.copy2(images_dir / "manifest.json", dist_images / "manifest.json")
        print(f"✓ Images copied ({copied} files)")
    
    # 加载数据
    digests_by_group = {}
    for group_id in GROUPS.keys():
        print(f"\n📂 Loading {group_id}...")
        digests = load_group_data(group_id)
        if digests:
            digests_by_group[group_id] = digests
            
            # 创建群聊目录
            group_dir = DIST_DIR / group_id
            group_dir.mkdir(exist_ok=True)
            
            # 生成每个日报的 HTML
            for digest in digests:
                page_id = digest_page_id(digest)
                if not page_id:
                    continue
                html = generate_html(digest, group_id)
                if not html:
                    continue
                file_path = group_dir / f"{page_id}.html"
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(html)
                
                # 生成对话页面
                chat_html = generate_chat_page(digest, group_id)
                if chat_html:
                    chat_file_path = group_dir / f"{page_id}_chat.html"
                    with open(chat_file_path, "w", encoding="utf-8") as f:
                        f.write(chat_html)
            
            print(f"✓ Generated {len(digests)} pages for {group_id}")
    
    # 生成首页
    index_html = generate_index(digests_by_group)
    with open(DIST_DIR / "index.html", "w", encoding="utf-8") as f:
        f.write(index_html)
    print("✓ Generated index.html")
    
    # 生成归档页面
    archive_html = generate_archive(digests_by_group)
    with open(DIST_DIR / "archive.html", "w", encoding="utf-8") as f:
        f.write(archive_html)
    print("✓ Generated archive.html")
    
    # 生成 RSS
    rss_content = generate_rss(digests_by_group)
    with open(DIST_DIR / "rss.xml", "w", encoding="utf-8") as f:
        f.write(rss_content)
    print("✓ Generated rss.xml")
    
    print(f"\n✅ Build complete! Output: {DIST_DIR}")
    print(f"📁 Files in dist: {len(list(DIST_DIR.rglob('*')))}")


if __name__ == "__main__":
    build()
