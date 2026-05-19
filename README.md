# Daily Digest - 群聊日报

自动聚合微信群聊精华，生成精美的日报网站。

## 数据格式

每个群聊的日报以 JSON 格式存储在 `data/{group_id}/` 目录下，文件名格式为 `YYYYMMDD.json`。

### JSON 结构

```json
{
  "id": "20250518",
  "date": "2025年05月18日",
  "weekday": "周日",
  "group": "三元 Agent 课程群",
  "issue": "001",
  "stats": {
    "messages": 156,
    "active": 12,
    "texts": 89
  },
  "topics": {
    "summary": "昨日群内主要讨论了...",
    "tags": ["话题1", "话题2"]
  },
  "points": [
    {"title": "要点标题", "desc": "要点描述"}
  ],
  "infos": [
    {"user": "用户", "content": "有价值的信息"}
  ],
  "actions": [
    "行动建议1",
    "行动建议2"
  ]
}
```

## 部署

### 方式一：Vercel（推荐）

1. 将代码推送到 GitHub
2. 在 Vercel 导入项目
3. 构建命令：`python src/build.py`
4. 输出目录：`dist`

### 方式二：本地预览

```bash
python src/build.py
npx serve dist
```

## 目录结构

```
daily-digest-site/
├── data/              # 群聊数据
│   ├── sanyuan/       # 三元 Agent 课程群
│   └── sitor/         # Sitor AI 产品用户群
├── src/
│   ├── build.py       # 静态网站生成器
│   └── style.css      # 样式
├── dist/              # 构建输出（自动生成）
└── vercel.json        # Vercel 配置
```

## 自动更新

通过 cron job 每天自动：
1. 提取群聊内容
2. 生成 JSON 数据保存到 `data/` 目录
3. 推送到 GitHub
4. Vercel 自动重新部署
