(function (global) {
    'use strict';

    const SUPPORTED_IMPACT_TYPES = new Set([
        'STAT_CHANGE',
        'REGION_TRANSFER',
        'ENTITY_CREATE',
        'ENTITY_REMOVE',
        'PIN_MOVE'
    ]);

    global.LevantModules = global.LevantModules || {};
    global.LevantModules.autonomy = {
        getAutonomyConfig() {
            return {
                mode: 'autonomous',
                autoRepair: true,
                maxRepairAttempts: 1,
                guardedRiskThreshold: 4,
                ...(this.settings.autonomy || {})
            };
        },

        setAutonomyStatus(phase, message, report = null) {
            this.autonomyState.phase = phase;
            this.autonomyState.message = message;
            if (report) this.autonomyState.lastReport = report;
        },

        getAllWorldRegions() {
            const regions = [];
            const seen = new Set();
            const append = (region) => {
                if (!region) return;
                const key = region.id || region.name;
                if (!key || seen.has(key)) return;
                seen.add(key);
                regions.push(region);
            };

            (this.map_data.regions || []).forEach(append);
            (this.map_data.layers || []).forEach(layer => {
                if (layer.type === 'region' && Array.isArray(layer.data)) {
                    layer.data.forEach(append);
                }
            });
            return regions;
        },

        getAllWorldPins() {
            const pins = [];
            const seen = new Set();
            const append = (pin) => {
                if (!pin) return;
                const key = pin.id || `${pin.x}:${pin.y}:${pin.label || ''}`;
                if (seen.has(key)) return;
                seen.add(key);
                pins.push(pin);
            };

            (this.map_data.pins || []).forEach(append);
            (this.map_data.layers || []).forEach(layer => {
                if (layer.type === 'marker' && Array.isArray(layer.data)) {
                    layer.data.forEach(append);
                }
            });
            return pins;
        },

        inferAutonomyImpactType(impact) {
            const explicitType = String(impact.type || '').toUpperCase();
            if (SUPPORTED_IMPACT_TYPES.has(explicitType)) return explicitType;
            if (impact.data && typeof impact.data === 'object') return 'ENTITY_CREATE';
            if (impact.attrKey) return 'STAT_CHANGE';
            if (impact.targetName && impact.newValue !== undefined) return 'REGION_TRANSFER';
            if (impact.targetId && impact.newValue !== undefined) return 'PIN_MOVE';
            if (impact.targetId) return 'ENTITY_REMOVE';
            return explicitType || 'UNKNOWN';
        },

        coerceAutonomyValue(value, field, path, repairs, errors) {
            const type = field.type || 'string';
            if (type === 'number') {
                const normalized = typeof value === 'string' ? value.trim() : value;
                const numeric = typeof normalized === 'number' ? normalized : Number(normalized);
                if (!Number.isFinite(numeric)) {
                    errors.push({
                        code: 'TYPE_MISMATCH',
                        path,
                        message: `Field "${field.key}" requires a finite number.`
                    });
                    return value;
                }
                if (numeric !== value) {
                    repairs.push({
                        code: 'COERCE_NUMBER',
                        path,
                        message: `Converted "${value}" to ${numeric}.`
                    });
                }
                return numeric;
            }

            if (value === null || value === undefined) {
                errors.push({
                    code: 'MISSING_VALUE',
                    path,
                    message: `Field "${field.key}" requires a value.`
                });
                return value;
            }
            return typeof value === 'string' ? value : String(value);
        },

        normalizeAutonomyEvent(rawEvent, eventIndex, report) {
            const event = rawEvent && typeof rawEvent === 'object'
                ? JSON.parse(JSON.stringify(rawEvent))
                : {};
            const basePath = `events[${eventIndex}]`;

            event.summary = typeof event.summary === 'string' ? event.summary.trim() : '';
            if (!event.summary && typeof event.content === 'string' && event.content.trim()) {
                event.summary = event.content.trim().slice(0, 80);
                report.repairs.push({
                    code: 'DERIVE_SUMMARY',
                    path: `${basePath}.summary`,
                    message: 'Derived a summary from event content.'
                });
            }
            if (!event.summary) {
                report.errors.push({
                    code: 'MISSING_SUMMARY',
                    path: `${basePath}.summary`,
                    message: 'Event summary is required.'
                });
            }

            if (typeof event.content !== 'string') {
                if (event.content === null || event.content === undefined) {
                    event.content = event.summary;
                } else {
                    event.content = JSON.stringify(event.content);
                    report.repairs.push({
                        code: 'STRINGIFY_CONTENT',
                        path: `${basePath}.content`,
                        message: 'Converted structured content to a JSON string.'
                    });
                }
            }

            event.timeStart = event.timeStart === undefined ? '?' : String(event.timeStart);
            event.timeEnd = event.timeEnd === undefined ? '?' : String(event.timeEnd);
            event.options = Array.isArray(event.options)
                ? event.options.filter(option => option && (option.label || typeof option === 'string'))
                : [];

            let factionIds = Array.isArray(event.factionIds)
                ? event.factionIds.filter(Boolean).map(String)
                : [];
            if (event.factionId) factionIds.unshift(String(event.factionId));
            factionIds = [...new Set(factionIds)];
            const validFactionIds = factionIds.filter(id => id === 'global' || this.players.some(player => player.id === id));
            if (validFactionIds.length !== factionIds.length) {
                report.warnings.push({
                    code: 'UNKNOWN_ACTOR',
                    path: `${basePath}.factionIds`,
                    message: 'Unknown actor references were removed.'
                });
            }
            event.factionIds = validFactionIds.length ? validFactionIds : ['global'];
            event.factionId = event.factionIds[0];

            const impacts = Array.isArray(event.impacts) ? event.impacts : [];
            if (!Array.isArray(event.impacts)) {
                report.repairs.push({
                    code: 'DEFAULT_IMPACTS',
                    path: `${basePath}.impacts`,
                    message: 'Replaced a missing impacts collection with an empty list.'
                });
            }
            event.impacts = impacts.map((impact, impactIndex) => (
                this.normalizeAutonomyImpact(impact, `${basePath}.impacts[${impactIndex}]`, report)
            )).filter(Boolean);

            event.reasoningSummary = typeof event.reasoningSummary === 'string'
                ? event.reasoningSummary
                : '';
            event.worldObservations = Array.isArray(event.worldObservations)
                ? event.worldObservations.map(String)
                : [];
            event.futureIntentions = Array.isArray(event.futureIntentions)
                ? event.futureIntentions.map(String)
                : [];
            event.isOpen = false;
            return event;
        },

        normalizeAutonomyImpact(rawImpact, path, report) {
            if (!rawImpact || typeof rawImpact !== 'object') {
                report.errors.push({
                    code: 'INVALID_IMPACT',
                    path,
                    message: 'Impact must be an object.'
                });
                return null;
            }

            const impact = JSON.parse(JSON.stringify(rawImpact));
            impact.type = this.inferAutonomyImpactType(impact);
            if (!SUPPORTED_IMPACT_TYPES.has(impact.type)) {
                report.errors.push({
                    code: 'UNSUPPORTED_IMPACT',
                    path: `${path}.type`,
                    message: `Unsupported impact type "${impact.type}".`
                });
                return impact;
            }

            if (impact.type === 'STAT_CHANGE') {
                const isGlobal = String(impact.targetId || '').toLowerCase() === 'global'
                    || String(impact.targetName || '').toLowerCase() === 'global';
                let target = null;
                let field = null;

                if (isGlobal) {
                    impact.targetId = 'global';
                    impact.targetName = 'Global';
                    target = this.global_vars.find(item => item.key === impact.attrKey);
                    field = target;
                } else {
                    target = this.players.find(player => player.id === impact.targetId);
                    if (!target && impact.targetName) {
                        target = this.players.find(player => player.name === impact.targetName);
                        if (target) {
                            impact.targetId = target.id;
                            report.repairs.push({
                                code: 'RESOLVE_ENTITY_NAME',
                                path: `${path}.targetId`,
                                message: `Resolved entity "${target.name}" to ${target.id}.`
                            });
                        }
                    }
                    if (target) {
                        const schema = this.rule_sets.find(item => item.id === target.schemaId);
                        field = schema ? schema.fields.find(item => item.key === impact.attrKey) : null;
                        if (!field && Object.prototype.hasOwnProperty.call(target.stats || {}, impact.attrKey)) {
                            field = {
                                key: impact.attrKey,
                                label: impact.attrKey,
                                type: typeof target.stats[impact.attrKey] === 'number' ? 'number' : 'string',
                                visibility: 'editable'
                            };
                            report.warnings.push({
                                code: 'LEGACY_FIELD',
                                path: `${path}.attrKey`,
                                message: `Validated legacy field "${impact.attrKey}" from current state.`
                            });
                        }
                        impact.targetName = target.name;
                    }
                }

                if (!target) {
                    report.errors.push({
                        code: 'UNKNOWN_TARGET',
                        path: `${path}.targetId`,
                        message: `Stat target "${impact.targetId || impact.targetName || ''}" does not exist.`
                    });
                    return impact;
                }
                if (!field) {
                    report.errors.push({
                        code: 'UNKNOWN_FIELD',
                        path: `${path}.attrKey`,
                        message: `Field "${impact.attrKey || ''}" does not exist on the target schema.`
                    });
                    return impact;
                }
                if ((field.visibility || 'editable') !== 'editable') {
                    report.errors.push({
                        code: 'READONLY_FIELD',
                        path: `${path}.attrKey`,
                        message: `Field "${field.key}" is ${field.visibility} and cannot be directly modified.`
                    });
                    return impact;
                }

                impact.attrLabel = field.label || field.key;
                impact.oldValue = isGlobal ? target.value : target.stats[field.key];
                impact.newValue = this.coerceAutonomyValue(
                    impact.newValue,
                    field,
                    `${path}.newValue`,
                    report.repairs,
                    report.errors
                );
            }

            if (impact.type === 'REGION_TRANSFER') {
                const regions = this.getAllWorldRegions();
                const region = regions.find(item => item.id === impact.targetId)
                    || regions.find(item => item.name === impact.targetName);
                if (!region) {
                    report.errors.push({
                        code: 'UNKNOWN_REGION',
                        path: `${path}.targetName`,
                        message: `Region "${impact.targetName || impact.targetId || ''}" does not exist.`
                    });
                    return impact;
                }

                let ownerId = impact.newValue;
                if (ownerId === 'neutral' || ownerId === 'global' || ownerId === null) ownerId = '';
                if (ownerId && !this.players.some(player => player.id === ownerId)) {
                    const owner = this.players.find(player => player.name === ownerId);
                    if (owner) {
                        ownerId = owner.id;
                        report.repairs.push({
                            code: 'RESOLVE_OWNER_NAME',
                            path: `${path}.newValue`,
                            message: `Resolved owner "${owner.name}" to ${owner.id}.`
                        });
                    } else {
                        report.errors.push({
                            code: 'UNKNOWN_OWNER',
                            path: `${path}.newValue`,
                            message: `Region owner "${impact.newValue}" does not exist.`
                        });
                    }
                }
                impact.targetId = region.id;
                impact.targetName = region.name;
                impact.oldValue = region.ownerId || '';
                impact.newValue = ownerId;
                impact.attrKey = 'ownerId';
                impact.attrLabel = 'Controller';
            }

            if (impact.type === 'ENTITY_CREATE') {
                const data = impact.data && typeof impact.data === 'object' ? impact.data : {};
                data.name = typeof data.name === 'string' ? data.name.trim() : '';
                if (!data.name) {
                    report.errors.push({
                        code: 'MISSING_ENTITY_NAME',
                        path: `${path}.data.name`,
                        message: 'Created entities require a name.'
                    });
                    return impact;
                }

                if (data.id && this.players.some(player => player.id === data.id)) {
                    report.errors.push({
                        code: 'DUPLICATE_ENTITY_ID',
                        path: `${path}.data.id`,
                        message: `Entity ID "${data.id}" already exists.`
                    });
                }

                const schema = this.rule_sets.find(item => item.id === data.schemaId)
                    || this.rule_sets[0]
                    || null;
                data.schemaId = schema ? schema.id : '';
                data.stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
                if (schema) {
                    const normalizedStats = {};
                    schema.fields.forEach(field => {
                        const proposed = data.stats[field.key];
                        if (proposed === undefined) {
                            normalizedStats[field.key] = field.type === 'number' ? 0 : '-';
                        } else if ((field.visibility || 'editable') === 'readonly') {
                            normalizedStats[field.key] = field.type === 'number' ? 0 : '-';
                            report.repairs.push({
                                code: 'RESET_DERIVED_FIELD',
                                path: `${path}.data.stats.${field.key}`,
                                message: `Reset derived field "${field.key}" for recalculation.`
                            });
                        } else {
                            normalizedStats[field.key] = this.coerceAutonomyValue(
                                proposed,
                                field,
                                `${path}.data.stats.${field.key}`,
                                report.repairs,
                                report.errors
                            );
                        }
                    });
                    data.stats = normalizedStats;
                }
                impact.data = data;
                impact.targetName = data.name;
                impact.attrLabel = 'Create Entity';
                impact.oldValue = null;
                impact.newValue = data.name;
            }

            if (impact.type === 'ENTITY_REMOVE') {
                let target = this.players.find(player => player.id === impact.targetId);
                if (!target && impact.targetName) {
                    target = this.players.find(player => player.name === impact.targetName);
                    if (target) impact.targetId = target.id;
                }
                if (!target) {
                    report.errors.push({
                        code: 'UNKNOWN_ENTITY',
                        path: `${path}.targetId`,
                        message: `Entity "${impact.targetId || impact.targetName || ''}" does not exist.`
                    });
                    return impact;
                }
                impact.targetId = target.id;
                impact.targetName = target.name;
                impact.attrLabel = 'Remove Entity';
                impact.oldValue = target.name;
                impact.newValue = null;
            }

            if (impact.type === 'PIN_MOVE') {
                const pin = this.getAllWorldPins().find(item => item.id === impact.targetId);
                if (!pin) {
                    report.errors.push({
                        code: 'UNKNOWN_PIN',
                        path: `${path}.targetId`,
                        message: `Map pin "${impact.targetId || ''}" does not exist.`
                    });
                    return impact;
                }
                const parts = Array.isArray(impact.newValue)
                    ? impact.newValue
                    : String(impact.newValue || '').split(/[,\s]+/);
                const x = Number(parts[0]);
                const y = Number(parts[1]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    report.errors.push({
                        code: 'INVALID_COORDINATES',
                        path: `${path}.newValue`,
                        message: 'Pin movement requires finite x and y coordinates.'
                    });
                    return impact;
                }
                impact.targetName = pin.label || this.getPinName(pin.linkId) || pin.id;
                impact.attrLabel = 'Position';
                impact.oldValue = `${pin.x},${pin.y}`;
                impact.newValue = `${x},${y}`;
            }

            return impact;
        },

        calculateAutonomyRisk(events) {
            let score = 0;
            const reasons = [];
            events.forEach(event => {
                (event.impacts || []).forEach(impact => {
                    if (impact.type === 'ENTITY_REMOVE') {
                        score += 4;
                        reasons.push(`Entity removal: ${impact.targetName}`);
                    } else if (impact.type === 'REGION_TRANSFER') {
                        score += 2;
                        reasons.push(`Region transfer: ${impact.targetName}`);
                    } else if (impact.type === 'ENTITY_CREATE') {
                        score += 1;
                    } else if (impact.type === 'STAT_CHANGE') {
                        score += 1;
                    }
                });
            });
            return {
                score,
                level: score >= 7 ? 'critical' : score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low',
                reasons
            };
        },

        validateAutonomyDecision(rawDecision) {
            const report = {
                valid: false,
                events: [],
                errors: [],
                warnings: [],
                repairs: [],
                risk: { score: 0, level: 'low', reasons: [] }
            };
            const rawEvents = Array.isArray(rawDecision)
                ? rawDecision
                : (Array.isArray(rawDecision?.events) ? rawDecision.events : [rawDecision]);

            if (!rawEvents.length) {
                report.errors.push({
                    code: 'EMPTY_DECISION',
                    path: 'events',
                    message: 'The model returned no events.'
                });
                return report;
            }

            report.events = rawEvents.map((event, index) => (
                this.normalizeAutonomyEvent(event, index, report)
            ));

            const unavailableEntityIds = new Set();
            const reservedEntityIds = new Set();
            report.events.forEach((event, eventIndex) => {
                event.impacts.forEach((impact, impactIndex) => {
                    const path = `events[${eventIndex}].impacts[${impactIndex}]`;
                    if (
                        ['STAT_CHANGE', 'ENTITY_REMOVE'].includes(impact.type)
                        && impact.targetId !== 'global'
                        && unavailableEntityIds.has(impact.targetId)
                    ) {
                        report.errors.push({
                            code: 'TARGET_REMOVED_EARLIER',
                            path: `${path}.targetId`,
                            message: `Entity "${impact.targetId}" was already removed earlier in this decision.`
                        });
                    }
                    if (impact.type === 'ENTITY_REMOVE') {
                        unavailableEntityIds.add(impact.targetId);
                    }
                    if (impact.type === 'ENTITY_CREATE' && impact.data?.id) {
                        if (reservedEntityIds.has(impact.data.id)) {
                            report.errors.push({
                                code: 'DUPLICATE_ENTITY_ID',
                                path: `${path}.data.id`,
                                message: `Entity ID "${impact.data.id}" is duplicated in this decision.`
                            });
                        }
                        reservedEntityIds.add(impact.data.id);
                    }
                });
            });

            report.risk = this.calculateAutonomyRisk(report.events);
            report.valid = report.errors.length === 0;
            return report;
        },

        buildAutonomyOutputContract() {
            return `

AUTONOMOUS EXECUTION CONTRACT:
- You make the world decision. Do not ask the user to approve it.
- Return one event object, or {"events":[...]} for simultaneous events.
- Every impact must use one executable type: STAT_CHANGE, REGION_TRANSFER, ENTITY_CREATE, ENTITY_REMOVE, PIN_MOVE.
- Use existing IDs and schema field keys exactly as provided in context.
- Do not modify ReadOnly or Hidden fields.
- Numeric schema fields must use finite JSON numbers.
- Optional continuity fields are encouraged: reasoningSummary, worldObservations[], futureIntentions[].
- Output raw JSON only.`;
        },

        buildAutonomyRepairContext(report) {
            return JSON.stringify({
                validationErrors: report.errors,
                entities: this.players.map(player => ({
                    id: player.id,
                    name: player.name,
                    schemaId: player.schemaId
                })),
                schemas: this.rule_sets.map(schema => ({
                    id: schema.id,
                    fields: schema.fields.map(field => ({
                        key: field.key,
                        type: field.type || 'string',
                        visibility: field.visibility || 'editable'
                    }))
                })),
                globals: this.global_vars.map(item => ({
                    key: item.key,
                    type: item.type || 'string',
                    visibility: item.visibility || 'editable'
                })),
                regions: this.getAllWorldRegions().map(region => ({
                    id: region.id,
                    name: region.name,
                    ownerId: region.ownerId
                })),
                pins: this.getAllWorldPins().map(pin => ({
                    id: pin.id,
                    label: pin.label || ''
                }))
            });
        },

        async repairAutonomyDecision(decision, report) {
            const payload = {
                provider: this.settings.api.provider,
                apiKey: this.settings.api.key,
                baseUrl: this.settings.api.baseUrl,
                model: this.settings.api.model,
                responseFormat: 'json',
                useProxy: this.settings.proxy.enabled,
                proxyPort: this.settings.proxy.port,
                systemPrompt: `You repair an autonomous simulation decision so it can execute.
Preserve the model's narrative and strategic decision. Only fix invalid references, field keys,
types, permissions, or JSON shape. Return the complete corrected raw JSON and nothing else.`,
                context: this.buildAutonomyRepairContext(report),
                history: '',
                userPrompt: `Repair this decision:\n${JSON.stringify(decision)}`
            };
            const data = await window.LevantAPI.generateAI(payload);
            return this.smartJSONParse(data.result);
        },

        applyAutonomyEventToEditor(event) {
            const normalized = JSON.parse(JSON.stringify(event));
            Object.assign(this.editor, normalized);
            this.editor.factionIds = normalized.factionIds || [normalized.factionId || 'global'];
            this.updateEditorPrimary();
            this.tabs.right = 'input';
        },

        async stageValidatedEvents(events) {
            const previousPending = JSON.stringify(this.pendingEvents);
            const previousTab = this.tabs.right;
            events.forEach(event => {
                this.pendingEvents.push(JSON.parse(JSON.stringify(event)));
            });
            this.tabs.right = 'staging';
            try {
                await this.saveGame(
                    'autosave.json',
                    { throwOnError: true }
                );
            } catch (error) {
                this.pendingEvents = JSON.parse(previousPending);
                this.tabs.right = previousTab;
                throw new Error(
                    `Staging was rolled back because autosave failed: ${error.message}`
                );
            }
        },

        async processAutonomyDecision(rawDecision) {
            const config = this.getAutonomyConfig();
            this.setAutonomyStatus('validating', this.t('autonomy_status_validating'));

            const validation = await this.validateAndRepairAutonomyDecision(rawDecision);
            const report = validation.report;

            if (!report.valid) {
                if (report.events[0]) this.applyAutonomyEventToEditor(report.events[0]);
                this.setAutonomyStatus('blocked', this.t('autonomy_status_blocked'), report);
                const error = new Error(report.errors.map(item => item.message).join('\n'));
                error.name = 'AutonomyValidationError';
                error.validationReport = report;
                throw error;
            }

            if (config.mode === 'director') {
                this.applyAutonomyEventToEditor(report.events[0]);
                if (report.events.length > 1) await this.stageValidatedEvents(report.events.slice(1));
                this.setAutonomyStatus('ready', this.t('autonomy_status_ready'), report);
                return { action: 'editor', report };
            }

            if (
                config.mode === 'guarded'
                && report.risk.score >= Number(config.guardedRiskThreshold || 4)
            ) {
                await this.stageValidatedEvents(report.events);
                this.setAutonomyStatus('staged', this.t('autonomy_status_staged'), report);
                return { action: 'staged', report };
            }

            await this.commitValidatedEvents(report.events, '', {
                mode: config.mode,
                repairAttempts: report.repairAttempts,
                warnings: report.warnings.length
            });
            this.setAutonomyStatus('committed', this.t('autonomy_status_committed'), report);
            return { action: 'committed', report };
        },

        async validateAndRepairAutonomyDecision(rawDecision) {
            const config = this.getAutonomyConfig();
            let decision = rawDecision;
            let report = this.validateAutonomyDecision(decision);
            let repairAttempts = 0;

            while (
                !report.valid
                && config.autoRepair
                && repairAttempts < Math.max(0, Number(config.maxRepairAttempts) || 0)
            ) {
                repairAttempts += 1;
                this.setAutonomyStatus('repairing', this.t('autonomy_status_repairing'), report);
                decision = await this.repairAutonomyDecision(decision, report);
                report = this.validateAutonomyDecision(decision);
            }

            report.repairAttempts = repairAttempts;
            this.autonomyState.lastReport = report;
            return { decision, report };
        },

        applyValidatedImpact(impact) {
            if (impact.type === 'STAT_CHANGE') {
                if (impact.targetId === 'global') {
                    const globalVar = this.global_vars.find(item => item.key === impact.attrKey);
                    if (globalVar) globalVar.value = impact.newValue;
                } else {
                    const player = this.players.find(item => item.id === impact.targetId);
                    if (player) player.stats[impact.attrKey] = impact.newValue;
                }
                return;
            }

            if (impact.type === 'REGION_TRANSFER') {
                const region = this.getAllWorldRegions().find(item => item.id === impact.targetId)
                    || this.getAllWorldRegions().find(item => item.name === impact.targetName);
                if (region) region.ownerId = impact.newValue;
                return;
            }

            if (impact.type === 'ENTITY_CREATE') {
                const data = impact.data;
                this.players.push({
                    id: data.id || `p${Date.now()}${Math.random().toString(16).slice(2)}`,
                    name: data.name,
                    logo: data.logo || 'fa-solid fa-question',
                    color: data.color || '#cccccc',
                    desc: data.desc || '',
                    schemaId: data.schemaId || this.rule_sets[0]?.id || '',
                    parentId: data.parentId || '',
                    stats: JSON.parse(JSON.stringify(data.stats || {})),
                    avatar: data.avatar || '',
                    avatars: Array.isArray(data.avatars) ? data.avatars : [],
                    isProtagonist: Boolean(data.isProtagonist)
                });
                return;
            }

            if (impact.type === 'ENTITY_REMOVE') {
                const index = this.players.findIndex(item => item.id === impact.targetId);
                if (index !== -1) {
                    this.players.splice(index, 1);
                    this.players.forEach(player => {
                        if (player.parentId === impact.targetId) player.parentId = '';
                    });
                    this.getAllWorldRegions().forEach(region => {
                        if (region.ownerId === impact.targetId) region.ownerId = '';
                    });
                    this.getAllWorldPins().forEach(pin => {
                        if (pin.linkId === impact.targetId) pin.linkId = '';
                    });
                }
                return;
            }

            if (impact.type === 'PIN_MOVE') {
                const pin = this.getAllWorldPins().find(item => item.id === impact.targetId);
                if (!pin) return;
                const [x, y] = String(impact.newValue).split(',').map(Number);
                pin.x = x;
                pin.y = y;
            }
        },

        async commitValidatedEvents(events, requestedRange = '', automation = {}) {
            if (!Array.isArray(events) || events.length === 0) return false;
            const rollbackState = JSON.stringify({
                rule_sets: this.rule_sets,
                lorebook: this.lorebook,
                players: this.players,
                timeline: this.timeline,
                global_vars: this.global_vars,
                currentTurnPending: this.pendingEvents,
                map_data: this.map_data
            });
            const rollbackUndoStack = [...this.undoStack];
            const rollbackRedoStack = [...this.redoStack];
            const rollbackPendingTurnRange = this.pendingTurnRange;
            this.recordSnapshot();

            try {
                const numericIds = this.timeline
                    .map(turn => parseInt(turn.id, 10))
                    .filter(Number.isFinite);
                const nextId = (
                    numericIds.length ? Math.max(...numericIds) : 0
                ) + 1;
                const timeRange = requestedRange
                    || events
                        .map(event => {
                            return `${event.timeStart} - ${event.timeEnd}`;
                        })
                        .filter(value => value !== '? - ?')
                        .join(' / ')
                    || `Turn ${nextId}`;
                const committedEvents = JSON.parse(
                    JSON.stringify(events)
                );

                committedEvents.forEach(event => {
                    event.decisionMeta = {
                        mode: automation.mode || 'manual',
                        autoValidated: true,
                        repairAttempts: automation.repairAttempts || 0,
                        warningCount: automation.warnings || 0
                    };
                    (event.impacts || []).forEach(impact => {
                        this.applyValidatedImpact(impact);
                    });
                });

                this.timeline.push({
                    id: nextId,
                    timeRange,
                    events: committedEvents
                });
                this.recalculateState();
                if (automation.clearPending) {
                    this.pendingEvents = [];
                    this.pendingTurnRange = '';
                }
                await this.saveGame(
                    'autosave.json',
                    { throwOnError: true }
                );
            } catch (error) {
                const previousState = JSON.parse(rollbackState);
                this.rule_sets = previousState.rule_sets;
                this.lorebook = previousState.lorebook;
                this.players = previousState.players;
                this.timeline = previousState.timeline;
                this.global_vars = previousState.global_vars;
                this.pendingEvents = previousState.currentTurnPending;
                this.map_data = previousState.map_data;
                this.recalculateState();
                this.dataVersion += 1;
                this.undoStack = rollbackUndoStack;
                this.redoStack = rollbackRedoStack;
                this.pendingTurnRange = rollbackPendingTurnRange;
                throw new Error(
                    `Commit was rolled back because autosave failed: ${error.message}`
                );
            }
            this.$nextTick(() => {
                const element = document.getElementById('timeline-scroll');
                if (element) element.scrollTop = element.scrollHeight;
            });
            return true;
        }
    };
})(window);
