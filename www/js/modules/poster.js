(function (global) {
    'use strict';

    global.LevantModules = global.LevantModules || {};
    global.LevantModules.poster = {
        toggleScreenshotMode() {
            this.isScreenshotMode = !this.isScreenshotMode;
            if (!this.isScreenshotMode) {
                this.screenshotRect = { x:0, y:0, w:0, h:0 };
                this.screenshotTarget = null;
            }
        },
        exitScreenshotMode() {
            this.isScreenshotMode = false;
        },

        // 核心逻辑：智能查找“值得截图”的父级容器
        handleScreenshotHover(e) {
            const elements = document.elementsFromPoint(e.clientX, e.clientY);

            // 1. 找到第一个不是“截图辅助层”的元素
            const el = elements.find(node =>
                node.nodeType === 1 &&
                !node.classList.contains('screenshot-backdrop') &&
                !node.classList.contains('screenshot-overlay') &&
                !node.classList.contains('screenshot-label')
            );

            if (!el) return;

            // 2. [关键修改] 特殊处理地图区域
            // 如果鼠标下的元素属于地图视口（或者是视口本身），直接强制锁定为视口容器
            // 这样无论地图放大多少倍，我们只截取“窗口”看到的部分
            const mapViewport = el.closest('.map-viewport');
            if (mapViewport) {
                this.screenshotTarget = mapViewport;
                this.screenshotTargetName = "Tactical_Map_View";

                const rect = mapViewport.getBoundingClientRect();
                this.screenshotRect = {
                    x: rect.left,
                    y: rect.top,
                    w: rect.width,
                    h: rect.height
                };
                return; // 地图处理完毕，直接返回
            }

            // 3. 常规组件吸附逻辑 (处理非地图区域)
            const targetSelectors = [
                '.info-card',          // 实体卡片
                '.impact-badge',       // 状态胶囊
                '.glass-panel',        // 弹窗
                'aside',               // 侧边栏
                'header',              // 顶栏
                'section[role="main"]',// 中间主视图 (如果没选中地图视口，可能会选中这个)
                '.poster-terminal',
                '.poster-newspaper'
            ];

            let target = el.closest(targetSelectors.join(','));

            // 兜底逻辑
            if (!target) {
                // 排除大背景，防止误触
                if (el.id === 'app' || el.tagName === 'BODY' || el.tagName === 'HTML' || el.classList.contains('app-texture')) {
                    this.screenshotRect = { x:0, y:0, w:0, h:0 };
                    this.screenshotTarget = null;
                    return;
                }
                target = el;
            }

            this.screenshotTarget = target;

            // 获取显示名称
            let name = target.className;
            if (typeof name === 'string') name = name.split(' ')[0];
            else name = target.tagName.toLowerCase();

            if (target.getAttribute('aria-label')) name = target.getAttribute('aria-label');
            this.screenshotTargetName = name || 'Element';

            // 计算位置
            const rect = target.getBoundingClientRect();
            this.screenshotRect = {
                x: rect.left,
                y: rect.top,
                w: rect.width,
                h: rect.height
            };
        },
        async captureScreenshot() {
            if (!this.screenshotTarget) {
                alert("错误：未选中任何区域。");
                return;
            }

            const rect = { ...this.screenshotRect };
            const fileNameLabel = this.screenshotTargetName || "Capture";

            // 1. 暂时隐藏截图框
            this.isScreenshotMode = false;
            await this.$nextTick();

            try {
                // 获取 DPR (Retina屏幕支持)
                const dpr = window.devicePixelRatio || 1;

                // 计算屏幕物理分辨率
                const screenW = window.screen.width * dpr;
                const screenH = window.screen.height * dpr;

                // 2. 唤起屏幕共享 (参数调优版)
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        displaySurface: "browser",
                        // 【优化】去掉鼠标光标 (需选择"当前标签页")
                        cursor: "never",

                        // 【优化】请求最大物理分辨率
                        width: { ideal: screenW, max: 8192 },
                        height: { ideal: screenH, max: 8192 },

                        // 【优化】强制低帧率，告诉编码器我们要的是画质而不是流畅度
                        frameRate: { ideal: 1, max: 15 },

                        resizeMode: "none"
                    },
                    audio: false,
                    preferCurrentTab: true
                });

                // 3. 视频预热
                const video = document.createElement("video");
                video.style.position = "fixed";
                video.style.top = "-9999px";
                video.style.left = "-9999px";
                // 确保 video 元素本身也是物理像素大小，防止浏览器内部缩放
                video.style.width = window.innerWidth + "px";
                video.style.height = window.innerHeight + "px";
                document.body.appendChild(video);

                video.srcObject = stream;
                await video.play();

                // 【强制等待】等待画面变清晰 (视频流刚开始几帧通常很糊，主要是关键帧未到)
                await new Promise(resolve => setTimeout(resolve, 800));

                // 4. 计算精准坐标 (消除亚像素模糊)
                // 视频实际分辨率
                const videoW = video.videoWidth;
                // CSS 视口分辨率
                const viewportW = window.innerWidth;
                // 真实的缩放因子
                const scaleFactor = videoW / viewportW;

                // 【关键优化】所有坐标强制取整 (Math.round)，避免半像素渲染导致的模糊
                const sX = Math.round(rect.x * scaleFactor);
                const sY = Math.round(rect.y * scaleFactor);
                const sW = Math.round(rect.w * scaleFactor);
                const sH = Math.round(rect.h * scaleFactor);

                // 5. 绘图
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                canvas.width = sW;
                canvas.height = sH;

                // 关闭平滑 (在 1:1 像素映射时，关闭平滑反而更锐利)
                ctx.imageSmoothingEnabled = false;

                // 【可选黑科技】应用 SVG 锐化滤镜补偿视频压缩模糊
                // 如果觉得画面太“硬”，可以注释掉下面这行
                ctx.filter = 'contrast(1.05) saturate(1.05)';

                ctx.drawImage(
                    video,
                    sX, sY, sW, sH,  // 源坐标 (物理像素)
                    0, 0, canvas.width, canvas.height // 目标坐标
                );

                // 6. 清理
                stream.getTracks().forEach(track => track.stop());
                document.body.removeChild(video);

                // 7. 下载
                const link = document.createElement('a');
                link.download = `Crystal_Snap_${fileNameLabel}_${Date.now()}.png`;
                link.href = canvas.toDataURL("image/png");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

            } catch (e) {
                console.error(e);
                if (e.name !== 'NotAllowedError') {
                    alert("截图异常: " + e.message);
                }
            } finally {
                document.body.style.cursor = 'default';
                this.isScreenshotMode = true;
            }
        },
        // [新增] 切换地图标记显示模式
        async exportAsImage(type, data) {
            this.posterData = { title: '', factionName: '', color: '', icon: '', content: '', badges: [], timeDisplay: '' };
            const currentTurnTime = this.timeline.length > 0 ? this.timeline[this.timeline.length-1].timeRange : 'Current';
            if (type === 'faction') {
                this.posterData.title = data.name;
                this.posterData.factionName = "ENTITY FILE";
                this.posterData.color = data.color;
                this.posterData.icon = data.logo;
                this.posterData.content = this.renderMarkdown(data.desc);
                this.posterData.timeDisplay = currentTurnTime;
                for(let key in data.stats) {
                    this.posterData.badges.push({ name: data.name, icon: data.logo, color: data.color, label: this.getSchemaLabel(key), val: data.stats[key] });
                }
            } else if (type === 'event') {
                this.posterData.title = data.summary;
                this.posterData.factionName = this.getFactionName(data.factionId);
                this.posterData.color = this.getFactionColor(data.factionId);
                this.posterData.icon = this.getFactionLogo(data.factionId);
                this.posterData.content = this.renderMarkdown(data.content);
                this.posterData.timeDisplay = this.formatTimeSpan(data);
                if(data.impacts) {
                    data.impacts.forEach(imp => {
                        // ★ 核心修复：手动拼接数值变化字符串
                        const changeString = `${imp.oldValue} → ${imp.newValue}`;

                        this.posterData.badges.push({
                            name: imp.targetName,
                            icon: this.getFactionLogo(imp.targetId),
                            color: this.getFactionColor(imp.targetId),
                            label: imp.attrLabel,
                            val: changeString // ★ 使用拼接好的字符串
                        });
                    });
                }
            } else if (type === 'lore') {
                this.posterData.title = data.keys;
                this.posterData.factionName = "LORE DATABASE";
                this.posterData.color = "#10b981";
                this.posterData.icon = "fa-solid fa-database";
                this.posterData.content = this.renderMarkdown(data.content);
                this.posterData.timeDisplay = currentTurnTime;
            } else if (type === 'rules') {
                this.posterData.title = "SYSTEM RULES";
                this.posterData.factionName = "CORE";
                this.posterData.color = "#f59e0b";
                this.posterData.icon = "fa-solid fa-sliders";
                this.posterData.timeDisplay = currentTurnTime;
                let content = "Current Rules:\n\n";
                data.forEach(d => content += `- **${d.label}** [${d.key}]\n`);
                this.posterData.content = this.renderMarkdown(content);
            }
            await this.$nextTick();
            const element = document.getElementById('poster-canvas');
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
                const canvas = await html2canvas(element, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
                const link = document.createElement('a');
                link.download = `Levant_${type}_${Date.now()}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            } catch (e) { alert("Error generating image"); }
        },
    };
})(window);
