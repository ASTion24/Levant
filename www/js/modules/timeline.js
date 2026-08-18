(function (global) {
    'use strict';

    global.LevantModules = global.LevantModules || {};
    global.LevantModules.timeline = {
        selectOption(event, optData) {
            let decisionText = "";
            if (typeof optData === 'object') {
                // 严格取 label，并附带 desc 给 AI 做上下文
                decisionText = `${optData.label} (${optData.desc})`;
            } else {
                decisionText = optData;
            }

            this.rawInput = `[Decision] ${this.getFactionName(event.factionId)} chose: ${decisionText}`;

            // 2. 切换到指令 Tab
            this.tabs.right = 'input';

            // 3. 自动打开上下文组装窗口 (或者你可以直接调用 runAiInference，但打开窗口更安全)
            this.openContextModal();

            // 4. 可选：为了方便，自动把“当前指令”勾选上（如果之前没勾的话）
            this.contextConfig.includeCurrent = true;
        },
        // --- ★ 核心智能 JSON 解析引擎 v10.0 (清洗 + 补全) ★ ---
        smartJSONParse(jsonStr) {
            if (!jsonStr) throw new Error("Empty JSON string");

            // 【阶段一】提取核心内容
            // 寻找第一个 { 或 [，和最后一个 } 或 ]
            const firstOpen = jsonStr.search(/[\{\[]/);
            const lastClose = Math.max(jsonStr.lastIndexOf('}'), jsonStr.lastIndexOf(']'));

            if (firstOpen === -1) throw new Error("No JSON object found.");

            // 如果找到了闭合符，截取中间；如果没找到(严重截断)，则取到最后
            let cleanStr = lastClose > firstOpen
                ? jsonStr.substring(firstOpen, lastClose + 1)
                : jsonStr.substring(firstOpen);

            // 【阶段二】本地字符清洗 (解决 "name": “银狐” 问题)
            // 逻辑：将所有非标准引号替换为转义的双引号，让 JSON.parse 认为它是字符串内容
            // 注意：这可能误伤，但在报错的情况下值得一试
            // 我们只替换那些明显会导致语法错误的中文引号
            const sanitizedStr = cleanStr
                .replace(/“/g, '\\"') // 左中文引号 -> 转义引号
                .replace(/”/g, '\\"'); // 右中文引号 -> 转义引号

            // 尝试直接解析清洗后的字符串
            try {
                return JSON.parse(sanitizedStr);
            } catch (e) {
                // 如果清洗后还是不行，进入阶段三
            }

            // 【阶段三】强力栈补全 (解决截断问题)
            // 这是一个简化版的流式解析器，用于计算缺少的闭合括号
            let stack = [];
            let inString = false;
            let isEscaped = false;
            let resultStr = "";

            // 使用原始 cleanStr (未清洗的)，避免正则破坏结构
            for (let i = 0; i < cleanStr.length; i++) {
                const char = cleanStr[i];

                if (inString) {
                    if (char === '\\' && !isEscaped) {
                        isEscaped = true;
                    } else if (char === '"' && !isEscaped) {
                        inString = false;
                    } else {
                        isEscaped = false;
                    }
                } else {
                    if (char === '"') {
                        inString = true;
                    } else if (char === '{') {
                        stack.push('}');
                    } else if (char === '[') {
                        stack.push(']');
                    } else if (char === '}' || char === ']') {
                        // 简单的栈匹配
                        if (stack.length > 0) {
                            const expected = stack[stack.length - 1];
                            if (char === expected) stack.pop();
                        }
                    }
                }
                resultStr += char;
            }

            // 补全所有未闭合的字符串和括号
            if (inString) resultStr += '"';
            while (stack.length > 0) {
                resultStr += stack.pop();
            }

            console.log("[SmartParse] Reconstructed JSON end:", resultStr.slice(-50));
            return JSON.parse(resultStr);
        },
        // --- [新增] AI JSON 修复辅助函数 ---
        async repairJsonWithAi(malformedStr, errorMsg) {
            const originalStatus = this.isThinking;
            this.isThinking = true;

            // 【核心修改】直接使用完整字符串，不做任何截断
            console.warn(`[Auto-Repair] Fixing JSON... Error: ${errorMsg}`);

            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                responseFormat: 'json',
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,

                systemPrompt: "You are a specialized JSON syntax repair engine. Your task is to fix syntax errors (especially smart quotes like “”), missing brackets, or truncated data. \n\nCRITICAL OUTPUT RULE: Output ONLY the full, valid, raw JSON string. Do NOT use markdown code blocks. Do NOT truncate the data.",

                context: `Parser Error: ${errorMsg}`,
                // 发送完整数据
                userPrompt: `Repair this data into valid JSON (Do not cut off content):\n\n${malformedStr}`
            };

            try {
                const data = await window.LevantAPI.generateAI(payload);

                const match = data.result.match(/\{[\s\S]*\}/);
                const cleanResult = match ? match[0] : data.result;

                return JSON.parse(cleanResult);
            } catch (e) {
                console.error("[Auto-Repair] Fatal Error:", e);
                throw new Error("AI Repair Failed.");
            } finally {
                this.isThinking = originalStatus;
            }
        },
        // --- 核心推演 (修改后支持 baseUrl 和 Attachments 接口) ---
        async runAiInference() {
            this.isThinking = true;

            // --- 构建单体上下文 (严格遵循 contextConfig.order 顺序) ---
            let contextPayload = "";

            this.contextConfig.order.forEach(type => {
                // [新增] 处理 Custom Prompt
                if (type === 'custom' && this.contextConfig.includeCustom && this.settings.prompts.custom) {
                    contextPayload += `=== [CUSTOM INSTRUCTION] ===\n${this.settings.prompts.custom}\n\n`;
                }
                // 1. 全局变量
                if (type === 'global' && this.contextConfig.includeGlobal) {
                    const visibleGlobals = this.global_vars.filter(g => g.visibility !== 'hidden');
                    contextPayload += `=== [WORLD: GLOBAL VARS] ===\n${visibleGlobals.map(g => {
                        // 调用 formatContextAttr，确保全局变量也有类型提示
                        const fmt = this.formatContextAttr(g.value, g.visibility, g.type);
                        return fmt ? `${g.key}: ${fmt}` : null;
                    }).filter(x=>x).join('\n')}\n\n`;
                }

                if (type === 'rules' && this.contextConfig.includeRules) {
                    contextPayload += `=== [WORLD: RULES DEFINITIONS] ===\n`;
                    // 遍历所有规则集发送给 AI
                    this.rule_sets.forEach(rs => {
                        const fieldsStr = rs.fields.map(f => `${f.key}=${f.label}`).join(', ');
                        contextPayload += `TYPE [${rs.name}]: ${fieldsStr}\n`;
                    });
                    contextPayload += `\n`;
                }

                // 3. 资料设定
                if (type === 'lore') {
                    const activeLore = this.contextConfig.loreList.filter(l => l.active);
                    if (activeLore.length > 0) {
                        contextPayload += `=== [WORLD: LORE] ===\n${activeLore.map(l => `> [${l.keys}]: ${l.content}`).join('\n')}\n\n`;
                    }
                }

                // 4. 参与实体
                if (type === 'players') {
                    const activePlayers = this.contextConfig.playerList.filter(p => p.active);
                    if (activePlayers.length > 0) {
                        contextPayload += `=== [WORLD: ENTITIES] ===\n${activePlayers.map(p => {
                            const realP = this.players.find(x => x.id === p.id);
                            const schema = this.rule_sets.find(rs => rs.id === realP.schemaId);

                            const visibleStats = {};
                            if (schema) {
                                schema.fields.forEach(f => {
                                    // ★ 核心修改：调用 formatContextAttr 注入类型和权限标签
                                    // 注意：这里我们传入 f.type 和 f.visibility
                                    const valStr = this.formatContextAttr(realP.stats[f.key], f.visibility||'editable', f.type||'string');

                                    if (valStr !== null) {
                                        visibleStats[f.key] = valStr; // 存入带标签的字符串，让 AI 可见
                                    }
                                });
                            } else {
                                // 兼容旧模式 (无规则集时默认全部可见，视为 String)
                                for(let k in realP.stats) {
                                    visibleStats[k] = this.formatContextAttr(realP.stats[k], 'editable', 'string');
                                }
                            }

                            // [新增] ★ 如果开关开启，且有差分立绘，则注入 Tags
                            let avatarTagsInfo = "";
                            if (this.enableAvatarTags && realP.avatars && realP.avatars.length > 0) {
                                const tags = realP.avatars.map(a => a.tag).join(", ");
                                avatarTagsInfo = `\n  [VISUAL] Available Expressions: [${tags}]`;
                            }

                            // 注意：JSON.stringify 会把带标签的字符串转义，这正是我们想要的
                            // 例如: "gold": "5000 <Type:Number>"
                            return `ID:${realP.id} | ${realP.name}\n  Desc: ${realP.desc}\n  Stats: ${JSON.stringify(visibleStats, null, 2)}${avatarTagsInfo}`;
                        }).join('\n\n')}\n\n`;
                    }
                }

                // 5. 地图数据 (Map) - 适配筛选列表
                if (type === 'map' && this.contextConfig.includeMap) {
                    const activeRegions = this.contextConfig.mapRegionList.filter(r => r.active);
                    const activePins = this.contextConfig.mapPinList.filter(p => p.active);
                    const allRegions = this.getAllWorldRegions();
                    const allPins = this.getAllWorldPins();

                    if (activeRegions.length > 0 || activePins.length > 0) {
                        contextPayload += `=== [TACTICAL MAP DATA] ===\n`;

                        if (activeRegions.length > 0) {
                            contextPayload += "Regions (Control):\n";
                            activeRegions.forEach(reg => {
                                // 必须回查原始数据以获取最新状态
                                const realReg = allRegions.find(r => r.id === reg.id) || reg;
                                const owner = realReg.ownerId ? this.getFactionName(realReg.ownerId) : "NEUTRAL";
                                contextPayload += `- Region "${realReg.name}" (Owner: ${owner})\n`;
                            });
                        }

                        if (activePins.length > 0) {
                            contextPayload += "\nPoints of Interest:\n";
                            activePins.forEach(pin => {
                                const realPin = allPins.find(p => p.id === pin.id) || pin;
                                const label = realPin.label || this.getPinName(realPin.linkId);
                                contextPayload += `- Pin "${label}" at [${realPin.x.toFixed(0)},${realPin.y.toFixed(0)}]\n`;
                            });
                        }
                        contextPayload += "\n";
                    }
                }

                // 6. 历史回溯 (History) - 正序 + 深浅分离
                if (type === 'history' && this.contextConfig.includeHistory) {
                    const totalLen = this.timeline.length;
                    const deepLen = this.contextConfig.historyDeepDepth;       // 近期 (详情)
                    const shallowLen = this.contextConfig.historyShallowDepth; // 远期 (摘要)

                    // 计算切片索引 (正序: 远 -> 近)
                    const deepStart = Math.max(0, totalLen - deepLen);
                    const shallowEnd = deepStart;
                    const shallowStart = Math.max(0, shallowEnd - shallowLen);

                    const shallowTurns = this.timeline.slice(shallowStart, shallowEnd);
                    const deepTurns = this.timeline.slice(deepStart);

                    if (shallowTurns.length > 0 || deepTurns.length > 0) {
                        contextPayload += `=== [HISTORY MEMORY] ===\n`;

                        // A. 浅层记忆 (仅摘要)
                        if (shallowTurns.length > 0) {
                            contextPayload += `--- Shallow Memory (Far Context / Summary Only) ---\n`;
                            shallowTurns.forEach(turn => {
                                contextPayload += `[Turn ${turn.id}] ${turn.timeRange}\n`;
                                turn.events.forEach(e => {
                                    contextPayload += ` • ${e.summary} (Actor: ${e.factionId})\n`;
                                });
                                contextPayload += `\n`;
                            });
                        }

                        // B. 深层记忆 (含完整 Content 和 Impacts)
                        if (deepTurns.length > 0) {
                            contextPayload += `--- Deep Memory (Recent Events / Full Detail) ---\n`;
                            deepTurns.forEach(turn => {
                                contextPayload += `[Turn ${turn.id}] ${turn.timeRange}\n`;
                                turn.events.forEach(e => {
                                    contextPayload += ` • ${e.summary} (Actor: ${e.factionId})\n`;
                                    // 注入完整内容，不截断
                                    if (e.content) contextPayload += `   Details: ${e.content}\n`;
                                    if (e.impacts && e.impacts.length) {
                                         contextPayload += `   Impacts: ${e.impacts.map(i => `${i.targetName}.${i.attrLabel}: ${i.change || (i.oldValue+'->'+i.newValue)}`).join('; ')}\n`;
                                    }
                                });
                                contextPayload += `\n`;
                            });
                        }
                        contextPayload += "\n";
                    }
                }

                // 7. 当前指令 (Current)
                if (type === 'current' && this.contextConfig.includeCurrent) {
                    contextPayload += `=== [CURRENT INSTRUCTION] ===\n`;
                    if (this.rawInput) contextPayload += `> COMMAND: ${this.rawInput}\n`;
                    if (this.editor.factionId) contextPayload += `> ACTOR_ID: ${this.editor.factionId}\n`;
                    if (this.editor.timeStart) contextPayload += `> TIME: ${this.editor.timeStart} - ${this.editor.timeEnd}\n`;
                    if (this.editor.summary) contextPayload += `> DRAFT_TITLE: ${this.editor.summary}\n`;
                    if (this.editor.content) contextPayload += `> DRAFT_CONTENT: ${this.editor.content}\n`;
                    if (this.editor.impacts.length) {
                        contextPayload += `> PLANNED_IMPACTS: ${JSON.stringify(this.editor.impacts)}\n`;
                    }

                    // 安科模式开关 (保持不变)
                    if (this.generateOptions) {
                        contextPayload += `> MODE: Generate "options" array for player decision.\n`;
                    }
                    contextPayload += `\n`;
                }
            });
            let chosenSystemPrompt = this.tempSystemPrompt || this.settings.prompts.system;
            if (this.useGalgamePrompt && !this.tempSystemPrompt) {
                chosenSystemPrompt = this.settings.prompts.galgame;
            }
            chosenSystemPrompt += this.buildAutonomyOutputContract();
            // --- 组装 API 请求 ---
            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                responseFormat: 'json',
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,

                systemPrompt: chosenSystemPrompt,

                // 核心修改：所有信息都放在 context 里，history 留空以避免后端重复插入
                context: contextPayload,
                history: "",

                // userPrompt 仅作为最后的触发器
                userPrompt: "Analyze context and generate the next turn JSON event."
            };

            try {
                const data = await window.LevantAPI.generateAI(payload);

                // 1. 提取 JSON 字符串
                const match = data.result.match(/\{[\s\S]*\}/);
                let jsonStr = match ? match[0] : data.result;

                // 2. 尝试解析 (优先用 smartJSONParse，失败求助 AI)
                let parsed;
                try {
                    if (!match) throw new Error("AI did not return a valid JSON object.");
                    parsed = this.smartJSONParse(jsonStr);
                } catch (parseErr) {
                    console.warn("[Inference] Parse failed, invoking AI Repair...", parseErr);
                    // 调用修复，若再次失败则抛出异常由外层 catch 捕获
                    parsed = await this.repairJsonWithAi(jsonStr, parseErr.message);
                    console.log("[Inference] AI Repair Successful!");
                }

                await this.processAutonomyDecision(parsed);
                this.updateCurrentProfileStatus('success');

                this.showContextModal = false;
            } catch (e) {
                if (e.name !== 'AutonomyValidationError') {
                    this.updateCurrentProfileStatus('error');
                }
                alert((e.name === 'AutonomyValidationError' ? "Validation blocked execution:\n" : "AI Error: ") + e.message);
            }
            finally { this.isThinking = false; }
        },
        addImpact() {
            const impact = this.createImpactObject(this.impactForm);
            if (impact) {
                this.editor.impacts.push(impact);
                // 重置表单
                this.impactForm.targetId = '';
                this.impactForm.attrKey = '';
                this.impactForm.newValue = '';
                this.impactForm.targetName = '';
            }
        },
        removeImpact(idx) { this.editor.impacts.splice(idx, 1); },

        // --- 修改后的 addToStaging ---
        addToStaging() {
            if (!this.editor.summary) return alert("Summary is required!");

            // 1. 确保有行动方数据
            if (!this.editor.factionIds || this.editor.factionIds.length === 0) {
                if (this.editor.factionId) this.editor.factionIds = [this.editor.factionId];
                else this.editor.factionIds = ['global'];
            }
            this.updateEditorPrimary();

            const report = this.validateAutonomyDecision(this.editor);
            if (!report.valid) {
                alert(`Cannot stage an invalid event:\n\n${report.errors.map(item => item.message).join('\n')}`);
                return;
            }

            this.pendingEvents.push(JSON.parse(JSON.stringify(report.events[0])));

            // 清空编辑器
            this.editor.summary = "";
            this.editor.content = "";
            this.editor.impacts = [];
            this.editor.options = [];
            this.editor.factionId = "";
            this.editor.factionIds = [];
            this.editor.timeStart = "";
            this.editor.timeEnd = "";
            this.tabs.right = 'staging';
            this.saveGame('autosave.json');
        },
        loadFromStaging(i) {
            // 提示用户这会覆盖当前编辑器内容
            if (this.editor.summary && !confirm("Editor is not empty. Overwrite with selected event?")) return;

            // 深拷贝数据到编辑器
            Object.assign(this.editor, JSON.parse(JSON.stringify(this.pendingEvents[i])));

            // 切换到输入 Tab
            this.tabs.right = 'input';

            // ★ 注意：这里不再调用 splice 删除原条目，防止误操作丢失
            // 用户如果修改满意了，可以生成新条目，然后手动删除旧条目
        },

        // 2. [新增] 显式删除
        deleteFromStaging(i) {
            this.pendingEvents.splice(i, 1);
            this.saveGame('autosave.json');
        },

        // --- [新增] 拖拽排序逻辑 ---
        onStagingDragStart(idx, event) {
            this.draggedStagingIndex = idx;
            // 设置拖拽效果，Firefox 需要
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.dropEffect = 'move';
        },
        onStagingDrop(targetIdx) {
            if (this.draggedStagingIndex === null || this.draggedStagingIndex === targetIdx) return;

            // 移动数组元素
            const itemToMove = this.pendingEvents[this.draggedStagingIndex];
            this.pendingEvents.splice(this.draggedStagingIndex, 1); // 先移除
            this.pendingEvents.splice(targetIdx, 0, itemToMove);    // 再插入到新位置

            this.draggedStagingIndex = null;
            this.saveGame('autosave.json'); // 排序后自动保存
        },
        async commitTurn() {
            if(this.pendingEvents.length === 0) return;
            this.setAutonomyStatus('validating', this.t('autonomy_status_validating'));
            try {
                const validation = await this.validateAndRepairAutonomyDecision({ events: this.pendingEvents });
                if (!validation.report.valid) {
                    throw new Error(validation.report.errors.map(item => item.message).join('\n'));
                }
                await this.commitValidatedEvents(
                    validation.report.events,
                    this.pendingTurnRange,
                    {
                        mode: 'manual',
                        repairAttempts: validation.report.repairAttempts,
                        warnings: validation.report.warnings.length,
                        clearPending: true
                    }
                );
                this.setAutonomyStatus('committed', this.t('autonomy_status_committed'), validation.report);
            } catch (error) {
                this.setAutonomyStatus('blocked', this.t('autonomy_status_blocked'));
                alert(`Validation blocked commit:\n${error.message}`);
            }
        },
        deleteTurn(tIdx) { if (confirm(`Delete Turn?`)) { this.recordSnapshot(); this.timeline.splice(tIdx, 1); this.saveGame('autosave.json'); } },
        toggleEventOpen(event) { if(!this.editingEventId && !this.editingTurnId) event.isOpen = !event.isOpen; },
        isEditingEvent(t, e) { return this.editingEventId === `${t}-${e}`; },
        enableEventEdit(t, e) {
            this.editingEventId = `${t}-${e}`;
            this.editingTurnId = null;
            // 重置表单，默认类型为 STAT_CHANGE
            this.editImpactForm = { type: 'STAT_CHANGE', targetId: '', attrKey: '', newValue: '', targetName: '' };
        },

        // 新增：向历史事件添加 Impact
        addEventImpact(event) {
            const impact = this.createImpactObject(this.editImpactForm);
            if (impact) {
                if (!event.impacts) event.impacts = [];
                event.impacts.push(impact);
                // 重置表单
                this.editImpactForm.targetId = '';
                this.editImpactForm.attrKey = '';
                this.editImpactForm.newValue = '';
                this.editImpactForm.targetName = '';
            }
        },

        // 新增：从历史事件移除 Impact
        removeEventImpact(event, idx) {
            event.impacts.splice(idx, 1);
        },
        saveTurnEdit() { this.editingTurnId = null; this.saveGame('autosave.json'); },
        saveEventEdit() { this.editingEventId = null; this.saveGame('autosave.json'); },
        deleteEvent(t,e) { if(confirm("Delete Event?")) { this.timeline[t].events.splice(e,1); this.saveGame('autosave.json'); } },
    };
})(window);
