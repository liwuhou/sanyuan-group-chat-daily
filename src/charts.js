// Daily Digest - Charts & Analytics
// 使用 Chart.js 生成数据统计图表

// 加载 Chart.js
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否在首页
    const statsContainer = document.getElementById('statsChart');
    if (!statsContainer) return;
    
    // 尝试从页面数据中提取统计信息
    const cards = document.querySelectorAll('.history-card');
    if (cards.length === 0) return;
    
    // 收集数据
    const data = {
        labels: [],
        messages: [],
        active: []
    };
    
    cards.forEach(card => {
        const title = card.querySelector('.title');
        const stats = card.querySelectorAll('.history-stats span');
        
        if (title && stats.length >= 2) {
            const dateText = title.textContent.split('·')[0].trim();
            const messagesMatch = stats[0].textContent.match(/\d+/);
            const activeMatch = stats[1].textContent.match(/\d+/);
            
            if (messagesMatch && activeMatch) {
                data.labels.push(dateText);
                data.messages.push(parseInt(messagesMatch[0]));
                data.active.push(parseInt(activeMatch[0]));
            }
        }
    });
    
    // 如果数据足够，生成简单统计
    if (data.labels.length > 0) {
        generateStatsSummary(data);
    }
});

function generateStatsSummary(data) {
    const totalMessages = data.messages.reduce((a, b) => a + b, 0);
    const avgMessages = Math.round(totalMessages / data.messages.length);
    const maxMessages = Math.max(...data.messages);
    
    const statsHtml = `
        <div class="stats-summary">
            <div class="stat-item">
                <div class="stat-value">${data.labels.length}</div>
                <div class="stat-label">日报期数</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${totalMessages}</div>
                <div class="stat-label">总消息数</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${avgMessages}</div>
                <div class="stat-label">平均消息</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${maxMessages}</div>
                <div class="stat-label">最高记录</div>
            </div>
        </div>
    `;
    
    // 插入到页面中
    const container = document.getElementById('statsSummary');
    if (container) {
        container.innerHTML = statsHtml;
    }
}
