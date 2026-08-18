const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(
    fs.readFileSync('www/vendor/js/jsep.iife.min.js', 'utf8'),
    context
);
context.window.jsep = context.jsep;
vm.runInContext(
    fs.readFileSync('www/js/formula-engine.js', 'utf8'),
    context
);

const engine = context.window.LevantFormulaEngine;
const formulaContext = {
    globals: { bonus: 3 },
    turn: 2,
    utils: {
        sumAllRegionStat: () => 5
    }
};
const result = engine.evaluate(
    "self.stats['base'] > 2 && turn === 2"
        + " ? Math.max(self.stats['base'], 4)"
        + " + ctx.utils.sumAllRegionStat('income')"
        + " + globals['bonus']"
        + " : 0",
    {
        self: { stats: { base: 4 } },
        ctx: formulaContext
    }
);
assert.equal(result, 12);

context.window.__formulaPwned = false;
const blocked = [
    "fetch('https://attacker.example')",
    'globalThis.__formulaPwned = true',
    "self.constructor.constructor('return globalThis')()"
].map(source => {
    return engine.validate(source, {
        self: {},
        ctx: formulaContext
    }).valid;
});
assert.deepEqual(blocked, [false, false, false]);
assert.equal(context.window.__formulaPwned, false);

console.log(JSON.stringify({
    status: 'ok',
    result,
    blocked
}));
