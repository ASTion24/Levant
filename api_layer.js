/* --- api_layer.js (Fixed Global Scope) --- */

// 1. 环境检测
// IS_CAPACITOR: 明确是否在 Capacitor 容器中 (安卓/iOS)
window.IS_CAPACITOR = window.Capacitor !== undefined;

// IS_NATIVE_APP: 只有在 Capacitor 中，且非网页调试模式下，才视为纯原生App模式
// 如果你在桌面端浏览器里跑，即使引入了 Capacitor 库，只要有 Python 后端，我们依然优先用 Python
window.IS_NATIVE_APP = window.IS_CAPACITOR;

const PYTHON_API_BASE = "http://127.0.0.1:8000";

console.log(`%c[Levant Kernel] Env: ${window.IS_NATIVE_APP ? 'Native App (No Python)' : 'Desktop/Web (Python Backend)'}`, "color: #10b981; font-weight: bold; font-size: 14px;");

// 2. 工具函数
const Utils = {
    b64DecodeUnicode(str) {
        try {
            return decodeURIComponent(atob(str).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        } catch (e) {
            console.warn("Base64 decode failed:", e);
            return str;
        }
    },

    processAttachments(attachments, allowImage) {
        let textPart = "";
        let mediaParts = [];
        if (!attachments || !Array.isArray(attachments)) return { textPart, mediaParts };

        attachments.forEach(att => {
            let cleanData = att.data.replace(/^data:.*?;base64,/, '');
            if (att.type.startsWith('image/')) {
                if (allowImage) {
                    mediaParts.push({ mime_type: att.type, data: cleanData });
                } else {
                    textPart += `\n[System: User uploaded image '${att.name}', but current model does not support vision. Image ignored.]\n`;
                }
            } 
            else if (att.type.startsWith('text/') || att.name.endsWith('.txt') || att.name.endsWith('.md') || att.name.endsWith('.json') || att.name.endsWith('.py')) {
                const content = this.b64DecodeUnicode(cleanData);
                textPart += `\n\n=== FILE: ${att.name} ===\n${content}\n`;
            }
            else {
                textPart += `\n[System: File '${att.name}' (${att.type}) skipped. Binary parsing requires Python backend.]\n`;
            }
        });
        return { textPart, mediaParts };
    }
};

// 3. 原生 AI 实现 (定义在前，防止调用时未初始化)
const NativeAI = {
    async callGemini(req, promptText, mediaParts) {
        const apiKey = req.apiKey;
        const model = req.model || "gemini-2.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const parts = [{ text: req.systemPrompt + "\n\n" + promptText }]; 
        mediaParts.forEach(m => {
            parts.push({ inline_data: { mime_type: m.mime_type, data: m.data } });
        });
        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });
        if (!response.ok) throw new Error(`Gemini Error ${response.status}: ${await response.text()}`);
        const json = await response.json();
        try { 
            // [修复] 增加安全检查
            if (!json.candidates || json.candidates.length === 0) {
                throw new Error("Gemini returned no candidates (Possible safety block).");
            }
            const parts = json.candidates[0].content?.parts;
            if (!parts || parts.length === 0) {
                throw new Error("Gemini returned empty content.");
            }
            return { result: parts[0].text }; 
        } catch (e) { 
            console.error("Gemini Raw Response:", json);
            throw new Error("Gemini response parsing failed: " + e.message); 
        }
    },

    async callClaude(req, promptText, mediaParts) {
        const url = "https://api.anthropic.com/v1/messages";
        const contentArr = [];
        mediaParts.forEach(m => {
            contentArr.push({ type: "image", source: { type: "base64", media_type: m.mime_type, data: m.data } });
        });
        contentArr.push({ type: "text", text: promptText });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': req.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true' 
            },
            body: JSON.stringify({
                model: req.model || "claude-3-5-sonnet-20240620", max_tokens: 4096,
                system: req.systemPrompt, messages: [{ role: "user", content: contentArr }]
            })
        });
        if (!response.ok) throw new Error(`Claude Error ${response.status}: ${await response.text()}`);
        const json = await response.json();
        return { result: json.content[0].text };
    },

    async callOpenAICompatible(req, promptText, mediaParts) {
        let baseUrl = req.baseUrl || "https://api.openai.com/v1";
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        if (!baseUrl.includes('/chat/completions')) baseUrl += '/chat/completions';

        const messages = [{ role: "system", content: req.systemPrompt }];
        if (mediaParts.length > 0) {
            const contentArr = [{ type: "text", text: promptText }];
            mediaParts.forEach(m => {
                contentArr.push({ type: "image_url", image_url: { url: `data:${m.mime_type};base64,${m.data}` } });
            });
            messages.push({ role: "user", content: contentArr });
        } else {
            messages.push({ role: "user", content: promptText });
        }

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${req.apiKey}` },
            body: JSON.stringify({ model: req.model, messages: messages, temperature: 0.7 })
        });
        if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);
        const json = await response.json();
        return { result: json.choices[0].message.content };
    }
};

// 4. 核心 API 适配层 (★强制挂载到 window★)
// 4. 核心 API 适配层 (★强制挂载到 window★)
window.LevantAPI = {
    // --- 内部辅助：动态加载 Capacitor 插件 ---
    async _getCapacitorFs() {
        if (!window.IS_NATIVE_APP) return null;
        // 动态导入，防止桌面端报错
        // 注意：这需要你的安卓打包环境(Vite/Webpack)支持解析 @capacitor/filesystem
        return await import('@capacitor/filesystem');
    },

    // ★★★ [适配] 获取音乐列表 ★★★
    async getMusicList() {
        if (!window.IS_NATIVE_APP) {
            // 桌面/Web模式：找 Python 要
            const url = `${PYTHON_API_BASE}/api/music-list?t=${Date.now()}`;
            return (await axios.get(url)).data;
        }
        
        // 安卓模式：读取 /assets/sounds 或者是文档目录
        // 简单起见，安卓端如果没法动态列出 asset 文件，可以返回空，或者硬编码几个
        // 这里演示如何读取文档目录下的 sounds 文件夹
        try {
            const { Filesystem, Directory } = await this._getCapacitorFs();
            // 尝试读取 Documents/sounds 目录
            const ret = await Filesystem.readdir({
                path: 'sounds',
                directory: Directory.Documents
            });
            // 过滤音频文件
            const files = ret.files
                .filter(f => f.name.match(/\.(mp3|wav|ogg)$/i))
                .map(f => f.name);
            return { files: files };
        } catch (e) {
            console.warn("[App] No user sounds found, using fallback.");
            return { files: [] }; // 返回空，前端会处理默认值
        }
    },
    
    // --- A. 存档系统 ---
    async getSaves() {
        // 1. 桌面模式：调用 Python
        if (!window.IS_NATIVE_APP) {
            return (await axios.get(`${PYTHON_API_BASE}/api/saves`)).data;
        }

        // 2. 安卓模式：调用 Filesystem
        try {
            const { Filesystem, Directory } = await this._getCapacitorFs();
            // 读取 Documents/saves 目录
            const ret = await Filesystem.readdir({
                path: 'saves',
                directory: Directory.Documents
            });
            // 过滤 .json
            const files = ret.files
                .map(f => f.name)
                .filter(n => n.endsWith('.json'))
                .sort();
            return { files: files };
        } catch (e) {
            // 目录可能不存在，这很正常
            return { files: [] };
        }
    },

    async loadGame(filename) {
        if (!window.IS_NATIVE_APP) {
            return (await axios.get(`${PYTHON_API_BASE}/api/state?filename=${filename}`)).data;
        }

        const { Filesystem, Directory, Encoding } = await this._getCapacitorFs();
        try {
            const ret = await Filesystem.readFile({
                path: `saves/${filename}`,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
            });
            return JSON.parse(ret.data);
        } catch (e) {
            throw new Error(`Failed to load ${filename}: ${e.message}`);
        }
    },

    async saveGame(filename, data) {
        if (!window.IS_NATIVE_APP) {
            return await axios.post(`${PYTHON_API_BASE}/api/state?filename=${filename}`, data);
        }

        const { Filesystem, Directory, Encoding } = await this._getCapacitorFs();
        try {
            // 确保 saves 目录存在
            try {
                await Filesystem.mkdir({
                    path: 'saves',
                    directory: Directory.Documents,
                    recursive: true
                });
            } catch (e) {} // 忽略已存在错误

            await Filesystem.writeFile({
                path: `saves/${filename}`,
                data: JSON.stringify(data, null, 2),
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
            });
            return { status: "saved", filename };
        } catch (e) {
            throw new Error("Save failed: " + e.message);
        }
    },

    async deleteSave(filename) {
        if (!window.IS_NATIVE_APP) {
            return await axios.delete(`${PYTHON_API_BASE}/api/saves/${filename}`);
        }

        const { Filesystem, Directory } = await this._getCapacitorFs();
        await Filesystem.deleteFile({
            path: `saves/${filename}`,
            directory: Directory.Documents
        });
        return { status: "deleted" };
    },

    // --- B. AI 接口 ---
    async generateAI(req) {
        // 1. 桌面模式：依然优先走 Python (因为它有强大的 PDF 解析和日志能力)
        if (!window.IS_NATIVE_APP) {
            return (await axios.post(`${PYTHON_API_BASE}/api/ai/generate`, req)).data;
        }

        // 2. 安卓模式：直接在前端调用 AI API
        // 注意：安卓端无法使用 Python 解析 PDF/Word，这里需要做降级处理
        // 如果 req.attachments 里有文档，这里只能忽略，或仅支持图片
        console.log(`[Mobile AI] Direct Call: ${req.provider} / ${req.model}`);
        
        // 简单判断模型是否支持视觉
        const m = req.model.toLowerCase();
        const canSee = m.includes('gpt-4') || m.includes('claude') || m.includes('gemini') || m.includes('vision');

        // 使用前端工具函数处理附件 (仅图片)
        const { textPart, mediaParts } = Utils.processAttachments(req.attachments, canSee);
        
        // 组装 Prompt
        const fullContext = `=== CONTEXT ===\n${req.context}\n${textPart}\n=== INSTRUCTION ===\n${req.userPrompt}`;

        // 复用你已经写好的 NativeAI 对象
        const provider = req.provider.toLowerCase();
        
        // ★★★ 跨域处理提示 ★★★
        // 如果在手机上遇到 CORS 错误，可能需要引入 @capacitor/http 插件来替换 fetch
        // 这里暂时保持 fetch，大部分 AI API (OpenAI/Claude/Gemini) 支持直连
        if (provider === 'gemini') {
            return await NativeAI.callGemini(req, fullContext, mediaParts);
        } else if (provider === 'claude') {
            return await NativeAI.callClaude(req, fullContext, mediaParts);
        } else {
            // OpenAI / DeepSeek / Compatible
            return await NativeAI.callOpenAICompatible(req, fullContext, mediaParts);
        }
    }
};