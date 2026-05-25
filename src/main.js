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
                    <div class="image-overlay-title">原图预览 · 双击/滚轮缩放，拖动查看</div>
                    <div class="image-overlay-actions">
                        <button type="button" class="image-overlay-zoom-out" aria-label="缩小">−</button>
                        <button type="button" class="image-overlay-zoom-reset" aria-label="复位">1:1</button>
                        <button type="button" class="image-overlay-zoom-in" aria-label="放大">＋</button>
                        <button type="button" class="image-overlay-fullscreen">全屏</button>
                        <button type="button" class="image-overlay-close">✕ 关闭</button>
                    </div>
                </div>
                <div class="image-overlay-stage">
                    <div class="image-overlay-loading">加载原图中...</div>
                    <img src="${previewUrl}" alt="原图" class="loaded" draggable="false">
                </div>
            </div>
        `;

        const content = overlay.querySelector('.image-overlay-content');
        const stage = overlay.querySelector('.image-overlay-stage');
        const img = overlay.querySelector('img');
        const loading = overlay.querySelector('.image-overlay-loading');
        const fullscreenBtn = overlay.querySelector('.image-overlay-fullscreen');
        const zoomInBtn = overlay.querySelector('.image-overlay-zoom-in');
        const zoomOutBtn = overlay.querySelector('.image-overlay-zoom-out');
        const zoomResetBtn = overlay.querySelector('.image-overlay-zoom-reset');
        let isFullscreen = false;
        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let startTranslateX = 0;
        let startTranslateY = 0;
        let pinchStartDistance = 0;
        let pinchStartScale = 1;
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
            window.removeEventListener('mousemove', onDragMove);
            window.removeEventListener('mouseup', onDragEnd);
            window.removeEventListener('touchmove', onTouchMove, { passive: false });
            window.removeEventListener('touchend', onTouchEnd);
            window.removeEventListener('touchcancel', onTouchEnd);
        };

        const closeOverlay = () => {
            cleanup();
            overlay.remove();
        };

        const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
        const getDistance = (t1, t2) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

        const applyTransform = () => {
            img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
            stage.classList.toggle('zoomed', scale > 1.02);
        };

        const resetView = () => {
            scale = 1;
            translateX = 0;
            translateY = 0;
            applyTransform();
        };

        const zoomTo = (nextScale, originX, originY) => {
            const oldScale = scale;
            const newScale = clamp(nextScale, 1, 6);
            if (Math.abs(newScale - oldScale) < 0.001) return;

            const rect = stage.getBoundingClientRect();
            const cx = originX == null ? rect.left + rect.width / 2 : originX;
            const cy = originY == null ? rect.top + rect.height / 2 : originY;
            const dx = cx - (rect.left + rect.width / 2);
            const dy = cy - (rect.top + rect.height / 2);
            const ratio = newScale / oldScale;

            translateX = dx - (dx - translateX) * ratio;
            translateY = dy - (dy - translateY) * ratio;
            scale = newScale;
            if (scale <= 1.02) {
                resetView();
            } else {
                applyTransform();
            }
        };

        lockScroll();
        overlay.style.touchAction = 'none';
        stage.style.touchAction = 'none';
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

        content.addEventListener('click', (e) => e.stopPropagation());

        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isFullscreen = !isFullscreen;
            content.classList.toggle('is-fullscreen', isFullscreen);
            fullscreenBtn.textContent = isFullscreen ? '退出全屏' : '全屏';
        });

        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            zoomTo(scale * 1.25);
        });

        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            zoomTo(scale / 1.25);
        });

        zoomResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetView();
        });

        img.addEventListener('click', (e) => {
            // 单击图片只拦截冒泡，不再复位；复位用双击或工具栏按钮。
            e.stopPropagation();
        });

        img.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (scale > 1.02) {
                resetView();
            } else {
                zoomTo(2.5, e.clientX, e.clientY);
            }
        });

        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            zoomTo(scale * factor, e.clientX, e.clientY);
        }, { passive: false });

        img.addEventListener('mousedown', (e) => {
            if (scale <= 1.02 || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            startTranslateX = translateX;
            startTranslateY = translateY;
            stage.classList.add('is-dragging');
            window.addEventListener('mousemove', onDragMove);
            window.addEventListener('mouseup', onDragEnd);
        });

        function onDragMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            translateX = startTranslateX + e.clientX - dragStartX;
            translateY = startTranslateY + e.clientY - dragStartY;
            applyTransform();
        }

        function onDragEnd() {
            isDragging = false;
            stage.classList.remove('is-dragging');
            window.removeEventListener('mousemove', onDragMove);
            window.removeEventListener('mouseup', onDragEnd);
        }

        stage.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                if (scale <= 1.02) return;
                e.preventDefault();
                const t = e.touches[0];
                isDragging = true;
                dragStartX = t.clientX;
                dragStartY = t.clientY;
                startTranslateX = translateX;
                startTranslateY = translateY;
                stage.classList.add('is-dragging');
            } else if (e.touches.length === 2) {
                e.preventDefault();
                isDragging = false;
                stage.classList.remove('is-dragging');
                pinchStartDistance = getDistance(e.touches[0], e.touches[1]);
                pinchStartScale = scale;
            }
        }, { passive: false });

        function onTouchMove(e) {
            if (!stage.contains(e.target)) return;
            if (e.touches.length === 1 && isDragging) {
                e.preventDefault();
                const t = e.touches[0];
                translateX = startTranslateX + t.clientX - dragStartX;
                translateY = startTranslateY + t.clientY - dragStartY;
                applyTransform();
            } else if (e.touches.length === 2 && pinchStartDistance > 0) {
                e.preventDefault();
                const dist = getDistance(e.touches[0], e.touches[1]);
                const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                zoomTo((pinchStartScale * dist) / pinchStartDistance, centerX, centerY);
                if (loading) loading.remove();
            }
        }

        function onTouchEnd(e) {
            if (e.touches.length === 0) {
                isDragging = false;
                pinchStartDistance = 0;
                stage.classList.remove('is-dragging');
            }
        }

        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('touchcancel', onTouchEnd);
        document.addEventListener('keydown', onKeyDown);

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                closeOverlay();
            } else if (e.key === '+' || e.key === '=') {
                zoomTo(scale * 1.25);
            } else if (e.key === '-') {
                zoomTo(scale / 1.25);
            } else if (e.key === '0') {
                resetView();
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
