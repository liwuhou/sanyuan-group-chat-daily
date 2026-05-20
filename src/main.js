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
                <div class="image-overlay-toolbar">
                    <div class="image-overlay-title">原图预览</div>
                    <div class="image-overlay-close">✕ 关闭</div>
                </div>
                <div class="image-overlay-stage">
                    <div class="image-overlay-loading">加载原图中...</div>
                    <img src="${originalUrl}" alt="原图" class="loaded">
                </div>
            </div>
        `;
        
        const stage = overlay.querySelector('.image-overlay-stage');
        const img = overlay.querySelector('img');
        const loading = overlay.querySelector('.image-overlay-loading');
        
        let scale = 1;
        let baseScale = 1;
        let startDistance = 0;
        let isPinching = false;
        
        function applyTransform() {
            img.style.transform = `scale(${scale})`;
            stage.classList.toggle('zoomed', scale > 1.02);
        }
        
        function clamp(n, min, max) {
            return Math.max(min, Math.min(max, n));
        }
        
        function getDistance(t1, t2) {
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            return Math.hypot(dx, dy);
        }
        
        function getCenter(t1, t2) {
            return {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };
        }
        
        // 加载完成后移除 loading
        img.addEventListener('load', () => {
            if (loading) loading.remove();
        }, { once: true });
        img.addEventListener('error', () => {
            if (loading) loading.textContent = '图片加载失败';
        }, { once: true });
        
        // 单击空白关闭
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.classList.contains('image-overlay-close')) {
                overlay.remove();
            }
        });
        
        // 单击图片切换放大
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isPinching) {
                if (scale > 1.02) {
                    scale = 1;
                    baseScale = 1;
                    img.style.transform = '';
                    stage.classList.remove('zoomed');
                } else {
                    scale = 2;
                    baseScale = 2;
                    applyTransform();
                }
            }
        });
        
        // 双指捏合缩放
        stage.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                isPinching = true;
                startDistance = getDistance(e.touches[0], e.touches[1]);
                baseScale = scale;
                stage.classList.add('zoomed');
            }
        }, { passive: false });
        
        stage.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && isPinching) {
                e.preventDefault();
                const dist = getDistance(e.touches[0], e.touches[1]);
                const center = getCenter(e.touches[0], e.touches[1]);
                scale = clamp((baseScale * dist) / startDistance, 1, 4);
                lastTouchCenter = { x: 0, y: 0 };
                applyTransform();
                if (loading) loading.remove();
            }
        }, { passive: false });
        
        stage.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                isPinching = false;
                if (scale <= 1.02) {
                    scale = 1;
                    baseScale = 1;
                    img.style.transform = '';
                    stage.classList.remove('zoomed');
                }
            }
        });
        
        // ESC 关闭
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', onKeyDown);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKeyDown));
        
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
