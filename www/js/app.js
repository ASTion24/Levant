const { createApp } = Vue;

createApp({
    data() {
        return {
            APP_VERSION: '1.21',
            showTutorialModal: false, // [新增]
            showHelpModal: false, // [新增]
            // ★★★ [新增] 撤销重做栈 ★★★
            undoStack: [],
            redoStack: [],
            // ★★★ [新增] 骰子仪式状态 ★★★
            showDiceModal: false,
            isRollingAnimation: false, // 是否处于“摇晃中”
            activeDiceList: [], // 用于弹窗显示的临时骰子数据
            useGalgamePrompt: false,
            // ★★★ [新增/修改] 动态 BGM 变量 ★★★
            currentBgmUrl: '',    // 实际播放地址
            currentBgmName: 'Loading Audio...', // 右下角显示的歌名
            isBgmPlaying: false,  // [新增] 主界面 BGM 播放状态
            showSplash: true, // [新增] 控制启动页显示
            hasInteracted: false, // 默认为 false，表示还在等待用户按键
            vnIsTyping: false,      // [新增] 是否正在打字
            vnFullText: "",         // [新增] 当前句子的完整文本
            vnTypeTimer: null,      // [新增] 打字机定时器
            vnUserInput: "", // [新增] VN模式下的用户输入

            // ★★★ [新增] VN 导演/上下文配置 ★★★
            vnShowSettings: false, // 是否显示导演面板
            vnActiveEntityIds: [],
            vnPlayerRoleId: '', // [新增] 当前玩家扮演的角色ID (默认为主角，可切换)
            vnContextConfig: {
                includeCustom: true,
                includeStats: true,
                includeTags: true,
                includeMap: false,
                // [修改] 独立的历史记忆设置，替代单一的 historyDepth
                includeHistory: true,
                historyDeepDepth: 1,   // VN模式专用的深层记忆
                historyShallowDepth: 5 // VN模式专用的浅层记忆
            },

            showFormulaModal: false,
            activeFormulaTab: '基础',
            validateFormulaResult: { valid: true, msg: '' },
            // 新增 '逻辑' 和 '函数'
            formulaTabs: ['基础', '逻辑', '函数', '自身', '环境', '高级'],
            currentEditingField: null, // 当前正在编辑哪个字段对象
            formulaTokens: [], // 存储公式片段: { type: 'var'|'op'|'num'|'func', label: '我的力量', value: "self.stats['str']" }
            tempNumber: 1,
            formulaBuilder: {
                targetEntityId: '',
                targetStatKey: '',
                aggOwner: 'self',
                aggStat: ''
            },

            // [新增] 文本润色/再生成状态
            showPolishModal: false,
            polishingEvent: null, // 当前正在润色的事件引用
            polishConfig: {
                style: 'epic', // 默认风格
                length: 100,   // 期望字数
                customInstruction: '' // 额外指令
            },
            isPolishing: false, // AI 处理中状态

            // ★★★ [新增] VN 模式状态 ★★★
            vnMode: false,          // 是否进入剧场模式
            vnCurrentEvent: null,   // 当前正在播放的事件对象
            vnScript: [],           // 解析后的剧本数组
            vnLineIndex: 0,         // 当前播放到第几行
            vnDisplayedText: "",    // 打字机效果当前显示的文字
            vnTypingTimer: null,    // 打字机计时器
            vnShowOptions: false,   // 是否显示选项层
            dataVersion: 0, // [新增] 全局数据版本号，用于强制刷新地图
            serverConnected: false, isThinking: false, currentSaveFile: 'savegame.json',
            showSettings: false, showFactionModal: false, showSaveLoadModal: false, showScriptGenModal: false, showContextModal: false,
            saveFiles: [], newSaveFilename: '',
            mapToolMode: 'view',
            // [新增] 安科模式开关
            generateOptions: false,
            previewAvatarIndex: -1,
            // --- 输入相关 ---
            scriptGenPrompt: '',
            rawInput: '',
            godModeInput: '', // [新增] 上帝模式输入
            scriptAttachments: [], // [新增] 剧本生成附件列表

            // [新增] 剧本生成高级配置
            scriptGenTab: 'content',
            scriptGenConfig: {
                rulesCount: 2,      // 默认生成2套规则
                entitiesCount: 4,   // 默认生成4个实体
                attrStyle: 'mixed'  // mixed | number | letter | text
            },

            editingFaction: { id: '', name: '', logo: '', stats: {} },
            editingTurnId: null, editingEventId: null,
            tabs: { left: 'players', right: 'input' },
            mobileActiveView: 'main',
            showMobileTools: false,
            leftPanelCollapsed: false,
            rightPanelCollapsed: false,
            isLargeScreen: window.innerWidth >= 1024,
            isKeyboardOpen: false, // [新增] 键盘状态标志
            // [新增] 战斗表单数据
            combatForm: {
                attackerId: '',
                defenderId: '',
                context: '',
                locationId: '', // [新增] 战斗地点 ID
                // [新增] 骰子池：默认先给一个 D20
                dicePool: [
                    { type: 'd20', val: null, label: '' }
                ]
            },
            isRollingDice: false,
            // [新增] 截图模式状态
            isScreenshotMode: false,
            screenshotRect: { x: 0, y: 0, w: 0, h: 0 },
            screenshotTarget: null, // 当前吸附的 DOM 元素
            screenshotTargetName: '', // 显示组件名称
            // [新增] 地图打点模态框状态
            showPinModal: false,
            editingPinIndex: -1, // -1 表示新建，>=0 表示编辑索引

            // ★★★ 彩蛋状态 ★★★
            logoClickCount: 0,
            showEasterEgg: false,

            pinForm: {
                x: 0, y: 0,
                mode: 'entity', // entity | lore | custom
                selectedId: '',
                customLabel: '',
                icon: '', color: '',
                schemaId: '',   // ★ 必须显式声明
                stats: {}       // ★ 必须显式声明
            },

            // --- UI Settings ---
            ui: { theme: 'terminal', lang: 'zh' },

            // [新增] 用于设置面板切换 Prompt 标签页
            settingsPromptTab: 'system',
            isLayerManagerOpen: true,
            // [新增] 剧本生成时的自定义Prompt开关
            scriptGenUseCustom: true,

            settings: {
                api: window.LevantModelCatalog.applyPreset({ key: '' }, 'gemini', { rename: false }),
                autonomy: {
                    mode: 'autonomous',
                    autoRepair: true,
                    maxRepairAttempts: 1,
                    guardedRiskThreshold: 4
                },

                // [新增] API 配置列表 (存储多套 Key)
                api_profiles: [],

                // [新增] 当前选中的 Profile ID (用于 UI 高亮)
                active_profile_id: null,

                proxy: { enabled: true, port: '7890' },
                prompts: {
                    // [新增] 自定义 Prompt 初始化
                    custom: "",
                    galgame: `你是一个 Galgame/Visual Novel 的剧本生成引擎。
                    【任务】
                    基于当前的“世界上下文”和“用户指令”，推演下一段剧情。
                    请直接返回 JSON 格式的 TimelineEvent。

                    【关键要求：Content 字段结构】
                    "content" 字段**必须**是一个 JSON 字符串（即 Stringified JSON Array），以便前端解析。
                    该数组描述了对话流。格式如下：
                    [
                    { "role": "faction_id_A", "tag": "angry", "text": "你竟敢背叛我！" },
                    { "role": "faction_id_B", "tag": "smile", "text": "这叫战略调整，我的朋友。" },
                    { "role": "narrator", "text": "随着一声枪响，谈判破裂了。" }
                    ]
                    - role: 对应 players 中的 id。如果是旁白，请用 "narrator"。
                    - tag: (可选) 对应立绘的表情变体 (如 "smile", "angry", "sad")。
                    - text: 对话内容或旁白描述。

                    【类型与逻辑注意事项】
                    1. **上下文理解**：上下文中标记为 <Type:Number> 的属性是数值，标记为 <ReadOnly> 的属性不可直接修改。
                    2. **数值变更**：如果你在 'impacts' 中修改好感度或金钱，请确保 newValue 输出为**纯数字**（如 100），严禁加引号。

                    【完整 JSON 示例】
                    {
                    "factionId": "global",
                    "timeStart": "1098年",
                    "timeEnd": "1099年",
                    "summary": "决裂时刻",
                    "content": "[{\\"role\\":\\"p_001\\",\\"tag\\":\\"angry\\",\\"text\\":\\"住手！\\"},{\\"role\\":\\"narrator\\",\\"text\\":\\"一阵爆炸声传来。\\"}]",
                    "impacts": [
                        // 示例：数值型属性变更
                        { "type": "STAT_CHANGE", "targetId": "p_001", "attrKey": "mood", "newValue": 0 }
                    ],
                    "options": [
                        { "label": "反击", "desc": "立即开火" },
                        { "label": "逃跑", "desc": "保存实力" }
                    ]
                    }`,
                    // --- 1. 日常推演 (Daily Deduction) - v3 多层级/多规则版 ---
                    system: `你是一个辅助世界推演的 AI 引擎。
                    【任务】
                    根据“世界上下文”和“用户指令”，推演下一阶段事件并以 JSON 格式输出。

                    【关键：数据类型与权限】
                    输入的上下文格式为：Key: Value <Metadata>
                    1. **类型严格 (Type Strictness)**：
                    - 如果属性标记为 <Type:Number>，你在输出 JSON 时**必须**输出为数字类型（例如 100，而不是 "100"）。
                    - 如果属性标记为 <Type:String>，输出为字符串。
                    2. **只读保护 (ReadOnly)**：
                    - 标记为 <ReadOnly> 或 <Auto-Calc> 的属性是世界法则自动计算的（自变量）。
                    - 你**严禁**在 'impacts' 中直接修改这些只读属性。你只能通过修改其他非只读属性来间接影响它们。
                    3. **数据清洗**：
                    - 输出的 JSON 中，Value **绝对不能**包含 <...> 这样的元数据标记。只输出纯净的值。

                    【核心原则】
                    1. **层级联动**：子实体(Child)的变动会波及父实体(Parent)。
                    2. **JSON 完整性**：确保 JSON 格式极其严谨，括号成对闭合。
                    3. **数据一致性**：oldValue 必须等于当前值。

                    【特殊 Impact 事件类型】
                    A. REGION_TRANSFER: { "targetName": "地块名", "newValue": "新领主ID" }
                    B. ENTITY_CREATE:   { "data": { "name": "...", "parentId": "...", "schemaId": "..." } }
                    C. ENTITY_REMOVE:   { "targetId": "..." }
                    D. PIN_MOVE:        { "targetId": "...", "newValue": "x,y" }
                    E. GLOBAL MOD:      { "type": "STAT_CHANGE", "targetId": "global", ... }

                    【分支选项 (OPTIONS) - 仅在被要求时生成】
                    - **结构必须为对象数组**：[ { "label": "...", "desc": "..." }, ... ]
                    - **字段定义**：
                    * "label": 4-8字短标题 (如"正面强攻")。
                    * "desc": 详细后果预估。
                    - **严禁**使用纯字符串数组！

                    【标准 JSON 响应模板】
                    {
                    "factionId": "行动方ID (如 p_empire)",
                    "timeStart": "时间段开始",
                    "timeEnd": "时间段结束",
                    "summary": "简短标题",
                    "content": "详细剧情描述...",

                    // [可选] 仅在用户明确要求生成选项(Anko模式)时才包含此字段
                    "options": [
                        { "label": "外交斡旋", "desc": "尝试通过谈判解决争端，消耗资金但避免伤亡。" },
                        { "label": "武力镇压", "desc": "调动近卫军进行清洗，虽然高效但会大幅降低稳定度。" },
                        { "label": "静观其变", "desc": "暂时不采取行动，观察局势变化，风险较低。" }
                    ],

                    "impacts": [
                        {
                        "type": "STAT_CHANGE",
                        "targetId": "p_target_id",
                        "attrKey": "stability",
                        "oldValue": "稳固",
                        "newValue": "动荡"
                        },
                        {
                        "type": "REGION_TRANSFER",
                        "targetName": "诺曼底",
                        "newValue": "p_new_owner"
                        }
                    ]
                    }`,

                    // --- 2. 剧本生成 (Script Generator) - v6 类型增强版 (基于 v5) ---
                    script_generator: `你是一个世界设定生成器，严格按照指定的 JSON 结构输出。

                    【任务目标】
                    构建一个具有**深度层级结构**和**多样化实体类型**的世界。

                    【关键指令】
                    1. **多重规则集 (Rule Sets)**：不要只使用一套通用属性。请定义 2-3 套不同的规则集（rule_sets）。例如：
                    - "国家规则" (包含: 稳定度, 经济, 外交立场)
                    - "城市/行省规则" (包含: 治安, 人口, 归属感)
                    - "关键角色规则" (包含: 影响力, 忠诚, 个人战力)
                    - **★ 新增要求**：每个字段定义必须包含 "type" ('string'|'number') 和 "visibility" ('editable'|'readonly')。
                    2. **层级结构 (Hierarchy)**：利用 "parentId" 字段构建树状关系。不要只生成一堆顶级势力。
                    - 例如：创建一个“帝国”作为顶级节点，然后创建几个“行省”或“军团”作为其子节点（parentId 指向帝国）。
                    3. **关联性**：确保每个 player 的 "schemaId" 对应正确的 rule_sets id。
                    4. **数据类型严格**：如果字段定义 type="number"，在生成 stats 时**必须**输出纯数字（如 100），严禁使用字符串（如 "100"）。

                    【输出规则】
                    1. **只输出纯 JSON**：单一、合法的 JSON 对象，无Markdown。
                    2. **严格遵守结构**：参照下方的【JSON 结构范例】。
                    3. **语言与篇幅**：中文描述。Timeline 中的 event content 约 50 字。
                    4. **属性值**：对于 String 类型的属性，优先使用描述性文本（如“动荡(D)”）；对于 Number 类型，必须是数字。

                    【JSON 结构与范例】
                    {
                    "rule_sets": [
                        {
                            "id": "rs_nation",
                            "name": "国家政体",
                            "fields": [
                                { "key": "gov_type", "label": "政体", "type": "string", "visibility": "editable" },
                                { "key": "stability", "label": "稳定度", "type": "number", "visibility": "editable" }
                            ]
                        },
                        {
                            "id": "rs_hero",
                            "name": "英雄单位",
                            "fields": [
                                { "key": "class", "label": "职阶", "type": "string", "visibility": "editable" },
                                { "key": "loyalty", "label": "忠诚", "type": "string", "visibility": "editable" },
                                { "key": "power", "label": "战力", "type": "number", "visibility": "editable" }
                            ]
                        }
                    ],
                    "global_vars": [
                        { "key": "当前纪元", "value": "第四纪元", "type": "string", "visibility": "editable" }
                    ],
                    "lorebook": [
                        {
                        "keys": "源石,Originium",
                        "content": "一种黑色的结晶矿物...",
                        "mode": "auto"
                        }
                    ],
                    "players": [
                        {
                        "id": "p_empire",
                        "name": "乌萨斯帝国",
                        "logo": "fa-solid fa-crown",
                        "color": "#881c1c",
                        "desc": "以军事立国的庞大帝国。",
                        "parentId": "",
                        "schemaId": "rs_nation",
                        "stats": {
                            "gov_type": "君主专制",
                            "stability": 80 // Number
                        }
                        },
                        {
                        "id": "p_patriot",
                        "name": "爱国者",
                        "logo": "fa-solid fa-shield-halved",
                        "color": "#555555",
                        "desc": "帝国的传奇将领。",
                        "parentId": "p_empire",
                        "schemaId": "rs_hero",
                        "stats": {
                            "class": "重装盾卫",
                            "loyalty": "死忠",
                            "power": 9000 // Number
                        }
                        }
                    ],
                    "timeline": [
                        {
                        "id": 1,
                        "timeRange": "1096年 冬",
                        "events": [
                            {
                            "factionId": "p_empire",
                            "timeStart": "冬初",
                            "timeEnd": "冬末",
                            "summary": "大叛乱的前兆",
                            "content": "（此处生成 50 字左右的详细描述...）",
                            "impacts": [
                                {
                                "targetId": "p_patriot",
                                "targetName": "爱国者",
                                "attrKey": "loyalty",
                                "attrLabel": "忠诚",
                                "newValue": "动摇"
                                }
                            ]
                            }
                        ]
                        }
                    ]
                    }`,

                    // --- 3. 上帝模式 (God Mode) - v4 类型增强版 (基于 v3) ---
                    god_mode: `你是一个智能数据库管理员，能够理解并执行对 JSON 数据的关联修改。

                    【核心指令】
                    根据用户的自然语言指令，修改当前的 JSON 状态。你必须返回一个包含所有被修改的顶层字段的 JSON 对象。

                    【关键规则：多规则集与层级】
                    1. **修改规则集 (Rule Sets)**：
                       - 用户可能会说“给所有国家增加人口属性”。你需要找到 \`rule_sets\` 中代表“国家”的那个对象，在它的 \`fields\` 中添加新字段。
                       - **★ 新增要求**：当添加新字段时，必须补全 "type" ('string'|'number') 和 "visibility" ('editable'|'readonly')。默认 type='string'。
                       - 如果用户要求创建一种新类型的实体（如“创造一个神器类型”），你需要向 \`rule_sets\` 数组添加一个新对象。
                    2. **数据一致性**：
                       - 当你在规则集中添加了新属性（如 "mana"），请尝试智能地更新所有使用该规则集 ("schemaId") 的实体的 \`stats\`，给它们一个默认值。
                       - **★ 新增要求**：如果 type="number"，默认值必须是纯数字（如 0），严禁加引号。

                    【严重警告：数组完整性】
                    当你修改任何数组（如 \`players\`, \`rule_sets\`）时，**必须返回该数组的完整内容**（包括未修改的项），否则数据会丢失。

                    【输出规则】
                    1. **只输出纯 JSON**。
                    2. 仅返回被修改的顶层字段。

                    【示例】
                    用户指令: "给所有属于'英雄'规则的实体增加'魔法值(mp)'(数值型)，默认为0"
                    正确输出:
                    {
                    "rule_sets": [
                        {
                            "id": "rs_nation", "name": "国家", "fields": [...]
                        },
                        {
                            "id": "rs_hero",
                            "name": "英雄",
                            "fields": [
                                { "key": "hp", "label": "生命", "type": "number", "visibility": "editable" },
                                { "key": "mp", "label": "魔法值", "type": "number", "visibility": "editable" } // ★ 新增字段，带类型
                            ]
                        }
                    ],
                    "players": [
                        {
                        "id": "p_arthur",
                        "schemaId": "rs_hero", // 匹配到了规则集
                        "stats": {
                            "hp": 100,
                            "mp": 0 // ★ 自动填充默认值，纯数字
                        }
                        },
                        {
                        "id": "p_england",
                        "schemaId": "rs_nation",
                        "stats": { ... } // 未受影响
                        }
                    ]
                    }`,
                }
            },

            // [新增] API 编辑器临时状态
            isEditingProfile: false,
            editingProfileData: { id: null, name: '', provider: 'Gemini', baseUrl: '', model: '', key: '', presetId: 'gemini', capabilities: {} },
            discoveredModels: [],
            isLoadingModels: false,
            modelLoadError: '',

            // --- i18n Dictionary (完整修复版) ---
            translations: {
                app_title: { zh: "LEVANT 自动化推演", en: "LEVANT Auto-Deduction", ja: "LEVANT 自動演繹" },
                status_online: { zh: "系统联机", en: "SYSTEM ONLINE", ja: "システム稼働中" },
                status_offline: { zh: "离线模式", en: "OFFLINE MODE", ja: "オフライン" },
                next_turn_label: { zh: "下一回合 / 序列", en: "NEXT TURN / SEQ", ja: "次のターン / シーケンス" },
                auto: { zh: "自动", en: "AUTO", ja: "自動" },
                btn_script_gen: { zh: "剧本生成", en: "Script Gen", ja: "シナリオ生成" },
                btn_files: { zh: "档案管理", en: "Files", ja: "ファイル管理" },
                mobile_tools: { zh: "快捷工具", en: "Quick Tools", ja: "クイックツール" },
                workspace_library: { zh: "世界资料库", en: "World Library", ja: "世界資料庫" },
                workspace_command: { zh: "推演指挥台", en: "Command Center", ja: "推演司令台" },
                workspace_directive: { zh: "原始指令", en: "World Directive", ja: "世界指令" },
                map_editor_label: { zh: "地图编辑", en: "Map Editor", ja: "地図編集" },
                music_play: { zh: "播放音乐", en: "Play Music", ja: "音楽を再生" },
                music_pause: { zh: "暂停音乐", en: "Pause Music", ja: "音楽を一時停止" },

                // Sidebar Tabs
                tab_world: { zh: "世界", en: "World", ja: "世界" },
                tab_entity: { zh: "实体", en: "Entities", ja: "実体" },
                tab_lore: { zh: "资料", en: "Lore", ja: "資料" },
                tab_rules: { zh: "规则", en: "Rules", ja: "ルール" },

                // [新增] 文本润色相关
                btn_polish_text: { zh: "文本润色/重写", en: "Polish / Rewrite", ja: "文章推敲" },
                modal_polish_title: { zh: "AI 文本润色大师", en: "AI Text Polisher", ja: "AI 文章推敲" },
                lbl_polish_style: { zh: "目标风格", en: "Target Style", ja: "目標スタイル" },
                lbl_polish_length: { zh: "期望字数 (约)", en: "Target Length (Approx)", ja: "文字数 (約)" },
                lbl_polish_custom: { zh: "额外指令 (可选)", en: "Extra Instructions", ja: "追加指示" },
                btn_apply_polish: { zh: "应用修改", en: "Apply Changes", ja: "適用" },
                btn_start_polish: { zh: "开始生成", en: "Generate", ja: "生成開始" },

                // [修改] 文学风格预设 (更具体)
                style_jiangnan: { zh: "江南风 (热血/哀伤/长句)", en: "Jiang Nan Style", ja: "江南風" },
                style_liu: { zh: "刘慈欣风 (硬科幻/冷峻/宏大)", en: "Liu Cixin Style", ja: "劉慈欣風" },
                style_jin: { zh: "金庸风 (武侠/半文半白)", en: "Jin Yong Style", ja: "金庸風" },
                style_gu: { zh: "古龙风 (短句/浪子/留白)", en: "Gu Long Style", ja: "古龍風" },
                style_lovecraft: { zh: "洛夫克拉夫特风 (不可名状/恐怖)", en: "Lovecraftian", ja: "ラヴクラフト風" },
                style_scp: { zh: "SCP基金会风 (临床腔/档案/黑条)", en: "SCP Foundation Style", ja: "SCP財団風" },
                style_history: { zh: "史记/资治通鉴风 (文言/史笔)", en: "Historical Records", ja: "史記風" },

                // Sidebar Content
                header_global_vars: { zh: "全局变量控制", en: "Global Variables", ja: "グローバル変数" },
                ph_var_key: { zh: "变量名", en: "Var Name", ja: "変数名" },
                ph_var_val: { zh: "当前状态", en: "Current Value", ja: "現在値" },
                btn_add_global: { zh: "添加全局状态", en: "Add Global Var", ja: "グローバル変数を追加" },
                btn_new_entity: { zh: "注册新实体", en: "New Entity", ja: "新規実体登録" },
                ph_lore_key: { zh: "关键词...", en: "Keywords...", ja: "キーワード..." },
                ph_lore_content: { zh: "设定内容...", en: "Content...", ja: "内容..." },
                btn_mode_on: { zh: "常驻", en: "ALWAYS", ja: "常駐" },
                btn_mode_auto: { zh: "自动", en: "AUTO", ja: "自動" },
                btn_mode_off: { zh: "禁用", en: "OFF", ja: "無効" },
                btn_add_lore: { zh: "新增资料条目", en: "Add Lore Entry", ja: "資料エントリ追加" },
                header_type_def: { zh: "类型定义", en: "TYPE DEFINITIONS", ja: "型定義" },
                msg_no_fields: { zh: "(该类型未定义属性字段)", en: "(No fields defined for this type)", ja: "(フィールド未定義)" },
                lbl_field_label: { zh: "显示名", en: "Label", ja: "表示名" },
                lbl_field_key: { zh: "键名", en: "Key", ja: "キー" },
                btn_add_rule: { zh: "添加属性字段", en: "Add Attribute", ja: "属性フィールド追加" },

                // Timeline & Events
                view_timeline: { zh: "时间轴情报流", en: "Timeline Stream", ja: "タイムライン" },
                view_map: { zh: "战术地图", en: "Tactical Map", ja: "戦術地図" },
                btn_show_all_history: { zh: "显示全部历史", en: "Show All History", ja: "全履歴を表示" },
                msg_no_events: { zh: "等待情报输入...", en: "Awaiting Intelligence...", ja: "情報入力待ち..." },
                header_manage_impacts: { zh: "影响管理", en: "Manage Impacts", ja: "影響管理" },
                header_anko_options: { zh: "安科选项 (决策)", en: "ANKO OPTIONS (DECISIONS)", ja: "安価オプション (決定)" },
                btn_add: { zh: "添加", en: "Add", ja: "追加" },
                msg_no_options: { zh: "暂无选项", en: "No options available.", ja: "オプションなし" },
                lbl_opt_label: { zh: "标题", en: "Label", ja: "ラベル" },
                ph_opt_label: { zh: "选项标题", en: "Option Label", ja: "オプション名" },
                lbl_opt_desc: { zh: "描述", en: "Desc", ja: "説明" },
                ph_opt_desc: { zh: "后果描述...", en: "Consequence...", ja: "結果の説明..." },
                btn_copy: { zh: "复制", en: "Copy", ja: "コピー" },
                btn_delete: { zh: "删除", en: "Delete", ja: "削除" },

                // Impact Editor
                btn_type_stat: { zh: "属性变更", en: "CHANGE STAT", ja: "ステータス変更" },
                btn_type_region: { zh: "地块转移", en: "TRANSFER REGION", ja: "領土移譲" },
                btn_type_create: { zh: "创建实体", en: "CREATE ENTITY", ja: "実体作成" },
                btn_type_remove: { zh: "移除实体", en: "REMOVE ENTITY", ja: "実体削除" },
                btn_type_pin: { zh: "移动标记", en: "MOVE PIN", ja: "ピン移動" }, // 之前漏了
                ph_target_entity: { zh: "目标实体", en: "Target Entity", ja: "対象実体" },
                ph_attribute: { zh: "属性", en: "Attribute", ja: "属性" },
                ph_target_region: { zh: "目标区域", en: "Target Region", ja: "対象地域" },
                ph_new_controller: { zh: "新控制者", en: "New Controller", ja: "新支配者" },
                ph_new_entity_name: { zh: "新实体名称...", en: "New Entity Name...", ja: "新実体名..." },
                ph_entity_remove: { zh: "选择要移除的实体", en: "Entity to Remove", ja: "削除する実体" },
                ph_new_value: { zh: "新值", en: "New Value", ja: "新しい値" },

                // Map Interface
                btn_upload_map: { zh: "上传地图", en: "Upload Map", ja: "地図読込" },
                mode_view: { zh: "浏览", en: "View", ja: "閲覧" },
                mode_pin: { zh: "标记", en: "Pin", ja: "ピン" },
                mode_region: { zh: "区域", en: "Region", ja: "領域" },
                btn_fit: { zh: "适配", en: "Fit", ja: "全体" },
                btn_export: { zh: "导出", en: "Export", ja: "出力" },
                btn_import: { zh: "导入", en: "Import", ja: "取込" },
                btn_img: { zh: "截图", en: "IMG", ja: "画像" },
                hint_click_pin: { zh: "点击", en: "CLICK", ja: "クリック" },
                hint_drag: { zh: "拖拽", en: "DRAG", ja: "ドラッグ" },
                hint_zoom: { zh: "滚轮", en: "WHEEL", ja: "ホイール" },
                msg_no_map: { zh: "未装载战术地图", en: "No Tactical Map Loaded", ja: "戦術地図なし" },

                // Layer Manager
                header_layer_manager: { zh: "图层管理", en: "LAYER MANAGER", ja: "レイヤー管理" },
                btn_add_layer_map: { zh: "+地图", en: "+Map", ja: "+地図" },
                btn_add_layer_reg: { zh: "+区域", en: "+Reg", ja: "+領域" },
                btn_add_layer_pin: { zh: "+标记", en: "+Pin", ja: "+ピン" },
                msg_no_layers_created: { zh: "暂无图层。请点击上方按钮添加。", en: "No Layers Created. Click buttons above to add one.", ja: "レイヤーなし。上のボタンで追加してください。" },

                // Right Panel Tabs
                tab_pending: { zh: "待决", en: "Pending", ja: "保留中" },
                tab_combat: { zh: "战斗", en: "Combat", ja: "戦闘" },
                tab_console: { zh: "指令台", en: "Console", ja: "コンソール" },
                tab_godmode: { zh: "上帝模式", en: "God Mode", ja: "神モード" },
                msg_empty_queue: { zh: "队列为空", en: "Queue Empty", ja: "キューが空です" },
                placeholder_input: { zh: "// 输入原始指令...\n例如: #Cortex 试图入侵 #NeoTokyo", en: "// Input raw command...\ne.g., #Cortex attempts to hack #NeoTokyo", ja: "// コマンドを入力...\n例: #Cortex が #NeoTokyo に侵入を試みる" },

                // Right Panel - Combat
                header_combat: { zh: "战斗裁决系统 (UCS)", en: "Universal Combat System", ja: "汎用戦闘システム" },
                lbl_attacker: { zh: "攻击方", en: "Attacker", ja: "攻撃側" },
                lbl_defender: { zh: "防御方", en: "Defender", ja: "防御側" },
                opt_select: { zh: "选择...", en: "Select...", ja: "選択..." },
                lbl_combat_loc: { zh: "战斗地点", en: "Location", ja: "場所" },
                opt_no_loc: { zh: "-- 无特定地点 --", en: "-- No Specific Location --", ja: "-- 場所指定なし --" },
                optgroup_regions: { zh: "领土区域", en: "Regions (Territory)", ja: "領土エリア" },
                optgroup_pins: { zh: "标记点 (POI)", en: "Pins (POI)", ja: "地点 (POI)" },
                label_combat_context: { zh: "战斗背景 / 战术意图", en: "Context / Intent", ja: "戦闘背景 / 意図" },
                ph_combat_context: { zh: "例如：争夺桥头堡 / 遭遇战 / 试图刺杀", en: "E.g. Bridgehead skirmish / Encounter / Assassination attempt", ja: "例：橋頭堡の争奪 / 遭遇戦 / 暗殺の試み" },
                label_dice_check: { zh: "命运检定 (RNG)", en: "Fate Check (RNG)", ja: "運命判定" },
                btn_add_die: { zh: "添加骰子", en: "Add Die", ja: "ダイス追加" },
                ph_die_intent: { zh: "检定目的 (如: 命中/伤害)", en: "Check (e.g. Hit/Dmg)", ja: "判定目的 (例: 命中/ダメ)" },
                btn_roll_all: { zh: "全部投掷", en: "ROLL ALL DICE", ja: "全ロール" },
                btn_judge_combat: { zh: "AI 裁决战斗结果", en: "AI Judge Combat", ja: "AI 戦闘裁定" },

                // Right Panel - Godmode & Editor
                header_godmode: { zh: "全局状态干涉 (上帝模式)", en: "GLOBAL STATE MANIPULATION", ja: "神の操作" },
                msg_godmode_desc: { zh: "用自然语言直接修改世界状态。例如：“把所有名为‘帝国’的势力的兵力设为0”，“给所有人增加一个‘理智值’属性，默认为100”。", en: "Modify world state with natural language. E.g., 'Set manpower to 0 for all Empire factions', 'Add Sanity stat to everyone, default 100'.", ja: "自然言語で世界の状態を直接変更します。例：「『帝国』という名前の全勢力の兵力を0にする」、「全員に『理性値』属性を追加し、デフォルトを100にする」。" },
                ph_godmode: { zh: "输入神之指令...", en: "Enter divine command...", ja: "神のコマンドを入力..." },
                btn_execute: { zh: "执行", en: "EXECUTE", ja: "実行" },

                ai_core_label: { zh: "AI 智能核心 (Active)", en: "AI CORE (Active)", ja: "AI コア (稼働中)" },
                header_anko_mode: { zh: "安科模式", en: "ANKO MODE", ja: "安価モード" },
                header_anko_on: { zh: "安科: 开启", en: "ANKO: ON", ja: "安価: ON" },
                btn_ai_deduce: { zh: "AI 智能补全 / 推演", en: "AI DEDUCTION / AUTO-COMPLETE", ja: "AI 自動補完 / 演繹" },
                status_thinking: { zh: "正在进行战术推演...", en: "Calculating Strategy...", ja: "戦術演算中..." },

                // AI Editor Inputs
                label_actor: { zh: "行动实体", en: "Actor", ja: "行動主体" },
                label_start: { zh: "开始", en: "Start", ja: "開始" },
                label_end: { zh: "结束", en: "End", ja: "終了" },
                option_ai_auto: { zh: "AI 自动判断", en: "AI Auto-Detect", ja: "AI 自動判定" },
                option_global: { zh: "全局事件", en: "Global Event", ja: "グローバルイベント" },
                label_summary: { zh: "标题摘要", en: "Summary", ja: "要約" },
                label_impact: { zh: "状态变更计算", en: "State Impact Calc", ja: "状態変化計算" },
                label_details: { zh: "详细情报档案", en: "Detailed Intelligence", ja: "詳細情報アーカイブ" },
                ph_editor_content: { zh: "// 在此输入剧情内容...", en: "// Enter story content here...", ja: "// ここにストーリーを入力..." },
                lbl_manual_options: { zh: "手动选项 (MANUAL)", en: "MANUAL OPTIONS", ja: "手動オプション" },
                msg_no_manual_options: { zh: "(未定义选项，点击'Add'手动创建)", en: "(No options defined. Click 'Add' to create manual choices.)", ja: "(オプション未定義、'Add'で作成)" },
                btn_add_pending: { zh: "加入待决序列", en: "Add to Pending", ja: "保留リストに追加" },
                label_next_turn_b: { zh: "下个回合:", en: "Next Turn:", ja: "次ターン:" },
                btn_commit: { zh: "执行推演 (Commit)", en: "COMMIT TURN", ja: "ターン実行 (Commit)" },

                // Modals - Context
                modal_context_title: { zh: "上下文装配与推演", en: "Context Assembler", ja: "コンテキストアセンブラ" },
                modal_context_subtitle: { zh: "确认 AI 将接收到的“世界切片”以及“当前指令”。", en: "Confirm the 'World Slice' and 'Action' sent to AI.", ja: "AIに送信する「世界スライス」と「現在指令」を確認してください。" },
                set_sys_prompt: { zh: "系统提示词 (System Prompt)", en: "System Prompt", ja: "システムプロンプト" },
                ctx_current: { zh: "当前指令与草稿", en: "Current Action", ja: "現在の指令" },
                ctx_global: { zh: "世界全局变量", en: "Global Vars", ja: "グローバル変数" },
                ctx_rules: { zh: "属性规则定义", en: "Stat Rules", ja: "属性ルール" },
                ctx_lore: { zh: "资料设定 (Lore)", en: "Lore Entries", ja: "資料設定" },
                ctx_entities: { zh: "参与实体", en: "Active Entities", ja: "参加実体" },
                ctx_history: { zh: "历史记录", en: "History Memory", ja: "履歴メモリ" },
                ctx_hist_deep: { zh: "深层记忆 (近 - 含详情)", en: "Deep Mem (Recent - Full)", ja: "深層記憶 (詳細)" },
                ctx_hist_shallow: { zh: "浅层记忆 (远 - 仅摘要)", en: "Shallow Mem (Older - Summary)", ja: "浅層記憶 (要約)" },
                ctx_preview_label: { zh: "Payload 预览 (AI 可见内容)", en: "Payload Preview (What AI Sees)", ja: "ペイロードプレビュー" },
                ctx_preview_hint: { zh: "AI 将基于以上预览内容进行生成。", en: "AI will generate based on the preview content.", ja: "AIは上記に基づいて生成します。" },

                // Modals - Settings
                settings_title: { zh: "系统配置", en: "System Settings", ja: "システム設定" },
                autonomy_title: { zh: "推演自治", en: "Simulation Autonomy", ja: "シミュレーション自律性" },
                autonomy_mode: { zh: "执行模式", en: "Execution Mode", ja: "実行モード" },
                autonomy_mode_autonomous: { zh: "自主执行", en: "Autonomous", ja: "自律実行" },
                autonomy_mode_guarded: { zh: "风险暂存", en: "Guarded", ja: "リスク保留" },
                autonomy_mode_director: { zh: "导演模式", en: "Director", ja: "ディレクター" },
                autonomy_desc_autonomous: { zh: "LLM 决策通过自动校验后立即写入世界。", en: "Valid LLM decisions are committed immediately.", ja: "検証済みの LLM 判断を即時反映します。" },
                autonomy_desc_guarded: { zh: "普通决策自动执行，高影响决策进入待决序列。", en: "Routine decisions commit automatically; high-impact decisions are staged.", ja: "通常判断は自動実行し、高影響判断は保留します。" },
                autonomy_desc_director: { zh: "校验完成后载入编辑器，由用户决定何时提交。", en: "Validated decisions are loaded into the editor for manual direction.", ja: "検証後にエディターへ読み込みます。" },
                autonomy_auto_repair: { zh: "语义错误自动修复", en: "Automatic semantic repair", ja: "意味エラーを自動修復" },
                autonomy_repair_hint: { zh: "仅修正无效 ID、字段、权限和类型，不改写 LLM 的战略与叙事决定。", en: "Repairs invalid IDs, fields, permissions, and types without changing the model's decision.", ja: "判断内容を変えず、ID・フィールド・権限・型のみ修正します。" },
                autonomy_status_validating: { zh: "正在自动校验决策", en: "Validating decision", ja: "判断を自動検証中" },
                autonomy_status_repairing: { zh: "正在自动修复不可执行字段", en: "Repairing invalid fields", ja: "実行不能フィールドを修復中" },
                autonomy_status_blocked: { zh: "决策未通过执行校验，已停止写入", en: "Decision blocked by execution validation", ja: "実行検証により停止しました" },
                autonomy_status_ready: { zh: "校验通过，已载入编辑器", en: "Validated and loaded into editor", ja: "検証済み、エディターへ読み込みました" },
                autonomy_status_staged: { zh: "高影响决策已自动进入待决序列", en: "High-impact decision staged automatically", ja: "高影響判断を自動保留しました" },
                autonomy_status_committed: { zh: "决策已自动校验并写入世界", en: "Decision validated and committed", ja: "判断を検証し世界へ反映しました" },
                settings_ui: { zh: "界面与语言", en: "Interface & Language", ja: "UIと言語" },
                settings_theme: { zh: "界面风格", en: "Theme", ja: "テーマ" },
                settings_lang: { zh: "系统语言", en: "Language", ja: "言語" },
                set_llm_config: { zh: "LLM API 配置", en: "LLM API Configuration", ja: "LLM API 設定" },
                set_provider: { zh: "厂商预设", en: "Provider Preset", ja: "プロバイダープリセット" },
                set_base_url: { zh: "API 地址 (Base URL)", en: "Base URL", ja: "API URL" },
                set_model: { zh: "模型名称", en: "Model Name", ja: "モデル名" },
                set_model_refresh: { zh: "从提供商刷新模型", en: "Refresh models from provider", ja: "プロバイダーからモデルを更新" },
                set_model_manual: { zh: "手动模型 ID", en: "Manual model ID", ja: "手動モデル ID" },
                set_model_catalog: { zh: "内置目录更新", en: "Built-in catalog updated", ja: "内蔵カタログ更新" },
                cap_vision: { zh: "图像", en: "Vision", ja: "画像" },
                cap_documents: { zh: "原生文档", en: "Native docs", ja: "ネイティブ文書" },
                cap_reasoning: { zh: "推理", en: "Reasoning", ja: "推論" },
                cap_structured: { zh: "结构化输出", en: "Structured output", ja: "構造化出力" },
                set_key: { zh: "API 密钥", en: "API Key", ja: "API キー" },
                set_key_optional: { zh: "可选", en: "Optional", ja: "任意" },
                set_proxy: { zh: "网络代理 (Proxy)", en: "Network Proxy", ja: "プロキシ" },
                set_enable_proxy: { zh: "启用本地代理", en: "Enable Local Proxy", ja: "プロキシ有効化" },

                header_welcome_guide: { zh: "操作手册", en: "User Manual", ja: "操作マニュアル" },
                desc_welcome_guide: { zh: "包含核心概念、推演流程和基本操作。", en: "Core concepts, simulation flow, and basic operations.", ja: "基本概念、シミュレーションフロー、基本操作。" },

                // [新增] 代理帮助文案
                proxy_help_why: { zh: "何时开启：API 请求超时、无法连接 OpenAI/Google 等海外服务时。", en: "When to enable: API timeouts or unable to connect to OpenAI/Google.", ja: "いつ使う：APIタイムアウトや海外サービスに接続できない場合。" },
                proxy_help_port: { zh: "端口号(Port)：7890 是常见代理软件(如Clash)的默认端口。如果您的软件使用了不同端口，请在代理软件的“设置”中查找“本地端口(Local Port)”并填入。", en: "Port: 7890 is default for tools like Clash. If different, check 'Local Port' in your proxy app settings.", ja: "ポート：7890は一般的です。異なる場合は、プロキシアプリの設定で「ローカルポート」を確認してください。" },
                desc_prompt_system: { zh: "用于日常“战术推演”与“智能补全”的核心指令。", en: "Core instruction for daily 'Tactical Deduction' and 'Auto-Complete'.", ja: "日常の「戦術演繹」と「自動補完」のための核心指令。" },
                desc_prompt_script: { zh: "用于“剧本生成”功能，控制世界观初始化逻辑。", en: "Controls world initialization logic for 'Script Generation'.", ja: "「シナリオ生成」機能用、世界観初期化ロジックを制御。" },
                desc_prompt_god: { zh: "用于“上帝模式”功能，控制直接修改 JSON 数据的逻辑。", en: "Controls JSON manipulation logic for 'God Mode'.", ja: "「神モード」機能用、JSONデータ直接修正ロジックを制御。" },
                btn_save: { zh: "保存配置", en: "Save Config", ja: "設定保存" },

                // [新增] TUN 模式提示
                proxy_help_tun: {
                    zh: "TUN 模式：使用 VPN 的 TUN / 增强模式时，可关闭此处的本地代理开关，由系统网络接管请求。",
                    en: "TUN mode: when the VPN handles system traffic, disable the local proxy option here.",
                    ja: "TUN モード：VPN がシステム通信を処理する場合、ここのローカルプロキシを無効にできます。"
                },

                // Modals - Faction
                modal_edit_entity: { zh: "编辑实体档案", en: "Edit Entity", ja: "実体編集" },
                modal_new_entity: { zh: "注册新实体", en: "Register Entity", ja: "新規実体登録" },
                label_name: { zh: "名称", en: "Name", ja: "名称" },
                lbl_parent_entity: { zh: "父级实体 (层级关系)", en: "Parent Entity (Hierarchy)", ja: "親実体 (階層)" },
                opt_top_level: { zh: "-- 无父级 (顶级势力) --", en: "-- No Parent (Top Level) --", ja: "-- 親なし (トップレベル) --" },
                label_icon_color: { zh: "图标 & 颜色", en: "Icon & Color", ja: "アイコン & 色" },
                label_desc: { zh: "描述", en: "Description", ja: "説明" },
                label_stats: { zh: "属性面板", en: "Stats", ja: "ステータス" },
                lbl_entity_type: { zh: "实体类型:", en: "Type:", ja: "タイプ:" },
                msg_no_attrs_for_type: { zh: "该类型未定义属性。", en: "No attributes defined for this type.", ja: "このタイプの属性は未定義です。" },
                btn_destroy: { zh: "销毁数据", en: "Destroy Data", ja: "データ破棄" },
                btn_confirm: { zh: "确认", en: "Confirm", ja: "確認" },
                btn_cancel: { zh: "取消", en: "Cancel", ja: "キャンセル" },

                // Modals - Save/Load
                modal_files: { zh: "档案管理", en: "File Management", ja: "ファイル管理" },
                label_save_as: { zh: "另存为", en: "Save As", ja: "名前を付けて保存" },
                label_local_files: { zh: "本地档案", en: "Local Files", ja: "ローカルファイル" },
                btn_load: { zh: "读取", en: "Load", ja: "読込" },
                btn_overwrite: { zh: "覆盖", en: "Overwrite", ja: "上書" },
                msg_no_files: { zh: "无存档", en: "No Files", ja: "ファイルなし" },

                // Modals - Map Editor
                map_new_terr: { zh: "新建领土 (Region)", en: "New Territory", ja: "新規領土" },
                map_edit_terr: { zh: "编辑领土 (Region)", en: "Edit Territory", ja: "領土編集" },
                map_add_pin: { zh: "添加标记 (Pin)", en: "Add Pin", ja: "ピン追加" },
                map_edit_pin: { zh: "编辑标记 (Pin)", en: "Edit Pin", ja: "ピン編集" },
                map_geo_title: { zh: "地缘政治设定", en: "Geopolitics", ja: "地政学設定" },
                label_geo_name: { zh: "地理名称", en: "Region Name", ja: "地域名" },
                hint_geo_name: { zh: "该地块的永久地理名称。", en: "The permanent name of this land.", ja: "この土地の恒久的な名前。" },
                label_controller: { zh: "当前控制权", en: "Current Controller", ja: "支配勢力" },
                opt_neutral: { zh: "-- 中立 / 无主 --", en: "-- Neutral / Unclaimed --", ja: "-- 中立 / 無主 --" },
                hint_controller: { zh: "颜色将自动跟随控制者。", en: "Color matches the controller automatically.", ja: "色は支配者に追従します。" },
                label_marker_type: { zh: "标记类型", en: "Marker Type", ja: "マーカー種類" },
                btn_type_entity: { zh: "实体", en: "Entity", ja: "実体" },
                btn_type_lore: { zh: "资料", en: "Lore", ja: "資料" },
                btn_type_custom: { zh: "自定义", en: "Custom", ja: "カスタム" },
                label_select_entity: { zh: "选择实体", en: "Select Entity", ja: "実体選択" },
                opt_choose_entity: { zh: "-- 请选择实体 --", en: "-- Choose Entity --", ja: "-- 実体を選択 --" },
                label_select_lore: { zh: "选择资料条目", en: "Select Lore Entry", ja: "資料エントリ選択" },
                opt_choose_lore: { zh: "-- 请选择资料 --", en: "-- Choose Lore --", ja: "-- 資料を選択 --" },
                hint_lore_link: { zh: "链接至资料库。", en: "Links to Lore Library.", ja: "資料データベースへリンク。" },
                label_custom_label: { zh: "自定义标签", en: "Label Name", ja: "ラベル名" },
                label_appearance: { zh: "图标与颜色覆盖 (可选)", en: "Icon & Color Override", ja: "アイコンと色のオーバーライド" },
                label_icon_class: { zh: "图标类名 (FontAwesome)", en: "Icon Class", ja: "アイコンクラス" },
                label_custom_color: { zh: "自定义颜色", en: "Custom Color", ja: "カスタム色" },
                label_pos_region: { zh: "标签位置微调 (重心)", en: "Label Position (Centroid)", ja: "ラベル位置 (重心)" },
                label_pos_pin: { zh: "标记坐标微调", en: "Pin Position", ja: "ピン座標" },
                hint_pos_region: { zh: "微调地块标签的中心点。", en: "Fine-tune the label center point.", ja: "ラベルの中心点を微調整。" },
                hint_pos_pin: { zh: "微调标记点的位置。", en: "Fine-tune pin location.", ja: "ピンの位置を微調整。" },
                btn_remove: { zh: "移除", en: "Remove", ja: "削除" },

                // Modals - Script Gen
                modal_script_gen: { zh: "AI 剧本生成", en: "AI Script Generation", ja: "AI シナリオ生成" },
                msg_script_gen_hint: { zh: "上传设定集、地图图片或描述您想要的世界观。AI 将自动生成实体、属性规则和开场。", en: "Upload lore, maps, or describe your world. AI will generate entities, rules, and intro.", ja: "設定資料、地図をアップロード、または世界観を記述。AIが実体、ルール、オープニングを生成します。" },
                label_upload_ref: { zh: "上传参考文档 / 图片", en: "Upload Reference Docs / Images", ja: "参考資料/画像をアップロード" },
                placeholder_prompt: { zh: "提示词 (例如: '一个魔法吞噬灵魂的黑暗奇幻世界...')", en: "Prompt (e.g., 'A grimdark fantasy world...')", ja: "プロンプト (例: '魔法が魂を食らうダークファンタジー世界...')" },
                status_generating: { zh: "正在构建世界...", en: "Constructing World...", ja: "世界構築中..." },
                btn_start_gen: { zh: "初始化剧本生成", en: "Initialize Generation", ja: "生成開始" },

                // Poster
                poster_footer_text: { zh: "LEVANT 自动化推演 | AUTOMATED REPORT", en: "LEVANT AUTO-DEDUCTION | AUTOMATED REPORT", ja: "LEVANT 自動演繹 | 自動レポート" },
                // --- Settings: Prompt Config ---
                set_prompt_config: { zh: "AI 提示词配置", en: "AI Prompt Configuration", ja: "AIプロンプト設定" },
                tab_prompt_sys: { zh: "核心推演 (System)", en: "System (Deduction)", ja: "システム (演繹)" },
                tab_prompt_script: { zh: "剧本生成 (Script)", en: "Script Gen", ja: "シナリオ生成" },
                tab_prompt_god: { zh: "上帝模式 (God)", en: "God Mode", ja: "神モード" },
                // [新增] Galgame 模式翻译
                tab_prompt_galgame: { zh: "剧场模式 (VN)", en: "Galgame/VN", ja: "劇場モード" },
                desc_prompt_galgame: { zh: "用于“剧场模式”，指导AI生成标准化的 JSON 剧本格式 (Array)。", en: "For 'VN Mode', instructs AI to generate standardized JSON script arrays.", ja: "「劇場モード」用、標準化されたJSON脚本配列を生成するよう指示。" },

                // --- JS Dynamic Strings (用于 JavaScript 逻辑的动态文本) ---
                dice_crit_success: { zh: "大成功!", en: "CRITICAL SUCCESS!", ja: "大成功！" },
                dice_crit_fail: { zh: "大失败!", en: "CRITICAL FAILURE!", ja: "大失敗！" },
                dice_pass: { zh: "成功", en: "Pass", ja: "成功" },
                dice_fail: { zh: "失败", en: "Fail", ja: "失敗" },

                layer_new: { zh: "新建图层", en: "New Layer", ja: "新規レイヤー" },
                layer_map: { zh: "地图底图", en: "Map Layer", ja: "地図レイヤー" },
                layer_region: { zh: "领土层", en: "Regions", ja: "領域レイヤー" },
                layer_marker: { zh: "标记层", en: "Markers", ja: "マーカーレイヤー" },

                opt_new: { zh: "新选项", en: "New Option", ja: "新規オプション" },
                opt_desc_ph: { zh: "后果描述...", en: "Description...", ja: "結果の説明..." },
                dec_new: { zh: "新决策", en: "New Decision", ja: "新規決定" },
                dec_desc_ph: { zh: "潜在后果...", en: "Potential consequences...", ja: "潜在的な結果..." },

                splash_init: { zh: "[ 按任意键或点击初始化系统 ]", en: "[ PRESS ANY KEY TO INITIALIZE ]", ja: "[ 任意のキーを押して初期化 ]" },

                // [新增] 剧本生成高级选项
                lbl_adv_settings: { zh: "高级生成参数", en: "Advanced Settings", ja: "詳細設定" },
                script_gen_tab_content: { zh: "内容与参考", en: "Content & References", ja: "内容と参考資料" },
                script_gen_tab_params: { zh: "生成参数", en: "Generation Parameters", ja: "生成パラメータ" },
                lbl_gen_rules_count: { zh: "生成规则集数量", en: "Rule Sets Count", ja: "ルールセット数" },
                lbl_gen_entities_count: { zh: "生成实体数量", en: "Entities Count", ja: "実体数" },
                lbl_gen_attr_style: { zh: "属性数值风格", en: "Attribute Style", ja: "属性スタイル" },

                opt_style_mixed: { zh: "混合类型", en: "Mixed Types", ja: "混合タイプ" },
                opt_style_number: { zh: "纯数字 (RPG风)", en: "Numbers Only (1-100)", ja: "数値のみ (RPG風)" },
                opt_style_letter: { zh: "字母评级 (S/A/B)", en: "Letter Grades (S/A/B)", ja: "ランク (S/A/B)" },
                opt_style_text: { zh: "文字描述 (极高/低)", en: "Text Desc (High/Low)", ja: "テキスト (高/低)" },

                btn_load_copy: { zh: "载入编辑", en: "Load to Edit", ja: "編集に読込" },
                btn_remove_item: { zh: "移除条目", en: "Remove Item", ja: "項目削除" },

                // [新增] Custom Prompt 相关的翻译
                tab_prompt_custom: { zh: "自定义 (Custom)", en: "Custom Prompt", ja: "カスタム" },
                desc_prompt_custom: { zh: "全局自定义指令。在推演和剧本生成时，这部分内容会根据您的设置插入到上下文中。", en: "Global custom instructions injected into context.", ja: "グローバルカスタム命令。" },
                ctx_custom: { zh: "自定义指令 (Custom Prompt)", en: "Custom Prompt", ja: "カスタムプロンプト" },
                lbl_use_custom: { zh: "启用自定义指令", en: "Enable Custom Prompt", ja: "カスタムプロンプトを有効化" },
                // [新增翻译] API Profile Manager
                header_api_profiles: { zh: "API 配置管理", en: "API Profiles", ja: "API設定管理" },

                // [新增] 首次启动提示
                msg_setup_api_first: {
                    zh: "请先配置一个模型服务。Levant 支持云端 API，也支持本机运行的 OpenAI-compatible 服务。",
                    en: "Configure a model service first. Levant supports cloud APIs and local OpenAI-compatible servers.",
                    ja: "モデルサービスを設定してください。クラウド API とローカルの OpenAI 互換サーバーに対応しています。"
                },

                // [新增] API 获取指南文案
                header_api_guide: { zh: "厂商文档与控制台", en: "Provider Documentation & Consoles", ja: "プロバイダー資料とコンソール" },

                // [新增] API Key 解释
                api_key_explanation: {
                    zh: "云端服务通常需要 API Key；本地服务可留空。配置保存在当前浏览器的本地存储中，请勿在共享设备上保存密钥。",
                    en: "Cloud services usually require an API key; local services may leave it blank. Profiles are stored in this browser's local storage.",
                    ja: "クラウドサービスでは通常 API キーが必要です。ローカルサービスでは空欄にできます。設定はブラウザーのローカルストレージに保存されます。"
                },
                msg_profile_fields_required: { zh: "请填写配置名称和模型 ID。", en: "Profile name and model ID are required.", ja: "プロファイル名とモデル ID を入力してください。" },
                msg_profile_key_required: { zh: "此厂商需要 API Key。", en: "This provider requires an API key.", ja: "このプロバイダーには API キーが必要です。" },
                provider_docs: { zh: "文档", en: "Docs", ja: "資料" },
                provider_api_key: { zh: "API Key", en: "API Key", ja: "API キー" },
                provider_local: { zh: "本地", en: "Local", ja: "ローカル" },

                btn_add_profile: { zh: "新建配置", en: "New Profile", ja: "新規作成" },
                lbl_profile_name: { zh: "配置别名", en: "Profile Name", ja: "プロファイル名" },
                msg_confirm_delete: { zh: "确定删除此配置吗？", en: "Delete this profile?", ja: "削除しますか？" },
                lbl_active_profile: { zh: "当前使用", en: "Active", ja: "使用中" },
                btn_open_tutorial: { zh: "新手必读 (教程)", en: "Beginner's Guide", ja: "初心者ガイド" },
                modal_tutorial_title: { zh: "Gemini API 获取教程", en: "Gemini API Tutorial", ja: "Gemini API ガイド" },

                // 教程正文 (Markdown 格式)
                tutorial_content: {
                    zh: `
# Google Gemini API Key

1. 打开 [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)。
2. 登录 Google 账号并按页面流程创建 API Key。
3. 在 Levant 的“系统配置”中新增 Google Gemini 配置，填写模型 ID 和 API Key。
4. 使用配置列表中的连接测试按钮验证请求。

接口参数与地区可用性以 [Gemini API 官方文档](https://ai.google.dev/gemini-api/docs) 为准。
                    `,
                    en: "Please refer to Chinese version.",
                    ja: "中国語版を参照してください。"
                },
                // [新增] 帮助中心按钮
                btn_help_center: { zh: "帮助手册", en: "Help Manual", ja: "ヘルプ" },
                modal_help_title: { zh: "Levant 操作手册", en: "Levant User Manual", ja: "Levant ユーザーマニュアル" },

                // [新增] 帮助文档正文 (Markdown)
                help_content: {
                    zh: `
# Levant 快速入门指南

Levant 是一个基于 AI 的自动化世界推演引擎，用于维护实体、规则、地图和时间线。

---

### 1. 核心概念 (Core Concepts)

*   **实体 (Entity)**: 世界的基本单位。它可以是一个**国家**、一个**角色**、甚至是一个**概念**（如“大瘟疫”）。
*   **规则集 (Rule Set)**: 定义实体的属性模板。例如“国家”有“国力”，“角色”有“生命值”。
*   **时间轴 (Timeline)**: 历史的记录。每一次“回合提交 (Commit Turn)”，都会将【待决队列】中的事件固化为历史。
*   **AI 核心**: 当前配置的大语言模型服务，用于生成剧情、裁决战斗和补全指令。

---

### 2. 界面概览 (Interface)

*   **左侧 (资料库)**:
*   **世界**: 全局变量（如“当前纪元”、“魔法浓度”）。
*   **实体**: 查看所有角色卡片。点击可编辑属性、立绘。
*   **资料**: 存放世界观设定（Lorebook）。
*   **规则**: 定义属性字段（如 HP, STR）。
*   **中间 (视图)**:
*   **情报流**: 以时间轴形式展示已发生的历史。
*   **地图**: 可视化战术地图。支持上传底图、绘制领土、标记地点。
*   **右侧 (控制台)**:
*   **待决 (Pending)**: 下一回合即将发生的事件队列。可拖拽排序。
*   **指令 (Console)**: 输入自然语言（如“帝国向联邦宣战”），点击 AI 推演生成事件。
*   **战斗 (Combat)**: TRPG 骰子裁决系统。
*   **上帝 (God Mode)**: 直接修改世界现实（如“删除所有精灵族”）。

---

### 3. 如何开始第一局？ (Quick Start)

**方法 A：AI 生成剧本**
1.  点击顶部导航栏的 **[剧本生成]** 按钮。
2.  在弹窗中描述你想要的世界（例如：“一个赛博朋克风格的古代中国”）。
3.  点击生成。AI 会自动为你创建实体、规则和开场剧情。

**方法 B：手动推演**
1.  在右侧 **[指令]** 面板，输入：“主角在一个酒馆醒来，发现身边有一封信。”
2.  点击底部的 **[AI 智能推演]**。
3.  AI 会生成一个事件卡片，展示在下方的编辑器中。
4.  检查无误后，点击 **[加入待决序列]**。
5.  在待决面板确认后，点击最底部的 **[执行推演 (COMMIT)]**。

---

### 4. 进阶技巧 (Advanced)

*   **地图交互**: 在地图模式下，选择“标记”工具，点击地图任意位置可创建据点。你可以把据点链接到某个实体，它的颜色会自动同步。
*   **立绘差分**: 在实体编辑面板，可以上传多张表情差分（如“愤怒”、“大笑”）。在剧场模式中 AI 会自动调用。
*   **剧场模式 (VN Mode)**: 点击时间轴事件的剧场按钮，进入文字冒险模式并与角色对话。
*   **战斗裁决**: 在右侧 [战斗] 面板选择攻守双方并添加骰子。AI 根据属性和骰子结果生成战报。

---

### 5. 常见问题 (FAQ)

*   **Q: AI 没反应？**
*   A: 请检查设置中的 API Key 是否正确，以及是否开启了代理（Proxy）。
*   **Q: 地图怎么是一片黑？**
*   A: 你需要先在地图工具栏点击 [上传地图] 按钮，上传一张图片作为底图。
*   **Q: 如何保存？**
*   A: 系统会自动保存到 \`autosave.json\`。你也可以点击顶部的 [档案] 按钮手动导出/导入。
                    `,
                    en: "Please refer to Chinese version.",
                    ja: "中国語版を参照してください。"
                },
            },

            // [修改] stat_schema 升级为 rule_sets (允许多套规则)
            // 结构示例: [{ id: 'default', name: '通用规则', fields: [{key:'hp', label:'生命'}] }]
            rule_sets: [],
            activeSchemaId: '', // 当前在左侧栏正在编辑哪一套规则

            lorebook: [], players: [], timeline: [], global_vars: [],
            map_data: { layers: [], activeLayerId: '', image: '', pins: [], regions: [] },

            // [新增] 地图交互模式状态
            mapToolMode: 'pin', // 'pin' | 'region'
            isProcessingRegion: false,
            editingRegionIndex: -2, // -2:无, -1:新增, >=0:编辑

            // [新增] 地图视图控制状态
            mapView: {
                scale: 1,
                x: 0,
                y: 0,
                isDragging: false,
                isMouseDown: false, // ★ 新增：区分按下和拖拽
                startX: 0,
                startY: 0,
                // ★ 新增：徽章大小控制 (默认 1.0)
                badgeScale: 1.0,
                // ★ 新增：显示模式 (full=全显示, icon=仅图标, dot=仅点)
                displayMode: 'full'
            },
            showMap: false,
            // [优化] 时间轴分页控制
            timelinePageSize: 10,
            showAllTimeline: false,
            pendingTurnRange: "", pendingEvents: [],
            autonomyState: {
                phase: 'idle',
                message: '',
                lastReport: null
            },
            // [修改] 增加 options 数组
            editor: { factionId: '', factionIds: [], timeStart: '', timeEnd: '', summary: '', content: '', impacts: [], options: [] },
            impactForm: { type: 'STAT_CHANGE', targetId: '', attrKey: '', newValue: '', targetName: '' },
            editImpactForm: { type: 'STAT_CHANGE', targetId: '', attrKey: '', newValue: '', targetName: '' },

            posterData: { title: '', factionName: '', color: '', icon: '', content: '', badges: [], timeDisplay: '' },
            quoteIdx: 0,
            quotes: [ "岁寒，然后知松柏之后凋也", "看看演员 王公 游民 盗贼的心电图", "人生若只如初见，何事秋风悲画扇", "我还想和你谈论宇宙和天空", "西郊有密林，助君出重围", "我一无所有 只有一颗赤子之心", "高树多悲风，海水扬其波", "你方唱罢我登场，反认他乡是故乡", "空山新林归鹧鸪，世间繁华梦一出", "昨夜西风凋碧树，独上高楼，望尽天涯路", "我听见那声音向我严正发问 我为明天尽些什么义务", "六朝何事？只成门户私计！" ],

            tempSystemPrompt: "",
            contextConfig: {
                // [新增] 自定义 Prompt 开关
                includeCustom: true,

                // 原有的开关
                includeGlobal: true,
                includeRules: true,
                includeHistory: true,
                includeCurrent: true,
                includeMap: true,

                // [核心记忆变量]
                historyDeepDepth: 1,
                historyShallowDepth: 3,

                // ★★★ [关键修复] 必须把这些空数组加回来！否则报 length undefined 错误 ★★★
                loreList: [],
                playerList: [],
                mapRegionList: [],
                mapPinList: [],

                // [修改] order 数组，将 'custom' 放在最前面
                order: ['custom', 'global', 'rules', 'lore', 'players', 'map', 'history', 'current']
            }
        }
    },
    watch: {
        // 1. 监听 UI 主题变化，实时切换 CSS 变量
        'ui.theme': {
            handler(newTheme) {
                document.body.setAttribute('data-theme', newTheme);
            },
            immediate: true
        },

        // 2. [新增] 监听地图打点表单中的 selectedId 变化
        // 当用户在下拉框选择了一个实体或资料时，自动填充图标和颜色
        'pinForm.selectedId': function(newVal) {
            // 如果是“实体(Entity)”模式
            if (this.pinForm.mode === 'entity' && newVal) {
                const p = this.players.find(x => x.id === newVal);
                if (p) {
                    // 自动填入该实体的 Logo 和 颜色
                    this.pinForm.icon = p.logo || 'fa-solid fa-users';
                    this.pinForm.color = p.color || '#ffffff';
                }
            }
            // 如果是“资料(Lore)”模式
            else if (this.pinForm.mode === 'lore' && newVal) {
                // 如果当前还是默认图标，或者是空的，就自动填入“书签”图标和绿色
                // 这样设计是为了防止覆盖用户刚刚手动修改过的自定义图标
                const currentIcon = this.pinForm.icon;
                if (!currentIcon || currentIcon === 'fa-solid fa-map-pin' || currentIcon === 'fa-solid fa-users') {
                    this.pinForm.icon = 'fa-solid fa-book-bookmark';
                    this.pinForm.color = '#10b981'; // 资料默认给个翡翠绿
                }
            }
        },

        // 3. [新增] 监听模式切换，重置一下默认值，避免图标残留
        'pinForm.mode': function(newMode) {
            if (newMode === 'custom') {
                // 切换到自定义模式时，如果当前没有图标，给一个默认的
                if (!this.pinForm.icon) {
                    this.pinForm.icon = 'fa-solid fa-map-pin';
                    this.pinForm.color = '#f59e0b'; // 琥珀色
                }
            }
            // 切换到实体模式时，清空 selectedId 以便触发下一次选择监听
            if (newMode === 'entity') {
               // 这里不需要强制清空 selectedId，保留上次的选择体验可能更好
               // 但如果想重置，可以在这里写 this.pinForm.selectedId = '';
            }
        }
    },
async mounted() {
        // --- 1. 界面与媒体初始化 (等待 DOM 就绪) ---
        this.$nextTick(async () => {
            // A. 绑定键盘监听 (用于 Click-to-Start)
            document.addEventListener('keydown', this.initKeyHandler, { once: true });

            // B. 初始化黑客帝国背景特效
            if (this.showSplash) {
                this.initMatrixEffect();
            }

            // C. ★★★ [新增] 获取随机音乐列表 (通过 LevantAPI) ★★★
            this.playRandomMusic(false);
        });

        // --- 2. 核心逻辑：加载本地设置，并在版本升级时刷新默认 Prompt ---
        const storedVersion = localStorage.getItem('levant_version');
        const isVersionUpgrade = storedVersion !== this.APP_VERSION;

        // --- 3. 窗口与输入监听 ---
        window.addEventListener('resize', () => {
            this.isLargeScreen = window.innerWidth >= 1024;
            if (this.isLargeScreen) this.showMobileTools = false;
        });

        // ★★★ [新增] 键盘快捷键 ★★★
        window.addEventListener('keydown', (e) => {
            // Ctrl+Z (Undo)
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.performUndo();
            }
            // Ctrl+Y (Redo)
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                this.performRedo();
            }
        });

        // 处理软键盘遮挡
        const handleFocus = () => { if(!this.isLargeScreen) this.isKeyboardOpen = true; };
        const handleBlur = () => { if(!this.isLargeScreen) this.isKeyboardOpen = false; };

        document.addEventListener('focusin', (e) => {
            if(['INPUT', 'TEXTAREA'].includes(e.target.tagName)) handleFocus();
        });
        document.addEventListener('focusout', (e) => {
            if(['INPUT', 'TEXTAREA'].includes(e.target.tagName)) handleBlur();
        });

        // --- 4. 加载用户设置 ---
        const parsedSettings = this.loadPersistedSettings();
        if (parsedSettings) {
            if (parsedSettings.proxy) this.settings.proxy = { ...this.settings.proxy, ...parsedSettings.proxy };
            if (parsedSettings.autonomy) {
                this.settings.autonomy = { ...this.settings.autonomy, ...parsedSettings.autonomy };
            }
            if (!isVersionUpgrade && parsedSettings.prompts) {
                this.settings.prompts = { ...this.settings.prompts, ...parsedSettings.prompts };
            }
            if (parsedSettings.ui) this.ui = { ...this.ui, ...parsedSettings.ui };

            if (parsedSettings.api_profiles && Array.isArray(parsedSettings.api_profiles)) {
                this.settings.api_profiles = parsedSettings.api_profiles.map(profile => this.normalizeApiProfile(profile));
                this.settings.active_profile_id = parsedSettings.active_profile_id || null;
            } else if (parsedSettings.api && parsedSettings.api.model) {
                const legacyProfile = this.normalizeApiProfile({
                    id: Date.now(),
                    name: "Default (Legacy)",
                    ...parsedSettings.api
                });
                this.settings.api_profiles = [legacyProfile];
                this.settings.active_profile_id = legacyProfile.id;
            }
        }

        if (!this.settings.active_profile_id && this.settings.api_profiles.length > 0) {
            this.settings.active_profile_id = this.settings.api_profiles[0].id;
        }

        if (!this.syncActiveProfileToSettings() && this.settings.api_profiles.length > 0) {
            this.settings.active_profile_id = this.settings.api_profiles[0].id;
            this.syncActiveProfileToSettings();
        }

        if (isVersionUpgrade) {
            console.info(`[System] Version updated (${storedVersion} -> ${this.APP_VERSION}). Refreshing local defaults...`);
            this.saveSettings(true);
        }

        const hasValidProfile = this.settings.api_profiles.length > 0;
        const hasActiveModel = this.hasUsableModelProfile(this.settings.api);

        if (!hasValidProfile || !hasActiveModel) {
            setTimeout(() => {
                this.showSettings = true;

                setTimeout(() => {
                    // [修改] 提示语改得更明确，指向下方指南
                    alert(this.t('msg_setup_api_first'));

                    // [删除] 不要自动打开编辑器了，让用户先看界面
                    // if (this.settings.api_profiles.length === 0) {
                    //    this.openProfileEditor(null);
                    // }
                }, 300);
            }, 500);
        }

        document.body.setAttribute('data-theme', this.ui.theme);

        // --- 5. 加载游戏存档 ---
        await this.loadGame(this.currentSaveFile);
        if (this.map_data.image) {
            // 使用 $nextTick 确保 DOM 里的 Canvas 已经渲染出来
            this.$nextTick(() => this.initMapCanvas(this.map_data.image));
        }

        // --- 6. 自动保存与名言轮播 ---
        window.addEventListener('beforeunload', () => { if(this.serverConnected) this.saveGame('autosave.json'); });

        setInterval(() => {
            let nextIdx; do { nextIdx = Math.floor(Math.random() * this.quotes.length); } while (nextIdx === this.quoteIdx);
            this.quoteIdx = nextIdx;
        }, 6000);
    },
    computed: {
        vnCurrentLine() {
            if (!this.vnScript || this.vnScript.length === 0) return null;
            return this.vnScript[this.vnLineIndex];
        },
        // [新增] 获取当前正在编辑的立绘对象 (可能是默认的，也可能是差分里的)
        currentEditingAvatar() {
            if (this.previewAvatarIndex === -1) {
                // 返回一个代理对象，读写直接映射到 editingFaction 的根属性
                return {
                    url: this.editingFaction.avatar,
                    scale: this.editingFaction.avatarScale,
                    offsetY: this.editingFaction.avatarOffsetY,
                    isDefault: true
                };
            } else {
                const avatars = this.editingFaction.avatars;
                if (avatars && avatars[this.previewAvatarIndex]) {
                    return avatars[this.previewAvatarIndex];
                }
                return null;
            }
        },
        // [优化] 仅渲染可见的时间轴回合，避免后期 DOM 爆炸
        visibleTimeline() {
            if (this.showAllTimeline) return this.timeline;
            // 仅返回最后 N 个回合
            const start = Math.max(0, this.timeline.length - this.timelinePageSize);
            return this.timeline.slice(start);
        },
        // [新增] 树状实体列表：将扁平的 players 转换为带层级信息的列表
        sortedPlayers() {
            const result = [];
            // 1. 建立 ID 到对象的映射，方便查找
            const map = new Map(this.players.map(p => [p.id, { ...p, _depth: 0 }]));

            // 2. 递归函数：添加节点及其子节点
            const addNode = (parentId, depth) => {
                // 找到所有父级ID为 parentId 的实体
                const children = this.players.filter(p => (p.parentId || '') === parentId);

                children.forEach(child => {
                    const childObj = map.get(child.id);
                    childObj._depth = depth;
                    result.push(childObj);
                    // 递归查找下一层
                    addNode(child.id, depth + 1);
                });
            };

            // 3. 从根节点（parentId 为空）开始遍历
            addNode('', 0);

            // 4. 处理孤儿节点（以防万一数据错乱，虽不常见但为了健壮性）
            const addedIds = new Set(result.map(r => r.id));
            this.players.forEach(p => {
                if (!addedIds.has(p.id)) {
                    result.push({ ...p, _depth: 0 }); // 放在最后，视为根节点
                }
            });

            return result;
        },

        currentAttrValue() {
            if (!this.impactForm.targetId || !this.impactForm.attrKey) return '---';
            const p = this.players.find(x => x.id === this.impactForm.targetId);
            return p ? (p.stats[this.impactForm.attrKey] || 'N/A') : '???';
        },

        finalContextPreview() {
            let preview = "";

            // --- 辅助函数：处理属性可见性与格式 ---
            // 改用 methods 中的统一格式化函数，确保预览和实际发送一致
            const formatAttr = (val, visibility, type) => {
                return this.formatContextAttr(val, visibility, type);
            };

            this.contextConfig.order.forEach(type => {

                // [新增] 处理 Custom Prompt
                if (type === 'custom' && this.contextConfig.includeCustom && this.settings.prompts.custom) {
                    preview += `=== [CUSTOM INSTRUCTION] ===\n${this.settings.prompts.custom}\n\n`;
                }

                // 1. 全局变量 (原代码)
                if (type === 'global' && this.contextConfig.includeGlobal) {
                    // 过滤掉 hidden 的变量
                    const visibleGlobals = this.global_vars.filter(g => g.visibility !== 'hidden');

                    if (visibleGlobals.length > 0) {
                        preview += `=== [WORLD: GLOBAL VARS] ===\n`;
                        preview += visibleGlobals.map(g => {
                            // 兼容旧存档：默认 visibility 为 editable
                            const vis = g.visibility || 'editable';
                            const valStr = formatAttr(g.value, vis, g.type);
                            // formatAttr 返回 null 说明是 hidden，虽然上面 filter 过了，双重保险
                            return valStr !== null ? `${g.key}: ${valStr}` : null;
                        }).filter(x => x !== null).join('\n');
                        preview += `\n\n`;
                    }
                }

                // --- 2. 规则定义 (Rules) ---
                if (type === 'rules' && this.contextConfig.includeRules) {
                    preview += `=== [WORLD: RULES DEFINITIONS] ===\n`;
                    this.rule_sets.forEach(rs => {
                        // 构造字段定义字符串
                        const fieldsStr = rs.fields.map(f => {
                            const vis = f.visibility || 'editable';
                            // 如果字段定义本身是 hidden，也不告诉 AI 这个字段的存在
                            if (vis === 'hidden') return null;

                            const visMark = vis === 'readonly' ? '(Auto-Calc)' : '';
                            return `${f.key}=${f.label}${visMark}`;
                        }).filter(x => x).join(', '); // 过滤 null

                        if (fieldsStr) {
                            preview += `TYPE [${rs.name}]: ${fieldsStr}\n`;
                        }
                    });
                    preview += `\n`;
                }

                // --- 3. 资料设定 (Lore) ---
                if (type === 'lore') {
                    const activeLore = this.contextConfig.loreList.filter(l => l.active);
                    if (activeLore.length > 0) {
                        preview += `=== [WORLD: LORE] ===\n${activeLore.map(l => `> [${l.keys}]: ${l.content}`).join('\n')}\n\n`;
                    }
                }

                // --- 4. 参与实体 (Entities) [核心修改区域] ---
                if (type === 'players') {
                    const activePlayers = this.contextConfig.playerList.filter(p => p.active);
                    if (activePlayers.length > 0) {
                        preview += `=== [WORLD: ENTITIES] ===\n`;

                        preview += activePlayers.map(pItem => {
                            // 回查原始数据
                            const realP = this.players.find(x => x.id === pItem.id);
                            if (!realP) return "";

                            // A. 查找该实体的规则集
                            const schema = this.rule_sets.find(rs => rs.id === realP.schemaId);
                            const visibleStats = {};

                            // B. 根据规则集过滤属性
                            if (schema) {
                                schema.fields.forEach(f => {
                                    const rawVal = realP.stats[f.key] !== undefined ? realP.stats[f.key] : '-';
                                    const formatted = formatAttr(rawVal, f.visibility || 'editable', f.type);

                                    // 只有非 hidden 才加入输出对象
                                    if (formatted !== null) {
                                        visibleStats[f.key] = formatted;
                                    }
                                });
                            } else {
                                // 旧存档无规则集，全显
                                Object.assign(visibleStats, realP.stats);
                            }

                            // C. 立绘表情 Tag 信息
                            let avatarTagsInfo = "";
                            if (this.enableAvatarTags && realP.avatars && realP.avatars.length > 0) {
                                const tags = realP.avatars.map(a => a.tag).join(", ");
                                avatarTagsInfo = `\n  [VISUAL] Available Expressions: [${tags}]`;
                            }

                            return `ID:${realP.id} | ${realP.name}\n  Desc: ${realP.desc}\n  Stats: ${JSON.stringify(visibleStats)}${avatarTagsInfo}`;
                        }).join('\n\n');

                        preview += `\n\n`;
                    }
                }

                // --- 5. 地图数据 (Map) ---
                if (type === 'map' && this.contextConfig.includeMap) {
                    const activeRegions = this.contextConfig.mapRegionList.filter(r => r.active);
                    const activePins = this.contextConfig.mapPinList.filter(p => p.active);
                    const allRegions = this.getAllWorldRegions();
                    const allPins = this.getAllWorldPins();

                    if (activeRegions.length > 0 || activePins.length > 0) {
                        preview += `=== [TACTICAL MAP DATA] ===\n`;

                        if (activeRegions.length > 0) {
                            preview += "Regions (Control):\n";
                            activeRegions.forEach(reg => {
                                const realReg = allRegions.find(r => r.id === reg.id) || reg;
                                const owner = realReg.ownerId ? this.getFactionName(realReg.ownerId) : "NEUTRAL";

                                // 地块属性也应用过滤逻辑
                                let regStatsStr = "";
                                if(realReg.schemaId && realReg.stats) {
                                    const rSchema = this.rule_sets.find(rs => rs.id === realReg.schemaId);
                                    if(rSchema) {
                                        const safeRegStats = {};
                                        rSchema.fields.forEach(f => {
                                            const val = formatAttr(realReg.stats[f.key], f.visibility||'editable');
                                            if(val !== null) safeRegStats[f.key] = val;
                                        });
                                        regStatsStr = " " + JSON.stringify(safeRegStats);
                                    }
                                }

                                preview += `- Region "${realReg.name}" (Owner: ${owner})${regStatsStr}\n`;
                            });
                        }

                        if (activePins.length > 0) {
                            preview += "\nPoints of Interest:\n";
                            activePins.forEach(pin => {
                                const realPin = allPins.find(p => p.id === pin.id) || pin;
                                const label = realPin.label || this.getPinName(realPin.linkId);
                                preview += `- Pin "${label}" at [${realPin.x.toFixed(0)},${realPin.y.toFixed(0)}]\n`;
                            });
                        }
                        preview += "\n";
                    }
                }

                // --- 6. 历史回溯 (History) ---
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
                        preview += `=== [HISTORY MEMORY] ===\n`;

                        // A. 浅层记忆 (仅摘要)
                        if (shallowTurns.length > 0) {
                            preview += `--- Shallow Memory (Far Context / Summary Only) ---\n`;
                            shallowTurns.forEach(turn => {
                                preview += `[Turn ${turn.id}] ${turn.timeRange}\n`;
                                turn.events.forEach(e => {
                                    preview += ` • ${e.summary} (Actor: ${e.factionId})\n`;
                                });
                                preview += `\n`;
                            });
                        }

                        // B. 深层记忆 (含完整 Content 和 Impacts)
                        if (deepTurns.length > 0) {
                            preview += `--- Deep Memory (Recent Events / Full Detail) ---\n`;
                            deepTurns.forEach(turn => {
                                preview += `[Turn ${turn.id}] ${turn.timeRange}\n`;
                                turn.events.forEach(e => {
                                    preview += ` • ${e.summary} (Actor: ${e.factionId})\n`;
                                    // 注入完整内容
                                    if (e.content) preview += `   Details: ${e.content}\n`;
                                    if (e.impacts && e.impacts.length) {
                                         preview += `   Impacts: ${e.impacts.map(i => `${i.targetName}.${i.attrLabel}: ${i.change || (i.oldValue+'->'+i.newValue)}`).join('; ')}\n`;
                                    }
                                });
                                preview += `\n`;
                            });
                        }
                        preview += "\n";
                    }
                }

                // --- 7. 当前指令 (Current) ---
                if (type === 'current' && this.contextConfig.includeCurrent) {
                    preview += `=== [CURRENT INSTRUCTION] ===\n`;
                    if (this.rawInput) preview += `> COMMAND: ${this.rawInput}\n`;
                    if (this.editor.factionId) preview += `> ACTOR_ID: ${this.editor.factionId}\n`;
                    if (this.editor.timeStart) preview += `> TIME: ${this.editor.timeStart} - ${this.editor.timeEnd}\n`;
                    if (this.editor.summary) preview += `> DRAFT_TITLE: ${this.editor.summary}\n`;
                    if (this.editor.content) preview += `> DRAFT_CONTENT: ${this.editor.content}\n`;
                    if (this.editor.impacts.length) {
                        preview += `> PLANNED_IMPACTS: ${JSON.stringify(this.editor.impacts)}\n`;
                    }

                    if (this.generateOptions) {
                        preview += `> MODE: Generate "options" array for player decision.\n`;
                    }
                    preview += `\n`;
                }
            });
            return preview;
        }
    },
    methods: {
        ...window.LevantModules.settings,
        ...window.LevantModules.vn,
        ...window.LevantModules.map,
        ...window.LevantModules.poster,
        ...window.LevantModules.autonomy,
        ...window.LevantModules.timeline,
        openFormulaModal(field) {
            this.currentEditingField = field;
            this.formulaTokens = [];
            this.activeFormulaTab = '基础';
            this.showFormulaModal = true;

            if (field.formula) {
                this.formulaTokens.push({
                    type: 'func',
                    label: '现有公式',
                    value: field.formula
                });
            }
        },

        closeFormulaModal() {
            this.showFormulaModal = false;
        },

        // 2. 添加积木块
        addToken(type, label, value) {
            this.formulaTokens.push({ type, label, value });
        },

        removeToken(idx) {
            this.formulaTokens.splice(idx, 1);
        },

        // 3. 获取所有可用的字段定义（用于下拉框）
        getAllUniqueFields() {
            const map = new Map();
            this.rule_sets.forEach(rs => {
                rs.fields.forEach(f => {
                    if (f.type === 'number') map.set(f.key, f);
                });
            });
            return Array.from(map.values());
        },

        // 4. 获取当前上下文可用的自身字段
        getAvailableFields() {
            // 假设我们正在编辑的是一个 RuleSet 里的字段
            // 这里简单返回所有 number 类型的字段定义
            // 如果能知道当前 editingField 属于哪个 RuleSet 更好，但全局搜索也行
            return this.getAllUniqueFields();
        },

        // 5. 添加特定实体引用
        addSpecificEntityToken() {
            const p = this.players.find(x => x.id === this.formulaBuilder.targetEntityId);
            const fKey = this.formulaBuilder.targetStatKey;
            if (!p || !fKey) return;

            const code = `ctx.utils.getPlayerStat(${JSON.stringify(p.id)}, ${JSON.stringify(fKey)})`;
            const label = `${p.name}的${fKey}`;

            this.addToken('func', label, code);
        },

        // 6. 添加聚合函数
        addAggToken() {
            const stat = this.formulaBuilder.aggStat;
            const owner = this.formulaBuilder.aggOwner;
            if (!stat) return;

            let code = "";
            let label = "";

            if (owner === 'self') {
                code = `ctx.utils.sumRegionStat(self.id, ${JSON.stringify(stat)})`;
                label = `我的地块[${stat}]总和`;
            } else {
                code = `ctx.utils.sumAllRegionStat(${JSON.stringify(stat)})`;
                label = `世界地块[${stat}]总和`;
            }

            this.addToken('func', label, code);
        },

        // 7. 生成代码字符串 (含校验状态)
        generateCodeFromTokens() {
            const code = this.formulaTokens.map(t => t.value).join(' ');
            this.validateFormulaResult = this.checkFormulaSyntax(code); // 触发校验
            return code;
        },

        // [新增] 语法校验函数
        checkFormulaSyntax(code) {
            if (!code.trim()) return { valid: true, msg: '' };
            const mockSelf = { stats: {}, id: 'test' };
            this.getAllUniqueFields().forEach(field => {
                mockSelf.stats[field.key] = 1;
            });
            const mockCtx = {
                globals: {},
                players: [],
                map: { regions: [], pins: [] },
                utils: {
                    getPlayerStat: () => 1,
                    getOwnedRegionCount: () => 1,
                    sumAllRegionStat: () => 1,
                    sumRegionStat: () => 1
                },
                turn: 1
            };
            this.global_vars.forEach(globalVar => {
                mockCtx.globals[globalVar.key] = 1;
            });

            const result = window.LevantFormulaEngine.validate(code, {
                self: mockSelf,
                ctx: mockCtx
            });
            if (!result.valid) {
                return result;
            }
            const numericResult = Number(result.value);
            return Number.isFinite(numericResult)
                ? { valid: true, msg: 'Syntax Valid' }
                : { valid: false, msg: 'Formula must return a finite number.' };
        },

        // 8. 保存
        saveFormula() {
            if (this.currentEditingField) {
                const formula = this.generateCodeFromTokens();
                if (!this.validateFormulaResult.valid) return;
                this.currentEditingField.formula = formula;
                this.saveGame('autosave.json');
            }
            this.closeFormulaModal();
        },

        // 9. 样式辅助
        getTokenClass(type) {
            if (type === 'op') return 'border-gray-500 text-gray-300 bg-gray-800'; // 基础运算符
            if (type === 'num') return 'border-pink-500 text-pink-400 bg-pink-900/20'; // 数字
            if (type === 'var') return 'border-indigo-500 text-indigo-400 bg-indigo-900/20'; // 变量
            if (type === 'env') return 'border-amber-500 text-amber-400 bg-amber-900/20'; // 环境变量
            if (type === 'func') return 'border-blue-500 text-blue-400 bg-blue-900/20'; // 数学函数
            return 'border-gray-600 text-gray-400';
        },
        // --- [新增] 上下文属性格式化 (Type/Tag Generator) ---
        formatContextAttr(val, visibility, type) {
            // 1. Hidden 属性直接不可见
            if (visibility === 'hidden') return null;

            // 2. 构建元数据标签
            let metaParts = [];

            // 类型标记
            if (type === 'number') metaParts.push('Type:Number');
            else metaParts.push('Type:String'); // 默认为 String

            // 权限标记
            if (visibility === 'readonly') metaParts.push('ReadOnly/Auto-Calc');

            const metaTag = metaParts.length > 0 ? ` <${metaParts.join(', ')}>` : '';

            // 3. 返回格式化字符串: "100 <Type:Number, ReadOnly/Auto-Calc>"
            return `${val}${metaTag}`;
        },

        // 编辑器预览与自治执行共用同一套影响校验。
        validateImpact(imp) {
            const report = { errors: [], warnings: [], repairs: [] };
            this.normalizeAutonomyImpact(imp, 'impact', report);
            return {
                valid: report.errors.length === 0,
                msg: report.errors.map(item => item.message).join('\n')
            };
        },
        evaluateFormulaNumber(formula, self, context) {
            const result = window.LevantFormulaEngine.evaluate(formula, {
                self,
                ctx: context
            });
            const numericResult = Number(result);
            return Number.isFinite(numericResult)
                ? Math.round(numericResult * 100) / 100
                : 0;
        },
        // --- 修改后 (增强版) ---
        recalculateState() {
            const turnVal = this.timeline.length > 0 ? this.timeline[this.timeline.length-1].id : 0;
            const worldRegions = this.getAllWorldRegions();
            const worldPins = this.getAllWorldPins();

            // 1. 构建全知上下文 (World Context)
            // 这里的 context 将被注入到所有公式中
            const context = {
                globals: {}, // 稍后填充
                players: this.players,
                map: {
                    ...this.map_data,
                    regions: worldRegions,
                    pins: worldPins
                },
                turn: turnVal,

                // ★ 新增：工具函数，方便用户写公式
                // 用法示例: utils.sumChildStats('p_empire', 'gold_income')
                utils: {
                    getPlayerStat: (playerId, statKey) => {
                        const player = this.players.find(item => {
                            return item.id === playerId;
                        });
                        return parseFloat(player?.stats?.[statKey]) || 0;
                    },
                    getOwnedRegionCount: (ownerId) => {
                        return worldRegions.filter(region => {
                            return region.ownerId === ownerId;
                        }).length;
                    },
                    sumRegionStat: (ownerId, statKey) => {
                        return worldRegions.reduce((sum, region) => {
                            if (region.ownerId !== ownerId) return sum;
                            return sum + (
                                parseFloat(region.stats?.[statKey]) || 0
                            );
                        }, 0);
                    },
                    sumAllRegionStat: (statKey) => {
                        return worldRegions.reduce((sum, region) => {
                            return sum + (
                                parseFloat(region.stats?.[statKey]) || 0
                            );
                        }, 0);
                    }
                }
            };

            // 填充 globals 字典 (方便引用，如 context.globals['污染度'])
            this.global_vars.forEach(g => {
                let val = g.value;
                if (g.type === 'number') val = parseFloat(val) || 0;
                context.globals[g.key] = val;
            });

            // --- A. 计算全局变量 (Global Vars) ---
            this.global_vars.forEach(g => {
                if (g.type === 'number' && g.visibility === 'readonly' && g.formula) {
                    try {
                        g.value = this.evaluateFormulaNumber(
                            g.formula,
                            null,
                            context
                        );
                        context.globals[g.key] = g.value;
                    } catch (e) {
                        g.value = 0;
                        context.globals[g.key] = 0;
                        console.warn(`Global formula error [${g.key}]:`, e);
                    }
                }
            });

            // --- B. 计算实体属性 (Entity Stats) ---
            this.players.forEach(player => {
                const schema = this.rule_sets.find(rs => rs.id === player.schemaId);
                if (!schema) return;

                schema.fields.forEach(field => {
                    if (field.type === 'number' && field.visibility === 'readonly' && field.formula) {
                        try {
                            // 准备 self.stats
                            const selfStats = {};
                            schema.fields.forEach(f => {
                                let val = player.stats[f.key];
                                if (f.type === 'number') val = parseFloat(val) || 0;
                                selfStats[f.key] = val;
                            });

                            const selfObj = {
                                ...player,
                                id: player.id,
                                name: player.name,
                                stats: selfStats
                            };

                            player.stats[field.key] = this.evaluateFormulaNumber(
                                field.formula,
                                selfObj,
                                context
                            );
                        } catch (e) {
                            player.stats[field.key] = 0;
                            console.warn(`Stat formula error [${player.name}.${field.key}]:`, e);
                        }
                    }
                });
            });
        // --- C. ★ 新增：计算地块属性 (Region Stats) ---
        if (worldRegions.length > 0) {
            worldRegions.forEach(reg => {
                if (!reg.schemaId) return;
                const schema = this.rule_sets.find(rs => rs.id === reg.schemaId);
                if (!schema) return;

                schema.fields.forEach(field => {
                    if (field.type === 'number' && field.visibility === 'readonly' && field.formula) {
                        try {
                            const selfStats = {};
                            schema.fields.forEach(f => {
                                let val = reg.stats[f.key];
                                if (f.type === 'number') val = parseFloat(val) || 0;
                                selfStats[f.key] = val;
                            });

                            const selfObj = {
                                ...reg,
                                id: reg.id,
                                name: reg.name,
                                ownerId: reg.ownerId,
                                stats: selfStats
                            };

                            reg.stats[field.key] = this.evaluateFormulaNumber(
                                field.formula,
                                selfObj,
                                context
                            );
                        } catch (e) {
                            reg.stats[field.key] = 0;
                            console.warn(`Region formula error [${reg.name}.${field.key}]:`, e);
                        }
                    }
                });
            });
        }
        },

        // [修复] 核心算法：计算国旗投影 (加入地图长宽比修正，防止拉伸)
        addActorToEditor(e) {
            const val = e.target.value;
            if (!val) return;
            if (!this.editor.factionIds) this.editor.factionIds = [];

            if (!this.editor.factionIds.includes(val)) {
                this.editor.factionIds.push(val);
                this.updateEditorPrimary(); // 更新主ID用于兼容
            }
            e.target.value = ""; // 重置选择器
        },
        updateEditorPrimary() {
            // 始终让 factionId 等于数组的第一个，保持旧逻辑兼容（如边框颜色）
            if (this.editor.factionIds && this.editor.factionIds.length > 0) {
                this.editor.factionId = this.editor.factionIds[0];
            } else {
                this.editor.factionId = '';
            }
        },
        // ★★★ [新增] 检测内容是否为 JSON 剧本格式 ★★★
        handleSplashClick() {
            if (!this.hasInteracted) {
                // 第一次点击：只执行初始化（出Logo，播音乐）
                this.initInteraction();
            } else {
                // 第二次点击：只有在 Logo 出来后，点击才进入 App
                this.enterApp();
            }
        },
        // ★★★ 彩蛋逻辑 ★★★
        handleLogoClick() {
            this.logoClickCount++;
            if (this.logoClickCount >= 5) {
                this.showEasterEgg = true;
                this.logoClickCount = 0;
                window.addEventListener('keydown', this.closeEasterEgg);
            }
        },

        // [修改] 关闭逻辑
        closeEasterEgg() {
            if (this.showEasterEgg) {
                // 这里直接关闭，配合 CSS 的 transition 可能会有点硬，但因为是 v-if，直接消失也行。
                // 如果你想做淡出动画，需要更复杂的逻辑，这里为了代码简洁直接关闭即可。
                this.showEasterEgg = false;
                window.removeEventListener('keydown', this.closeEasterEgg);
            }
        },

        initInteraction() {
            if (this.hasInteracted) return;
            this.hasInteracted = true; // 状态变更

            // 播放音乐逻辑 (保持不变)
            const audio = this.$refs.splashBgm;
            if (audio) {
                audio.volume = 0;
                audio.play().then(() => {
                    let vol = 0;
                    const fadeTw = setInterval(() => {
                        if (!this.showSplash) { clearInterval(fadeTw); return; }
                        if (vol < 0.95) {
                            vol += 0.05;
                            audio.volume = vol;
                        } else {
                            audio.volume = 1;
                            clearInterval(fadeTw);
                        }
                    }, 100);
                }).catch(e => console.warn("Audio play failed:", e));
            }

            // 移除只用一次的键盘监听 (点击监听由 v-on:click 托管，不需要手动移除)
            document.removeEventListener('keydown', this.initKeyHandler);
        },

        // 专门处理键盘按下
        initKeyHandler(e) {
            this.initInteraction();
        },

// [修改] 启动黑客帝国数据流特效 (流星雨版)
        initMatrixEffect() {
            const canvas = this.$refs.matrixCanvas;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const charArray = chars.split('');

            // ★★★ 彩蛋流星群 ★★★
            const easterEggs = ['LEVANT', 'EASTERN','DONGFANG'];
            const activeSpecialCols = {};

            const fontSize = 14;
            const columns = Math.floor(canvas.width / fontSize);

            const drops = [];
            for (let x = 0; x < columns; x++) {
                drops[x] = Math.random() * -100;
            }

            const draw = () => {
                // 拖尾层稍微变淡一点 (0.05 -> 0.08)，让流星划过后的黑色背景恢复得稍微快一点，突出高亮
                ctx.fillStyle = 'rgba(2, 6, 23, 0.08)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.font = fontSize + 'px monospace';

                for (let i = 0; i < drops.length; i++) {
                    let text = '';

                    // --- A. 正在输出高亮词汇 (流星本体) ---
                    if (activeSpecialCols[i]) {
                        const state = activeSpecialCols[i];
                        text = state.word[state.charIndex];

                        // ★★★ 流星样式 ★★★
                        ctx.fillStyle = '#FFFFFF';   // 纯白核心
                        ctx.shadowColor = '#FFFFFF'; // 白色光晕
                        ctx.shadowBlur = 15;         // 光晕增强，像星星一样闪烁
                        ctx.font = 'bold ' + (fontSize + 3) + 'px monospace'; // 字号加大，更显眼

                        state.charIndex++;
                        if (state.charIndex >= state.word.length) {
                            delete activeSpecialCols[i];
                        }
                    }
                    // --- B. 普通背景流 ---
                    else {
                        // ★★★ 概率调整 ★★★
                        // 0.999 (0.1%) -> 0.96 (4%)
                        // 意味着每列每帧有4%的概率变成流星，屏幕上会非常热闹
                        // 同时限制生成高度在屏幕上半部分，保证词汇能完整落下
                        if (Math.random() > 0.99 && drops[i] * fontSize < canvas.height * 0.7) {
                            const word = easterEggs[Math.floor(Math.random() * easterEggs.length)];
                            activeSpecialCols[i] = { word: word, charIndex: 1 };
                            text = word[0];

                            // 流星头部的样式
                            ctx.fillStyle = '#FFFFFF';
                            ctx.shadowColor = '#FFFFFF';
                            ctx.shadowBlur = 15;
                            ctx.font = 'bold ' + (fontSize + 3) + 'px monospace';
                        } else {
                            // 普通乱码
                            text = charArray[Math.floor(Math.random() * charArray.length)];

                            // 背景字稍微暗一点，衬托流星
                            const isCyan = Math.random() > 0.5;
                            ctx.fillStyle = isCyan ? 'rgba(34, 211, 238, 0.5)' : 'rgba(232, 121, 249, 0.5)';
                            ctx.shadowBlur = 0;
                            ctx.font = fontSize + 'px monospace';
                        }
                    }

                    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                        drops[i] = 0;
                        if (activeSpecialCols[i]) delete activeSpecialCols[i];
                    }

                    drops[i]++;
                }
            };

            this.matrixInterval = setInterval(draw, 33);

            window.addEventListener('resize', () => {
                 if(!this.showSplash) return;
                 canvas.width = window.innerWidth;
                 canvas.height = window.innerHeight;
            });
        },

        async playRandomMusic(autoPlay = false) {
            try {
                const data = await window.LevantAPI.getMusicList();
                const files = data.files;

                if (files && files.length > 0) {
                    // 防重逻辑
                    const lastPlayed = localStorage.getItem('last_bgm_file');
                    let pool = files;
                    if (files.length > 1 && lastPlayed) {
                        pool = files.filter(f => f !== lastPlayed);
                    }

                    const randomFile = pool[Math.floor(Math.random() * pool.length)];
                    localStorage.setItem('last_bgm_file', randomFile);

                    const finalUrl = `sounds/${encodeURIComponent(randomFile)}?v=${Date.now()}`;
                    this.currentBgmName = randomFile.replace(/\.(mp3|wav|ogg|flac)$/i, '');

                    const audio = this.$refs.splashBgm;
                    if (audio) {
                        audio.src = finalUrl;
                        audio.load();
                        if (autoPlay) {
                            audio.volume = 0.4; // 默认音量
                            audio.play().catch(e => console.warn("Auto play blocked:", e));
                            this.isBgmPlaying = true;
                        }
                    }
                } else {
                    this.currentBgmName = "NO AUDIO FILES";
                }
            } catch (e) {
                console.warn("[System] Failed to load music:", e);
                this.currentBgmName = "AUDIO OFFLINE";
            }
        },

        // ★★★ [新增] 主界面音乐开关 ★★★
        toggleMainBgm() {
            const audio = this.$refs.splashBgm;
            if (!audio) return;

            if (this.isBgmPlaying) {
                // 关闭
                audio.pause();
                this.isBgmPlaying = false;
            } else {
                // 开启
                audio.volume = 0.4; // 恢复音量
                audio.play().then(() => {
                    this.isBgmPlaying = true;
                }).catch(e => {
                    console.error("Play failed:", e);
                    // 如果因为资源过期等原因播放失败，尝试重新加载一首
                    this.playRandomMusic(true);
                });
            }
        },

        // ★★★ [新增] 切歌 ★★★
        changeBgm() {
            this.playRandomMusic(true);
        },

        // 2. [修改] 进入应用时，停止动画以节省性能
        enterApp() {
            // 1. 界面飞出
            this.showSplash = false;

            if (this.matrixInterval) {
                clearInterval(this.matrixInterval);
                this.matrixInterval = null;
            }

            // 2. 音频淡出 (进入主界面后默认是关闭音乐的)
            const audio = this.$refs.splashBgm;
            if (audio && !audio.paused) {
                // 标记状态为关闭
                this.isBgmPlaying = false;

                const fadeOut = setInterval(() => {
                    if (audio.volume > 0.05) {
                        audio.volume -= 0.05;
                    } else {
                        audio.volume = 0;
                        audio.pause();
                        // 注意：这里不要重置 currentTime，也不要清空 src，方便用户点击按钮时直接继续播放或切歌
                        clearInterval(fadeOut);
                    }
                }, 50);
            }
        },
        // [新增] 添加选项到右侧编辑器
        addOptionToEditor() {
            if (!this.editor.options) this.editor.options = [];
            this.editor.options.push({
                label: this.t('opt_new'),
                desc: this.t('opt_desc_ph')
            });
        },

        // [新增] 添加选项到时间轴事件
        addOptionToEvent(event) {
            if (!event.options) event.options = [];
            // 确保是对象结构
            event.options.push({
                label: this.t('dec_new'),
                desc: this.t('dec_desc_ph')
            });
        },

        // --- 新增工具方法 ---
        createImpactObject(form) {
            const type = form.type || 'STAT_CHANGE';
            let newImpact = { type };

            if (type === 'STAT_CHANGE') {
                if (!form.targetId || !form.attrKey || form.newValue === '') return null;

                // 全局变量处理
                if (form.targetId === 'global') {
                    Object.assign(newImpact, {
                        targetId: 'global',
                        targetName: 'Global',
                        attrKey: form.attrKey,
                        attrLabel: form.attrKey,
                        oldValue: this.getAttrValueDisplay('global', form.attrKey),
                        newValue: form.newValue
                    });
                } else {
                    // 实体处理
                    const t = this.players.find(p => p.id === form.targetId);
                    if (!t) return null;

                    // ★ 修复：不再依赖 this.stat_schema，而是通过 getSchemaLabel 全局查找
                    const label = this.getSchemaLabel(form.attrKey, t.schemaId);

                    Object.assign(newImpact, {
                        targetId: t.id,
                        targetName: t.name,
                        attrKey: form.attrKey,
                        attrLabel: label,
                        oldValue: t.stats[form.attrKey] || '-',
                        newValue: form.newValue
                    });
                }
            }
            else if (type === 'REGION_TRANSFER') {
                if (!form.targetName || !form.newValue) return null;
                Object.assign(newImpact, { targetName: form.targetName, newValue: form.newValue });
            }
            else if (type === 'ENTITY_CREATE') {
                if (!form.newValue.trim()) return null;
                Object.assign(newImpact, { data: { name: form.newValue.trim() } });
            }
            else if (type === 'ENTITY_REMOVE') {
                if (!form.targetId) return null;
                Object.assign(newImpact, { targetId: form.targetId });
            }
            else if (type === 'PIN_MOVE') {
                if (!form.targetId || !form.newValue) return null;
                const pin = this.getAllWorldPins().find(p => p.id === form.targetId);
                const oldCoords = pin ? `${pin.x.toFixed(1)},${pin.y.toFixed(1)}` : '?,?';
                Object.assign(newImpact, {
                    targetId: form.targetId,
                    targetName: pin ? (pin.label || this.getPinName(pin.linkId)) : 'Unknown Pin',
                    oldValue: oldCoords,
                    newValue: form.newValue
                });
            }
            return newImpact;
        },
