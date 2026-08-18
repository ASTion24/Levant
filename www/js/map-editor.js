const { createApp } = Vue;

createApp({
    data() {
        return {
            mapData: { layers: [] },
            activeLayerId: null,
            view: { x: 0, y: 0, scale: 1 },
            tool: 'move',
            isDragging: false,
            lastMouse: { x: 0, y: 0 },
            mousePos: { x: 0, y: 0 },

            // [更新] 选中状态管理
            selectedItem: null, // 为了兼容属性面板，显示最后一个选中的
            selectedIds: new Set(), // 存储选中项的 ID

            // [新增] 框选相关
            selectionBox: { x: 0, y: 0, w: 0, h: 0, startX: 0, startY: 0, visible: false },

            // [新增] 批量处理
            batchModal: { visible: false },
            // [修改] 增加 schemaId 字段
            batchForm: { ownerId: '', color: '#ffffff', schemaId: '' },

            // [新增] 规则集支持
            rule_sets: [],
            ruleModal: { visible: false },
            activeRuleSetId: '',

            mapDimensions: { w: 0, h: 0 },

            autoScan: {
                mode: 'include',
                includeColors: [],
                excludeColors: [],
                tolerance: 15,
                blur: 0
            },
            isScanning: false,

            // [新增] 用于像素级命中检测的 Mask 缓存
            maskCanvasCache: new Map()
        }
    },
    computed: {
        activeLayer() { return this.mapData.layers.find(l => l.id === this.activeLayerId); },
        reversedLayers() {
            if (!this.mapData.layers) return [];
            return this.mapData.layers.map((l, i) => ({...l, index: i})).reverse();
        },
        toolName() {
            const names = { 'move': '画布拖拽', 'select': '元素选择', 'region_paint': '智能魔棒 (点选)', 'auto_scan': '自动预处理 (批量)', 'pin': '定点标记' };
            return names[this.tool];
        }
    },
    mounted() {
        if (this.mapData.layers.length === 0) {
            this.addLayer('image');
        }
        window.addEventListener('keydown', this.handleKeydown);
        document.addEventListener('contextmenu', event => event.preventDefault());
        this.detectMapDimensions();
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleKeydown);
    },
    methods: {
        // [新增] 核心：像素级命中检测辅助函数
        async isPointInRegionMask(region, point) {
            // point = {x, y} in map-local pixel coordinates

            // 1. 简单包围盒预检测 (快速排除)
            const mapW = this.mapDimensions.w;
            const mapH = this.mapDimensions.h;
            const regionLeft = (region.x / 100) * mapW;
            const regionTop = (region.y / 100) * mapH;
            const regionWidth = (region.w / 100) * mapW;
            const regionHeight = (region.h / 100) * mapH;

            if (point.x < regionLeft || point.x > regionLeft + regionWidth || point.y < regionTop || point.y > regionTop + regionHeight) {
                return false;
            }

            // 2. 检查缓存
            let maskImageData = this.maskCanvasCache.get(region.id);

            if (!maskImageData) {
                // 首次加载：绘制 mask 到离屏 canvas 并缓存像素数据
                const img = new Image();
                await new Promise(resolve => {
                    img.onload = resolve;
                    img.src = region.maskData;
                });

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);
                maskImageData = tempCtx.getImageData(0, 0, img.width, img.height);
                this.maskCanvasCache.set(region.id, maskImageData);
            }

            // 3. 计算点击点在 mask 上的相对坐标
            const relativeX = point.x - regionLeft;
            const relativeY = point.y - regionTop;

            const maskCoordX = Math.floor((relativeX / regionWidth) * maskImageData.width);
            const maskCoordY = Math.floor((relativeY / regionHeight) * maskImageData.height);

            // 4. 读取像素的 Alpha 通道
            const pixelIndex = (maskCoordY * maskImageData.width + maskCoordX) * 4;
            const alpha = maskImageData.data[pixelIndex + 3];

            // 5. 判断 Alpha 是否 > 0 (不透明)
            return alpha > 128; // 使用一个阈值防止边缘半透明像素的误判
        },
        // --- 规则集管理 ---
        addNewRuleSet() {
            const id = 'rs_' + Date.now();
            this.rule_sets.push({ id, name: '新规则集', fields: [] });
            this.activeRuleSetId = id;
        },
        deleteRuleSet(idx) {
            if (confirm('删除此规则集？使用此规则的地块将失去属性定义。')) {
                this.rule_sets.splice(idx, 1);
                if(this.rule_sets.length > 0) this.activeRuleSetId = this.rule_sets[0].id;
                else this.activeRuleSetId = '';
            }
        },
        getActiveRuleSet() {
            return this.rule_sets.find(r => r.id === this.activeRuleSetId);
        },
        addFieldToActive() {
            const rs = this.getActiveRuleSet();
            if(rs) rs.fields.push({ label: '新属性', key: 'new_attr' });
        },
        deleteField(idx) {
            const rs = this.getActiveRuleSet();
            if(rs) rs.fields.splice(idx, 1);
        },
        getFieldsBySchemaId(id) {
            const rs = this.rule_sets.find(r => r.id === id);
            return rs ? rs.fields : [];
        },
        // 当选择了规则集后，确保 item.stats 对象存在，防止报错
        initItemStats(item) {
            if (!item.stats) item.stats = {};
            // 可选：预填默认值
            const fields = this.getFieldsBySchemaId(item.schemaId);
            fields.forEach(f => {
                if (item.stats[f.key] === undefined) item.stats[f.key] = '-';
            });
        },
        detectMapDimensions() {
            const imgLayer = this.mapData.layers.find(l => l.type === 'image' && l.data);
            if (imgLayer) {
                const img = new Image();
                img.onload = () => {
                    this.mapDimensions.w = img.naturalWidth;
                    this.mapDimensions.h = img.naturalHeight;
                };
                img.src = imgLayer.data;
            }
        },

        setTool(t) { this.tool = t; },
        handleKeydown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Enter') {
                if (this.selectedIds.size > 0) this.openBatchModal();
            }

            if (e.code === 'Space') { this.tool = 'move'; e.preventDefault(); }
            if (e.code === 'KeyV') this.tool = 'select';
            if (e.code === 'KeyW') this.tool = 'region_paint';
            if (e.code === 'KeyA') this.tool = 'auto_scan';
            if (e.code === 'KeyP') this.tool = 'pin';
            if (e.code === 'Delete' || e.code === 'Backspace') this.batchDelete(); // 使用批量删除逻辑
        },

        addLayer(type) {
            const id = 'layer_' + Date.now();
            let name = '新图层';
            let data = null;
            if (type === 'image') { name = '底图 (Image)'; data = ''; }
            else if (type === 'region') { name = '领土 (Region)'; data = []; }
            else if (type === 'marker') { name = '标记 (Pin)'; data = []; }
            this.mapData.layers.push({ id, type, name, visible: true, opacity: 1, data });
            this.activeLayerId = id;
        },

        // --- 选中逻辑更新 ---
        isSelected(item) {
            return this.selectedIds.has(item.id);
        },

        // 点击选择
        selectItem(type, idx, layer, event) {
            // 如果是移动模式，不处理
            if (this.tool === 'move') return;

            // 阻止冒泡 (虽然在 onCanvasDown 里手动调用时没用，但对 Marker 的原生点击有用)
            if (event && event.stopPropagation) event.stopPropagation();

            if (this.tool !== 'select') return;

            const item = layer.data[idx];
            this.activeLayerId = layer.id;

            // ★★★ Shift 逻辑处理 ★★★
            if (event && event.shiftKey) {
                // 多选模式：反转状态
                if (this.selectedIds.has(item.id)) {
                    this.selectedIds.delete(item.id); // 以前选中 -> 现在取消 (实现反选)
                } else {
                    this.selectedIds.add(item.id);    // 以前没选 -> 现在选中 (实现加选)
                }
            } else {
                // 单选模式：清空其他，只选当前
                this.selectedIds.clear();
                this.selectedIds.add(item.id);
            }

            // 更新属性面板显示的 Item (如果有选中，显示最后一个选中的；如果全取消了，置空)
            if (this.selectedIds.has(item.id)) {
                this.selectedItem = item;
            } else {
                // 如果取消了当前项，尝试找一个还在选中列表里的显示，或者置空
                if (this.selectedIds.size > 0) {
                    const lastId = Array.from(this.selectedIds).pop();
                    this.selectedItem = layer.data.find(i => i.id === lastId);
                } else {
                    this.selectedItem = null;
                }
            }
        },
        deleteSelectedItem() { this.batchDelete(); },

        // --- 画布交互 (包含框选) ---
        startPan(e) {
            if(e.button === 1) { this.isDragging = true; this.lastMouse = { x: e.clientX, y: e.clientY }; }
        },
        async onCanvasDown(e) {
            if (e.button === 1) {
                this.isDragging = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                return;
            }
            if (e.button === 0) {
                if (this.tool === 'move') {
                    this.isDragging = true;
                    this.lastMouse = { x: e.clientX, y: e.clientY };
                    document.body.style.cursor = 'grabbing';

                } else if (this.tool === 'select') {

                    // 1. ★★★ 像素级命中检测 (Pixel-Perfect Hit Test) ★★★
                    const mapRect = this.$refs.transformContainer.getBoundingClientRect();

                    // 计算鼠标在未缩放地图上的像素坐标
                    const mapLocalPoint = {
                        x: ((e.clientX - mapRect.left) / mapRect.width) * this.mapDimensions.w,
                        y: ((e.clientY - mapRect.top) / mapRect.height) * this.mapDimensions.h
                    };

                    let hitFound = false;
                    if (this.activeLayer && this.activeLayer.type === 'region') {
                        const regions = this.activeLayer.data;
                        // 从上往下遍历 (渲染顺序的倒序)
                        for (let i = regions.length - 1; i >= 0; i--) {
                            const region = regions[i];
                            if (await this.isPointInRegionMask(region, mapLocalPoint)) {
                                // 命中！
                                this.selectItem('region', i, this.activeLayer, e);
                                hitFound = true;
                                break; // 找到后立即停止
                            }
                        }
                    }

                    // 2. 如果没有命中任何地块，再处理背景操作
                    if (!hitFound) {
                        if (e.shiftKey) {
                            // Shift + 点击空白处 -> 开始追加框选
                            this.selectionBox.visible = true;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const localX = e.clientX - rect.left;
                            const localY = e.clientY - rect.top;
                            this.selectionBox.startX = localX;
                            this.selectionBox.startY = localY;
                            this.selectionBox.x = localX;
                            this.selectionBox.y = localY;
                            this.selectionBox.w = 0;
                            this.selectionBox.h = 0;
                        } else {
                            // 普通点击空白处 -> 清空所有选择
                            this.selectedIds.clear();
                            this.selectedItem = null;
                        }
                    }

                } else if (this.tool === 'region_paint') {
                    this.performFloodFill(e);
                } else if (this.tool === 'auto_scan') {
                    this.pickColorForAutoScan(e);
                } else if (this.tool === 'pin') {
                    this.addPinAtMouse(e);
                }
            }
        },
        onMouseMove(e) {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.view.x += dx;
                this.view.y += dy;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }

            // [新增] 更新框选
            if (this.selectionBox.visible) {
                // ★★★ 核心修复：获取局部坐标 ★★★
                const rect = e.currentTarget.getBoundingClientRect();
                const currentX = e.clientX - rect.left;
                const currentY = e.clientY - rect.top;

                const minX = Math.min(this.selectionBox.startX, currentX);
                const minY = Math.min(this.selectionBox.startY, currentY);
                const w = Math.abs(currentX - this.selectionBox.startX);
                const h = Math.abs(currentY - this.selectionBox.startY);

                this.selectionBox.x = minX;
                this.selectionBox.y = minY;
                this.selectionBox.w = w;
                this.selectionBox.h = h;
            }

            const rawX = (e.clientX - this.view.x) / this.view.scale;
            const rawY = (e.clientY - this.view.y) / this.view.scale;
            this.mousePos.x = Math.max(0, rawX);
            this.mousePos.y = Math.max(0, rawY);
        },
        onMouseUp() {
            this.isDragging = false;
            if (this.tool === 'move') document.body.style.cursor = 'default';

            // [新增] 结束框选计算
            if (this.selectionBox.visible) {
                this.selectionBox.visible = false;
                this.calculateMarqueeSelection();
            }
        },

        // --- 框选计算核心 ---
        calculateMarqueeSelection() {
            if (!this.activeLayer || !Array.isArray(this.activeLayer.data)) return;

            // ★★★ 核心修复：坐标系对齐 ★★★

            // 1. 获取地图本身的矩形 (受缩放和拖拽影响)
            const mapRect = this.$refs.transformContainer.getBoundingClientRect();

            // 2. 获取视口容器的矩形 (即 transformContainer 的父级)
            const viewRect = this.$refs.transformContainer.parentElement.getBoundingClientRect();

            // 3. 计算地图相对于视口的偏移量 (Local Offset)
            const mapLocalLeft = mapRect.left - viewRect.left;
            const mapLocalTop = mapRect.top - viewRect.top;

            // 4. 选框坐标 (已经是局部坐标了，直接用)
            const selLeft = this.selectionBox.x;
            const selTop = this.selectionBox.y;
            const selRight = selLeft + this.selectionBox.w;
            const selBottom = selTop + this.selectionBox.h;

            // 5. 遍历当前图层的所有元素
            this.activeLayer.data.forEach(item => {
                // 计算 Item 在视口内的局部像素位置
                // 公式：(百分比 * 地图当前宽度) + 地图当前偏移
                const itemPixelX = (item.x / 100) * mapRect.width + mapLocalLeft;
                const itemPixelY = (item.y / 100) * mapRect.height + mapLocalTop;

                let itemPixelW = 0, itemPixelH = 0;
                if (this.activeLayer.type === 'region') {
                    itemPixelW = (item.w / 100) * mapRect.width;
                    itemPixelH = (item.h / 100) * mapRect.height;
                } else {
                    // Marker 视为一个点，给一点容差 (不随缩放变化太大，或者跟随 mapRect.width 缩放亦可，这里保持固定大小体验更好)
                    itemPixelW = 20;
                    itemPixelH = 20;
                    itemPixelX -= 10;
                    itemPixelY -= 10;
                }

                // AABB 碰撞检测
                const itemRight = itemPixelX + itemPixelW;
                const itemBottom = itemPixelY + itemPixelH;

                const isIntersecting = !(
                    itemRight < selLeft ||
                    itemPixelX > selRight ||
                    itemBottom < selTop ||
                    itemPixelY > selBottom
                );

                if (isIntersecting) {
                    this.selectedIds.add(item.id);
                }
            });

            // 更新 selectedItem 指向最后一个
            if (this.selectedIds.size > 0) {
                const lastId = Array.from(this.selectedIds).pop();
                this.selectedItem = this.activeLayer.data.find(i => i.id === lastId);
            }
        },

        // --- 批量处理逻辑 ---
        openBatchModal() {
            this.batchModal.visible = true;
        },

        // 批量更新属性 (Owner, Color, Schema)
        batchUpdate(prop) {
            if (!this.activeLayer) return;
            let count = 0;
            this.activeLayer.data.forEach(item => {
                if (this.selectedIds.has(item.id)) {
                    if (prop === 'ownerId') item.ownerId = this.batchForm.ownerId;
                    if (prop === 'color') item.color = this.batchForm.color;

                    // [新增] 批量应用规则集
                    if (prop === 'schemaId') {
                        item.schemaId = this.batchForm.schemaId;
                        // 关键：切换规则后，立即初始化 stats 对象，补全字段
                        this.initItemStats(item);
                    }

                    count++;
                }
            });
            alert(`已更新 ${count} 个地块。`);
            this.batchModal.visible = false;
        },

        // 批量删除
        batchDelete() {
            if (!this.activeLayer || this.selectedIds.size === 0) return;
            if (!confirm(`确定删除选中的 ${this.selectedIds.size} 个对象？`)) return;

            // 过滤掉选中的
            this.activeLayer.data = this.activeLayer.data.filter(item => !this.selectedIds.has(item.id));

            this.selectedIds.clear();
            this.selectedItem = null;
            this.batchModal.visible = false;
        },

        // [核心] 批量合并地块
        async batchMerge() {
            if (this.selectedIds.size < 2) return alert("请至少选择 2 个地块进行合并。");
            if (this.activeLayer.type !== 'region') return alert("仅支持合并领土层(Region)对象。");

            // 1. 获取所有选中对象
            const selectedItems = this.activeLayer.data.filter(i => this.selectedIds.has(i.id));
            if (selectedItems.length === 0) return;

            // 2. 计算总包围盒 (百分比坐标)
            let minX = 100, minY = 100, maxX = 0, maxY = 0;

            // 为了像素级合并，我们需要基于原始底图尺寸计算
            const mapW = this.mapDimensions.w || 1000;
            const mapH = this.mapDimensions.h || 1000;

            selectedItems.forEach(item => {
                if (item.x < minX) minX = item.x;
                if (item.y < minY) minY = item.y;
                if (item.x + item.w > maxX) maxX = item.x + item.w;
                if (item.y + item.h > maxY) maxY = item.y + item.h;
            });

            const mergedW_Pct = maxX - minX;
            const mergedH_Pct = maxY - minY;

            const canvasW = Math.ceil((mergedW_Pct / 100) * mapW);
            const canvasH = Math.ceil((mergedH_Pct / 100) * mapH);

            if (canvasW <= 0 || canvasH <= 0) return alert("合并尺寸错误。");

            // 3. 创建合并画布
            const canvas = document.createElement('canvas');
            canvas.width = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext('2d');

            // 4. 绘制所有地块的 Mask 到画布上
            // 需要将每个地块的相对坐标换算到新画布中
            const promises = selectedItems.map(item => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        // 计算该地块在合并画布中的偏移 (像素)
                        const offsetX = ((item.x - minX) / 100) * mapW;
                        const offsetY = ((item.y - minY) / 100) * mapH;
                        const drawW = (item.w / 100) * mapW;
                        const drawH = (item.h / 100) * mapH;

                        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
                        resolve();
                    };
                    img.src = item.maskData;
                });
            });

            await Promise.all(promises);

            // 5. 生成新的合并地块对象
            const newRegion = {
                id: 'reg_merged_' + Date.now(),
                name: selectedItems[0].name + ' (Merged)', // 继承第一个名字
                ownerId: selectedItems[0].ownerId,
                color: selectedItems[0].color,
                x: minX,
                y: minY,
                w: mergedW_Pct,
                h: mergedH_Pct,
                maskData: canvas.toDataURL(),
                centerX: minX + mergedW_Pct/2, // 简单取中心
                centerY: minY + mergedH_Pct/2
            };

            // 6. 移除旧地块，添加新地块
            this.activeLayer.data = this.activeLayer.data.filter(item => !this.selectedIds.has(item.id));
            this.activeLayer.data.push(newRegion);

            // 7. 更新选中状态
            this.selectedIds.clear();
            this.selectedIds.add(newRegion.id);
            this.selectedItem = newRegion;

            this.batchModal.visible = false;
            alert("合并完成！");
        },

        // --- 其他基础方法 (保持不变) ---
        resetView() { this.view = { x: 0, y: 0, scale: 1 }; },

        // ... (deleteLayer, moveLayer, toggleLayerVisible, uploadLayerImage, clearLayerImage, exportJSON, importJSON 等保持原样) ...
        deleteLayer(idx) {
            if (confirm("确定删除该图层？")) {
                this.mapData.layers.splice(idx, 1);
                if(this.mapData.layers.length > 0) this.activeLayerId = this.mapData.layers[this.mapData.layers.length - 1].id;
                else this.activeLayerId = null;
                this.selectedItem = null;
                this.detectMapDimensions();
            }
        },
        moveLayer(idx, dir) {
            const target = idx + dir;
            if (target >= 0 && target < this.mapData.layers.length) {
                const temp = this.mapData.layers[idx];
                this.mapData.layers[idx] = this.mapData.layers[target];
                this.mapData.layers[target] = temp;
            }
        },
        toggleLayerVisible(layer) { layer.visible = !layer.visible; },

        uploadLayerImage(e) {
            const file = e.target.files[0];
            if(!file || !this.activeLayer || this.activeLayer.type !== 'image') return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    this.mapDimensions.w = img.naturalWidth;
                    this.mapDimensions.h = img.naturalHeight;
                    this.activeLayer.data = evt.target.result;
                    this.activeLayer.name = file.name;
                    this.resetView();
                }
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        },

        clearLayerImage() {
            if (this.activeLayer && this.activeLayer.type === 'image') {
                this.activeLayer.data = '';
                this.mapDimensions = { w: 0, h: 0 };
            }
        },

        onWheel(e) {
            const zoomIntensity = 0.1;
            const direction = e.deltaY > 0 ? -1 : 1;
            let newScale = this.view.scale + (direction * zoomIntensity);
            newScale = Math.min(Math.max(0.1, newScale), 10);
            this.view.scale = newScale;
        },

        addPinAtMouse(e) {
            let targetLayer = this.activeLayer;
            if (!targetLayer || targetLayer.type !== 'marker') {
                targetLayer = this.mapData.layers.find(l => l.type === 'marker');
                if (!targetLayer) {
                    this.addLayer('marker');
                    targetLayer = this.mapData.layers[this.mapData.layers.length - 1];
                }
                this.activeLayerId = targetLayer.id;
            }

            const rect = this.$refs.transformContainer.getBoundingClientRect();
            const xPct = ((e.clientX - rect.left) / rect.width) * 100;
            const yPct = ((e.clientY - rect.top) / rect.height) * 100;

            if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;

            const newPin = {
                id: 'pin_' + Date.now(),
                x: parseFloat(xPct.toFixed(2)),
                y: parseFloat(yPct.toFixed(2)),
                label: 'New Marker',
                icon: 'fa-solid fa-map-pin',
                color: '#f59e0b',
                type: 'custom',
                schemaId: '', // [新增]
                stats: {}     // [新增]
            };

            targetLayer.data.push(newPin);
            this.selectItem('marker', targetLayer.data.length - 1, targetLayer);
            this.tool = 'select';
        },

        applyBlur(ctx, width, height, radius) {
            if (radius <= 0) return;
            ctx.filter = `blur(${radius}px)`;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(ctx.canvas, 0, 0);
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.filter = 'none';
        },

        pickColorForAutoScan(e) {
            const baseLayer = this.mapData.layers.find(l => l.type === 'image' && l.visible && l.data);
            if (!baseLayer) return;

            const imgEl = this.$refs.transformContainer.querySelector(`img`);
            if (!imgEl) return;

            const rect = imgEl.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            if (clickX < 0 || clickX > rect.width || clickY < 0 || clickY > rect.height) return;

            const canvas = document.getElementById('analysis-canvas');
            const ctx = canvas.getContext('2d');
            const rawImg = new Image();
            rawImg.crossOrigin = "Anonymous";
            rawImg.src = baseLayer.data;

            rawImg.onload = () => {
                canvas.width = rawImg.width;
                canvas.height = rawImg.height;
                ctx.drawImage(rawImg, 0, 0);

                this.applyBlur(ctx, rawImg.width, rawImg.height, this.autoScan.blur);

                const scaleX = rawImg.width / rect.width;
                const scaleY = rawImg.height / rect.height;
                const startX = Math.floor(clickX * scaleX);
                const startY = Math.floor(clickY * scaleY);

                const p = ctx.getImageData(startX, startY, 1, 1).data;
                const color = [p[0], p[1], p[2]];

                if (this.autoScan.mode === 'include') {
                    this.autoScan.includeColors.push(color);
                } else {
                    this.autoScan.excludeColors.push(color);
                }
            };
        },

        runAutoScan() {
            const baseLayer = this.mapData.layers.find(l => l.type === 'image' && l.visible && l.data);
            if (!baseLayer) return alert("未找到可见底图！");

            let targetLayer = this.activeLayer;
            if (!targetLayer || targetLayer.type !== 'region') {
                targetLayer = this.mapData.layers.find(l => l.type === 'region');
                if (!targetLayer) {
                    this.addLayer('region');
                    targetLayer = this.mapData.layers[this.mapData.layers.length - 1];
                }
                this.activeLayerId = targetLayer.id;
            }

            if(!confirm(`即将开始全图扫描。\n图片尺寸: ${this.mapDimensions.w}x${this.mapDimensions.h}\n请确保已吸取【边界】和【海洋】作为排除色！`)) return;

            this.isScanning = true;
            setTimeout(() => {
                this._executeScanLogic(baseLayer, targetLayer);
            }, 100);
        },

        _executeScanLogic(baseLayer, targetLayer) {
            try {
                const canvas = document.getElementById('analysis-canvas');
                const ctx = canvas.getContext('2d');
                const rawImg = new Image();
                rawImg.crossOrigin = "Anonymous";
                rawImg.src = baseLayer.data;

                rawImg.onload = () => {
                    canvas.width = rawImg.width;
                    canvas.height = rawImg.height;
                    ctx.drawImage(rawImg, 0, 0);

                    this.applyBlur(ctx, rawImg.width, rawImg.height, this.autoScan.blur);

                    const width = canvas.width;
                    const height = canvas.height;
                    const imageData = ctx.getImageData(0, 0, width, height);

                    const buf32 = new Uint32Array(imageData.data.buffer);
                    const visited = new Uint8Array(width * height);

                    const tol = this.autoScan.tolerance;

                    const isMatchList = (color32, list) => {
                        const r = color32 & 0xff;
                        const g = (color32 >> 8) & 0xff;
                        const b = (color32 >> 16) & 0xff;
                        return list.some(c => Math.abs(r - c[0]) < tol && Math.abs(g - c[1]) < tol && Math.abs(b - c[2]) < tol);
                    };

                    let regionsFound = 0;
                    const maxRegions = 1000;

                    for (let i = 0; i < width * height; i += 2) {
                        if (visited[i]) continue;

                        const color32 = buf32[i];
                        if ((color32 >>> 24) < 50) { visited[i] = 1; continue; }

                        if (this.autoScan.excludeColors.length > 0) {
                            if (isMatchList(color32, this.autoScan.excludeColors)) {
                                visited[i] = 1;
                                continue;
                            }
                        }

                        let shouldFill = false;
                        if (this.autoScan.includeColors.length === 0) {
                            shouldFill = true;
                        } else {
                            if (isMatchList(color32, this.autoScan.includeColors)) {
                                shouldFill = true;
                            }
                        }

                        if (shouldFill) {
                            const x = i % width;
                            const y = (i / width) | 0;
                            const region = this._floodFillFast(x, y, width, height, buf32, visited, this.autoScan.excludeColors);

                            if (region) {
                                targetLayer.data.push(region);
                                regionsFound++;
                                if (regionsFound >= maxRegions) break;
                            }
                        }
                    }

                    alert(`扫描完成！生成了 ${regionsFound} 个地块。`);
                    this.isScanning = false;
                    this.tool = 'select';
                };
            } catch (e) {
                console.error(e);
                alert("扫描出错: " + e.message);
                this.isScanning = false;
            }
        },

        _floodFillFast(startX, startY, width, height, buf32, visited, excludeColors) {
            const stack = [startY * width + startX];
            const regionPixels = [];
            let minX = width, maxX = 0, minY = height, maxY = 0;

            const startColor = buf32[startY * width + startX];
            const r0 = startColor & 0xff;
            const g0 = (startColor >> 8) & 0xff;
            const b0 = (startColor >> 16) & 0xff;
            const tol = this.autoScan.tolerance;

            const hasExcludes = excludeColors && excludeColors.length > 0;

            visited[startY * width + startX] = 1;

            let pixelCount = 0;
            const limit = 2000000;

            while (stack.length) {
                const idx = stack.pop();
                const x = idx % width;
                const y = (idx / width) | 0;

                regionPixels.push(x, y);
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;

                const neighbors = [idx-1, idx+1, idx-width, idx+width];
                const nx = [x-1, x+1, x, x];
                const ny = [y, y, y-1, y+1];

                for(let i=0; i<4; i++) {
                    const nIdx = neighbors[i];
                    const _nx = nx[i];
                    const _ny = ny[i];

                    if (_nx >= 0 && _nx < width && _ny >= 0 && _ny < height) {
                        if (!visited[nIdx]) {
                            const nColor = buf32[nIdx];

                            if (hasExcludes) {
                                const nr = nColor & 0xff;
                                const ng = (nColor >> 8) & 0xff;
                                const nb = (nColor >> 16) & 0xff;

                                let isExcluded = false;
                                for(let ec of excludeColors) {
                                    if (Math.abs(nr-ec[0])<tol && Math.abs(ng-ec[1])<tol && Math.abs(nb-ec[2])<tol) {
                                        isExcluded = true;
                                        break;
                                    }
                                }
                                if (isExcluded) {
                                    visited[nIdx] = 1;
                                    continue;
                                }
                            }

                            const nr = nColor & 0xff;
                            const ng = (nColor >> 8) & 0xff;
                            const nb = (nColor >> 16) & 0xff;

                            if (Math.abs(nr-r0) < tol && Math.abs(ng-g0) < tol && Math.abs(nb-b0) < tol) {
                                visited[nIdx] = 1;
                                stack.push(nIdx);
                            }
                        }
                    }
                }
                pixelCount++;
                if (pixelCount > limit) break;
            }

            if (pixelCount < 50) return null;

            const regionW = maxX - minX + 1;
            const regionH = maxY - minY + 1;
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = regionW;
            maskCanvas.height = regionH;
            const maskCtx = maskCanvas.getContext('2d');
            const maskImgData = maskCtx.createImageData(regionW, regionH);

            let sumX = 0, sumY = 0;
            for (let i = 0; i < regionPixels.length; i += 2) {
                const px = regionPixels[i] - minX;
                const py = regionPixels[i+1] - minY;
                const idx = (py * regionW + px) * 4;
                maskImgData.data[idx] = 255; maskImgData.data[idx+1] = 255;
                maskImgData.data[idx+2] = 255; maskImgData.data[idx+3] = 255;
                sumX += regionPixels[i];
                sumY += regionPixels[i+1];
            }
            maskCtx.putImageData(maskImgData, 0, 0);

            const count = regionPixels.length / 2;
            return {
                id: 'reg_' + Date.now() + Math.random().toString(16).slice(2),
                name: 'Auto Region',
                ownerId: '',
                color: `hsl(${Math.random()*360}, 70%, 50%)`,
                x: (minX / width) * 100,
                y: (minY / height) * 100,
                w: (regionW / width) * 100,
                h: (regionH / height) * 100,
                maskData: maskCanvas.toDataURL(),
                centerX: (sumX / count / width) * 100,
                centerY: (sumY / count / height) * 100,
                schemaId: '', // [新增]
                stats: {}     // [新增]
            };
        },

        performFloodFill(e) {
            const baseLayer = this.mapData.layers.find(l => l.type === 'image' && l.visible && l.data);
            if (!baseLayer) return alert("未找到可见底图！");

            let targetLayer = this.activeLayer;
            if (!targetLayer || targetLayer.type !== 'region') {
                targetLayer = this.mapData.layers.find(l => l.type === 'region');
                if (!targetLayer) {
                    this.addLayer('region');
                    targetLayer = this.mapData.layers[this.mapData.layers.length - 1];
                }
                this.activeLayerId = targetLayer.id;
            }

            const rect = this.$refs.transformContainer.getBoundingClientRect();
            const clickX_Screen = e.clientX - rect.left;
            const clickY_Screen = e.clientY - rect.top;

            if (clickX_Screen < 0 || clickX_Screen > rect.width || clickY_Screen < 0 || clickY_Screen > rect.height) return;

            document.body.style.cursor = 'wait';

            const canvas = document.getElementById('analysis-canvas');
            const ctx = canvas.getContext('2d');
            const rawImg = new Image();
            rawImg.crossOrigin = "Anonymous";
            rawImg.src = baseLayer.data;

            rawImg.onload = () => {
                canvas.width = rawImg.width;
                canvas.height = rawImg.height;
                ctx.drawImage(rawImg, 0, 0);

                this.applyBlur(ctx, rawImg.width, rawImg.height, this.autoScan.blur);

                const scaleX = rawImg.width / rect.width;
                const scaleY = rawImg.height / rect.height;
                const startX = Math.floor(clickX_Screen * scaleX);
                const startY = Math.floor(clickY_Screen * scaleY);

                const width = canvas.width;
                const height = canvas.height;
                const imageData = ctx.getImageData(0, 0, width, height);
                const buf32 = new Uint32Array(imageData.data.buffer);
                const visited = new Uint8Array(width * height);

                const region = this._floodFillFast(startX, startY, width, height, buf32, visited, this.autoScan.excludeColors);

                if (region) {
                    region.name = 'New Region';
                    region.color = '#10b981';
                    region.schemaId = ''; // [新增]
                    region.stats = {};    // [新增]
                    targetLayer.data.push(region);
                    this.selectItem('region', targetLayer.data.length - 1, targetLayer);
                    this.tool = 'select';
                } else {
                    alert("区域过小或无效");
                }
                document.body.style.cursor = 'default';
            };
        },

        exportJSON() {
            // [升级] 导出逻辑：打包规则集
            const exportPackage = {
                meta: { type: 'Levant_Map_Package', version: '1.15', exportedAt: Date.now() },
                map_data: {
                    layers: this.mapData.layers,
                    activeLayerId: this.activeLayerId
                },
                embedded_rules: this.rule_sets // 携带规则集
            };

            const dataStr = JSON.stringify(exportPackage, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `MapPackage_${Date.now()}.json`;
            link.click();
        },

        importJSON(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const jsonRaw = JSON.parse(evt.target.result);

                    // [升级] 智能识别包格式
                    let newMapData = null;

                    // Case A: 完整包 (含规则)
                    if (jsonRaw.type === 'Levant_Map_Package' && jsonRaw.map_data) {
                        newMapData = jsonRaw.map_data;
                        // 合并规则集 (简单的 ID 去重合并)
                        if (jsonRaw.embedded_rules) {
                            jsonRaw.embedded_rules.forEach(newRs => {
                                if (!this.rule_sets.some(r => r.id === newRs.id)) {
                                    this.rule_sets.push(newRs);
                                }
                            });
                        }
                        alert(`导入成功！包含 ${jsonRaw.embedded_rules?.length || 0} 个规则集。`);
                    }
                    // Case B: 仅地图数据 (V2)
                    else if (jsonRaw.layers) {
                        newMapData = jsonRaw;
                    }
                    // Case C: 旧版数据 (V1)
                    else if (jsonRaw.image) {
                        newMapData = {
                            layers: [
                                { id: 'l1', type: 'image', name: '底图', visible: true, opacity: 1, data: jsonRaw.image },
                                { id: 'l2', type: 'region', name: '领土', visible: true, opacity: 1, data: jsonRaw.regions || [] },
                                { id: 'l3', type: 'marker', name: '标记', visible: true, opacity: 1, data: jsonRaw.pins || [] }
                            ],
                            activeLayerId: 'l2'
                        };
                    }

                    if (newMapData) {
                        // 数据清洗：确保每个地块都有 schemaId 和 stats 字段
                        newMapData.layers.forEach(l => {
                            if (Array.isArray(l.data)) {
                                l.data.forEach(item => {
                                    if (!item.stats) item.stats = {};
                                    if (!item.schemaId) item.schemaId = '';
                                });
                            }
                        });

                        this.mapData = newMapData;
                        if (newMapData.activeLayerId) this.activeLayerId = newMapData.activeLayerId;
                        else if (this.mapData.layers.length > 0) this.activeLayerId = this.mapData.layers[this.mapData.layers.length-1].id;

                        this.detectMapDimensions();
                        this.resetView();
                    } else {
                        throw new Error("未知文件格式");
                    }
                } catch (err) {
                    alert("导入失败: " + err.message);
                    console.error(err);
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        }
    }
}).mount('#app');
