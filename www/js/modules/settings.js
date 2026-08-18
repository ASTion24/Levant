(function (global) {
    'use strict';

    global.LevantModules = global.LevantModules || {};
    global.LevantModules.settings = {
        getDefaultApiSettings() {
            return window.LevantModelCatalog.applyPreset({ key: '' }, 'gemini', { rename: false });
        },
        normalizeApiProfile(profile) {
            const base = window.LevantModelCatalog.migrateProfile(profile || {});
            const preset = window.LevantModelCatalog.getPreset(base.presetId || 'custom');
            return {
                id: base.id || Date.now(),
                name: base.name || 'New Profile',
                provider: base.provider || 'Gemini',
                baseUrl: base.baseUrl || '',
                model: base.model || preset.defaultModel || '',
                key: base.key || '',
                presetId: base.presetId || 'custom',
                capabilities: base.capabilities || {},
                status: 'unknown',
                isTesting: false
            };
        },
        stripProfileUiState(profile) {
            return {
                id: profile.id,
                name: profile.name,
                provider: profile.provider,
                baseUrl: profile.baseUrl,
                model: profile.model,
                key: profile.key,
                presetId: profile.presetId || 'custom',
                capabilities: profile.capabilities || {}
            };
        },
        loadPersistedSettings() {
            const raw = localStorage.getItem('levant_settings');
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.error("Failed to parse saved settings", e);
                localStorage.removeItem('levant_settings');
                return null;
            }
        },
        syncActiveProfileToSettings() {
            const activeProfile = this.settings.api_profiles.find(p => p.id === this.settings.active_profile_id);
            if (!activeProfile) {
                this.settings.api = this.getDefaultApiSettings();
                return false;
            }
            this.settings.api = {
                provider: activeProfile.provider,
                baseUrl: activeProfile.baseUrl,
                model: activeProfile.model,
                key: activeProfile.key,
                presetId: activeProfile.presetId || 'custom',
                capabilities: activeProfile.capabilities || {}
            };
            window.LevantActiveModelProfile = { ...this.settings.api };
            return true;
        },
        getModelPresets() {
            return window.LevantModelCatalog.presets;
        },
        getModelCatalogUpdatedAt() {
            return window.LevantModelCatalog.updatedAt;
        },
        getProfilePreset(profile) {
            return window.LevantModelCatalog.inferPreset(profile || {});
        },
        profileRequiresApiKey(profile) {
            return this.getProfilePreset(profile).requiresApiKey !== false;
        },
        profileIsLocal(profile) {
            return this.getProfilePreset(profile).local === true;
        },
        hasUsableModelProfile(profile) {
            if (!profile || !profile.model) return false;
            return !this.profileRequiresApiKey(profile) || Boolean(String(profile.key || '').trim());
        },
        ensureActiveModelConfigured() {
            if (this.hasUsableModelProfile(this.settings.api)) return true;
            this.showSettings = true;
            alert(this.t('msg_setup_api_first'));
            return false;
        },
        getApiProviderLinks() {
            return this.getModelPresets().filter(preset => preset.docsUrl || preset.apiKeyUrl);
        },
        getProfileModels(profile) {
            const preset = window.LevantModelCatalog.inferPreset(profile || {});
            const catalogModels = preset.models || [];
            const discovered = this.discoveredModels || [];
            const currentModel = profile?.model;
            const merged = new Map();

            [...catalogModels, ...discovered].forEach(model => {
                if (model?.id) merged.set(model.id, model);
            });
            if (currentModel && !merged.has(currentModel)) {
                merged.set(currentModel, {
                    id: currentModel,
                    label: currentModel,
                    displayName: currentModel
                });
            }
            return Array.from(merged.values());
        },
        getProfileCapabilities(profile) {
            return window.LevantModelCatalog.resolveCapabilities(profile || {});
        },
        syncEditingProfileCapabilities() {
            this.editingProfileData.capabilities = window.LevantModelCatalog.resolveCapabilities({
                ...this.editingProfileData,
                capabilities: null
            });
        },
        async refreshProfileModels() {
            if (this.profileRequiresApiKey(this.editingProfileData) && !this.editingProfileData.key) {
                this.modelLoadError = this.t('msg_profile_key_required');
                return;
            }
            this.isLoadingModels = true;
            this.modelLoadError = '';
            try {
                const response = await window.LevantAPI.listModels({
                    ...this.editingProfileData,
                    useProxy: this.settings.proxy.enabled,
                    proxyPort: this.settings.proxy.port
                });
                this.discoveredModels = (response.models || []).map(model => ({
                    ...model,
                    label: model.displayName || model.id
                }));
                if (!this.editingProfileData.model && this.discoveredModels.length > 0) {
                    this.editingProfileData.model = this.discoveredModels[0].id;
                    this.syncEditingProfileCapabilities();
                }
            } catch (error) {
                this.modelLoadError = error.message;
            } finally {
                this.isLoadingModels = false;
            }
        },
        openProfileEditor(profile) {
            this.discoveredModels = [];
            this.modelLoadError = '';
            if (profile) {
                // 编辑模式：深拷贝数据
                this.editingProfileData = JSON.parse(JSON.stringify(this.stripProfileUiState(profile)));
            } else {
                this.editingProfileData = window.LevantModelCatalog.applyPreset(
                    { id: null, key: '' },
                    'gemini',
                    { clearKey: true }
                );
            }
            this.isEditingProfile = true;
        },

        // 2. 保存配置 (新建或更新)
        saveProfile() {
            const isNewProfile = !this.editingProfileData.id;
            const data = this.normalizeApiProfile(this.editingProfileData);
            if (!data.name || !data.model) {
                return alert(this.t('msg_profile_fields_required'));
            }
            if (this.profileRequiresApiKey(data) && !data.key) {
                return alert(this.t('msg_profile_key_required'));
            }

            if (!isNewProfile) {
                // 更新现有
                const idx = this.settings.api_profiles.findIndex(p => p.id === data.id);
                if (idx !== -1) {
                    this.settings.api_profiles[idx] = data;
                    // 如果更新的是当前选中的，实时同步到 active api
                    if (this.settings.active_profile_id === data.id) {
                        this.selectProfile(data);
                    }
                }
            } else {
                // 新建
                data.id = Date.now();
                this.settings.api_profiles.push(data);
                // 如果是第一个，自动选中
                if (this.settings.api_profiles.length === 1) {
                    this.selectProfile(data);
                }
            }

            // 保存到 localStorage
            // [修改] 传入 true，表示静默保存，不要关闭大弹窗
            this.saveSettings(true);
            this.isEditingProfile = false;
        },
        // 3. 选中/激活配置
        selectProfile(profile) {
            this.settings.active_profile_id = profile.id;
            this.syncActiveProfileToSettings();
            // 立即保存状态，防止刷新丢失选中项
            this.saveSettings(true);
        },

        // 4. 删除配置
        deleteProfile(idx) {
            if (!confirm(this.t('msg_confirm_delete'))) return;

            const deletedId = this.settings.api_profiles[idx].id;
            this.settings.api_profiles.splice(idx, 1);

            // 如果删除了当前选中的，重置状态
            if (this.settings.active_profile_id === deletedId) {
                this.settings.active_profile_id = null;
                if (this.settings.api_profiles.length > 0) {
                    this.selectProfile(this.settings.api_profiles[0]);
                    return;
                }
            }
            this.syncActiveProfileToSettings();
            this.saveSettings(true);
        },
        // --- [新增] API 测试与状态同步逻辑 ---

        // 1. 主动测试某个配置 (点击小钥匙)
        async testUserProfile(profile) {
            if (this.profileRequiresApiKey(profile) && !profile.key) {
                return alert(this.t('msg_profile_key_required'));
            }

            profile.isTesting = true;
            profile.status = 'unknown';

            // 构造极简请求
            const payload = {
                provider: profile.provider,
                baseUrl: profile.baseUrl,
                apiKey: profile.key,
                model: profile.model,
                capabilities: profile.capabilities,
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,
                systemPrompt: "You are a connection tester.",
                context: "Test",
                userPrompt: "Reply 'OK' if you receive this."
            };

            try {
                // 调用后端/Native API
                await window.LevantAPI.generateAI(payload);
                profile.status = 'success';
            } catch (e) {
                console.warn("API Test Failed:", e);
                profile.status = 'error';
                // 可选：显示具体错误
                // alert("Connection Failed:\n" + e.message);
            } finally {
                profile.isTesting = false;
                // 如果这个正好是当前激活的配置，触发保存（虽然 status 不存，但保持逻辑一致性）
                if (this.settings.active_profile_id === profile.id) {
                    this.saveSettings(true); // [修改] 静默保存
                }
            }
        },

        // 2. 全局状态更新钩子 (供上帝模式/推演等调用)
        updateCurrentProfileStatus(status) { // status: 'success' | 'error'
            const activeId = this.settings.active_profile_id;
            if (!activeId) return;

            const profile = this.settings.api_profiles.find(p => p.id === activeId);
            if (profile) {
                profile.status = status;
            }
        },
        applyPresetToEditor(presetId) {
            this.editingProfileData = window.LevantModelCatalog.applyPreset(
                this.editingProfileData,
                presetId,
                { clearKey: true }
            );
            this.discoveredModels = [];
            this.modelLoadError = '';
        },
        applyPreset(presetId) {
            this.settings.api = window.LevantModelCatalog.applyPreset(
                this.settings.api,
                presetId,
                { rename: false }
            );
        },
    };
})(window);