// --- [新增] 智能截图系统 ---

        buildHierarchyString() {
            const roots = this.players.filter(p => !p.parentId);
            let output = "";

            const printNode = (p, depth) => {
                const indent = "  ".repeat(depth);

                // 清洗 stats，防止属性中混入 Base64 图片
                const safeStats = { ...p.stats };
                for (const key in safeStats) {
                    const val = safeStats[key];
                    // 如果值是字符串且过长，判定为非文本数据，进行截断
                    if (typeof val === 'string' && val.length > 200) {
                        safeStats[key] = "[LONG_DATA_OMITTED]";
                    }
                }
                const statsStr = JSON.stringify(safeStats);

                output += `${indent}- [${p.name}] (ID: ${p.id}) ${statsStr}\n`;

                // 查找子节点
                const children = this.players.filter(child => child.parentId === p.id);
                children.forEach(c => printNode(c, depth + 1));
            };

            roots.forEach(r => printNode(r, 0));
            return output;
        },

        // 构建地图描述字符串，供 AI 使用
        t(key) {
            if (!this.translations[key]) return key;
            return this.translations[key][this.ui.lang] || this.translations[key]['zh'];
        },
        // [修改] Markdown 渲染：强制新窗口打开链接，防止覆盖当前页面
        renderMarkdown(text) {
            if (!text) return '';

            const sanitizeOptions = {
                USE_PROFILES: { html: true },
                ADD_ATTR: ['target', 'rel'],
                FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'audio', 'video', 'form', 'input', 'button', 'textarea', 'select', 'option', 'svg', 'math'],
                FORBID_ATTR: ['style']
            };
            let rawHtml = marked.parse(text, { gfm: true, breaks: true });

            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(rawHtml, 'text/html');

                // 找到所有链接，强制添加 target="_blank"
                const links = doc.querySelectorAll('a');
                links.forEach(a => {
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener noreferrer');
                });

                return DOMPurify.sanitize(doc.body.innerHTML, sanitizeOptions);
            } catch (e) {
                return DOMPurify.sanitize(rawHtml, sanitizeOptions);
            }
        },
        getFactionColor(id) {
            if(!id || id === 'global') return '#94a3b8';
            const p = this.players.find(x => x.id === id);
            return p ? p.color : '#6366f1';
        },
        getFactionName(id) {
            if (id === 'global') return this.t('option_global');
            if (!id) return 'Unknown';
            const p = this.players.find(x => x.id === id);
            return p ? p.name : 'Unknown';
        },
        getFactionLogo(id) {
            if (id === 'global') return 'fa-solid fa-globe';
            if (!id) return 'fa-solid fa-users';
            const p = this.players.find(x => x.id === id);
            return p && p.logo ? p.logo : 'fa-solid fa-users';
        },
        getSchemaLabel(key) { const s = this.stat_schema.find(x => x.key === key); return s ? s.label : key; },
        // [新增] 获取指定规则集的所有字段
        getFieldsBySchemaId(sid) {
            const schema = this.rule_sets.find(r => r.id === sid);
            return schema ? schema.fields : [];
        },
        // [新增] 获取当前正在编辑的规则集字段
        getActiveSchemaFields() {
            return this.getFieldsBySchemaId(this.activeSchemaId);
        },
        // [修改] 根据 key 查找 label (需要遍历所有规则集，或者指定规则集)
        getSchemaLabel(key, schemaId = null) {
            // 1. 如果指定了 schemaId，精准查找
            if (schemaId) {
                const schema = this.rule_sets.find(r => r.id === schemaId);
                if (schema) {
                    const field = schema.fields.find(f => f.key === key);
                    if (field) return field.label;
                }
            }
            // 2. 全局查找 (用于 Impact 显示等上下文不明确的情况)
            for (const rs of this.rule_sets) {
                const field = rs.fields.find(f => f.key === key);
                if (field) return field.label;
            }
            return key; // 找不到则返回 key 本身
        },
        // [新增] 添加新规则集
        addNewRuleSet() {
            const name = prompt("New Rule Set Name (e.g. 'Character', 'Nation')");
            if (!name) return;
            const newId = 'rs_' + Date.now();
            this.rule_sets.push({ id: newId, name: name, fields: [] });
            this.activeSchemaId = newId;
            this.saveGame('autosave.json');
        },
        // [新增] 删除规则集
        deleteActiveRuleSet() {
            if (this.rule_sets.length <= 1) return alert("Must keep at least one rule set.");
            if (!confirm("Delete this rule set? Entities using it will lose stat definitions.")) return;
            const idx = this.rule_sets.findIndex(r => r.id === this.activeSchemaId);
            this.rule_sets.splice(idx, 1);
            this.activeSchemaId = this.rule_sets[0].id;
            this.saveGame('autosave.json');
        },
        // [新增] 判断是否为图片 (Base64 或 URL)
        isImage(str) { return str && (str.startsWith('data:image') || str.startsWith('http') || str.includes('.png') || str.includes('.jpg')); },
        // [新增] 智能解析值：如果是实体ID则显示名称，否则显示原值
        resolveVal(val) {
            if (!val || typeof val !== 'string') return val;
            // 尝试在 players 列表里找
            const p = this.players.find(x => x.id === val);
            if (p) return p.name;
            // 如果是 global，显示对应文本
            if (val === 'global') return this.t('option_global');
            return val;
        },

        // [新增] 处理实体头像上传
        // [修改] 支持 field 为 'add_variant' 时推入数组
        handleFactionImageUpload(event, field) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            // 遍历所有选中的文件
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();

                reader.onload = (e) => {
                    if (field === 'add_variant') {
                        if (!this.editingFaction.avatars) this.editingFaction.avatars = [];

                        // [关键修复] 增加 Math.random() 防止 ID 冲突导致列表显示不全
                        // 使用文件名作为默认 Tag，方便识别
                        const safeName = file.name.split('.')[0].replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '').substring(0, 10);

                        this.editingFaction.avatars.push({
                            id: 'av_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                            tag: safeName || 'tag_' + (this.editingFaction.avatars.length + 1),
                            url: e.target.result,
                            scale: 1.0,
                            offsetY: 0.0
                        });
                        this.$nextTick(() => {
                            this.previewAvatarIndex = this.editingFaction.avatars.length - 1;
                        });
                    } else {
                        // 默认立绘 (只取第一个，或者覆盖)
                        this.editingFaction[field] = e.target.result;
                    }
                };
                reader.readAsDataURL(file);
            }

            // 清空 input 允许重复选择相同文件
            event.target.value = '';
        },
        formatTimeSpan(event) { if (!event.timeStart) return "Time ?"; if (!event.timeEnd || event.timeStart === event.timeEnd) return event.timeStart; return `${event.timeStart} - ${event.timeEnd}`; },
        async openSaveLoadModal() {
            try {
                // ★★★ 修改点：加上 window. 前缀 ★★★
                const data = await window.LevantAPI.getSaves();
                this.saveFiles = data.files;
                this.showSaveLoadModal = true;
            } catch (e) {
                console.error(e);
                alert("Failed to fetch saves: " + e.message);
            }
        },
        async loadGame(filename) {
            if (!filename) return;
            try {
                // ★★★ 修改点：加上 window. 前缀 ★★★
                const data = await window.LevantAPI.loadGame(filename);

                this.applyState(data);
                this.$nextTick(() => {
                    this.initMapCanvas();
                });

                this.currentSaveFile = filename;
                this.showSaveLoadModal = false;
            } catch (e) {
                console.error("Load Error:", e);
                // ★★★ 修改点：加上 window. 前缀 ★★★
                if (!window.IS_APP_MODE) this.serverConnected = false;
            }
        },
        // [优化] 简单的防抖保存包装器
        debouncedSave(filename) {
            if (this.saveTimeout) clearTimeout(this.saveTimeout);
            this.saveTimeout = setTimeout(() => {
                this.saveGame(filename);
            }, 1000); // 延迟 1 秒保存
        },

        async saveGame(filename, options = {}) {
            // 如果是防抖触发的，清除计时器句柄
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
                this.saveTimeout = null;
            }

            if (!filename || !filename.trim()) {
                const error = new Error('Save filename is required.');
                if (options.throwOnError) throw error;
                return false;
            }
            if (!filename.endsWith('.json')) filename += '.json';

            try {
                const stateData = {
                    rule_sets: this.rule_sets,
                    lorebook: this.lorebook,
                    players: this.players,
                    timeline: this.timeline,
                    global_vars: this.global_vars,
                    currentTurnPending: this.pendingEvents,
                    map_data: this.map_data
                };

                // 使用 LevantAPI

                await window.LevantAPI.saveGame(filename, stateData);

                this.currentSaveFile = filename;
                // ★★★ 修改点：加上 window. 前缀 ★★★
                if (!window.IS_APP_MODE) this.serverConnected = true;
                if (this.showSaveLoadModal) { this.showSaveLoadModal = false; this.newSaveFilename = ''; }
                return true;
            } catch (e) {
                console.error(e);
                if (options.throwOnError) throw e;
                alert("Save Failed:\n" + e.message);
                return false;
            }
        },
        async deleteSave(filename) {
            if (!confirm(`Delete "${filename}"?`)) return;
            try {
                // ★★★ 修改点：加上 window. 前缀 ★★★
                await window.LevantAPI.deleteSave(filename);
                this.openSaveLoadModal();
            } catch (e) { alert("Delete failed: " + e.message); }
        },

        // --- ★★★ [新增] 存档上传逻辑 ★★★ ---
        handleSaveUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const content = JSON.parse(e.target.result);
                    // 简单的格式校验
                    if (!content.timeline && !content.players) {
                        throw new Error("Invalid Save File Format");
                    }

                    // 使用文件名作为存档名，保存到系统
                    let filename = file.name;
                    // 调用现有的保存逻辑 (这会写入文件系统/后端)
                    // 注意：这里我们不需要 recordSnapshot，因为只是上传文件，没有改变当前状态
                    // 如果你想上传后立即加载，可以调用 this.loadGame(filename)

                    await window.LevantAPI.saveGame(filename, content);
                    alert(`Save file "${filename}" uploaded successfully!`);

                    // 刷新列表
                    this.openSaveLoadModal();

                } catch (err) {
                    alert("Upload Failed: " + err.message);
                }
                event.target.value = ''; // 重置 input
            };
            reader.readAsText(file);
        },

        // --- ★★★ [新增] 撤销 / 重做 系统 ★★★ ---

        // 记录快照 (在每次修改数据前调用)
        recordSnapshot() {
            // 构建当前状态的深拷贝
            const snapshot = JSON.stringify({
                rule_sets: this.rule_sets,
                lorebook: this.lorebook,
                players: this.players,
                timeline: this.timeline,
                global_vars: this.global_vars,
                // currentTurnPending: this.pendingEvents, // 待决事件通常不计入撤销，或者看你需要
                map_data: this.map_data
            });

            this.undoStack.push(snapshot);

            // 限制栈大小 (例如 30 步)
            if (this.undoStack.length > 30) {
                this.undoStack.shift();
            }

            // 发生新动作时，清空重做栈
            this.redoStack = [];
        },

        performUndo() {
            if (this.undoStack.length === 0) return;

            // 1. 保存当前状态到 Redo 栈
            const currentSnapshot = JSON.stringify({
                rule_sets: this.rule_sets,
                lorebook: this.lorebook,
                players: this.players,
                timeline: this.timeline,
                global_vars: this.global_vars,
                map_data: this.map_data
            });
            this.redoStack.push(currentSnapshot);

            // 2. 取出 Undo 栈顶
            const prevJson = this.undoStack.pop();
            const prevState = JSON.parse(prevJson);

            // 3. 应用状态
            this.applyState(prevState);
        },

        performRedo() {
            if (this.redoStack.length === 0) return;

            // 1. 保存当前状态到 Undo 栈
            const currentSnapshot = JSON.stringify({
                rule_sets: this.rule_sets,
                lorebook: this.lorebook,
                players: this.players,
                timeline: this.timeline,
                global_vars: this.global_vars,
                map_data: this.map_data
            });
            this.undoStack.push(currentSnapshot);

            // 2. 取出 Redo 栈顶
            const nextJson = this.redoStack.pop();
            const nextState = JSON.parse(nextJson);

            // 3. 应用状态
            this.applyState(nextState);
        },
