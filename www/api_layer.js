/* --- START OF FILE api_layer.js (Final Native Version) --- */

// 1. 环境检测
// IS_CAPACITOR: 明确是否在 Capacitor 容器中 (安卓/iOS)
window.IS_CAPACITOR = window.Capacitor !== undefined;

// IS_NATIVE_APP: 只有在 Capacitor 中，才视为纯原生App模式
// 如果在桌面浏览器打开，即使引入了 Capacitor 库，只要有 Python 后端，依然优先用 Python
window.IS_NATIVE_APP = window.IS_CAPACITOR;

// Python 后端地址 (桌面调试用)
const PYTHON_API_BASE = "http://127.0.0.1:8000";

console.log(`%c[Levant Kernel] Env: ${window.IS_NATIVE_APP ? 'Native App (Filesystem Mode)' : 'Desktop/Web (Python Mode)'}`, "color: #10b981; font-weight: bold; font-size: 14px;");

// 2. 工具函数
const Utils = {
    // 处理 Base64 解码，解决中文乱码问题
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

    // 处理附件：在手机端无法使用 Python 解析 PDF/Docx，这里主要处理图片和纯文本
    processAttachments(attachments, allowImage) {
        let textPart = "";
        let mediaParts = [];
        if (!attachments || !Array.isArray(attachments)) return { textPart, mediaParts };

        attachments.forEach(att => {
            // 清洗 Base64 前缀
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
                textPart += `\n[System: File '${att.name}' (${att.type}) skipped. Native App mode currently supports Images and Text files only.]\n`;
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
            // 安全检查
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

// 4. 核心 API 适配层 (挂载到 window)
window.LevantAPI = {
    // --- 内部辅助：动态加载 Capacitor Filesystem 插件 ---
    // 这是为了防止在没有安装插件的普通浏览器环境中报错
    async _getCapacitorFs() {
        if (!window.IS_NATIVE_APP) return null;

        try {
            // 1. 优先尝试标准导入 (适用于 Vite/Webpack 打包环境)
            return await import('@capacitor/filesystem');
        } catch (e) {
            console.warn("[Levant] Module import failed, switching to Global Bridge mode.");

            // 2. 降级方案：直接使用全局 Capacitor 对象 (适用于未打包的静态 JS)
            // 只要你安装了插件并 sync 过，window.Capacitor.Plugins.Filesystem 就是可用的
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
                return {
                    // 核心插件对象
                    Filesystem: window.Capacitor.Plugins.Filesystem,
                    
                    // 手动补全常量 (因为无法 import 枚举，我们需要手动定义字符串)
                    Directory: {
                        Documents: 'DOCUMENTS',
                        Data: 'DATA',
                        Library: 'LIBRARY',
                        Cache: 'CACHE',
                        External: 'EXTERNAL',        // ★ 安卓专用
                        ExternalStorage: 'EXTERNAL_STORAGE'
                    },
                    Encoding: {
                        UTF8: 'utf8',
                        ASCII: 'ascii',
                        UTF16: 'utf16'
                    }
                };
            }
            
            // 如果连全局对象都没有，说明插件没安装
            throw new Error("Capacitor Filesystem plugin is MISSING. Please run: npm install @capacitor/filesystem && npx cap sync");
        }
    },

    // ★★★ [新增] 获取当前平台合适的存储目录 ★★★
    // 安卓需使用 External 目录以避免权限报错，iOS 继续使用 Documents
    async _getStorageDir() {
        const { Directory } = await this._getCapacitorFs();
        const isAndroid = window.Capacitor && window.Capacitor.getPlatform() === 'android';
        return isAndroid ? Directory.External : Directory.Documents;
    },

    // ★★★ [适配] 获取音乐列表 ★★★
    async getMusicList() {
        if (!window.IS_NATIVE_APP) {
            // 桌面/Web模式：找 Python 要
            const url = `${PYTHON_API_BASE}/api/music-list?t=${Date.now()}`;
            return (await axios.get(url)).data;
        }
        
        // 安卓模式：读取文档目录下的 sounds 文件夹
        try {
            const { Filesystem, Directory } = await this._getCapacitorFs();
            
            // 尝试创建 sounds 目录 (如果不存在)，防止读取报错
            try {
                await Filesystem.mkdir({
                    path: 'sounds',
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) {}

            const dir = await this._getStorageDir(); // 获取动态目录
            const ret = await Filesystem.readdir({
                path: 'sounds',
                directory: dir
            });
            
            // 过滤音频文件
            // 注意：ret.files 是一个对象数组 [{name: 'xxx.mp3', ...}]
            const files = ret.files
                .filter(f => f.name && f.name.match(/\.(mp3|wav|ogg|flac)$/i))
                .map(f => f.name);
                
            return { files: files };
        } catch (e) {
            console.warn("[App] Error loading sounds from Documents/sounds:", e);
            return { files: [] };
        }
    },
    
    // --- A. 存档系统 (使用真实文件系统) ---
    async getSaves() {
        // 1. 桌面模式
        if (!window.IS_NATIVE_APP) {
            return (await axios.get(`${PYTHON_API_BASE}/api/saves`)).data;
        }

        // 2. 安卓模式：读取 Documents/saves 目录
        try {
            const { Filesystem, Directory } = await this._getCapacitorFs();
            
            // 确保目录存在
            try {
                await Filesystem.mkdir({
                    path: 'saves',
                    directory: Directory.Data,
                    recursive: true
                });
            } catch(e) {}

            const dirSave = await this._getStorageDir(); // 获取动态目录
            const ret = await Filesystem.readdir({
                path: 'saves',
                directory: dirSave
            });
            
            const files = ret.files
                .map(f => f.name)
                .filter(n => n.endsWith('.json'))
                .sort();
            return { files: files };
        } catch (e) {
            console.error("[App] Get saves failed:", e);
            return { files: [] };
        }
    },

    async loadGame(filename) {
        if (!window.IS_NATIVE_APP) {
            return (await axios.get(`${PYTHON_API_BASE}/api/state?filename=${filename}`)).data;
        }

        const { Filesystem, Encoding } = await this._getCapacitorFs();
        const dir = await this._getStorageDir(); // ★ 动态目录

        try {
            const ret = await Filesystem.readFile({
                path: `saves/${filename}`,
                directory: dir, // ★ 使用 dir
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

        const { Filesystem, Encoding } = await this._getCapacitorFs();
        const dir = await this._getStorageDir(); // ★ 动态目录

        try {
            // 确保 saves 目录存在
            try {
                await Filesystem.mkdir({
                    path: 'saves',
                    directory: dir, // ★ 使用 dir
                    recursive: true
                });
            } catch (e) {} 

            await Filesystem.writeFile({
                path: `saves/${filename}`,
                data: JSON.stringify(data, null, 2),
                directory: dir, // ★ 使用 dir
                encoding: Encoding.UTF8,
            });
            return { status: "saved", filename };
        } catch (e) {
            console.error("Native Save Error:", e); // 增加日志以便调试
            throw new Error("Save failed: " + e.message);
        }
    },

    async deleteSave(filename) {
        if (!window.IS_NATIVE_APP) {
            return await axios.delete(`${PYTHON_API_BASE}/api/saves/${filename}`);
        }

        const { Filesystem } = await this._getCapacitorFs();
        const dir = await this._getStorageDir(); // ★ 动态目录

        await Filesystem.deleteFile({
            path: `saves/${filename}`,
            directory: dir // ★ 使用 dir
        });
        return { status: "deleted" };
    },

    // --- B. AI 接口 ---
    async generateAI(req) {
        // 1. 桌面模式：依然优先走 Python (支持 PDF 解析和日志)
        if (!window.IS_NATIVE_APP) {
            return (await axios.post(`${PYTHON_API_BASE}/api/ai/generate`, req)).data;
        }

        // 2. 安卓模式：直接在前端调用 AI API
        console.log(`[Mobile AI] Direct Call: ${req.provider} / ${req.model}`);
        
        const m = req.model.toLowerCase();
        const canSee = m.includes('gpt-4') || m.includes('claude') || m.includes('gemini') || m.includes('vision');

        // 使用前端工具函数处理附件
        const { textPart, mediaParts } = Utils.processAttachments(req.attachments, canSee);
        
        // 组装 Prompt
        const fullContext = `=== CONTEXT ===\n${req.context}\n${textPart}\n=== INSTRUCTION ===\n${req.userPrompt}`;

        const provider = req.provider.toLowerCase();
        
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
/* --- END OF FILE api_layer.js --- */