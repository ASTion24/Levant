(function (global) {
    'use strict';

    global.LevantModules = global.LevantModules || {};
    global.LevantModules.vn = {
        openPolishModal(event) {
            this.polishingEvent = event;
            // 初始化内容：直接把原文本放进去，方便用户对比或基于原文本修改
            this.polishConfig.draftContent = event.content;
            this.showPolishModal = true;
        },
        getStyleDescription(styleKey) {
            switch(styleKey) {
                case 'jiangnan': return "示例：虽然是个废柴，但也要像狮子一样去战斗。哪怕结局注定是悲剧，也要把世界点燃给你看。";
                case 'liu': return "示例：在这个宇宙中，生存是第一要务。巨大的星舰如同墓碑般静默，这里没有温情，只有物理法则的冰冷审判。";
                case 'jin': return "示例：那汉子使出一招「亢龙有悔」，掌风呼啸，端的是威猛无比。虽是生死相搏，却也透着一股侠者风范。";
                case 'gu': return "示例：风。冷风。他没有动。因为他知道，动就是死。";
                case 'lovecraft': return "示例：那是一种无法用人类语言描述的几何结构，散发着来自远古深渊的腥臭，令人的理智在瞬间崩塌。";
                case 'scp': return "示例：项目等级：Keter。描述：对象表现为[数据删除]。任何接触对象的人员均需进行心理评估。";
                case 'history': return "示例：初，帝起兵于野，众皆不服。乃设奇谋，大破敌军，遂定天下。史臣曰：此非天命乎？";
                default: return "选择一种风格以查看描述...";
            }
        },

        // 2. [修改] 执行润色 (使用中文 Prompt)
        async executePolish() {
            if (!this.ensureActiveModelConfigured()) return;

            this.isPolishing = true;
            const originalText = this.polishingEvent.content;

            // 构建具体的风格指令
            let styleInstruction = "";
            switch(this.polishConfig.style) {
                case 'jiangnan':
                    styleInstruction = "请模仿中国作家【江南】（代表作《龙族》《九州缥缈录》）的文风。特点：热血中带着哀伤，善用长句和排比，强调少年的孤独与成长，描写细腻且富有张力，喜欢使用“狮子”、“王座”、“孤独”等意象。";
                    break;
                case 'liu':
                    styleInstruction = "请模仿中国科幻作家【刘慈欣】（代表作《三体》）的文风。特点：冷峻、宏大、硬核，侧重对技术细节和宇宙图景的描写，文字质朴但具有极强的画面感和震撼力，经常从社会学角度审视文明。";
                    break;
                case 'jin':
                    styleInstruction = "请模仿【金庸】的武侠文风。特点：半文半白，叙事流畅，善于描写动作招式和心理活动，融合历史背景，具有浓厚的中国传统文化底蕴。";
                    break;
                case 'gu':
                    styleInstruction = "请模仿【古龙】的武侠文风。特点：极短的句子，大量的留白和换行。强调氛围渲染而非具体招式，充满哲理性的对话，主角通常是浪子，带有一种孤独、冷酷的气质。";
                    break;
                case 'lovecraft':
                    styleInstruction = "请模仿【H.P. 洛夫克拉夫特】（克苏鲁神话）的文风。特点：大量使用形容词（如“不可名状”、“亵渎”），强调人类在未知道具面前的渺小与恐惧，氛围压抑、阴暗、粘稠。";
                    break;
                case 'scp':
                    styleInstruction = "请模仿【SCP基金会】的文档风格。特点：临床腔，绝对客观冷静，使用“项目”、“对象”、“收容”等术语，适当使用[数据删除]或██来增加神秘感。";
                    break;
                case 'history':
                    styleInstruction = "请模仿中国古代【二十四史】（如《史记》）的文言文或半文言风格。特点：微言大义，用词精炼，客观记述但暗含褒贬，注重人物列传和历史事件的因果。";
                    break;
            }

            const systemPrompt = `你是一位精通多种文学风格的资深编辑。
你的任务是重写用户提供的文本，使其完全符合指定的作家风格。

【重写要求】
1. **核心风格**：${styleInstruction}
2. **篇幅控制**：大约 ${this.polishConfig.length} 字（请尽量贴近此长度）。
3. **额外指令**：${this.polishConfig.customInstruction || "无"}
4. **输出规则**：只返回重写后的正文，不要包含“好的”、“这是重写后的版本”等任何解释性语句。`;

            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,
                systemPrompt: systemPrompt,
                context: "【原始文本】\n" + originalText,
                userPrompt: "开始重写。"
            };

            try {
                const data = await window.LevantAPI.generateAI(payload);
                this.polishConfig.draftContent = data.result.trim();
                this.updateCurrentProfileStatus('success');
            } catch (e) {
                this.updateCurrentProfileStatus('error');
                alert("Polish Failed: " + e.message);
            } finally {
                this.isPolishing = false;
            }
        },
        applyPolishResult() {
            if (this.polishingEvent) {
                this.polishingEvent.content = this.polishConfig.draftContent;
                this.saveGame('autosave.json');
            }
            this.showPolishModal = false;
        },
        saveAndExitVN() {
            if (this.vnCurrentEvent) {
                // ★ 将当前演出的完整脚本（包含你的插话和AI的新回应）保存回事件数据
                // 这样回到时间轴视图，或者生成海报时，内容就是你们互动后的新版本了
                this.vnCurrentEvent.content = JSON.stringify(this.vnScript);

                // 自动更新摘要（可选）：标记一下这个事件已经被改写了
                if (!this.vnCurrentEvent.summary.includes("(Interactive)")) {
                    this.vnCurrentEvent.summary += " (Interactive)";
                }
            }

            this.vnMode = false;
            this.saveGame('autosave.json'); // 物理存盘
        },
        // --- 修改后的 sendVNChat 方法 ---
        async sendVNChat() {
            if (!this.vnUserInput.trim()) return;
            if (this.isThinking) return;

            const text = this.vnUserInput.trim();
            this.vnUserInput = "";

            // 1. 查找主角ID
            const roleId = this.vnPlayerRoleId || 'narrator';

            const newLine = { role: roleId, text: text, tag: 'default' };

            // ★★★ 核心修改点开始 ★★★

            // 如果当前不是剧本的最后一行，说明用户是在“中途插话”
            if (this.vnLineIndex < this.vnScript.length - 1) {
                this.vnScript.splice(this.vnLineIndex + 1);
            }

            // ★★★ [新增] 既然剧情变了，原本的选项(options)就不再适用了，清空它以免误导
            if (this.vnCurrentEvent) {
                this.vnCurrentEvent.options = [];
                this.vnShowOptions = false; // 确保选项层不遮挡
            }

            // 将用户的话加入剧本末尾
            this.vnScript.push(newLine);

            // ★★★ 核心修改点结束 ★★★

            // 移动索引到最新一行（即用户刚才说的话）并播放
            this.vnLineIndex = this.vnScript.length - 1;

            // 立即显示用户的话（不用打字机效果，直接显示更爽快）
            this.vnDisplayedText = text;
            this.vnIsTyping = false; // 停止打字状态

            // 3. 调用 AI 生成回应 (续写新的未来)
            await this.generateVNResponse();
        },
        async generateVNResponse() {
            this.isThinking = true;

            // 1. 构建系统指令 (System Prompt)
            let systemPrompt = `你正处于一个“互动式视觉小说”场景中。
        【当前场景】：${this.vnCurrentEvent.summary}
        【任务】：根据用户的最新发言和上下文，扮演场景中的其他角色进行回应。
        【要求】：
        1. 输出 JSON 数组：[{"role":"id","tag":"expression","text":"..."}]
        2. 生成 1-3 句对话，保持剧情紧凑。`;

            // 注入自定义 Prompt
            if (this.vnContextConfig.includeCustom && this.settings.prompts.custom) {
                systemPrompt += `\n\n=== 全局设定 ===\n${this.settings.prompts.custom}`;
            }

            // 2. 构建上下文 Payload (Context)
            let contextStr = "";

            // A. 演员表与设定 (The Cast)
            // 获取所有活跃演员 + 主角
            const activeIds = [...new Set([...this.vnActiveEntityIds, ...this.players.filter(p=>p.isProtagonist).map(p=>p.id)])];

            contextStr += `=== 🎭 登场角色 (ACTIVE CAST) ===\n`;
            activeIds.forEach(id => {
                const p = this.players.find(x => x.id === id);
                if (!p) return;

                // 基础信息
                contextStr += `[ID: ${p.id}] ${p.name} (${p.desc})\n`;

                // 属性 (Stats)
                if (this.vnContextConfig.includeStats) {
                    contextStr += `  Stats: ${JSON.stringify(p.stats)}\n`;
                }

                // ★★★ 关键：立绘差分列表 (Avatar Tags) ★★★
                // 告诉 LLM 有哪些表情可用，以便它自然切换
                if (this.vnContextConfig.includeTags && p.avatars && p.avatars.length > 0) {
                    const tags = p.avatars.map(a => a.tag).join(", ");
                    contextStr += `  [Visual Tags Available]: ${tags}\n`;
                }
                contextStr += `\n`;
            });

            // B. 前情提要 (History) - [修改] 支持深浅分离的独立设置
            if (this.vnContextConfig.includeHistory) {
                const totalLen = this.timeline.length;
                const deepLen = this.vnContextConfig.historyDeepDepth;
                const shallowLen = this.vnContextConfig.historyShallowDepth;

                // 计算切片
                const deepStart = Math.max(0, totalLen - deepLen);
                const shallowEnd = deepStart;
                const shallowStart = Math.max(0, shallowEnd - shallowLen);

                const shallowTurns = this.timeline.slice(shallowStart, shallowEnd);
                const deepTurns = this.timeline.slice(deepStart);

                if (shallowTurns.length > 0 || deepTurns.length > 0) {
                    contextStr += `=== 📜 历史记忆 (MEMORY) ===\n`;

                    // 浅层：只带摘要
                    if (shallowTurns.length > 0) {
                        contextStr += `[远期概要]:\n`;
                        shallowTurns.forEach(t => {
                            t.events.forEach(e => contextStr += `- ${e.summary}\n`);
                        });
                    }
                    // 深层：带详细内容
                    if (deepTurns.length > 0) {
                        contextStr += `[近期详情]:\n`;
                        deepTurns.forEach(t => {
                            t.events.forEach(e => {
                                contextStr += `- ${e.summary}\n`;
                                if(e.content) contextStr += `  Details: ${e.content.substring(0, 300)}...\n`; // 限制长度防止爆Token
                            });
                        });
                    }
                    contextStr += `\n`;
                }
            }

            // C. 地图/环境 (Map) - 如果需要
            if (this.vnContextConfig.includeMap) {
                contextStr += this.buildMapString() + "\n\n";
            }

            // D. 当前剧本流 (Script Flow)
            // 截取最近 N 条，保持短期记忆连贯
            const recentLines = this.vnScript.slice(-20);
            contextStr += `=== 🎬 当前剧本流 (CURRENT SCRIPT) ===\n${JSON.stringify(recentLines, null, 2)}`;

            // 3. 发送请求
            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,

                systemPrompt: systemPrompt,
                context: contextStr,
                // 显式提示 AI 刚刚发生了什么 (例如加入了新角色)
                userPrompt: "Based on the script above (especially the last user action), generate the next character reactions."
            };

            try {
                const data = await window.LevantAPI.generateAI(payload);
                this.updateCurrentProfileStatus('success'); // ★ Success
                const match = data.result.match(/\[[\s\S]*\]/);
                if (match) {
                    const newLines = JSON.parse(match[0]);
                    if (Array.isArray(newLines)) {
                        this.vnScript.push(...newLines);
                        // 此时无需自动播放，等待用户操作
                    }
                }
            } catch (e) {
                this.updateCurrentProfileStatus('error'); // ★ Error
                console.error("VN Gen Error:", e);
            } finally {
                this.isThinking = false;
            }
        },
        isProtagonist(roleId) {
            if (roleId === 'narrator') return false;
            const p = this.players.find(x => x.id === roleId);
            return p && p.isProtagonist;
        },
        isJsonScript(content) {
            if (!content || typeof content !== 'string') return false;
            // 简单判断：必须以 [ 开头，以 ] 结尾，且看起来像 JSON
            const trimmed = content.trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    // 尝试解析前几个字符确认
                    JSON.parse(trimmed);
                    return true;
                } catch (e) {
                    return false;
                }
            }
            return false;
        },

        // ★★★ [新增] 解析剧本 JSON ★★★
        parseScript(content) {
            try {
                return JSON.parse(content);
            } catch (e) {
                // 兜底：如果解析失败，返回包含错误的单行
                return [{ role: 'narrator', text: content }];
            }
        },
        // ★★★ [新增] 专门处理立绘替换 (修复默认立绘无法上传的问题) ★★★
        handleAvatarReplace(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target.result;

                // 判断是替换默认立绘还是差分立绘
                if (this.previewAvatarIndex === -1) {
                    // 核心修复：强制更新 Vue 的响应式对象
                    this.editingFaction.avatar = result;
                } else {
                    // 确保对象存在再赋值
                    if (this.editingFaction.avatars && this.editingFaction.avatars[this.previewAvatarIndex]) {
                        this.editingFaction.avatars[this.previewAvatarIndex].url = result;
                    }
                }
            };
            reader.readAsDataURL(file);

            // 清空 Input，允许重复选择同一文件
            e.target.value = '';
        },
        // --- 修改 startVNMode ---
        startVNMode(event) {
            this.vnCurrentEvent = event;

            let script = [];
            try {
                script = JSON.parse(event.content);
                if (!Array.isArray(script)) throw new Error("Not an array");
            } catch (e) {
                // 兼容纯文本，自动切分
                const lines = event.content.split('\n').filter(l => l.trim());
                script = lines.map(l => ({ role: 'narrator', text: l }));
            }

            this.vnScript = script;
            this.vnLineIndex = 0;
            this.vnShowOptions = false;
            this.vnMode = true;

            // ★★★ [新增] 初始化活跃演员表 ★★★
            // 默认包含事件中涉及的所有 factionIds
            // 并过滤掉主角（主角默认总是存在的）和 'global'
            this.vnActiveEntityIds = (event.factionIds || [event.factionId])
                .filter(id => id !== 'global' && !this.isProtagonist(id));

            // [新增] 初始化玩家身份：优先选定 marked as Protagonist 的角色，否则选 narrator
            const protagonist = this.players.find(p => p.isProtagonist);
            this.vnPlayerRoleId = protagonist ? protagonist.id : 'narrator';

            // 开始播放
            this.playTypewriter(this.vnCurrentLine.text);
        },

        // --- 修改 vnNextLine ---
        vnNextLine(e) {
            // ★★★ [新增] 核心修复：如果点击的目标是输入框、按钮或其内部元素，直接终止，不切换下一句
            if (e && e.target) {
                const tag = e.target.tagName;
                // 如果点击的是 INPUT, BUTTON, TEXTAREA，或者点击了输入框内部
                if (['INPUT', 'BUTTON', 'TEXTAREA'].includes(tag) || e.target.closest('input') || e.target.closest('button')) {
                    return;
                }
            }

            // 1. 如果正在打字，立即显示全文本 (Skip typing)
            if (this.vnIsTyping) {
                clearInterval(this.vnTypeTimer);
                this.vnDisplayedText = this.vnFullText;
                this.vnIsTyping = false;
                return;
            }

            // 2. 如果还有下一句，播放下一句
            if (this.vnLineIndex < this.vnScript.length - 1) {
                this.vnLineIndex++;
                this.playTypewriter(this.vnCurrentLine.text);
            } else {
                // ★★★ [修改] 剧本播放完毕后的逻辑 ★★★

                // 只有当事件确实包含预设选项时，才弹出选项层结束对话
                if (this.vnCurrentEvent.options && this.vnCurrentEvent.options.length > 0) {
                    this.vnShowOptions = true;
                } else {
                    // 如果没有选项，说明是“开放式对话”
                    // 此时什么都不做，停留在最后一句画面上
                    // 输入框依然在，用户可以继续输入 sendVNChat 来“续命”
                    console.log("Script ended, waiting for user input...");
                }
            }
        },

        // --- [新增] 打字机核心逻辑 ---
        playTypewriter(text) {
            this.vnFullText = text;
            this.vnDisplayedText = "";
            this.vnIsTyping = true;

            if (this.vnTypeTimer) clearInterval(this.vnTypeTimer);

            let i = 0;
            // [修改] 提高打字速度：从 30ms 改为 10ms，提升流畅感
            this.vnTypeTimer = setInterval(() => {
                if (i < text.length) {
                    this.vnDisplayedText += text.charAt(i);
                    i++;
                } else {
                    clearInterval(this.vnTypeTimer);
                    this.vnIsTyping = false;
                }
            }, 1);
        },
        // [新增] 获取立绘的动态样式 (缩放与位移)
        getAvatarStyleObj(id, tag = null) {
            const style = {
                transformOrigin: 'bottom center', // 关键：从底部中心缩放，符合立绘逻辑
                transition: 'all 0.3s ease-out'
            };

            if (!id || id === 'global') return style;
            const p = this.players.find(x => x.id === id);
            if (!p) return style;

            let scale = 1.0;
            let offsetY = 0.0;

            // 1. 尝试查找 Tag 对应的差分配置
            if (tag && p.avatars && p.avatars.length > 0) {
                const variant = p.avatars.find(a => a.tag.toLowerCase() === tag.toLowerCase());
                if (variant) {
                    // 只有当 variant 真的有 url 时才应用它的配置，否则 fallback 到默认
                    // 但这里假设只要 tag 匹配就用它的配置
                    scale = variant.scale !== undefined ? variant.scale : 1.0;
                    offsetY = variant.offsetY !== undefined ? variant.offsetY : 0.0;

                    style.transform = `scale(${scale}) translateY(${offsetY}%)`;
                    return style;
                }
            }

            // 2. 使用默认配置
            scale = p.avatarScale !== undefined ? p.avatarScale : 1.0;
            offsetY = p.avatarOffsetY !== undefined ? p.avatarOffsetY : 0.0;

            style.transform = `scale(${scale}) translateY(${offsetY}%)`;
            return style;
        },
        // [修改] 支持传入 tag 获取特定差分立绘
        getFactionAvatar(id, tag = null) {
            if (!id || id === 'global') return null;
            const p = this.players.find(x => x.id === id);
            if (!p) return null;

            // 1. 优先尝试匹配 Tag (如果 Tag 存在)
            if (tag && p.avatars && p.avatars.length > 0) {
                // 不区分大小写查找
                const variant = p.avatars.find(a => a.tag.toLowerCase() === tag.toLowerCase());
                if (variant && this.isImage(variant.url)) return variant.url;
            }

            // 2. 默认立绘 fallback
            if (p.avatar && this.isImage(p.avatar)) return p.avatar;

            // 3. 如果没有 avatar，但 logo 是图片，勉强用 logo 代替
            if (p.logo && this.isImage(p.logo)) return p.logo;

            return null;
        },
    };
})(window);