// [核心修复] 应用存档状态 (全方位兼容旧版数据，强制补全地块属性)
        applyState(data) {
            // 深拷贝防止引用污染
            const state = JSON.parse(JSON.stringify(data));

            // --- 1. 规则集 (Rule Sets) 迁移 ---
            if (state.rule_sets && Array.isArray(state.rule_sets)) {
                this.rule_sets = state.rule_sets;
            } else {
                console.info("[Load] Migrating legacy schema to Rule Sets...");
                const legacySchema = state.stat_schema || state.schema || [];
                this.rule_sets = [{
                    id: 'default', name: '通用规则 (Default)', fields: legacySchema
                }];
            }

            // --- 2. 激活规则集 ID 校验 ---
            const hasRules = this.rule_sets.length > 0;
            const isValidId = this.activeSchemaId && this.rule_sets.some(r => r.id === this.activeSchemaId);
            if (!isValidId) {
                this.activeSchemaId = hasRules ? this.rule_sets[0].id : '';
            }

            // --- 3. 基础数据加载 ---
            this.lorebook = state.lorebook || [];
            this.global_vars = state.global_vars || [];
            this.pendingEvents = state.currentTurnPending || [];

            // --- 4. 实体 (Players) 数据清洗 ---
            this.players = (state.players || []).map(p => {
                if (p.avatar === undefined) p.avatar = "";
                if (p.avatarScale === undefined) p.avatarScale = 1.0;
                if (p.avatarOffsetY === undefined) p.avatarOffsetY = 0.0;

                // ★★★ [新增] 补全主角标记 ★★★
                if (p.isProtagonist === undefined) p.isProtagonist = false;

                if (!p.schemaId) p.schemaId = hasRules ? this.rule_sets[0].id : 'default';
                if (!p.stats) p.stats = {};
                return p;
            });

            // --- 5. 时间轴 (Timeline) 数据清洗 ---
            this.timeline = (state.timeline || []).map(turn => {
                if(turn.events) {
                    turn.events.forEach(e => {
                        if (!e.factionIds) e.factionIds = e.factionId ? [e.factionId] : [];
                        if (!e.factionId && e.factionIds.length > 0) e.factionId = e.factionIds[0];
                    });
                }
                return turn;
            });

            // --- 6. 地图数据 (Map Data) 强力迁移与清洗 ---
            const loadedMap = state.map_data || { layers: [] };

            // 判断是否为旧版散装格式
            const isLegacyMap = (!loadedMap.layers || loadedMap.layers.length === 0) &&
                                (loadedMap.image || (loadedMap.regions && loadedMap.regions.length > 0));

            if (isLegacyMap) {
                console.info("[Load] Migrating legacy Map Data to Layer System...");
                const newLayers = [];
                const ts = Date.now();

                if (loadedMap.image) {
                    newLayers.push({
                        id: 'layer_bg_' + ts, type: 'image', name: 'Base Map',
                        visible: true, opacity: 1.0, data: loadedMap.image
                    });
                }
                if (loadedMap.regions && loadedMap.regions.length > 0) {
                    // ★ 数据清洗：旧存档中的地块也要补全 stats
                    const cleanRegions = loadedMap.regions.map(r => ({
                        ...r,
                        schemaId: r.schemaId || '',
                        stats: r.stats || {}
                    }));

                    newLayers.push({
                        id: 'layer_reg_' + ts, type: 'region', name: 'Territories',
                        visible: true, opacity: 1.0, data: cleanRegions
                    });
                }
                if (loadedMap.pins && loadedMap.pins.length > 0) {
                    newLayers.push({
                        id: 'layer_pin_' + ts, type: 'marker', name: 'Markers',
                        visible: true, opacity: 1.0, data: loadedMap.pins
                    });
                }

                this.map_data = {
                    layers: newLayers,
                    activeLayerId: newLayers.length > 0 ? newLayers[0].id : ''
                };
            } else {
                // 新版格式，同样进行二次清洗，确保万无一失
                if (!loadedMap.layers) loadedMap.layers = [];

                loadedMap.layers.forEach(layer => {
                    if (layer.type === 'region' && Array.isArray(layer.data)) {
                        layer.data = layer.data.map(r => ({
                            ...r,
                            schemaId: r.schemaId || '',
                            stats: r.stats || {}
                        }));
                    }
                });

                this.map_data = loadedMap;

                if (!this.map_data.activeLayerId && this.map_data.layers.length > 0) {
                    this.map_data.activeLayerId = this.map_data.layers[0].id;
                }
            }

            // --- 7. 系统状态恢复 ---
            this.serverConnected = true;
            // [新增] 修复旧存档数据结构 & 执行计算
            this.recalculateState();
            this.$nextTick(() => { this.initMapCanvas(); });
        },

        addGlobalVar() {
            this.global_vars.push({ key: 'New Var', value: 'Value' });
            this.saveGame('autosave.json');
        },

        openContextModal() {
            if (!this.ensureActiveModelConfigured()) return;

            const rawInputText = this.rawInput.trim();
            const editorDraft = this.editor.summary;

            // 1. 基础校验
            if (!rawInputText && !editorDraft) return alert("Please input command or summary! (请输入指令或摘要)");

            // [修改] 根据模式动态加载系统提示词到临时编辑区
            if (this.useGalgamePrompt) {
                this.tempSystemPrompt = this.settings.prompts.galgame;
            } else {
                this.tempSystemPrompt = this.settings.prompts.system;
            }

            const inputText = (rawInputText + " " + editorDraft).toLowerCase();

            // 2. 准备资料库
            this.contextConfig.loreList = (this.lorebook || []).map(entry => {
                let isActive = false;
                if (entry.mode === 'on') isActive = true;
                else if (entry.mode === 'auto') {
                    const keysStr = entry.keys || "";
                    const keywords = keysStr.split(/[,，]/).map(k => k.trim().toLowerCase()).filter(k => k);
                    isActive = keywords.some(k => inputText.includes(k));
                }
                return { ...entry, active: isActive, originalMode: entry.mode };
            });

            // 3. 准备实体列表
            this.contextConfig.playerList = (this.players || []).map(p => ({
                id: p.id, name: p.name, logo: p.logo, color: p.color, active: true
            }));

            // --- [关键修复点 A]：聚合图层数据 ---
            let allRegions = [];
            let allPins = [];

            // 优先从图层读取
            if (this.map_data.layers && this.map_data.layers.length > 0) {
                this.map_data.layers.forEach(layer => {
                    if (layer.visible && Array.isArray(layer.data)) {
                        if (layer.type === 'region') allRegions = allRegions.concat(layer.data);
                        if (layer.type === 'marker') allPins = allPins.concat(layer.data);
                    }
                });
            } else {
                // 兼容旧数据
                allRegions = this.map_data.regions || [];
                allPins = this.map_data.pins || [];
            }

            // 映射到 contextConfig
            this.contextConfig.mapRegionList = allRegions.map(r => ({ ...r, active: true }));
            this.contextConfig.mapPinList = allPins.map(p => ({
                id: p.id, label: p.label, linkId: p.linkId, type: p.type, x: p.x, y: p.y, active: true
            }));

            // 4. 打开弹窗
            this.showContextModal = true;
        },

        moveContextItem(type, direction) {
            const idx = this.contextConfig.order.indexOf(type);
            if (idx < 0) return;
            const newIdx = idx + direction;
            if (newIdx >= 0 && newIdx < this.contextConfig.order.length) {
                const temp = this.contextConfig.order[newIdx];
                this.contextConfig.order[newIdx] = this.contextConfig.order[idx];
                this.contextConfig.order[idx] = temp;
            }
        },

        // --- 修改后的文件处理逻辑 ---
        async handleScriptFiles(event) {
            const files = event.target.files;
            if (!files.length) return;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();

                reader.onload = (e) => {
                    // readAsDataURL 读取的结果格式永远是: "data:应用类型;base64,纯Base64编码..."
                    const rawData = e.target.result;

                    // 提取逗号后面的纯 Base64 部分
                    // 这样做可以保证发给后端的 data 字段是纯净的 Base64 字符串
                    let base64Data = "";
                    if (rawData.includes(',')) {
                        base64Data = rawData.split(',')[1];
                    } else {
                        base64Data = rawData;
                    }

                    let payload = {
                        name: file.name,
                        // 有些浏览器识别不出 docx 的 type，这里给个兜底，后端主要靠文件名后缀判断
                        type: file.type || 'application/octet-stream',
                        data: base64Data
                    };

                    this.scriptAttachments.push(payload);
                };

                // ★★★ 核心修改 ★★★
                // 不管是图片、PDF 还是 Word，统统用 readAsDataURL 读取
                // 这样能保证二进制数据完整转为 Base64，不会丢失任何字节
                reader.readAsDataURL(file);
            }

            // 清空 input，允许重复选择同一文件
            event.target.value = '';
        },
        // [修改] 点击选项后的处理逻辑
        saveSettings(isSilent = false) {
            const toSave = {
                api_profiles: this.settings.api_profiles.map(profile => this.stripProfileUiState(profile)),
                active_profile_id: this.settings.active_profile_id,
                proxy: this.settings.proxy,
                autonomy: this.settings.autonomy,
                prompts: this.settings.prompts,
                ui: this.ui
            };
            localStorage.setItem('levant_settings', JSON.stringify(toSave));
            localStorage.setItem('levant_version', this.APP_VERSION);

            // 如果传入的参数是 true，则是静默保存（不关闭窗口，不弹窗）
            // 按钮点击时传入的是 Event 对象，不等于 true，所以会执行下面的关闭逻辑
            if (isSilent !== true) {
                this.showSettings = false;
                alert("Settings Saved!");
            }
        },
        addLoreEntry() { this.lorebook.unshift({ keys: '', content: '', mode: 'auto' }); },
        cycleLoreMode(e) { const m=['on','auto','off']; e.mode = m[(m.indexOf(e.mode)+1)%3]; this.saveGame('autosave.json') },
        addSchemaField() {
            const l=prompt("Label Name (e.g. 'Health', 'GDP')");
            if(l) {
                const k=prompt("Key (English, e.g. 'hp', 'gdp')");
                if(k) {
                    // 添加到当前规则集
                    this.getActiveSchemaFields().push({label:l, key:k});
                    // 初始化所有使用该规则集的实体
                    this.players.filter(p => p.schemaId === this.activeSchemaId).forEach(p => {
                        if(!p.stats[k]) p.stats[k] = '-';
                    });
                    this.saveGame('autosave.json');
                }
            }
        },
        copyToClipboard(t) { navigator.clipboard.writeText(t); },
        openFactionModal(p) {
            this.previewAvatarIndex = -1;
            if(p) {
                this.editingFaction = JSON.parse(JSON.stringify(p));

                // ★★★ [新增] 编辑已有角色时，确保字段存在 ★★★
                if (this.editingFaction.isProtagonist === undefined) {
                    this.editingFaction.isProtagonist = false;
                }
                // [兼容性] 补全视觉参数
                if (this.editingFaction.avatarScale === undefined) this.editingFaction.avatarScale = 1.0;
                if (this.editingFaction.avatarOffsetY === undefined) this.editingFaction.avatarOffsetY = 0.0;
                // 补全差分列表中的参数
                if (this.editingFaction.avatars) {
                    this.editingFaction.avatars.forEach(av => {
                        if (av.scale === undefined) av.scale = 1.0;
                        if (av.offsetY === undefined) av.offsetY = 0.0;
                    });
                }

                // 确保有 schemaId
                if(!this.editingFaction.schemaId) this.editingFaction.schemaId = this.rule_sets[0]?.id || 'default';
            } else {
                // 新建实体
                this.editingFaction = {
                    id:'', name:'',
                    logo: 'fa-solid fa-users',
                    isProtagonist: false,
                    avatar: '',
                    avatarScale: 1.0,   // [新增]
                    avatarOffsetY: 0.0, // [新增]
                    avatars: [],
                    color:'#ffffff', desc:'',
                    parentId: '',
                    schemaId: this.activeSchemaId || (this.rule_sets[0]?.id || 'default'),
                    stats:{}
                };
                // 预填空值
                this.getFieldsBySchemaId(this.editingFaction.schemaId).forEach(s => this.editingFaction.stats[s.key]='-');
            }
            this.showFactionModal = true;
        },
        closeFactionModal() { this.showFactionModal = false; },
        saveFaction() { if(!this.editingFaction.name) return; this.recordSnapshot(); if(this.editingFaction.id) { const i = this.players.findIndex(p => p.id === this.editingFaction.id); if(i !== -1) this.players[i] = JSON.parse(JSON.stringify(this.editingFaction)); } else { this.editingFaction.id = 'p'+Date.now(); this.players.push(JSON.parse(JSON.stringify(this.editingFaction))); } this.dataVersion++; this.closeFactionModal(); this.saveGame('autosave.json'); },
        deleteFaction() { const i = this.players.findIndex(p => p.id === this.editingFaction.id); if(i !== -1 && confirm("Destroy Entity?")) { this.recordSnapshot(); this.players.splice(i,1); this.closeFactionModal(); this.saveGame('autosave.json'); } },
        openScriptGenModal() {
            this.scriptGenPrompt = '';
            this.scriptAttachments = [];
            this.scriptGenTab = 'content';
            this.showScriptGenModal = true;
        },
        // [新增] 切换实体类型时，自动补全属性字段
        refreshFactionStats() {
            if (!this.editingFaction.schemaId) return;

            // 获取当前规则集的所有字段定义
            const fields = this.getFieldsBySchemaId(this.editingFaction.schemaId);

            // 确保 stats 对象存在
            if (!this.editingFaction.stats) this.editingFaction.stats = {};

            // 遍历字段，如果当前 stats 里没有这个 key，就初始化为 '-'
            fields.forEach(f => {
                if (this.editingFaction.stats[f.key] === undefined) {
                    this.editingFaction.stats[f.key] = '-';
                }
            });
        },
        // --- 查找并替换 methods 中的 generateScript ---

        async generateScript() {
            if (!this.ensureActiveModelConfigured()) return;
            if (!confirm("确定覆盖当前进度？")) return;
            this.recordSnapshot();
            this.isThinking = true;

            // --- 1. [新增] 动态构建高级约束指令 ---
            // 这些指令会强制 AI 覆盖默认行为
            let constraintPrompt = `\n\n【GENERATION CONSTRAINTS (MUST FOLLOW)】\n`;

            // A. 数量约束
            constraintPrompt += `1. Structure: You MUST generate exactly ${this.scriptGenConfig.rulesCount} distinct 'rule_sets' and exactly ${this.scriptGenConfig.entitiesCount} distinct 'players'.\n`;

            // B. 风格约束
            const style = this.scriptGenConfig.attrStyle;
            if (style === 'number') {
                constraintPrompt += `2. Attribute Style: All stats in 'rule_sets' MUST be of type 'number'. Values in 'players.stats' MUST be pure integers (e.g., 100, 50).\n`;
            } else if (style === 'letter') {
                constraintPrompt += `2. Attribute Style: All stats in 'rule_sets' MUST be of type 'string'. Values in 'players.stats' MUST use Letter Grades (e.g., "S", "A+", "B", "C").\n`;
            } else if (style === 'text') {
                constraintPrompt += `2. Attribute Style: All stats in 'rule_sets' MUST be of type 'string'. Values in 'players.stats' MUST use descriptive text (e.g., "High", "Weak", "Stable", "Chaos").\n`;
            } else {
                constraintPrompt += `2. Attribute Style: Mix 'number' and 'string' types appropriately based on the attribute nature (e.g., HP is number, Rank is string).\n`;
            }

            // --- 2. 构建 System Prompt ---
            let finalSystemPrompt = this.settings.prompts.script_generator;

            // 注入自定义 Prompt (如果开启)
            if (this.scriptGenUseCustom && this.settings.prompts.custom) {
                finalSystemPrompt = this.settings.prompts.custom + "\n\n" + finalSystemPrompt;
            }

            // 注入高级约束 (放在最后以加强权重)
            finalSystemPrompt += constraintPrompt;

            // --- 3. 发送请求 (后续代码保持不变) ---
            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                responseFormat: 'json',
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,

                systemPrompt: finalSystemPrompt, // 使用带约束的 Prompt

                context: `Req: "${this.scriptGenPrompt}"`,
                userPrompt: "Generate JSON strictly following the constraints.",
                attachments: this.scriptAttachments
            };

                try {
                    const data = await window.LevantAPI.generateAI(payload);

                    // ★★★ [新增] 标记为成功 ★★★
                    this.updateCurrentProfileStatus('success');

                    // 1. 尝试提取 JSON 字符串
                    const match = data.result.match(/\{[\s\S]*\}/);
                    let jsonStr = match ? match[0] : data.result;

                    let newState;

                    // 2. 尝试解析，如果失败则通过 AI 修复
                    try {
                        // 优先尝试你的智能解析器 (或者直接 JSON.parse)
                        newState = JSON.parse(jsonStr);
                    } catch (parseErr) {
                        console.warn("Initial Parse Failed, invoking AI Repair...", parseErr);
                        // ★★★ 核心修改：调用 AI 修复 ★★★
                        // 如果修复失败，repairJsonWithAi 会抛出异常，跳到外层 catch
                        newState = await this.repairJsonWithAi(jsonStr, parseErr.message);
                        console.log("AI Repair Successful!");
                    }
                // --- ★★★ 核心后处理逻辑开始 ★★★ ---
                if (newState.timeline && newState.players) {
                    // 1. 创建一个玩家初始状态的快速查找表 (Map)
                    const playerStatsMap = new Map();
                    newState.players.forEach(p => playerStatsMap.set(p.id, p.stats));

                    // 2. 遍历 timeline 中的所有事件和 impact
                    newState.timeline.forEach(turn => {
                        turn.events?.forEach(event => {
                            event.impacts?.forEach(impact => {
                                const initialStats = playerStatsMap.get(impact.targetId);

                                // 3. 如果找到了对应的玩家和初始状态
                                if (initialStats) {
                                    // 4. 将初始状态值赋给 oldValue
                                    impact.oldValue = initialStats[impact.attrKey] ?? "?";
                                } else {
                                    // 如果没找到，则设为 '?'
                                    impact.oldValue = "?";
                                }

                                // 5. 确保 newValue 存在，防止 AI 遗漏
                                if (impact.newValue === undefined) {
                                    impact.newValue = "?";
                                }
                            });
                        });
                    });
                }
                // --- ★★★ 核心后处理逻辑结束 ★★★ ---


                // (保留之前的 lorebook 容错处理)
                if (newState.lorebook) {
                    newState.lorebook.forEach(entry => {
                        if (!entry.keys) {
                            entry.keys = entry.title || entry.key || entry.name || "未命名条目";
                        }
                        delete entry.title;
                    });
                }

                // (保留之前的 attrLabel 容错处理)
                if(newState.timeline) {
                    const labelMap = {};
                    // 修正后
                    if(newState.rule_sets) {
                        newState.rule_sets.forEach(rs => {
                            rs.fields.forEach(f => labelMap[f.key] = f.label);
                        });
                    }

                    newState.timeline.forEach(t => {
                        if(t.events) t.events.forEach(e => {
                            if(e.impacts) e.impacts.forEach(i => {
                                if(!i.attrLabel && labelMap[i.attrKey]) i.attrLabel = labelMap[i.attrKey];
                            });
                        });
                    });
                }

                if (!newState.map_data) {
                    newState.map_data = JSON.parse(JSON.stringify(this.map_data));
                }

                this.applyState(newState);
                this.showScriptGenModal = false;
                this.scriptAttachments = [];
                this.scriptGenPrompt = '';
            } catch(e) {
                // ★★★ [新增] 标记为失败 ★★★
                this.updateCurrentProfileStatus('error');
                alert("Gen Failed: " + e.message);
            } finally { this.isThinking = false; }
        },

        // --- [新增] 战斗系统相关方法 ---

        // [重写] 启动充满仪式感的投掷
        rollCombatDice() {
            if (this.combatForm.dicePool.length === 0) return;

            // 1. 初始化弹窗数据
            // 深拷贝当前的骰子池，并给每个骰子加状态
            this.activeDiceList = this.combatForm.dicePool.map(d => ({
                ...d,
                val: null, // 还没出结果
                isSettled: false // 还没落地
            }));

            this.showDiceModal = true;
            this.isRollingAnimation = true;

            // 2. 播放音效 (如果有的话)
            // const audio = new Audio('sounds/dice_shake.mp3'); audio.play();

            // 3. 摇晃阶段 (持续 1.5 秒)
            // 在这个阶段，我们可以在后台生成最终结果，或者让界面上的数字乱跳
            // 这里我们使用纯 CSS 动画震动，不需要 JS 频繁更新数字，性能更好

            setTimeout(() => {
                this.settleDice();
            }, 1500); // 摇晃 1.5秒
        },

        // [新增] 骰子落地结算
        settleDice() {
            this.isRollingAnimation = false;

            // 1. 生成真实结果
            this.activeDiceList.forEach(d => {
                const max = parseInt(d.type.substring(1));
                d.val = Math.floor(Math.random() * max) + 1;
                d.isSettled = true;
            });

            // 2. 播放落地音效 (如果有)
            // const audio = new Audio('sounds/dice_land.mp3'); audio.play();
        },

        // [新增] 关闭弹窗并回填数据
        closeDiceModal() {
            // 只有当动画结束(落地后)才能关闭
            if (this.isRollingAnimation) return;

            // 将结果回填到右侧栏的表单中
            this.combatForm.dicePool = JSON.parse(JSON.stringify(this.activeDiceList));

            this.showDiceModal = false;
        },

        // [新增] 辅助判断大成功
        isCritSuccess(die) {
            if (!die.val) return false;
            const max = parseInt(die.type.substring(1));
            // D20 的 20，D100 的 1-5 (根据规则) 或者 >= 95，这里简单判定最大值
            // 或者比例 > 0.95
            return die.val === max || (die.val / max) >= 0.95;
        },

        // [新增] 辅助判断大失败
        isCritFail(die) {
            if (!die.val) return false;
            // 1 或者 比例 < 0.05
            const max = parseInt(die.type.substring(1));
            return die.val === 1 || (die.val / max) <= 0.05;
        },

        getDiceColorClass(val, type) {
            const max = parseInt(type.substring(1));
            const ratio = val / max;
            if (ratio >= 0.95 || val === max) return 'text-amber-400'; // 大成功
            if (ratio <= 0.05 || val === 1) return 'text-red-500';   // 大失败
            if (ratio >= 0.6) return 'text-emerald-400';             // 成功
            return 'text-[var(--text-dim)]';                         // 普通/失败
        },

        getDiceText(val, type) {
            const max = parseInt(type.substring(1));
            const ratio = val / max;
            if (val === max) return this.t('dice_crit_success');
            if (val === 1) return this.t('dice_crit_fail');
            if (ratio >= 0.5) return this.t('dice_pass');
            return this.t('dice_fail');
        },
        addCombatDie() {
            this.combatForm.dicePool.push({ type: 'd20', val: null, label: '' });
        },
        getDieIcon(type) {
            switch(type) {
                case 'd6': return 'fa-solid fa-dice-d6';
                case 'd100': return 'fa-solid fa-dice'; // D100没有专用图标，用一个通用的
                case 'd20':
                default: return 'fa-solid fa-dice-d20';
            }
        },

        async executeCombat() {
            if (!this.ensureActiveModelConfigured()) return;

            // 1. 准备数据
            const attacker = this.players.find(p => p.id === this.combatForm.attackerId);
            const defender = this.players.find(p => p.id === this.combatForm.defenderId);

            // --- 处理地点 ---
            let locStr = "未知/无特定地点";
            if (this.combatForm.locationId) {
                const reg = this.getAllWorldRegions().find(r => r.name === this.combatForm.locationId);
                if (reg) {
                    const owner = this.getFactionName(reg.ownerId);
                    locStr = `[领土] ${reg.name} (控制方: ${owner}, ID: ${reg.ownerId})`;
                } else {
                    const pin = this.getAllWorldPins().find(p => (p.label === this.combatForm.locationId || p.id === this.combatForm.locationId));
                    if (pin) locStr = `[标记点/设施] ${pin.label || "未命名点"}`;
                }
            }

            // --- 处理骰子序列 ---
            let diceAnalysis = this.combatForm.dicePool.map((d, i) => {
                const max = parseInt(d.type.substring(1));
                const desc = this.getDiceText(d.val, d.type);
                const label = d.label ? `[${d.label}]` : `[第 ${i+1} 轮判定]`;
                return `${i+1}. ${label}: 结果 ${d.val} (骰子 ${d.type}, 满分 ${max}) -> 判定: ${desc}`;
            }).join('\n   ');

            // --- ★ 新增：格式化攻守双方 Stats (带类型标签) ---
            const formatEntityStats = (entity) => {
                const schema = this.rule_sets.find(rs => rs.id === entity.schemaId);
                const visibleStats = {};
                if (schema) {
                    schema.fields.forEach(f => {
                        // 调用通用的格式化函数
                        const valStr = this.formatContextAttr(entity.stats[f.key], f.visibility||'editable', f.type||'string');
                        if (valStr !== null) visibleStats[f.key] = valStr;
                    });
                } else {
                    for(let k in entity.stats) visibleStats[k] = entity.stats[k];
                }
                return JSON.stringify(visibleStats, null, 2);
            };

            const attackerStatsStr = formatEntityStats(attacker);
            const defenderStatsStr = formatEntityStats(defender);

            // --- 3. 组装终极 Prompt (v2 类型增强版) ---
            const systemPrompt = `你是一个严谨的 TRPG 战斗裁判与世界模拟引擎。你的任务是根据输入数据推演战斗结果。

        【核心裁决逻辑】
        1. **属性对抗**：对比攻守双方 Stats。强者通常胜出，但需结合骰子修正。
           - 注意 Stats 中的 <Type:Number> 标签，这些是可量化的数值。
           - 标记为 <ReadOnly> 的属性不可直接修改。
        2. **地点环境 (Location)**：
           - 当前地点为: ${locStr}。
           - 如果地点控制者与某一方一致，该方享有主场优势。
        3. **骰子序列叙事 (Dice Sequence)**：
           - 用户提供了一组骰子结果，这是**绝对客观事实**，必须在战报中体现。
        4. **层级波及**：
           - 如果一方是子实体，受损严重时，须考虑对其父实体造成连带影响。

        【非常重要：JSON 输出格式】
        必须只返回一个 JSON 对象，严格遵守 TimelineEvent 结构。
        **数值修改规则**：impacts 中的 newValue 必须根据上下文中的 <Type> 标签输出正确类型（Number 输出纯数字，String 输出字符串）。

        {
        "summary": "简短且具有冲击力的标题",
        "content": "详细的战报（>150字）。请结合地点环境和骰子结果编写...",
        "impacts": [
            {
            "type": "STAT_CHANGE",
            "targetId": "${attacker.id}",
            "attrKey": "manpower",
            "oldValue": "...",
            "newValue": 9500 // ★ 纯数字 (如果原属性是 Number)
            },
            {
            "type": "STAT_CHANGE",
            "targetId": "${defender.id}",
            "attrKey": "stability",
            "oldValue": "...",
            "newValue": 60 // ★ 纯数字
            },
            {
            "type": "REGION_TRANSFER",  // 仅在战斗意图是“攻占”且攻击方大胜时生成
            "targetName": "${this.combatForm.locationId}",
            "newValue": "${attacker.id}"
            }
        ]
        }

        【输入数据】
        [战斗背景]: ${this.combatForm.context || "遭遇战"}
        [战斗地点]: ${locStr}

        [攻击方]: ${attacker.name} (ID: ${attacker.id})
        - Parent: ${attacker.parentId || "None"}
        - Desc: ${attacker.desc}
        - Stats: ${attackerStatsStr}

        [防御方]: ${defender.name} (ID: ${defender.id})
        - Parent: ${defender.parentId || "None"}
        - Desc: ${defender.desc}
        - Stats: ${defenderStatsStr}

        [命运骰子序列]:
        ${diceAnalysis}`;

            this.isThinking = true;

            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                responseFormat: 'json',
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,
                systemPrompt: systemPrompt,
                context: "Combat Simulation",
                userPrompt: "Generate the JSON result based on the dice sequence and environment."
            };

            try {
                const data = await window.LevantAPI.generateAI(payload);

                // ★★★ [新增] 标记为成功 ★★★
                this.updateCurrentProfileStatus('success');
                const match = data.result.match(/\{[\s\S]*\}/);
                if (!match) throw new Error("Invalid JSON returned by AI");

                const combatEvent = JSON.parse(match[0]);

                // 自动补全
                combatEvent.factionId = attacker.id;
                combatEvent.timeStart = "Combat";
                combatEvent.timeEnd = "End";

                // 填入编辑器
                this.editor.factionId = combatEvent.factionId;
                this.editor.summary = combatEvent.summary;
                this.editor.content = combatEvent.content;

                // 解析 Impacts 确保格式正确
                this.editor.impacts = [];
                if (combatEvent.impacts) {
                    combatEvent.impacts.forEach(imp => {
                        if (!imp.oldValue) imp.oldValue = "?";
                        if (!imp.type) imp.type = "STAT_CHANGE";

                        // 自动修复 Label
                        if (imp.type === 'STAT_CHANGE') {
                            imp.attrLabel = this.getSchemaLabel(imp.attrKey);
                            imp.targetName = this.getFactionName(imp.targetId);
                        } else if (imp.type === 'REGION_TRANSFER') {
                            imp.targetName = imp.targetName || "Region";
                            imp.attrLabel = "Control";
                        }

                        this.editor.impacts.push(imp);
                    });
                }

                this.tabs.right = 'input';

            } catch (e) {
                // ★★★ [新增] 标记为失败 ★★★
                this.updateCurrentProfileStatus('error');
                alert("Combat Judge Error: " + e.message);
            } finally {
                this.isThinking = false;
            }
        },
        async executeGodMode() {
            if (!this.ensureActiveModelConfigured()) return;
            this.isThinking = true;

            // --- 1. 定义智能清洗函数 (发送前：把图片变短) ---
            const sanitizeForAI = (obj) => {
                if (!obj) return obj;
                if (Array.isArray(obj)) return obj.map(sanitizeForAI);
                if (typeof obj === 'object') {
                    const clone = {};
                    for (const key in obj) {
                        const val = obj[key];
                        // 判定：如果是图片Base64或超长文本，替换为占位符
                        if (typeof val === 'string' && (this.isImage(val) || val.length > 500)) {
                            clone[key] = "<KEEP_ORIGINAL_DATA>";
                        } else {
                            clone[key] = sanitizeForAI(val);
                        }
                    }
                    return clone;
                }
                return obj;
            };

            // --- 2. 准备上下文 (应用清洗) ---
            // 聚合地图数据以便 AI 理解
            let allRegions = [];
            let allPins = [];
            if (this.map_data.layers && this.map_data.layers.length > 0) {
                this.map_data.layers.forEach(layer => {
                    if (Array.isArray(layer.data)) {
                        if (layer.type === 'region') allRegions = allRegions.concat(layer.data);
                        if (layer.type === 'marker') allPins = allPins.concat(layer.data);
                    }
                });
            } else {
                allRegions = this.map_data.regions || [];
                allPins = this.map_data.pins || [];
            }

            const rawSlice = {
                rule_sets: this.rule_sets,
                global_vars: this.global_vars,
                players: this.players,
                map_data: { regions: allRegions, pins: allPins }
            };

            // 执行清洗
            const safeContextSlice = sanitizeForAI(rawSlice);

            // --- 3. 构造 Prompt (关键：告诉 AI 只返回修改的部分) ---
            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                responseFormat: 'json',
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,

                // 我们动态注入一段系统指令，强制 AI 采用增量返回模式
                systemPrompt: this.settings.prompts.god_mode +
                    "\n\n【IMPORTANT OUTPUT RULE】\n" +
                    "1. You act like a 'Git Merge' tool. \n" +
                    "2. Return ONLY the objects that you modified or added. \n" +
                    "3. Do NOT return the full list if you didn't change everything. \n" +
                    "4. I will merge your output into the existing state by ID. Omitted items will be kept as is.",

                context: JSON.stringify(safeContextSlice),
                userPrompt: `INSTRUCTION: ${this.godModeInput}`
            };

            try {
                const data = await window.LevantAPI.generateAI(payload);

                // 解析 JSON
                const match = data.result.match(/\{[\s\S]*\}/);
                let jsonStr = match ? match[0] : data.result;
                let changes;
                try {
                    if (!match) throw new Error("Invalid JSON returned by AI");
                    changes = JSON.parse(jsonStr);
                } catch (parseErr) {
                    console.warn("[GodMode] Parse failed, invoking AI Repair...", parseErr);
                    changes = await this.repairJsonWithAi(jsonStr, parseErr.message);
                }

                this.recordSnapshot(); // 记录撤销点

                // --- 4. Git 风格智能合并逻辑 (Deep Merge & Restore) ---

                // 辅助函数：合并单个实体对象
                // target: 原始对象 (引用), source: AI返回的对象
                const mergeEntity = (target, source) => {
                    for (const key in source) {
                        const val = source[key];

                        // A. 图片保护逻辑：如果 AI 返回了占位符或空，不要覆盖原始图片
                        if (['logo', 'avatar', 'maskData'].includes(key) || (key === 'avatars')) {
                            if (val === "<KEEP_ORIGINAL_DATA>" || !val) {
                                continue; // 跳过赋值，保留原样
                            }
                            // 特殊处理 avatars 数组内的图片
                            if (key === 'avatars' && Array.isArray(val) && Array.isArray(target.avatars)) {
                                // 简单的做法：直接采用 AI 的结构，但把图片 URL 还原回去
                                target.avatars = val.map(vItem => {
                                    const oldItem = target.avatars.find(old => old.id === vItem.id);
                                    if (oldItem && (vItem.url === "<KEEP_ORIGINAL_DATA>" || !vItem.url)) {
                                        vItem.url = oldItem.url;
                                    }
                                    return vItem;
                                });
                                continue;
                            }
                        }

                        // B. Stats 属性合并 (深度合并)
                        if (key === 'stats' && typeof val === 'object' && target.stats) {
                            // 混合新旧属性：旧的保留，新的覆盖
                            target.stats = { ...target.stats, ...val };
                            continue;
                        }

                        // C. 普通属性直接覆盖
                        target[key] = val;
                    }
                };

                // === A. 处理 Players (实体) ===
                if (changes.players && Array.isArray(changes.players)) {
                    changes.players.forEach(aiPlayer => {
                        // 1. 尝试按 ID 查找现有实体
                        const existingPlayer = this.players.find(p => p.id === aiPlayer.id);

                        if (existingPlayer) {
                            // [MODIFIED] 找到了 -> 执行合并 (Modify)
                            console.log(`[GodMode] Merging Player: ${existingPlayer.name}`);
                            mergeEntity(existingPlayer, aiPlayer);
                        } else {
                            // [NEW] 没找到 -> 视为新增 (Add)
                            // 新增时要注意，如果 AI 返回了占位符图片(理论上不应该，因为是新造的)，给个默认值
                            if (aiPlayer.logo === "<KEEP_ORIGINAL_DATA>") aiPlayer.logo = "fa-solid fa-user";
                            console.log(`[GodMode] Adding New Player: ${aiPlayer.name}`);
                            this.players.push(aiPlayer);
                        }
                    });
                    // [KEEP] 没在 changes.players 里的实体，自动保留，不做任何操作
                }

                // === B. 处理 Map Regions (地块) ===
                if (changes.map_data && Array.isArray(changes.map_data.regions)) {
                    // 地块分散在图层里，需要全局搜索
                    changes.map_data.regions.forEach(aiReg => {
                        let found = false;
                        // 遍历所有图层寻找 ID 匹配的地块
                        for (const layer of this.map_data.layers) {
                            if (layer.type === 'region' && Array.isArray(layer.data)) {
                                const existingReg = layer.data.find(r => r.id === aiReg.id);
                                if (existingReg) {
                                    // [MODIFIED] 找到了 -> 合并
                                    console.log(`[GodMode] Merging Region: ${existingReg.name}`);
                                    mergeEntity(existingReg, aiReg);
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (!found) {
                            // [NEW] 没找到 -> 这里稍微复杂，因为不知道加到哪个图层
                            // 策略：加到第一个 Region 图层，或者新建一个
                            console.log(`[GodMode] Adding New Region: ${aiReg.name}`);
                            let targetLayer = this.map_data.layers.find(l => l.type === 'region');
                            if (!targetLayer) {
                                this.addLayer('region');
                                targetLayer = this.map_data.layers[this.map_data.layers.length - 1];
                            }
                            // 确保必要的几何数据存在，否则给默认值
                            if(!aiReg.x) { aiReg.x=50; aiReg.y=50; aiReg.w=10; aiReg.h=10; }
                            targetLayer.data.push(aiReg);
                        }
                    });
                }

                // === C. 处理规则集 (Rule Sets) ===
                if (changes.rule_sets && Array.isArray(changes.rule_sets)) {
                    changes.rule_sets.forEach(aiRs => {
                        const existingRs = this.rule_sets.find(r => r.id === aiRs.id);
                        if (existingRs) {
                            // 规则集通常包含 fields 数组，这里建议直接替换 fields 列表，或者做更深度的合并
                            // 为了简单且安全，属性名(name)覆盖，字段列表(fields)如果 AI 给了就覆盖
                            existingRs.name = aiRs.name || existingRs.name;
                            if (aiRs.fields) {
                                // 这里可以选择合并字段，但通常规则定义是整体性的，覆盖可能更符合意图
                                // 但为了保险，我们可以合并:
                                aiRs.fields.forEach(newF => {
                                    const oldF = existingRs.fields.find(f => f.key === newF.key);
                                    if (oldF) Object.assign(oldF, newF);
                                    else existingRs.fields.push(newF);
                                });
                            }
                        } else {
                            this.rule_sets.push(aiRs);
                        }
                    });
                }

                // === D. 全局变量 (Global Vars) ===
                // 全局变量是个数组，且没有唯一ID (key即ID)，处理类似
                if (changes.global_vars && Array.isArray(changes.global_vars)) {
                    changes.global_vars.forEach(aiG => {
                        const existingG = this.global_vars.find(g => g.key === aiG.key);
                        if (existingG) {
                            Object.assign(existingG, aiG); // 合并值、类型等
                        } else {
                            this.global_vars.push(aiG);
                        }
                    });
                }
                // ★★★ [新增] 标记为成功 ★★★
                this.updateCurrentProfileStatus('success');

                this.godModeInput = '';
                this.saveGame('autosave.json');
                alert("World Reality Rewritten (Merge Success).");

            } catch(e) {
                // ★★★ [新增] 标记为失败 ★★★
                this.updateCurrentProfileStatus('error');
                console.error(e);
                alert("God Mode Failed: " + e.message);
            } finally {
                this.isThinking = false;
            }
        },
    }
}).mount('#app');
