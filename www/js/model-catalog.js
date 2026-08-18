(function (global) {
    'use strict';

    const capabilities = (overrides = {}) => ({
        vision: false,
        nativeDocuments: false,
        reasoning: true,
        structuredOutput: false,
        ...overrides
    });

    const presets = [
        {
            id: 'gemini',
            label: 'Google Gemini',
            protocol: 'Gemini',
            baseUrl: '',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://ai.google.dev/gemini-api/docs',
            apiKeyUrl: 'https://aistudio.google.com/app/apikey',
            defaultModel: 'gemini-3.7-flash',
            models: [
                { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', capabilities: capabilities({ vision: true, nativeDocuments: true, structuredOutput: true }) },
                { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', capabilities: capabilities({ vision: true, nativeDocuments: true, structuredOutput: true }) },
                { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', capabilities: capabilities({ vision: true, nativeDocuments: true, structuredOutput: true }) }
            ]
        },
        {
            id: 'claude',
            label: 'Anthropic Claude',
            protocol: 'Claude',
            baseUrl: '',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://docs.anthropic.com/en/api/overview',
            apiKeyUrl: 'https://console.anthropic.com/settings/keys',
            defaultModel: 'claude-sonnet-4-6',
            models: [
                { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', capabilities: capabilities({ vision: true, structuredOutput: true }) },
                { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', capabilities: capabilities({ vision: true, structuredOutput: true }) },
                { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', capabilities: capabilities({ vision: true, structuredOutput: true }) }
            ]
        },
        {
            id: 'deepseek',
            label: 'DeepSeek',
            protocol: 'OpenAI',
            baseUrl: 'https://api.deepseek.com',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://api-docs.deepseek.com/',
            apiKeyUrl: 'https://platform.deepseek.com/api_keys',
            defaultModel: 'deepseek-v4-pro',
            models: [
                { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', capabilities: capabilities({ structuredOutput: true }) },
                { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', capabilities: capabilities({ structuredOutput: true }) }
            ]
        },
        {
            id: 'qwen',
            label: 'Alibaba Qwen',
            protocol: 'OpenAI',
            baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen',
            apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
            defaultModel: 'qwen3.8-max',
            models: [
                { id: 'qwen3.8-max', label: 'Qwen 3.8 Max', capabilities: capabilities({ vision: true, structuredOutput: true }) },
                { id: 'qwen3.7-plus', label: 'Qwen 3.7 Plus', capabilities: capabilities({ vision: true, structuredOutput: true }) },
                { id: 'qwen3.7-flash', label: 'Qwen 3.7 Flash', capabilities: capabilities({ vision: true, structuredOutput: true }) }
            ]
        },
        {
            id: 'openai',
            label: 'OpenAI',
            protocol: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://platform.openai.com/docs/api-reference',
            apiKeyUrl: 'https://platform.openai.com/api-keys',
            defaultModel: 'gpt-5.6-terra',
            models: [
                { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', capabilities: capabilities({ vision: true, structuredOutput: true }) },
                { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', capabilities: capabilities({ vision: true, structuredOutput: true }) },
                { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', capabilities: capabilities({ vision: true, structuredOutput: true }) }
            ]
        },
        {
            id: 'siliconflow',
            label: 'SiliconFlow',
            protocol: 'OpenAI',
            baseUrl: 'https://api.siliconflow.cn/v1',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions',
            apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
            defaultModel: 'deepseek-ai/DeepSeek-V4-Pro',
            models: [
                { id: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro', capabilities: capabilities({ structuredOutput: true }) },
                { id: 'Pro/deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2 Pro', capabilities: capabilities({ structuredOutput: true }) },
                { id: 'Qwen/Qwen3.6-35B-A3B', label: 'Qwen 3.6 35B A3B', capabilities: capabilities() }
            ]
        },
        {
            id: 'kimi',
            label: 'Kimi / Moonshot',
            protocol: 'OpenAI',
            baseUrl: 'https://api.moonshot.cn/v1',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://platform.kimi.com/docs/',
            apiKeyUrl: 'https://platform.kimi.com/console/api-keys',
            defaultModel: 'kimi-k2.6',
            models: [
                { id: 'kimi-k2.6', label: 'Kimi K2.6', capabilities: capabilities({ vision: true, structuredOutput: true }) }
            ]
        },
        {
            id: 'glm',
            label: 'GLM / Zhipu AI',
            protocol: 'OpenAI',
            baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
            requiresApiKey: true,
            local: false,
            docsUrl: 'https://docs.bigmodel.cn/',
            apiKeyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
            defaultModel: 'glm-5.2',
            models: [
                { id: 'glm-5.2', label: 'GLM-5.2', capabilities: capabilities({ structuredOutput: true }) },
                { id: 'glm-4.7', label: 'GLM-4.7', capabilities: capabilities({ structuredOutput: true }) },
                { id: 'glm-4.7-flashx', label: 'GLM-4.7-FlashX', capabilities: capabilities({ structuredOutput: true }) },
                { id: 'glm-5v-turbo', label: 'GLM-5V-Turbo', capabilities: capabilities({ vision: true, structuredOutput: true }) }
            ]
        },
        {
            id: 'ollama',
            label: 'Ollama',
            protocol: 'OpenAI',
            baseUrl: 'http://localhost:11434/v1',
            requiresApiKey: false,
            local: true,
            docsUrl: 'https://docs.ollama.com/openai',
            apiKeyUrl: '',
            defaultModel: '',
            models: []
        },
        {
            id: 'lmstudio',
            label: 'LM Studio',
            protocol: 'OpenAI',
            baseUrl: 'http://localhost:1234/v1',
            requiresApiKey: false,
            local: true,
            docsUrl: 'https://lmstudio.ai/docs/developer/openai-compat',
            apiKeyUrl: '',
            defaultModel: '',
            models: []
        },
        {
            id: 'vllm',
            label: 'vLLM',
            protocol: 'OpenAI',
            baseUrl: 'http://localhost:8000/v1',
            requiresApiKey: false,
            local: true,
            docsUrl: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server/',
            apiKeyUrl: '',
            defaultModel: '',
            models: []
        },
        {
            id: 'localai',
            label: 'LocalAI',
            protocol: 'OpenAI',
            baseUrl: 'http://localhost:8080/v1',
            requiresApiKey: false,
            local: true,
            docsUrl: 'https://localai.io/features/text-generation/',
            apiKeyUrl: '',
            defaultModel: '',
            models: []
        },
        {
            id: 'custom',
            label: 'Custom',
            protocol: 'OpenAI',
            baseUrl: '',
            requiresApiKey: true,
            local: false,
            docsUrl: '',
            apiKeyUrl: '',
            defaultModel: '',
            models: []
        }
    ];

    function getPreset(presetId) {
        return presets.find(preset => preset.id === presetId) || presets[presets.length - 1];
    }

    function inferPreset(profile = {}) {
        const provider = String(profile.provider || '').toLowerCase();
        const baseUrl = String(profile.baseUrl || '').toLowerCase();
        const explicitPreset = presets.find(preset => preset.id === profile.presetId);
        if (explicitPreset && explicitPreset.id !== 'custom') return explicitPreset;
        if (provider === 'gemini') return getPreset('gemini');
        if (provider === 'claude') return getPreset('claude');
        if (baseUrl.includes('api.deepseek.com')) return getPreset('deepseek');
        if (baseUrl.includes('dashscope') || baseUrl.includes('maas.aliyuncs.com')) return getPreset('qwen');
        if (baseUrl.includes('api.openai.com')) return getPreset('openai');
        if (baseUrl.includes('siliconflow')) return getPreset('siliconflow');
        if (baseUrl.includes('api.moonshot.cn')) return getPreset('kimi');
        if (baseUrl.includes('open.bigmodel.cn')) return getPreset('glm');
        if (baseUrl.includes('localhost:11434') || baseUrl.includes('127.0.0.1:11434')) return getPreset('ollama');
        if (baseUrl.includes('localhost:1234') || baseUrl.includes('127.0.0.1:1234')) return getPreset('lmstudio');
        if (baseUrl.includes('localhost:8080') || baseUrl.includes('127.0.0.1:8080')) return getPreset('localai');
        return getPreset(profile.presetId || 'custom');
    }

    function findModel(profile = {}) {
        const preset = inferPreset(profile);
        const model = preset.models.find(item => item.id === profile.model);
        return model ? { preset, model } : { preset, model: null };
    }

    function resolveCapabilities(profile = {}) {
        if (profile.capabilities && typeof profile.capabilities === 'object') {
            return capabilities(profile.capabilities);
        }
        const { model } = findModel(profile);
        return model ? capabilities(model.capabilities) : capabilities();
    }

    function applyPreset(profile, presetId, options = {}) {
        const preset = getPreset(presetId);
        const next = {
            ...profile,
            presetId: preset.id,
            provider: preset.protocol,
            baseUrl: preset.baseUrl,
            model: preset.defaultModel,
            capabilities: resolveCapabilities({
                presetId: preset.id,
                provider: preset.protocol,
                baseUrl: preset.baseUrl,
                model: preset.defaultModel
            })
        };
        if (options.rename !== false) next.name = preset.label;
        if (options.clearKey) next.key = '';
        return next;
    }

    function migrateProfile(profile = {}) {
        const preset = inferPreset(profile);
        const migrated = { ...profile };
        migrated.presetId = preset.id;
        migrated.capabilities = resolveCapabilities(migrated);
        return migrated;
    }

    function enrichRequest(request = {}) {
        const profile = {
            presetId: request.presetId,
            provider: request.provider,
            baseUrl: request.baseUrl,
            model: request.model,
            capabilities: request.capabilities
        };
        return {
            ...request,
            capabilities: resolveCapabilities(profile)
        };
    }

    global.LevantModelCatalog = {
        updatedAt: '2026-08-18',
        presets,
        getPreset,
        inferPreset,
        findModel,
        resolveCapabilities,
        applyPreset,
        migrateProfile,
        enrichRequest
    };
})(window);
