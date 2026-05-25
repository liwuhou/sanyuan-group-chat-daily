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
        const closeBtn = overlay.querySelector('.image-overlay-close');
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
        let rafId = 0;
        let cleaned = false;

        const lockScroll = () => {
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            document.body.dataset.prevOverflow = document.body.style.overflow;
            document.body.dataset.prevPosition = document.body.style.position;
            document.body.dataset.prevWidth = document.body.style.width;
            document.body.dataset.prevTop = document.body.style.top;
            document.body.dataset.prevScrollY = String(scrollY);
            document.documentElement.dataset.prevOverflow = document.documentElement.style.overflow;
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
        };

        const unlockScroll = () => {
            const scrollY = Number(document.body.dataset.prevScrollY || '0');
            document.body.style.overflow = document.body.dataset.prevOverflow || '';
            document.body.style.position = document.body.dataset.prevPosition || '';
            document.body.style.width = document.body.dataset.prevWidth || '';
            document.body.style.top = document.body.dataset.prevTop || '';
            document.documentElement.style.overflow = document.documentElement.dataset.prevOverflow || '';
            delete document.body.dataset.prevOverflow;
            delete document.body.dataset.prevPosition;
            delete document.body.dataset.prevWidth;
            delete document.body.dataset.prevTop;
            delete document.body.dataset.prevScrollY;
            delete document.documentElement.dataset.prevOverflow;
            window.scrollTo(0, scrollY);
        };

        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            unlockScroll();
            document.removeEventListener('keydown', onKeyDown);
            if (rafId) cancelAnimationFrame(rafId);
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
            stage.classList.toggle('zoomed', scale > 1.02);
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
            });
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
            if (e.target === overlay) {
                closeOverlay();
            }
        });

        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeOverlay();
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
    
    // 分享海报功能
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async function() {
            if (document.body.dataset.pageType !== 'digest') {
                await copyCurrentUrl();
                return;
            }

            const originalText = shareBtn.textContent;
            shareBtn.disabled = true;
            shareBtn.textContent = '正在生成海报...';

            try {
                const posterDataUrl = await generateDigestPoster();
                showPosterPreview(posterDataUrl);
            } catch (err) {
                console.error('Poster generation failed:', err);
                showToast('海报生成失败，已复制链接');
                await copyCurrentUrl();
            } finally {
                shareBtn.disabled = false;
                shareBtn.textContent = originalText;
            }
        });
    }

    async function copyCurrentUrl() {
        const url = window.location.href;
        try {
            await navigator.clipboard.writeText(url);
            showToast('链接已复制到剪贴板');
        } catch (err) {
            const input = document.createElement('input');
            input.value = url;
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
            showToast('链接已复制到剪贴板');
        }
    }

    function getText(selector, fallback = '') {
        const el = document.querySelector(selector);
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : fallback;
    }

    function getListItems(selector, limit) {
        return Array.from(document.querySelectorAll(selector + ' li'))
            .map(item => item.textContent.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, limit);
    }

    function collectPosterContent() {
        const body = document.body.dataset;
        const metaValues = Array.from(document.querySelectorAll('.meta-item')).reduce((acc, item) => {
            const label = item.querySelector('.meta-label')?.textContent.trim();
            const value = item.querySelector('.meta-value')?.textContent.trim();
            if (label && value) acc[label] = value;
            return acc;
        }, {});

        const tags = Array.from(document.querySelectorAll('.content-section:first-of-type .tag'))
            .map(tag => tag.textContent.trim())
            .filter(Boolean)
            .slice(0, 5);

        return {
            title: getText('.digest-title', document.title),
            groupName: body.groupName || getText('.breadcrumb-item:not(.active)', '群聊日报'),
            date: body.digestDate || metaValues.DATE || '',
            issue: body.issue || '',
            summary: getText('.lead-text', ''),
            points: getListItems('.point-list', 3),
            infos: getListItems('.info-list', 2),
            tags,
            stats: {
                messages: metaValues.MESSAGES || '',
                active: metaValues.ACTIVE || '',
                texts: metaValues.TEXTS || ''
            },
            url: window.location.href.split('#')[0]
        };
    }

    function wrapText(ctx, text, maxWidth, maxLines) {
        const chars = String(text || '').split('');
        const lines = [];
        let line = '';
        for (const char of chars) {
            const test = line + char;
            if (ctx.measureText(test).width > maxWidth && line) {
                lines.push(line);
                line = char;
                if (lines.length === maxLines) break;
            } else {
                line = test;
            }
        }
        if (line && lines.length < maxLines) lines.push(line);
        if (chars.length && lines.length === maxLines) {
            let last = lines[lines.length - 1];
            while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
                last = last.slice(0, -1);
            }
            lines[lines.length - 1] = last + '…';
        }
        return lines;
    }

    function roundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
        const lines = wrapText(ctx, text, maxWidth, maxLines);
        lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
        return y + lines.length * lineHeight;
    }

    function drawQr(ctx, url, x, y, size) {
        const qr = createQrCode(url);
        const count = qr.length;
        const moduleSize = size / count;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#3D3229';
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (qr[row][col]) {
                    ctx.fillRect(x + col * moduleSize, y + row * moduleSize, Math.ceil(moduleSize), Math.ceil(moduleSize));
                }
            }
        }
    }

    // Minimal QR Code generator for byte-mode Version 5-L URLs.
    // Keeps poster generation dependency-free on the static site.
    function createQrCode(text) {
        const version = 5;
        const size = 17 + version * 4;
        const dataCodewords = 108;
        const ecCodewords = 26;
        const modules = Array.from({ length: size }, () => Array(size).fill(null));
        const reserved = Array.from({ length: size }, () => Array(size).fill(false));

        function setModule(x, y, dark, isReserved = true) {
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            modules[y][x] = !!dark;
            if (isReserved) reserved[y][x] = true;
        }

        function drawFinder(x, y) {
            for (let dy = -1; dy <= 7; dy++) {
                for (let dx = -1; dx <= 7; dx++) {
                    const xx = x + dx;
                    const yy = y + dy;
                    const isBorder = dx === -1 || dx === 7 || dy === -1 || dy === 7;
                    const isOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
                    const isInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
                    setModule(xx, yy, !isBorder && (isOuter || isInner));
                }
            }
        }

        function drawAlignment(cx, cy) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    setModule(cx + dx, cy + dy, dist !== 1);
                }
            }
        }

        drawFinder(0, 0);
        drawFinder(size - 7, 0);
        drawFinder(0, size - 7);

        for (let i = 8; i < size - 8; i++) {
            setModule(i, 6, i % 2 === 0);
            setModule(6, i, i % 2 === 0);
        }
        drawAlignment(30, 30);
        setModule(8, size - 8, true);

        // Reserve format information areas.
        for (let i = 0; i < 9; i++) {
            if (i !== 6) {
                reserved[8][i] = true;
                reserved[i][8] = true;
            }
        }
        for (let i = 0; i < 8; i++) {
            reserved[8][size - 1 - i] = true;
            reserved[size - 1 - i][8] = true;
        }

        function appendBits(arr, value, length) {
            for (let i = length - 1; i >= 0; i--) arr.push((value >>> i) & 1);
        }

        const bytes = new TextEncoder().encode(text);
        const bits = [];
        appendBits(bits, 0b0100, 4); // byte mode
        appendBits(bits, Math.min(bytes.length, 106), 8);
        bytes.slice(0, 106).forEach(byte => appendBits(bits, byte, 8));
        const totalBits = dataCodewords * 8;
        appendBits(bits, 0, Math.min(4, totalBits - bits.length));
        while (bits.length % 8) bits.push(0);
        const data = [];
        for (let i = 0; i < bits.length; i += 8) {
            data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
        }
        for (let pad = 0; data.length < dataCodewords; pad ^= 1) data.push(pad ? 0x11 : 0xEC);

        const gfExp = Array(512).fill(0);
        const gfLog = Array(256).fill(0);
        let x = 1;
        for (let i = 0; i < 255; i++) {
            gfExp[i] = x;
            gfLog[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
        const gfMul = (a, b) => (a && b) ? gfExp[gfLog[a] + gfLog[b]] : 0;

        let gen = [1];
        for (let i = 0; i < ecCodewords; i++) {
            const next = Array(gen.length + 1).fill(0);
            for (let j = 0; j < gen.length; j++) {
                next[j] ^= gfMul(gen[j], gfExp[i]);
                next[j + 1] ^= gen[j];
            }
            gen = next;
        }

        const ec = Array(ecCodewords).fill(0);
        data.forEach(byte => {
            const factor = byte ^ ec.shift();
            ec.push(0);
            for (let i = 0; i < ecCodewords; i++) ec[i] ^= gfMul(gen[i], factor);
        });
        const allCodewords = data.concat(ec);
        const allBits = [];
        allCodewords.forEach(byte => appendBits(allBits, byte, 8));

        let bitIndex = 0;
        let upward = true;
        for (let col = size - 1; col >= 1; col -= 2) {
            if (col === 6) col--;
            for (let i = 0; i < size; i++) {
                const row = upward ? size - 1 - i : i;
                for (let c = 0; c < 2; c++) {
                    const xx = col - c;
                    if (!reserved[row][xx]) {
                        let bit = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
                        if ((row + xx) % 2 === 0) bit ^= 1; // mask pattern 0
                        setModule(xx, row, bit, false);
                    }
                }
            }
            upward = !upward;
        }

        function formatBits(ecl, mask) {
            let dataBits = (ecl << 3) | mask;
            let rem = dataBits << 10;
            const poly = 0x537;
            for (let i = 14; i >= 10; i--) {
                if ((rem >>> i) & 1) rem ^= poly << (i - 10);
            }
            return ((dataBits << 10) | rem) ^ 0x5412;
        }

        const fmt = formatBits(1, 0); // ECL L, mask 0
        for (let i = 0; i < 15; i++) {
            const bit = ((fmt >>> i) & 1) === 1;
            const a = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]][i];
            const b = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]][i];
            setModule(a[0], a[1], bit);
            setModule(b[0], b[1], bit);
        }

        return modules.map(row => row.map(cell => !!cell));
    }

    async function generateDigestPoster() {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const data = collectPosterContent();
        const canvas = document.createElement('canvas');
        const scale = Math.min(window.devicePixelRatio || 2, 3);
        const width = 860;
        const height = 1320;
        canvas.width = width * scale;
        canvas.height = height * scale;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        ctx.fillStyle = '#F7F3EC';
        ctx.fillRect(0, 0, width, height);

        // Soft editorial background shapes
        ctx.fillStyle = 'rgba(139, 115, 85, 0.08)';
        ctx.beginPath();
        ctx.arc(720, 130, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(217, 207, 194, 0.45)';
        ctx.beginPath();
        ctx.arc(90, 1120, 230, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        roundRect(ctx, 54, 54, 752, 1212, 34);
        ctx.fillStyle = '#FFFDF8';
        ctx.shadowColor = 'rgba(61, 50, 41, 0.12)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 12;
        ctx.fill();
        ctx.restore();

        let y = 108;
        ctx.fillStyle = '#8B7355';
        ctx.font = '500 26px "Noto Sans SC", sans-serif';
        ctx.fillText('DAILY DIGEST', 96, y);
        ctx.textAlign = 'right';
        ctx.fillText(data.issue ? `Issue No.${data.issue}` : '群聊日报', 764, y);
        ctx.textAlign = 'left';

        y += 82;
        ctx.fillStyle = '#3D3229';
        ctx.font = '700 56px "Noto Serif SC", serif';
        y = drawWrapped(ctx, data.title, 96, y, 668, 68, 2) + 22;

        ctx.fillStyle = '#6B5E52';
        ctx.font = '400 26px "Noto Sans SC", sans-serif';
        ctx.fillText(data.date, 96, y);
        y += 56;

        const statY = y;
        const statItems = [
            ['消息', data.stats.messages || '—'],
            ['活跃', data.stats.active || '—'],
            ['文本', data.stats.texts || '—']
        ];
        statItems.forEach((item, i) => {
            const x = 96 + i * 214;
            roundRect(ctx, x, statY, 176, 92, 18);
            ctx.fillStyle = '#F7F3EC';
            ctx.fill();
            ctx.fillStyle = '#3D3229';
            ctx.font = '700 32px "Noto Serif SC", serif';
            ctx.fillText(String(item[1]), x + 24, statY + 38);
            ctx.fillStyle = '#8B7355';
            ctx.font = '400 22px "Noto Sans SC", sans-serif';
            ctx.fillText(item[0], x + 24, statY + 68);
        });
        y += 136;

        if (data.tags.length) {
            ctx.font = '400 22px "Noto Sans SC", sans-serif';
            let x = 96;
            data.tags.forEach(tag => {
                const label = `# ${tag}`;
                const w = ctx.measureText(label).width + 34;
                if (x + w > 764) return;
                roundRect(ctx, x, y - 28, w, 42, 21);
                ctx.fillStyle = '#EFE7DC';
                ctx.fill();
                ctx.fillStyle = '#8B7355';
                ctx.fillText(label, x + 17, y);
                x += w + 10;
            });
            y += 46;
        }

        ctx.fillStyle = '#3D3229';
        ctx.font = '600 30px "Noto Serif SC", serif';
        ctx.fillText('① 核心概览', 96, y);
        y += 46;
        ctx.fillStyle = '#5A4B3F';
        ctx.font = '400 28px "Noto Sans SC", sans-serif';
        y = drawWrapped(ctx, data.summary, 96, y, 668, 42, 5) + 54;

        if (data.points.length) {
            ctx.fillStyle = '#3D3229';
            ctx.font = '600 30px "Noto Serif SC", serif';
            ctx.fillText('② 精选要点', 96, y);
            y += 46;
            ctx.font = '400 25px "Noto Sans SC", sans-serif';
            ctx.fillStyle = '#5A4B3F';
            data.points.forEach((point, idx) => {
                ctx.fillStyle = '#8B7355';
                ctx.fillText(String(idx + 1).padStart(2, '0'), 96, y);
                ctx.fillStyle = '#5A4B3F';
                y = drawWrapped(ctx, point, 142, y, 622, 36, 2) + 18;
            });
        }

        const footerY = 1128;
        ctx.strokeStyle = '#E3D8CA';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(96, footerY - 36);
        ctx.lineTo(764, footerY - 36);
        ctx.stroke();

        drawQr(ctx, data.url, 96, footerY, 118);
        ctx.fillStyle = '#3D3229';
        ctx.font = '600 28px "Noto Serif SC", serif';
        ctx.fillText('扫码阅读完整日报', 242, footerY + 40);
        ctx.fillStyle = '#8B7355';
        ctx.font = '400 22px "Noto Sans SC", sans-serif';
        ctx.fillText(data.groupName + ' · 群聊日报', 242, footerY + 78);
        ctx.fillText(new URL(data.url).host, 242, footerY + 110);

        return canvas.toDataURL('image/png');
    }

    function showPosterPreview(dataUrl) {
        const scrollY = window.scrollY;
        document.querySelector('.poster-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'poster-overlay';
        overlay.innerHTML = `
            <div class="poster-panel" role="dialog" aria-modal="true" aria-label="分享海报预览">
                <button class="poster-close" type="button" aria-label="关闭">×</button>
                <div class="poster-preview-wrap">
                    <img class="poster-preview-img" src="${dataUrl}" alt="日报分享海报">
                </div>
                <div class="poster-actions">
                    <a class="poster-download" href="${dataUrl}" download="daily-digest-poster.png">下载海报</a>
                    <button class="poster-copy-link" type="button">复制链接</button>
                </div>
                <p class="poster-hint">长按图片可保存到相册；二维码会打开当前日报。</p>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('poster-open');

        const close = () => {
            overlay.remove();
            document.body.classList.remove('poster-open');
            window.scrollTo(0, scrollY);
        };

        overlay.querySelector('.poster-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.poster-copy-link').addEventListener('click', copyCurrentUrl);

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', onKeyDown);
                close();
            }
        };
        document.addEventListener('keydown', onKeyDown);
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
