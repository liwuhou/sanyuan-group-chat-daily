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
        const previewUrl = originalUrl;
        const overlay = document.createElement('div');
        overlay.className = 'image-overlay';
        overlay.innerHTML = `
            <div class="image-overlay-content">
                <div class="image-overlay-toolbar">
                    <div class="image-overlay-title">原图预览</div>
                    <div class="image-overlay-actions">
                        <button type="button" class="image-overlay-fullscreen">全屏</button>
                        <button type="button" class="image-overlay-close">✕ 关闭</button>
                    </div>
                </div>
                <div class="image-overlay-stage">
                    <div class="image-overlay-loading">加载原图中...</div>
                    <img src="${previewUrl}" alt="原图" class="loaded">
                </div>
            </div>
        `;

        const content = overlay.querySelector('.image-overlay-content');
        const stage = overlay.querySelector('.image-overlay-stage');
        const img = overlay.querySelector('img');
        const loading = overlay.querySelector('.image-overlay-loading');
        const fullscreenBtn = overlay.querySelector('.image-overlay-fullscreen');
        let isFullscreen = false;
        let scale = 1;
        let baseScale = 1;
        let startDistance = 0;
        let isPinching = false;
        let cleaned = false;

        const lockScroll = () => {
            document.body.dataset.prevOverflow = document.body.style.overflow;
            document.body.dataset.prevPosition = document.body.style.position;
            document.body.dataset.prevWidth = document.body.style.width;
            document.documentElement.dataset.prevOverflow = document.documentElement.style.overflow;
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
        };

        const unlockScroll = () => {
            document.body.style.overflow = document.body.dataset.prevOverflow || '';
            document.body.style.position = document.body.dataset.prevPosition || '';
            document.body.style.width = document.body.dataset.prevWidth || '';
            document.documentElement.style.overflow = document.documentElement.dataset.prevOverflow || '';
            delete document.body.dataset.prevOverflow;
            delete document.body.dataset.prevPosition;
            delete document.body.dataset.prevWidth;
            delete document.documentElement.dataset.prevOverflow;
        };

        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            unlockScroll();
            document.removeEventListener('keydown', onKeyDown);
            overlay.removeEventListener('touchmove', blockTouchMove, { passive: false });
        };

        const closeOverlay = () => {
            cleanup();
            overlay.remove();
        };

        const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
        const getDistance = (t1, t2) => {
            const dx = t1.clientX - t2.clientX;
            const dy = t1.clientY - t2.clientY;
            return Math.hypot(dx, dy);
        };

        const applyTransform = () => {
            img.style.transform = `scale(${scale})`;
            stage.classList.toggle('zoomed', scale > 1.02);
        };

        const blockTouchMove = (e) => {
            if (!stage.contains(e.target) || e.touches.length !== 2) {
                e.preventDefault();
            }
        };

        lockScroll();
        overlay.style.touchAction = 'none';
        overlay.addEventListener('touchmove', blockTouchMove, { passive: false });
        document.body.appendChild(overlay);

        img.addEventListener('load', () => {
            if (loading) loading.remove();
        }, { once: true });
        img.addEventListener('error', () => {
            if (loading) loading.textContent = '图片加载失败';
        }, { once: true });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('image-overlay-close')) {
                closeOverlay();
            }
        });

        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isFullscreen = !isFullscreen;
            content.classList.toggle('is-fullscreen', isFullscreen);
            fullscreenBtn.textContent = isFullscreen ? '退出全屏' : '全屏';
        });

        img.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isPinching) return;
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
        });

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
                scale = clamp((baseScale * dist) / startDistance, 1, 4);
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

        document.addEventListener('keydown', onKeyDown);

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                closeOverlay();
            }
        }
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
