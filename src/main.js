// Daily Digest - Theme Toggle & Search
document.addEventListener('DOMContentLoaded', function() {
    // 主题切换
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
        
        // 初始化主题
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            updateThemeIcon(savedTheme);
        } else {
            // 默认设置为亮色模式
            document.documentElement.setAttribute('data-theme', 'light');
            updateThemeIcon('light');
        }
    }
    
    function updateThemeIcon(theme) {
        const icon = document.querySelector('#themeToggle .theme-icon');
        if (icon) {
            icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }
    
    // 让所有懒加载图片在加载完成后显示出来
    function bindLazyImageLoading(root = document) {
        const imgs = root.querySelectorAll('img[loading="lazy"]');
        imgs.forEach(img => {
            const reveal = () => img.classList.add('loaded');
            if (img.complete && img.naturalWidth > 0) {
                reveal();
            } else {
                img.addEventListener('load', reveal, { once: true });
                img.addEventListener('error', reveal, { once: true });
            }
        });
    }
    bindLazyImageLoading();
    
    // 图片点击放大功能（使用事件委托）
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('chat-image')) {
            const originalUrl = e.target.getAttribute('data-original');
            if (originalUrl) {
                showImageOverlay(originalUrl);
            }
        }
    });
    
    function showImageOverlay(originalUrl) {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'image-overlay';
        overlay.innerHTML = `
            <div class="image-overlay-content">
                <img src="${originalUrl}" alt="原图" class="loaded">
                <div class="image-overlay-close">点击关闭</div>
            </div>
        `;
        
        // 点击关闭
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.className === 'image-overlay-close') {
                overlay.remove();
            }
        });
        
        document.body.appendChild(overlay);
    }
    
    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase().trim();
            const cards = document.querySelectorAll('.history-card');
            
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                if (text.includes(query)) {
                    card.style.display = 'flex';
                    card.style.opacity = '1';
                } else {
                    card.style.display = 'none';
                    card.style.opacity = '0';
                }
            });
        });
    }
    
    // 分享功能
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async function() {
            const url = window.location.href;
            const title = document.title;
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: title,
                        url: url
                    });
                } catch (err) {
                    console.log('Share cancelled');
                }
            } else {
                // 复制到剪贴板
                try {
                    await navigator.clipboard.writeText(url);
                    showToast('链接已复制到剪贴板');
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            }
        });
    }
    
    // Toast 提示
    function showToast(message) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
    
    // 标签筛选功能
    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) {
        const tags = tagFilter.querySelectorAll('.tag');
        let activeTag = null;
        
        tags.forEach(tag => {
            tag.addEventListener('click', function() {
                const tagName = this.dataset.tag;
                
                // 切换激活状态
                if (activeTag === tagName) {
                    // 取消筛选
                    activeTag = null;
                    tags.forEach(t => t.classList.remove('active'));
                    showAllCards();
                } else {
                    // 激活筛选
                    activeTag = tagName;
                    tags.forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    filterCardsByTag(tagName);
                }
            });
        });
    }
    
    function filterCardsByTag(tagName) {
        const cards = document.querySelectorAll('.history-card');
        cards.forEach(card => {
            const cardTags = card.dataset.tags;
            if (cardTags && cardTags.includes(tagName)) {
                card.style.display = 'flex';
                card.style.opacity = '1';
            } else {
                card.style.display = 'none';
                card.style.opacity = '0';
            }
        });
    }
    
    function showAllCards() {
        const cards = document.querySelectorAll('.history-card');
        cards.forEach(card => {
            card.style.display = 'flex';
            card.style.opacity = '1';
        });
    }
});
