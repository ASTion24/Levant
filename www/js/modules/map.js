(function (global) {
    'use strict';

    global.LevantModules = global.LevantModules || {};
    global.LevantModules.map = {
        getFlagTransform(reg, layer) {
            const bounds = this.getFactionBounds(layer, reg.ownerId);
            if (!bounds) return { x: 0, y: 0, w: 100, h: 100 };

            // 1. 获取地图的实际物理长宽比 (修正拉伸的关键!)
            // 尝试找到地图底图图片
            let mapRatio = 1.77; // 默认 16:9 兜底
            const mapImg = document.querySelector('#map-capture-target img');
            if (mapImg && mapImg.naturalHeight > 0) {
                mapRatio = mapImg.naturalWidth / mapImg.naturalHeight;
            }

            // 2. 设定国旗的目标视觉比例 (3:2 = 1.5)
            const flagRatio = 1.5;

            // 3. 计算修正系数
            // 我们在百分比坐标系下计算，必须抵消地图本身的拉伸
            // 公式推导：(W% * MapWidth) / (H% * MapHeight) = FlagRatio
            // => W%/H% * MapRatio = FlagRatio
            // => W%/H% = FlagRatio / MapRatio
            // 这个 ratioCorrection 就是 H% 应该相对于 W% 缩放多少
            const ratioCorrection = mapRatio / flagRatio;

            // 4. 计算疆域的“百分比比例”
            const boundsPercentRatio = bounds.w / bounds.h;

            // 5. 计算虚拟背景板 (单位: %)
            let virtW, virtH;

            // 比较时也要带上修正系数
            if (boundsPercentRatio > (1 / ratioCorrection)) {
                // 疆域比国旗更扁 -> 宽度对齐
                virtW = bounds.w;
                virtH = bounds.w * ratioCorrection;
            } else {
                // 疆域比国旗更瘦 -> 高度对齐
                virtH = bounds.h;
                virtW = bounds.h / ratioCorrection;
            }

            // 6. 中心对齐
            const boundsCenterX = bounds.x + bounds.w / 2;
            const boundsCenterY = bounds.y + bounds.h / 2;

            const virtX = boundsCenterX - virtW / 2;
            const virtY = boundsCenterY - virtH / 2;

            // 7. 映射到局部坐标
            return {
                x: (virtX - reg.x) / reg.w * 100,
                y: (virtY - reg.y) / reg.h * 100,
                w: virtW / reg.w * 100,
                h: virtH / reg.h * 100
            };
        },
        getFactionBounds(layer, ownerId) {
            // 如果是无主之地，只计算自己，防止无主地块连成一片
            if (!ownerId) return null;

            // 简单的缓存机制 (如果不加缓存，渲染每一帧都会遍历数组，性能会略有损耗，但几百个地块以内问题不大)
            // 这里为了代码简洁，采用实时计算。

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let found = false;

            // 遍历当前图层的所有地块
            layer.data.forEach(r => {
                if (r.ownerId === ownerId) {
                    if (r.x < minX) minX = r.x;
                    if (r.y < minY) minY = r.y;
                    // 注意：r.x 是左上角，右下角是 r.x + r.w
                    if (r.x + r.w > maxX) maxX = r.x + r.w;
                    if (r.y + r.h > maxY) maxY = r.y + r.h;
                    found = true;
                }
            });

            if (!found) return null;

            return {
                x: minX,
                y: minY,
                w: maxX - minX,
                h: maxY - minY
            };
        },
        // --- [新增] 多行动方编辑器辅助方法 ---
        getMapBackground() {
            // 1. 优先查找新版图层系统中的可见 Image 层
            if (this.map_data.layers && this.map_data.layers.length > 0) {
                // 找第一个可见的、类型为 image 的图层
                const imgLayer = this.map_data.layers.find(l => l.type === 'image' && l.visible);
                if (imgLayer && imgLayer.data) return imgLayer.data;
            }

            // 2. 兼容旧版数据结构
            if (this.map_data.image) return this.map_data.image;

            // 3. 都没有，返回 null (前端会处理显示默认 logo 或黑色)
            return null;
        },
        // ★★★ [新增] 统一的启动页点击处理器 ★★★
        cycleMapDisplayMode() {
            // 在数组中增加了 'flag' 模式
            const modes = ['full', 'icon', 'dot', 'flag'];
            const idx = modes.indexOf(this.mapView.displayMode);
            this.mapView.displayMode = modes[(idx + 1) % modes.length];
        },

        // [新增] 统一获取坐标 (兼容 Mouse 和 Touch)
        getClientPos(e) {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        },
        // [新增] 辅助 Impact 表单：根据选中的目标ID，返回其可用的属性字段列表
        getFieldsForImpactTarget(targetId) {
            if (!targetId || targetId === 'global') return []; // Global 单独处理
            const p = this.players.find(x => x.id === targetId);
            if (!p) return [];
            return this.getFieldsBySchemaId(p.schemaId);
        },
        getImpactColor(imp) {
        const type = imp.type || 'STAT_CHANGE';
        switch(type) {
            case 'STAT_CHANGE': return this.getFactionColor(imp.targetId);
            case 'REGION_TRANSFER': return '#6366f1'; // Indigo
            case 'ENTITY_CREATE': return '#10b981';   // Emerald
            case 'ENTITY_REMOVE': return '#ef4444';   // Red
            default: return '#64748b';
        }
    },
        getAttrValueDisplay(tid, key) {
            if (!tid || !key) return '---';
            if (tid === 'global') {
                const g = this.global_vars.find(x => x.key === key);
                return g ? g.value : '???';
            } else {
                const p = this.players.find(x => x.id === tid);
                return p ? (p.stats[key] || 'N/A') : '???';
            }
        },
        getFinalPinIcon(pin) {
            // 1. 如果 Pin 本身有自定义图标，优先使用
            if (pin.icon) return pin.icon;

            // 2. 如果没有自定义，且关联了实体，使用实体的 Logo
            if (pin.type === 'entity' || (!pin.type && pin.linkId)) {
                const p = this.players.find(x => x.id === pin.linkId);
                if (p && p.logo) return p.logo;
            }

            // 3. 默认图标 (区分资料点和普通点)
            if (pin.type === 'lore') return 'fa-solid fa-book-bookmark';
            return 'fa-solid fa-map-pin';
        },
        getFinalPinColor(pin) {
            // 1. 优先使用 Pin 自定义颜色
            if (pin.color) return pin.color;

            // 2. 使用实体颜色
            if (pin.type === 'entity' || (!pin.type && pin.linkId)) {
                const p = this.players.find(x => x.id === pin.linkId);
                if (p && p.color) return p.color;
            }

            // 3. 默认颜色
            if (pin.type === 'lore') return '#10b981'; // Emerald
            return '#f59e0b'; // Amber
        },


        // 1. 上传图片 (上传后自动重置视图，并初始化 Canvas)
        handleMapUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                // 查找当前激活的 Image 层，如果没有，创建一个新的
                let targetLayer = this.getActiveLayer();
                if (!targetLayer || targetLayer.type !== 'image') {
                    targetLayer = this.map_data.layers.find(l => l.type === 'image');
                }

                if (!targetLayer) {
                    this.addLayer('image');
                    targetLayer = this.map_data.layers[this.map_data.layers.length - 1]; // addLayer 是 push
                } else if (targetLayer.type !== 'image') {
                     this.addLayer('image');
                     targetLayer = this.map_data.layers[this.map_data.layers.length - 1];
                }

                // 更新图层数据
                targetLayer.data = e.target.result;
                targetLayer.name = file.name || "Map Layer";

                // 切换到该图层
                this.map_data.activeLayerId = targetLayer.id;

                this.resetMapView();
                this.saveGame('autosave.json');

                // [修复] 重新扫描底图并更新分析画布
                this.$nextTick(() => this.initMapCanvas());
            };
            reader.readAsDataURL(file);
        },

        // [新增] Canvas 初始化辅助函数
        initMapCanvas() {
            const canvas = document.getElementById('map-analysis-canvas');
            if(!canvas) return;

            // 1. 寻找用于分析的底图
            // 优先找名为 "Base Map" 的，或者第一个 type 为 image 的可见图层
            let baseLayer = this.map_data.layers.find(l => l.type === 'image' && l.visible);

            if (!baseLayer || !baseLayer.data) {
                console.warn("No visible base map layer found for analysis.");
                return;
            }

            const ctx = canvas.getContext('2d');
            const img = new Image();

            // 关键：允许跨域，虽然一般是 base64
            img.crossOrigin = "Anonymous";

            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                console.log("Analysis Canvas updated with layer:", baseLayer.name);
            };

            img.src = baseLayer.data;
        },

        // 2. 重置视图 (Fit Width)
        resetMapView() {
            this.mapView = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0, badgeScale: 1.0, displayMode: 'full' };
        },

        // 3. 鼠标滚轮 (缩放)
        onMapWheel(e) {
            // [修复] 只要有图层或者是处于地图模式，就允许缩放，不再检查 map_data.image
            if (!this.showMap && this.map_data.layers.length === 0) return;

            const zoomIntensity = 0.1;
            const direction = e.deltaY > 0 ? -1 : 1;
            let newScale = this.mapView.scale + (direction * zoomIntensity);

            // 限制缩放范围 (0.1x ~ 10x)
            newScale = Math.min(Math.max(0.1, newScale), 10);

            this.mapView.scale = newScale;
        },
        // [升级] 导出地图配置 (包含依赖的规则集)
        exportMapConfig() {
            // [修复] 检查图层数量而不是 image
            if (!this.map_data.layers || this.map_data.layers.length === 0) return alert("No map layers to export.");

            // 1. 扫描地图中用到的规则集 ID
            const usedSchemaIds = new Set();

            // 遍历所有图层寻找引用
            this.map_data.layers.forEach(layer => {
                if (layer.type === 'region' && Array.isArray(layer.data)) {
                    layer.data.forEach(reg => {
                        if (reg.schemaId) usedSchemaIds.add(reg.schemaId);
                    });
                }
            });

            // 2. 提取对应的规则集对象
            const dependencies = this.rule_sets.filter(rs => usedSchemaIds.has(rs.id));

            // 3. 构造完整的数据包 (Package)
            const exportPackage = {
                meta: {
                    version: this.APP_VERSION,
                    type: 'Levant_Map_Package',
                    exportedAt: Date.now()
                },
                map_data: this.map_data,
                // ★★★ 关键：携带规则集 ★★★
                embedded_rules: dependencies
            };

            // 4. 执行导出
            const dataStr = JSON.stringify(exportPackage, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `MapPackage_${Date.now()}.json`;
            link.click();

            URL.revokeObjectURL(url);
        },

// [终极版] 导入地图配置 (支持 V1/V2 格式兼容 + 规则集解包 + 属性字段自动补全)
        handleMapConfigImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonRaw = JSON.parse(e.target.result);

                    // --- 1. 格式识别与解包 ---
                    let newMapData = null;
                    let newRules = [];
                    let isPackage = false;

                    // Case A: 新版地图包 (包含规则集)
                    if (jsonRaw.type === 'Levant_Map_Package' && jsonRaw.map_data) {
                        newMapData = jsonRaw.map_data;
                        newRules = jsonRaw.embedded_rules || [];
                        isPackage = true;
                    }
                    // Case B: 普通地图文件 (V1 或 V1.5)
                    else {
                        newMapData = jsonRaw;
                    }

                    // --- 2. 有效性预检查 ---
                    const hasNewStructure = newMapData.layers && Array.isArray(newMapData.layers);
                    const hasOldStructure = newMapData.image || (newMapData.regions && Array.isArray(newMapData.regions)) || (newMapData.pins && Array.isArray(newMapData.pins));

                    if (!hasNewStructure && !hasOldStructure) {
                        throw new Error("无法识别的地图文件格式 (缺少 layers 或 image 数据)。");
                    }

                    // --- 3. 用户确认 ---
                    const confirmMsg = isPackage
                        ? "检测到完整地图包。\n导入将覆盖当前地图，并合并附带的属性规则集。\n确定继续？"
                        : "导入地图将覆盖当前地图数据。\n确定继续？";

                    if (confirm(confirmMsg)) {

                        // --- 4. 规则集 (Rule Sets) 智能合并 ---
                        let rulesAddedCount = 0;
                        if (newRules.length > 0) {
                            if (!this.rule_sets) this.rule_sets = [];
                            newRules.forEach(rule => {
                                const exists = this.rule_sets.some(r => r.id === rule.id);
                                if (!exists) {
                                    this.rule_sets.push(rule);
                                    rulesAddedCount++;
                                } else {
                                    console.log(`[Import] Rule Set '${rule.name}' (${rule.id}) already exists. Skipping.`);
                                }
                            });
                        }

                        // --- 5. 地图数据覆盖 ---
                        this.map_data = { layers: [], activeLayerId: '', image: '', pins: [], regions: [] };
                        const importedMap = JSON.parse(JSON.stringify(newMapData));

                        // --- 6. 数据结构迁移 (Migration V1 -> V2) ---
                        // ★★★ 核心修改：在迁移时注入 stats 和 schemaId ★★★
                        if (!importedMap.layers || importedMap.layers.length === 0) {
                            console.info("[Import] Detected Legacy Map V1. Migrating to Layer System...");
                            const migratedLayers = [];
                            const timestamp = Date.now();

                            if (importedMap.image) {
                                migratedLayers.push({
                                    id: 'layer_bg_' + timestamp, type: 'image', name: 'Base Map (Imported)',
                                    visible: true, opacity: 1.0, data: importedMap.image
                                });
                            }

                            if (importedMap.regions && importedMap.regions.length > 0) {
                                // ★ 数据清洗：强制补全属性字段
                                const cleanRegions = importedMap.regions.map(r => ({
                                    ...r,
                                    schemaId: r.schemaId || '',
                                    stats: r.stats || {}
                                }));

                                migratedLayers.push({
                                    id: 'layer_reg_' + timestamp, type: 'region', name: 'Territories (Imported)',
                                    visible: true, opacity: 1.0, data: cleanRegions
                                });
                            }

                            if (importedMap.pins && importedMap.pins.length > 0) {
                                migratedLayers.push({
                                    id: 'layer_pin_' + timestamp, type: 'marker', name: 'Markers (Imported)',
                                    visible: true, opacity: 1.0, data: importedMap.pins
                                });
                            }
                            this.map_data.layers = migratedLayers;
                        } else {
                            // --- 7. 新版格式清洗 (Sanitization) ---
                            // 即使是新版格式，也要防止 stats 字段丢失
                            importedMap.layers.forEach(layer => {
                                if (layer.type === 'region' && Array.isArray(layer.data)) {
                                    layer.data = layer.data.map(r => ({
                                        ...r,
                                        schemaId: r.schemaId || '',
                                        stats: r.stats || {}
                                    }));
                                }
                            });
                            this.map_data.layers = importedMap.layers;
                        }

                        // --- 8. 状态修正 ---
                        if (this.map_data.layers.length > 0) {
                            const isValidActive = importedMap.activeLayerId && this.map_data.layers.some(l => l.id === importedMap.activeLayerId);
                            this.map_data.activeLayerId = isValidActive ? importedMap.activeLayerId : this.map_data.layers[0].id;
                        } else {
                            this.map_data.activeLayerId = '';
                        }

                        // --- 9. 收尾工作 ---
                        this.resetMapView();
                        this.saveGame('autosave.json'); // ★ 此时保存，旧地图数据已被自动更新为新结构

                        this.$nextTick(() => { this.initMapCanvas(); });

                        let msg = "地图导入成功！";
                        if (rulesAddedCount > 0) msg += `\n已载入 ${rulesAddedCount} 个配套属性规则。`;
                        alert(msg);
                    }
                } catch (err) {
                    console.error("[Import Error]", err);
                    alert("地图导入失败: " + err.message);
                }
                event.target.value = '';
            };
            reader.readAsText(file);
        },
        // [新增] 导出为 PNG 图片
        async exportMapImage() {
            // [修复] 检查图层数量而不是 image
            if (!this.map_data.layers || this.map_data.layers.length === 0) return alert("No map layers loaded.");

            // 1. 获取地图的核心变换层
            const element = document.getElementById('map-capture-target');
            if (!element) {
                alert("Error: Map element not found (ID: map-capture-target missing).");
                return;
            }

            // 2. 保存当前视图状态
            const oldView = { ...this.mapView };
            const oldCursor = document.body.style.cursor;

            // 3. 提示用户并在后台调整视图
            document.body.style.cursor = 'wait';

            // 重置视图以截取全图
            this.mapView = { scale: 1, x: 0, y: 0, isDragging: false, badgeScale: oldView.badgeScale, displayMode: oldView.displayMode };

            await this.$nextTick();
            await new Promise(resolve => setTimeout(resolve, 300));

            try {
                // 4. 执行截图
                const canvas = await html2canvas(element, {
                    backgroundColor: null, // 透明背景
                    scale: 2,              // 2倍采样
                    useCORS: true,
                    logging: false,
                    ignoreElements: (el) => el.classList.contains('pointer-events-none') && el.tagName === 'DIV' && el.innerHTML === ''
                });

                // 5. 触发下载
                const link = document.createElement('a');
                link.download = `Tactical_Map_${Date.now()}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();

            } catch (e) {
                console.error(e);
                alert("Image export failed: " + e.message);
            } finally {
                // 6. 恢复视图
                this.mapView = oldView;
                document.body.style.cursor = oldCursor;
            }
        },
        // 4. 按下/触摸开始
        onMapMouseDown(e) {
            if (e.type === 'mousedown' && e.button !== 0) return;

            // ★ 仅标记鼠标已按下，暂不开启拖拽优化
            this.mapView.isMouseDown = true;
            this.mapView.isDragging = false;

            const pos = this.getClientPos(e);

            // 记录初始点击位置 (用于计算位移)
            this.dragOrigin = { x: pos.x, y: pos.y };

            // 记录地图当前的偏移基准
            this.mapView.startX = pos.x - this.mapView.x;
            this.mapView.startY = pos.y - this.mapView.y;

            // 注意：这里先不要改 cursor 为 grabbing，等真的动了再改
        },
        // 5. 移动/拖拽中
        onMapMouseMove(e) {
            // 如果没按下，直接退出
            if (!this.mapView.isMouseDown) return;

            const pos = this.getClientPos(e);

            // ★ 如果尚未进入拖拽模式，计算移动距离
            if (!this.mapView.isDragging) {
                const dist = Math.sqrt(
                    Math.pow(pos.x - this.dragOrigin.x, 2) +
                    Math.pow(pos.y - this.dragOrigin.y, 2)
                );

                // ★ 只有移动超过 5px 才视为拖拽，激活性能优化
                if (dist > 5) {
                    this.mapView.isDragging = true;
                    document.body.style.cursor = 'grabbing';
                } else {
                    // 移动太小，视为手抖，不更新地图位置
                    return;
                }
            }

            // 只要 isDragging 为 true，就执行位移并阻止默认行为
            if (this.mapView.isDragging) {
                if(e.cancelable) e.preventDefault();
                this.mapView.x = pos.x - this.mapView.startX;
                this.mapView.y = pos.y - this.mapView.startY;
            }
        },

        // 6. 抬起/触摸结束
        onMapMouseUp(e) {
            // 只要鼠标松开，就重置所有状态
            this.mapView.isMouseDown = false;

            // 如果之前处于拖拽状态，说明是拖拽结束
            if (this.mapView.isDragging) {
                this.mapView.isDragging = false;
                document.body.style.cursor = 'default';
                // 拖拽结束不需要触发 handleAddPinClick，因为那是点击背景添加点的逻辑
                return;
            }

            // ★ 如果 isDragging 为 false，说明移动距离极小 (<5px)
            // 此时 CSS 的 pointer-events: none 没有生效，
            // 如果用户点击的是地块 (Region)，地块自身的 @click.stop 会正常触发。
            // 如果用户点击的是背景，下面的逻辑会触发背景点击（添加点）。

            let endX, endY;
            if (e.changedTouches && e.changedTouches.length > 0) {
                endX = e.changedTouches[0].clientX;
                endY = e.changedTouches[0].clientY;
            } else {
                endX = e.clientX;
                endY = e.clientY;
            }

            // 调用背景点击逻辑 (handleAddPinClick 内部会判断是否点击了空白处)
            const mockEvent = {
                currentTarget: e.currentTarget,
                clientX: endX,
                clientY: endY,
                target: e.target
            };

            // 只有当点击的是背景容器本身时才触发添加点
            // (注意：Region 的 click 有 .stop 修饰符，所以这里通常处理的是穿透的点击)
            this.handleAddPinClick(mockEvent);
        },

        // 7. 处理添加点的逻辑 (也就是之前的 onMapBackgroundClick)
        // 注意：这里需要根据当前的 scale 和 translate 反推回 % 坐标
// 7. 处理点击逻辑：根据模式分流 (添加点 OR 添加区域)
        handleAddPinClick(e) {
            if (this.mapToolMode === 'view') return;

            const transformLayer = e.currentTarget.querySelector('.origin-top-left');
            if (!transformLayer) return;

            const rect = transformLayer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // 计算百分比
            const xPct = (clickX / rect.width) * 100;
            const yPct = (clickY / rect.height) * 100;
            if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;

            if (this.mapToolMode === 'pin') {
                // --- 原有点模式 ---
                this.editingPinIndex = -1;
                this.editingRegionIndex = -2; // 确保不冲突
                this.pinForm = {
                    x: xPct, y: yPct,
                    mode: 'entity', selectedId: '', customLabel: '',
                    icon: 'fa-solid fa-map-pin', color: '#ffffff'
                };
                this.showPinModal = true;
            } else if (this.mapToolMode === 'region') {
                // ★★★ [优化] 视觉精准判定 (Pixel Perfect Detection) ★★★
                // 抛弃方形包围盒计算，直接询问浏览器：鼠标当前悬停在哪个元素上？
                // 配合 HTML 中的 pointer-events 设置，这会自动忽略透明区域，只命中实际形状。

                const elements = document.elementsFromPoint(e.clientX, e.clientY);

                // 在光标下的所有元素中，寻找属于“当前激活图层”的地块
                const hitEl = elements.find(el => {
                    // 向上查找包含 data-rid 的容器
                    const target = el.closest('.region-hit-target');
                    // 确保点击的是当前激活图层 (activeLayer) 中的元素
                    return target && target.dataset.lid === activeLayer.id;
                });

                let hitIndex = -1;
                if (hitEl) {
                    // 如果找到了，通过 DOM 上的 data-rid 反查数据索引
                    const target = hitEl.closest('.region-hit-target');
                    const rid = target.dataset.rid;
                    hitIndex = activeLayer.data.findIndex(r => r.id === rid);
                }

                // --- 下面的逻辑完全保持不变 (这是你强调绝对不能丢弃的逻辑) ---
                if (hitIndex !== -1) {
                    console.log("Clicked existing region (Visual Hit), switching to EDIT mode.");
                    // 命中既有地块！直接复用点击逻辑进入“编辑模式”
                    this.onRegionClick(activeLayer.data[hitIndex], hitIndex, activeLayer);
                    return; // ★ 关键：阻止后续的泛洪生成代码执行
                }

                // --- 如果没点中任何旧地块，才执行泛洪生成新地块 ---

                const canvas = document.getElementById('map-analysis-canvas');
                // 换算坐标
                const rawX = Math.floor((clickX / rect.width) * canvas.width);
                const rawY = Math.floor((clickY / rect.height) * canvas.height);

                this.createRegionFromPoint(rawX, rawY);
            }
        },
        onMapBackgroundClick(e) {
            // 直接调用处理添加点的逻辑
            this.handleAddPinClick(e);
        },
        // [新增] 泛洪算法生成地块
        createRegionFromPoint(startX, startY) {
            if (this.isProcessingRegion) return;

            const canvas = document.getElementById('map-analysis-canvas');
            // [新增] 检查 Canvas 是否有数据
            if(!canvas || canvas.width === 0) {
                // 尝试最后一次初始化
                this.initMapCanvas();
                // 如果还是不行，提示用户
                if (!canvas || canvas.width === 0) return alert("Analysis canvas is empty. Please verify you have a visible 'Image' layer.");
            }

            this.isProcessingRegion = true;
            document.body.style.cursor = 'wait';

            try {
                const canvas = document.getElementById('map-analysis-canvas');
                const ctx = canvas.getContext('2d');
                const width = canvas.width;
                const height = canvas.height;

                // 获取全图像素数据
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;

                // 获取点击点的颜色
                const startPos = (startY * width + startX) * 4;
                const startColor = [data[startPos], data[startPos+1], data[startPos+2], data[startPos+3]];

                // 颜色容差 (40)
                const tolerance = 40;
                const match = (pos) => {
                    const r = data[pos], g = data[pos+1], b = data[pos+2];
                    return Math.abs(r - startColor[0]) < tolerance &&
                           Math.abs(g - startColor[1]) < tolerance &&
                           Math.abs(b - startColor[2]) < tolerance;
                };

                // BFS 泛洪 (优化：使用单层整数栈减少GC压力)
                // 将坐标 x,y 编码为单一整数 index = y * width + x
                const stack = [startY * width + startX];
                const visited = new Uint8Array(width * height);
                const regionPixels = [];

                let minX = width, maxX = 0, minY = height, maxY = 0;

                visited[startY * width + startX] = 1;

                // 预先定义方向数组，避免循环内创建对象
                const dx = [1, -1, 0, 0];
                const dy = [0, 0, 1, -1];

                while (stack.length) {
                    const idx = stack.pop();
                    const x = idx % width;
                    const y = (idx / width) | 0; // 取整

                    regionPixels.push(x, y);

                    // 只需要比较当前点，不需要每次循环都比较
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;

                    for (let i = 0; i < 4; i++) {
                        const nx = x + dx[i];
                        const ny = y + dy[i];

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (!visited[nIdx]) {
                                if (match(nIdx * 4)) {
                                    visited[nIdx] = 1;
                                    stack.push(nIdx);
                                }
                            }
                        }
                    }
                }

                if (regionPixels.length < 50) {
                    alert("Area too small!");
                    return;
                }

                // 生成掩码图片
                const regionW = maxX - minX + 1;
                const regionH = maxY - minY + 1;
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = regionW;
                maskCanvas.height = regionH;
                const maskCtx = maskCanvas.getContext('2d');
                const maskImgData = maskCtx.createImageData(regionW, regionH);

                for (let i = 0; i < regionPixels.length; i += 2) {
                    const px = regionPixels[i] - minX;
                    const py = regionPixels[i+1] - minY;
                    const idx = (py * regionW + px) * 4;

                    // 改为白色 (255, 255, 255)，为了兼容 SVG Mask
                    maskImgData.data[idx] = 255;   // R
                    maskImgData.data[idx+1] = 255; // G
                    maskImgData.data[idx+2] = 255; // B
                    maskImgData.data[idx+3] = 255; // A (完全不透明)
                }
                maskCtx.putImageData(maskImgData, 0, 0);

                // 计算重心
                let sumX = 0, sumY = 0;
                let pixelCount = 0;

                for (let i = 0; i < regionPixels.length; i += 2) {
                    sumX += regionPixels[i];
                    sumY += regionPixels[i+1];
                    pixelCount++;
                }

                // 计算相对于原图宽高的百分比
                const centerX = (sumX / pixelCount / width) * 100;
                const centerY = (sumY / pixelCount / height) * 100;

                // 打开编辑框
                this.editingRegionIndex = -1; // 标记新增 Region
                this.editingPinIndex = -2;    // 关闭 Pin 模式
                this.pinForm = {
                    // Region 特有
                    x: (minX / width) * 100,
                    y: (minY / height) * 100,
                    w: (regionW / width) * 100,
                    h: (regionH / height) * 100,
                    maskData: maskCanvas.toDataURL(),
                    centerX: centerX,
                    centerY: centerY,

                    // 通用
                    mode: 'entity', selectedId: '', customLabel: 'New Region',
                    icon: 'fa-solid fa-flag', color: '#ffffff'
                };
                this.showPinModal = true;

            } catch (e) {
                console.error(e);
                alert("Region detection failed.");
            } finally {
                this.isProcessingRegion = false;
                document.body.style.cursor = 'default';
            }
        },

// --- [修复] 点击地块 (解决 v-memo 导致的旧数据缓存问题) ---
        onRegionClick(reg, idx, layer) {
            this.map_data.activeLayerId = layer.id;
            this.editingRegionIndex = idx;
            this.editingPinIndex = -2;

            // ★★★ [这就是问题所在] ★★★
            // 因为 v-memo 锁住了视图，传进来的 'reg' 是还没保存时的“旧快照”。
            // 必须无视它，直接通过索引去 layer.data 里拿刚才保存进去的“最新数据”：
            const freshReg = layer.data[idx];

            // 回填表单 (全部使用 freshReg)
            this.pinForm = {
                ...freshReg,
                customLabel: freshReg.name,
                selectedId: freshReg.ownerId,
                icon: freshReg.icon || 'fa-solid fa-mountain',
                color: freshReg.color,

                // 现在这里能读到你刚保存的数据了
                schemaId: freshReg.schemaId || '',
                stats: freshReg.stats ? JSON.parse(JSON.stringify(freshReg.stats)) : {}
            };

            if (this.pinForm.schemaId) {
                this.refreshPinFormStats();
            }

            this.showPinModal = true;
        },

        // --- [同步修复] 点击标记点 (同样存在缓存问题) ---
        onPinClick(pin, idx, layer) {
            this.map_data.activeLayerId = layer.id;
            this.editingPinIndex = idx;
            this.editingRegionIndex = -2;

            // 同样，无视传进来的 pin，去拿最新的
            const freshPin = layer.data[idx];

            let mode = freshPin.type || 'custom';
            if (!freshPin.type) {
                 if (this.players.some(p => p.id === freshPin.linkId)) mode = 'entity';
                 else if (freshPin.linkId) mode = 'lore';
                 else mode = 'custom';
            }

            this.pinForm = {
                x: freshPin.x, y: freshPin.y,
                mode: mode,
                selectedId: freshPin.linkId || '',
                customLabel: freshPin.label || '',
                icon: freshPin.icon || this.getFinalPinIcon(freshPin),
                color: freshPin.color || this.getFinalPinColor(freshPin),
                // 补全属性读取
                schemaId: freshPin.schemaId || '',
                stats: freshPin.stats ? JSON.parse(JSON.stringify(freshPin.stats)) : {}
            };

            // 如果是 Pin，也尝试刷新一下输入框（如果有规则的话）
            if (this.pinForm.schemaId) {
                this.refreshPinFormStats();
            }

            this.showPinModal = true;
        },
        // [核心修复] 地图编辑：切换规则时，强制初始化属性对象
        refreshPinFormStats() {
            if (!this.pinForm.schemaId) return;
            if (!this.pinForm.stats) this.pinForm.stats = {};
            const fields = this.getFieldsBySchemaId(this.pinForm.schemaId);
            fields.forEach(f => {
                if (this.pinForm.stats[f.key] === undefined) {
                    this.pinForm.stats[f.key] = '-';
                }
            });
        },
        // [核心修复] 保存地图标记/区域 (强制包含 schemaId 和 stats)
        saveMapPin() {
            const activeLayer = this.getActiveLayer();
            if (!activeLayer) return alert("Please select a layer in Layer Manager first!");
            this.recordSnapshot(); // ★ [新增]

            let nameOrLabel = this.pinForm.customLabel || "Unnamed";
            let idRef = this.pinForm.selectedId || "";

            if (this.pinForm.mode === 'entity' && this.editingRegionIndex === -2) {
                const p = this.players.find(x => x.id === this.pinForm.selectedId);
                nameOrLabel = p ? p.name : "Unknown";
            } else if (this.pinForm.mode === 'lore' && this.editingRegionIndex === -2) {
                nameOrLabel = this.pinForm.selectedId;
            }

            const baseData = {
                icon: this.pinForm.icon,
                color: this.pinForm.color
            };

            // --- 保存分支 ---
            if (this.editingRegionIndex !== -2) {
                // === Region (地块) 保存逻辑 ===
                let targetLayer = activeLayer;

                // 智能图层定位
                if (targetLayer.type !== 'region') {
                    targetLayer = this.map_data.layers.find(l => l.type === 'region');
                    if (!targetLayer) {
                        if(confirm("Current layer is NOT a Region Layer. Create new?")) {
                            this.addLayer('region');
                            targetLayer = this.map_data.layers[this.map_data.layers.length - 1];
                        } else {
                            return;
                        }
                    }
                    this.map_data.activeLayerId = targetLayer.id;
                }

                const regionData = {
                    ...baseData,
                    id: this.editingRegionIndex === -1 ? 'reg_' + Date.now() : targetLayer.data[this.editingRegionIndex].id,
                    type: 'territory',
                    name: this.pinForm.customLabel || "Region",
                    ownerId: this.pinForm.selectedId,

                    // 几何数据
                    x: this.pinForm.x, y: this.pinForm.y,
                    w: this.pinForm.w, h: this.pinForm.h,
                    maskData: this.pinForm.maskData,
                    centerX: this.pinForm.centerX, centerY: this.pinForm.centerY,

                    // ★★★★★ [关键修复] 必须显式保存这两个字段！ ★★★★★
                    schemaId: this.pinForm.schemaId || '',
                    stats: JSON.parse(JSON.stringify(this.pinForm.stats || {}))
                };

                if (this.editingRegionIndex === -1) targetLayer.data.push(regionData);
                else targetLayer.data[this.editingRegionIndex] = regionData;

                this.editingRegionIndex = -2;
            } else {
                // === Pin (标记点) 保存逻辑 ===
                if (activeLayer.type !== 'marker') return alert("Current layer is NOT a Marker Layer!");

                const pinData = {
                    ...baseData,
                    id: this.editingPinIndex === -1 ? 'pin_' + Date.now() : activeLayer.data[this.editingPinIndex].id,
                    type: this.pinForm.mode,
                    label: nameOrLabel,
                    linkId: idRef,
                    x: this.pinForm.x,
                    y: this.pinForm.y,

                    // ★★★ [同步修复] 给 Pin 也加上保存逻辑，防止以后出同样问题 ★★★
                    schemaId: this.pinForm.schemaId || '',
                    stats: JSON.parse(JSON.stringify(this.pinForm.stats || {}))
                };
                if (this.editingPinIndex === -1) activeLayer.data.push(pinData);
                else activeLayer.data[this.editingPinIndex] = pinData;
            }
            this.dataVersion++;
            this.saveGame('autosave.json');
            this.showPinModal = false;
        },
        // --- [新增] 图层管理方法 ---
        addLayer(type) {
            const id = 'layer_' + type + '_' + Date.now();
            let data = null;
            let name = this.t('layer_new');

            if (type === 'image') { data = ''; name = this.t('layer_map'); }
            else if (type === 'region') { data = []; name = this.t('layer_region'); }
            else if (type === 'marker') { data = []; name = this.t('layer_marker'); }

            // 如果是 Image 层，建议放到最底下(unshift)；其他建议放到最上面(push)
            // 这里为了逻辑简单，统一 push 到数组末尾（显示在最上层），用户可手动调整
            this.map_data.layers.push({ id, type, name, visible: true, opacity: 1, data });

            this.map_data.activeLayerId = id;
            if (type === 'image') {
                // 这里 alert 也可以优化，但为了代码简洁暂时保留或替换为 t('msg_image_layer_hint')
                alert("Image Layer created. Click 'Upload Map' to set image.");
            }
            this.saveGame('autosave.json');
        },
        deleteLayer(idx) {
            if (confirm("Delete this layer? All data in it will be lost.")) {
                this.map_data.layers.splice(idx, 1);
                if (this.map_data.layers.length > 0) this.map_data.activeLayerId = this.map_data.layers[0].id;
                else this.map_data.activeLayerId = '';
                this.saveGame('autosave.json');
            }
        },
        moveLayer(idx, dir) {
            const target = idx + dir;
            if (target >= 0 && target < this.map_data.layers.length) {
                const temp = this.map_data.layers[idx];
                this.map_data.layers[idx] = this.map_data.layers[target];
                this.map_data.layers[target] = temp;
            }
        },
        getActiveLayer() {
            return this.map_data.layers.find(l => l.id === this.map_data.activeLayerId);
        },
        deleteMapPin() {
            const activeLayer = this.getActiveLayer();
            if (!activeLayer) return;

            if(confirm("Remove this item?")) {
                this.recordSnapshot(); // ★ [新增]
                if (this.editingRegionIndex !== -2 && this.editingRegionIndex !== -1) {
                     // 删除 Region
                     if (activeLayer.type === 'region') activeLayer.data.splice(this.editingRegionIndex, 1);
                } else if (this.editingPinIndex !== -1) {
                     // 删除 Pin
                     if (activeLayer.type === 'marker') activeLayer.data.splice(this.editingPinIndex, 1);
                }
                this.saveGame('autosave.json');
                this.showPinModal = false;
                this.editingRegionIndex = -2;
            }
        },
        getPinColor(linkId) {
            if (!linkId) return '#fbbf24'; // default amber
            return this.getFactionColor(linkId);
        },
        getPinName(linkId) {
            if (!linkId) return 'Marker';
            return this.getFactionName(linkId);
        },

        // 构建层级树字符串，供 AI 使用
        buildMapString() {
            const regions = this.getAllWorldRegions();
            const pins = this.getAllWorldPins();
            if (regions.length === 0 && pins.length === 0) return "No tactical map data defined.";

            let output = "=== TACTICAL MAP STATUS (Geopolitics) ===\n";

            // 1. 输出地块控制权信息
            if (regions.length > 0) {
                output += "Regions (Territory Control):\n";
                regions.forEach(reg => {
                    const ownerName = reg.ownerId ? this.getFactionName(reg.ownerId) : "NEUTRAL/UNCLAIMED";
                    output += `- Region "${reg.name}" is controlled by [${ownerName}] (ID: ${reg.ownerId || 'None'}).\n`;
                });
            }

            // 2. 输出关键点信息
            if (pins.length > 0) {
                output += "\nKey Locations (Points of Interest):\n";
                pins.forEach(pin => {
                    const name = pin.label || this.getPinName(pin.linkId);
                    output += `- POI "${name}" at [${pin.x.toFixed(1)}%, ${pin.y.toFixed(1)}%]. Type: ${pin.type}.\n`;
                });
            }

            output += "Note: Map coordinates are 0-100% relative.\n";
            return output;
        },
        // --- [新增] API Profile 管理逻辑 ---

        // 1. 打开编辑器
        getRegionColor(reg) {
            // 1. 最高优先级：如果有 ownerId，直接跟随势力的主题色
            // 这样当你把地块划给某个势力时，它会自动变成那个势力的颜色
            if (reg.ownerId) {
                const p = this.players.find(x => x.id === reg.ownerId);
                if (p && p.color) return p.color;
            }

            // 2. 次优先级：如果地块自己定义了 override 颜色，使用之
            // (用于那些确实需要特殊标记的无主地块，比如污染区、特殊地形)
            if (reg.color && reg.color !== '#ffffff') return reg.color;

            // 3. 兜底：默认无主颜色 (slate-500)
            return '#64748b';
        },
        getRegionOwnerLogo(reg) {
            if (reg.ownerId) {
                const p = this.players.find(x => x.id === reg.ownerId);
                if (p && p.logo) return p.logo;
            }
            return reg.icon || 'fa-solid fa-mountain';
        },
    };
})(window);
