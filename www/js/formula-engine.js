(function () {
    'use strict';

    const MAX_SOURCE_LENGTH = 1000;
    const MAX_AST_NODES = 250;
    const MAX_AST_DEPTH = 40;
    const FORBIDDEN_PROPERTIES = new Set([
        '__proto__',
        'prototype',
        'constructor'
    ]);
    const ALLOWED_IDENTIFIERS = new Set([
        'self',
        'ctx',
        'globals',
        'players',
        'map',
        'turn',
        'utils',
        'Math'
    ]);
    const ALLOWED_UNARY_OPERATORS = new Set(['+', '-', '!', '~']);
    const ALLOWED_BINARY_OPERATORS = new Set([
        '+', '-', '*', '/', '%', '**',
        '<', '<=', '>', '>=',
        '==', '!=', '===', '!==',
        '|', '&', '^', '<<', '>>', '>>>'
    ]);
    const ALLOWED_LOGICAL_OPERATORS = new Set(['&&', '||', '??']);
    const MATH_FUNCTIONS = Object.freeze({
        abs: Math.abs,
        acos: Math.acos,
        asin: Math.asin,
        atan: Math.atan,
        atan2: Math.atan2,
        cbrt: Math.cbrt,
        ceil: Math.ceil,
        cos: Math.cos,
        exp: Math.exp,
        floor: Math.floor,
        hypot: Math.hypot,
        log: Math.log,
        log10: Math.log10,
        log2: Math.log2,
        max: Math.max,
        min: Math.min,
        pow: Math.pow,
        random: Math.random,
        round: Math.round,
        sign: Math.sign,
        sin: Math.sin,
        sqrt: Math.sqrt,
        tan: Math.tan,
        trunc: Math.trunc
    });
    const MATH_VALUES = Object.freeze({
        E: Math.E,
        LN2: Math.LN2,
        LN10: Math.LN10,
        LOG2E: Math.LOG2E,
        LOG10E: Math.LOG10E,
        PI: Math.PI,
        SQRT1_2: Math.SQRT1_2,
        SQRT2: Math.SQRT2,
        ...MATH_FUNCTIONS
    });
    const ROOT_FUNCTIONS = Object.freeze({
        parseFloat: value => Number.parseFloat(value),
        parseInt: (value, radix) => Number.parseInt(value, radix),
        Number: value => Number(value),
        Boolean: value => Boolean(value),
        isFinite: value => Number.isFinite(Number(value)),
        isNaN: value => Number.isNaN(Number(value))
    });
    const ALLOWED_HELPERS = new Set([
        'getPlayerStat',
        'getOwnedRegionCount',
        'sumAllRegionStat',
        'sumRegionStat'
    ]);

    class FormulaError extends Error {
        constructor(message) {
            super(message);
            this.name = 'FormulaError';
        }
    }

    function assertParser() {
        if (typeof window.jsep !== 'function') {
            throw new FormulaError('Formula parser is unavailable.');
        }
    }

    function parse(source) {
        assertParser();
        const normalized = String(source || '').trim();
        if (!normalized) {
            throw new FormulaError('Formula is empty.');
        }
        if (normalized.length > MAX_SOURCE_LENGTH) {
            throw new FormulaError(
                `Formula exceeds ${MAX_SOURCE_LENGTH} characters.`
            );
        }
        return window.jsep(normalized);
    }

    function staticMemberProperty(node) {
        if (!node.computed && node.property.type === 'Identifier') {
            return node.property.name;
        }
        if (
            node.computed
            && node.property.type === 'Literal'
            && ['string', 'number'].includes(typeof node.property.value)
        ) {
            return String(node.property.value);
        }
        return null;
    }

    function staticPath(node) {
        if (node.type === 'Identifier') {
            return node.name;
        }
        if (node.type !== 'MemberExpression') {
            return '';
        }
        const parent = staticPath(node.object);
        const property = staticMemberProperty(node);
        if (!parent || property === null) {
            return '';
        }
        return `${parent}.${property}`;
    }

    function assertSafeProperty(property) {
        const key = String(property);
        if (FORBIDDEN_PROPERTIES.has(key)) {
            throw new FormulaError(`Property "${key}" is not allowed.`);
        }
        return key;
    }

    function assertAllowedCall(node) {
        const path = staticPath(node.callee);
        if (Object.hasOwn(ROOT_FUNCTIONS, path)) {
            return;
        }
        if (
            path.startsWith('Math.')
            && Object.hasOwn(MATH_FUNCTIONS, path.slice(5))
        ) {
            return;
        }
        for (const prefix of ['utils.', 'ctx.utils.']) {
            if (
                path.startsWith(prefix)
                && ALLOWED_HELPERS.has(path.slice(prefix.length))
            ) {
                return;
            }
        }
        throw new FormulaError(
            `Function call "${path || 'dynamic'}" is not allowed.`
        );
    }

    function inspectAst(node, state, depth) {
        if (!node || typeof node !== 'object') {
            throw new FormulaError('Invalid formula node.');
        }
        state.nodes += 1;
        if (state.nodes > MAX_AST_NODES) {
            throw new FormulaError('Formula is too complex.');
        }
        if (depth > MAX_AST_DEPTH) {
            throw new FormulaError('Formula is nested too deeply.');
        }

        switch (node.type) {
            case 'Literal':
                if (
                    node.value !== null
                    && !['number', 'string', 'boolean'].includes(
                        typeof node.value
                    )
                ) {
                    throw new FormulaError('Literal type is not allowed.');
                }
                return;
            case 'Identifier':
                if (
                    !ALLOWED_IDENTIFIERS.has(node.name)
                    && !Object.hasOwn(ROOT_FUNCTIONS, node.name)
                ) {
                    throw new FormulaError(
                        `Identifier "${node.name}" is not allowed.`
                    );
                }
                return;
            case 'UnaryExpression':
                if (!ALLOWED_UNARY_OPERATORS.has(node.operator)) {
                    throw new FormulaError(
                        `Unary operator "${node.operator}" is not allowed.`
                    );
                }
                inspectAst(node.argument, state, depth + 1);
                return;
            case 'BinaryExpression':
                if (
                    !ALLOWED_BINARY_OPERATORS.has(node.operator)
                    && !ALLOWED_LOGICAL_OPERATORS.has(node.operator)
                ) {
                    throw new FormulaError(
                        `Operator "${node.operator}" is not allowed.`
                    );
                }
                inspectAst(node.left, state, depth + 1);
                inspectAst(node.right, state, depth + 1);
                return;
            case 'LogicalExpression':
                if (!ALLOWED_LOGICAL_OPERATORS.has(node.operator)) {
                    throw new FormulaError(
                        `Operator "${node.operator}" is not allowed.`
                    );
                }
                inspectAst(node.left, state, depth + 1);
                inspectAst(node.right, state, depth + 1);
                return;
            case 'ConditionalExpression':
                inspectAst(node.test, state, depth + 1);
                inspectAst(node.consequent, state, depth + 1);
                inspectAst(node.alternate, state, depth + 1);
                return;
            case 'MemberExpression': {
                const property = staticMemberProperty(node);
                if (property !== null) {
                    assertSafeProperty(property);
                }
                inspectAst(node.object, state, depth + 1);
                if (node.computed) {
                    inspectAst(node.property, state, depth + 1);
                }
                return;
            }
            case 'CallExpression':
                assertAllowedCall(node);
                inspectAst(node.callee, state, depth + 1);
                node.arguments.forEach(argument => {
                    inspectAst(argument, state, depth + 1);
                });
                return;
            default:
                throw new FormulaError(
                    `Expression type "${node.type}" is not allowed.`
                );
        }
    }

    function buildScope(input) {
        const ctx = input?.ctx || {};
        return {
            self: input?.self || null,
            ctx,
            globals: ctx.globals || {},
            players: ctx.players || [],
            map: ctx.map || {},
            turn: ctx.turn ?? 0,
            utils: ctx.utils || {},
            Math: MATH_VALUES
        };
    }

    function readMember(node, scope) {
        const object = evaluateNode(node.object, scope);
        if (object === null || object === undefined) {
            throw new FormulaError('Cannot read a property of an empty value.');
        }
        const property = node.computed
            ? evaluateNode(node.property, scope)
            : node.property.name;
        const key = assertSafeProperty(property);
        const target = Object(object);
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
            return undefined;
        }
        return target[key];
    }

    function callFunction(node, scope) {
        const path = staticPath(node.callee);
        const args = node.arguments.map(argument => {
            return evaluateNode(argument, scope);
        });

        if (Object.hasOwn(ROOT_FUNCTIONS, path)) {
            return ROOT_FUNCTIONS[path](...args);
        }
        if (path.startsWith('Math.')) {
            return MATH_FUNCTIONS[path.slice(5)](...args);
        }

        const helperName = path.startsWith('ctx.utils.')
            ? path.slice('ctx.utils.'.length)
            : path.slice('utils.'.length);
        const helper = scope.utils[helperName];
        if (
            !ALLOWED_HELPERS.has(helperName)
            || typeof helper !== 'function'
        ) {
            throw new FormulaError(
                `Formula helper "${helperName}" is unavailable.`
            );
        }
        return helper(...args);
    }

    function evaluateBinary(operator, left, right) {
        switch (operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            case '%': return left % right;
            case '**': return left ** right;
            case '<': return left < right;
            case '<=': return left <= right;
            case '>': return left > right;
            case '>=': return left >= right;
            case '==': return left == right; // Formula language compatibility.
            case '!=': return left != right; // Formula language compatibility.
            case '===': return left === right;
            case '!==': return left !== right;
            case '|': return left | right;
            case '&': return left & right;
            case '^': return left ^ right;
            case '<<': return left << right;
            case '>>': return left >> right;
            case '>>>': return left >>> right;
            default:
                throw new FormulaError(
                    `Operator "${operator}" is not allowed.`
                );
        }
    }

    function evaluateNode(node, scope) {
        switch (node.type) {
            case 'Literal':
                return node.value;
            case 'Identifier':
                if (Object.prototype.hasOwnProperty.call(scope, node.name)) {
                    return scope[node.name];
                }
                if (Object.hasOwn(ROOT_FUNCTIONS, node.name)) {
                    return ROOT_FUNCTIONS[node.name];
                }
                throw new FormulaError(
                    `Identifier "${node.name}" is unavailable.`
                );
            case 'UnaryExpression': {
                const value = evaluateNode(node.argument, scope);
                switch (node.operator) {
                    case '+': return +value;
                    case '-': return -value;
                    case '!': return !value;
                    case '~': return ~value;
                    default:
                        throw new FormulaError(
                            `Unary operator "${node.operator}" is not allowed.`
                        );
                }
            }
            case 'BinaryExpression': {
                if (ALLOWED_LOGICAL_OPERATORS.has(node.operator)) {
                    const left = evaluateNode(node.left, scope);
                    if (node.operator === '&&') {
                        return left && evaluateNode(node.right, scope);
                    }
                    if (node.operator === '||') {
                        return left || evaluateNode(node.right, scope);
                    }
                    return left ?? evaluateNode(node.right, scope);
                }
                return evaluateBinary(
                    node.operator,
                    evaluateNode(node.left, scope),
                    evaluateNode(node.right, scope)
                );
            }
            case 'LogicalExpression': {
                const left = evaluateNode(node.left, scope);
                if (node.operator === '&&') {
                    return left && evaluateNode(node.right, scope);
                }
                if (node.operator === '||') {
                    return left || evaluateNode(node.right, scope);
                }
                return left ?? evaluateNode(node.right, scope);
            }
            case 'ConditionalExpression':
                return evaluateNode(node.test, scope)
                    ? evaluateNode(node.consequent, scope)
                    : evaluateNode(node.alternate, scope);
            case 'MemberExpression':
                return readMember(node, scope);
            case 'CallExpression':
                return callFunction(node, scope);
            default:
                throw new FormulaError(
                    `Expression type "${node.type}" is not allowed.`
                );
        }
    }

    function evaluate(source, input = {}) {
        const ast = parse(source);
        inspectAst(ast, { nodes: 0 }, 0);
        return evaluateNode(ast, buildScope(input));
    }

    function validate(source, input = {}) {
        try {
            return {
                valid: true,
                msg: '',
                value: evaluate(source, input)
            };
        } catch (error) {
            return {
                valid: false,
                msg: error instanceof Error
                    ? error.message
                    : 'Invalid formula.'
            };
        }
    }

    window.LevantFormulaEngine = Object.freeze({
        evaluate,
        validate
    });
})();
