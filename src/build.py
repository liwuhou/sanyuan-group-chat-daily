#!/usr/bin/env python3
"""
Daily Digest - Static Site Generator
生成纯静态网站，可部署到 Vercel
"""

import json
import os
import shutil
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).parent.parent
DIST_DIR = BASE_DIR / "dist"
DATA_DIR = BASE_DIR / "data"

# 群聊配置
GROUPS = {
    "sanyuan": {
        "name": "三元 Agent 课程群",
        "icon": "🤖",
        "color": "#8B7355"
    },
    "sitor": {
        "name": "Sitor AI 产品用户群",
        "icon": "🚀",
        "color": "#4A90A4"
    }
}


def load_group_data(group_id):
    """加载群聊数据"""
    group_dir = DATA_DIR / group_id
    digests = []
    
    if not group_dir.exists():
        return digests
    
    for json_file in sorted(group_dir.glob("*.json"), reverse=True):
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                digests.append(data)
        except Exception as e:
            print(f"Error reading {json_file}: {e}")
    
    return digests


def generate_html(data, group_id):
    """生成日报 HTML"""
    group = GROUPS.get(group_id, {})
    
    tags_html = "".join([f'<span class="tag">{tag}</span>' for tag in data.get("topics", {}).get("tags", [])])
    
    points_html = "".join([
        f'<li><strong>{p["title"]}</strong> — {p["desc"]}</li>'
        for p in data.get("points", [])
    ]) if data.get("points") else "<li>暂无数据</li>"
    
    infos_html = "".join([
        f'<li><strong>{i["user"]}</strong> {i["content"]}</li>'
        for i in data.get("infos", [])
    ]) if data.get("infos") else "<li>暂无数据</li>"
    
    actions_html = "".join([
        f'<li>{a}</li>'
        for a in data.get("actions", [])
    ]) if data.get("actions") else "<li>暂无数据</li>"
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>{data.get('group')} · 每日精选</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="page">
        <header class="digest-header">
            <div class="header-top">
                <div class="brand">Daily Digest</div>
                <div class="issue-badge">
                    <span class="dot"></span>
                    <span class="issue-number">Issue No.{data.get('issue', '001')}</span>
                </div>
            </div>

            <h1 class="digest-title">{data.get('group')} · 每日精选</h1>
            <p class="digest-subtitle">Curated conversations from the community</p>

            <div class="meta-bar">
                <div class="meta-item">
                    <span class="meta-label">DATE</span>
                    <span class="meta-value">{data.get('date')}</span>
                </div>
                <div class="meta-divider"></div>
                <div class="meta-item">
                    <span class="meta-label">MESSAGES</span>
                    <span class="meta-value">{data.get('stats', {}).get('messages', 0)}</span>
                </div>
                <div class="meta-divider"></div>
                <div class="meta-item">
                    <span class="meta-label">ACTIVE</span>
                    <span class="meta-value">{data.get('stats', {}).get('active', 0)}</span>
                </div>
                <div class="meta-divider"></div>
                <div class="meta-item">
                    <span class="meta-label">TEXTS</span>
                    <span class="meta-value">{data.get('stats', {}).get('texts', 0)}</span>
                </div>
            </div>
        </header>

        <section class="section">
            <div class="section-header">
                <div class="section-number">1</div>
                <h2 class="section-title">昨日核心话题</h2>
                <div class="section-line"></div>
            </div>
            <div class="section-content">
                <p class="lead-text">{data.get('topics', {}).get('summary', '')}</p>
                <div class="tag-list">
                    {tags_html}
                </div>
            </div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="section-number">2</div>
                <h2 class="section-title">核心要点</h2>
                <div class="section-line"></div>
            </div>
            <div class="section-content">
                <ul class="item-list">
                    {points_html}
                </ul>
            </div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="section-number">3</div>
                <h2 class="section-title">有价值信息</h2>
                <div class="section-line"></div>
            </div>
            <div class="section-content">
                <ul class="item-list">
                    {infos_html}
                </ul>
            </div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="section-number">4</div>
                <h2 class="section-title">行动建议</h2>
                <div class="section-line"></div>
            </div>
            <div class="section-content">
                <ul class="action-list">
                    {actions_html}
                </ul>
            </div>
        </section>

        <footer class="digest-footer">
            <div class="footer-brand">{data.get('group')} · 每日精选</div>
            <div class="footer-meta">Generated by Hermes Agent</div>
        </footer>
    </div>
</body>
</html>
"""


def generate_index(digests_by_group):
    """生成首页"""
    
    def generate_cards(group_id):
        digests = digests_by_group.get(group_id, [])
        if not digests:
            return '<p class="lead-text">暂无数据</p>'
        
        cards_html = ""
        for digest in digests[:5]:  # 只显示最近5条
            # 从 id (YYYYMMDD) 解析日期
            digest_id = digest['id']
            if len(digest_id) == 8 and digest_id.isdigit():
                day = digest_id[6:8]  # 日
                month = digest_id[4:6]  # 月
            else:
                # 备用：从 date 字段解析
                date_str = digest.get('date', '')
                parts = date_str.replace('年', '-').replace('月', '-').replace('日', '').split('-')
                if len(parts) >= 3:
                    month, day = parts[1], parts[2]
                else:
                    month, day = "--", "--"
            
            cards_html += f"""
                <a href="/{group_id}/{digest['id']}.html" class="history-card">
                    <div class="history-date">
                        <span class="day">{day}</span>
                        <span class="month">{month}月</span>
                    </div>
                    <div class="history-info">
                        <div class="title">{GROUPS[group_id]['name']} · 每日精选</div>
                        <div class="meta">{digest.get('date')} · {digest.get('weekday', '')}</div>
                    </div>
                    <div class="history-stats">
                        <span>💬 {digest.get('stats', {}).get('messages', 0)}</span>
                        <span>👥 {digest.get('stats', {}).get('active', 0)}</span>
                    </div>
                </a>
            """
        return cards_html
    
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>群聊日报 - Daily Digest</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="page">
        <header class="digest-header">
            <div class="header-top">
                <div class="brand">Daily Digest</div>
                <div class="issue-badge">
                    <span class="dot"></span>
                    <span class="issue-number">All Issues</span>
                </div>
            </div>

            <h1 class="digest-title">群聊日报</h1>
            <p class="digest-subtitle">Curated conversations from the community</p>
        </header>

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

        <footer class="digest-footer">
            <div class="footer-brand">群聊日报</div>
            <div class="footer-meta">Generated by Hermes Agent</div>
        </footer>
    </div>
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
                html = generate_html(digest, group_id)
                file_path = group_dir / f"{digest['id']}.html"
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(html)
            
            print(f"✓ Generated {len(digests)} pages for {group_id}")
    
    # 生成首页
    index_html = generate_index(digests_by_group)
    with open(DIST_DIR / "index.html", "w", encoding="utf-8") as f:
        f.write(index_html)
    print("✓ Generated index.html")
    
    print(f"\n✅ Build complete! Output: {DIST_DIR}")
    print(f"📁 Files in dist: {len(list(DIST_DIR.rglob('*')))}")


if __name__ == "__main__":
    build()
