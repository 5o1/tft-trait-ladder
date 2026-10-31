const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = { console, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'web/vendor/solver.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'web/engine.js'), 'utf8'), ctx);
const E = ctx.TraitEngine;
const taxonomy = { traits: [{ name: 'j1', category: 'job' }, { name: 'r2', category: 'race' }, { name: 'j0', category: 'job' }, { name: 'r1', category: 'race' }] };
assert.equal(E.orderTraitNames(taxonomy, ['j0', 'r1', 'j1', 'r2']).join(), 'r2,r1,j1,j0');
const data = JSON.parse(fs.readFileSync(path.join(root, 'web/data.json'), 'utf8'));
const reference = JSON.parse(fs.readFileSync(path.join(root, 'docs/value_verification.json'), 'utf8'));
let checked = 0;
function close(a, b, label) { assert.ok(Math.abs(a - b) < 1e-5, `${label}: ${a} != ${b}`); }
for (const row of reference.rows.filter(r => [3, 8].includes(r.population))) {
  const options = E.normalizeOptions(data, { emblem: row.emblem, population: row.population, timeLimit: 15000 });
  const maximum = E.solveOne(data, options);
  assert.equal(maximum.status, 'optimal', '未证明羁绊上限');
  assert.equal(maximum.count, row.reachable_max, row.emblem + ' 羁绊上限与 Python 不一致');
  const expected = row.plans.at(-1);
  const result = E.solveOne(data, options, { target: expected.traits });
  assert.equal(result.status, 'optimal', row.emblem + ' 价值未完成证明');
  assert.equal(result.count, expected.traits);
  close(result.difficulty, expected.difficulty, row.emblem + ' 难度');
  close(result.value, expected.value, row.emblem + ' 价值');
  checked++;
}
const options = E.normalizeOptions(data, { population: 10, evolutions: ['狂战士', '迅捷射手'], timeLimit: 15000 });
const fourteen = E.solveOne(data, options, { target: 14 });
assert.equal(fourteen.status, 'optimal'); assert.equal(fourteen.count, 14);
assert.ok(fourteen.board.some(u => u.name === '卡兹克'));
assert.ok(options.owned.includes('卡兹克'));
close(E.unitValues(data, options)[data.units.find(u => u.name === '卡兹克').id].difficulty, 0, '进化后卡兹克不应重复计费');
const impossible = E.solveOne(data, E.normalizeOptions(data, { population: 3 }), { target: 4 });
assert.equal(impossible.status, 'infeasible');
const lowLevelEvolution = E.solveOne(data, E.normalizeOptions(data, { population: 3, evolutions: ['裁决使'] }), { target: 3 });
assert.equal(lowLevelEvolution.status, 'optimal');
const owned = E.solveOne(data, E.normalizeOptions(data, { population: 3, owned: ['洛', '霞', '约里克'] }), { target: 2 });
close(owned.value, 100, '已拥有全部示例时的价值');
for (const names of [['卡兹克', '雷恩加尔'], ['卡兹克'], ['雷恩加尔']]) {
  const result = E.solveOne(data, E.normalizeOptions(data, { population: 1, level: 8, emblems: [], evolutionCount: 0, owned: names }), { target: 1 });
  assert.equal(result.difficulty, 0);
  assert.equal(result.lineup[0].label, '任意宿敌');
  assert.equal(result.lineup[0].candidates.map(u => u.name).sort().join(), ['卡兹克', '雷恩加尔'].sort().join());
}
const evolvedRival = E.solveOne(data, E.normalizeOptions(data, { population: 1, level: 8, emblems: [], evolutions: ['法师'], owned: ['卡兹克', '雷恩加尔'] }), { target: 1 });
assert.equal(evolvedRival.lineup[0].kind, 'unit'); assert.equal(evolvedRival.lineup[0].unit.name, '卡兹克');
const blockedRival = E.solveOne(data, E.normalizeOptions(data, { population: 1, level: 8, emblems: [], owned: ['卡兹克'], excludedUnits: ['雷恩加尔'] }), { target: 1 });
assert.equal(blockedRival.lineup[0].kind, 'unit');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'web/data.json'), 'utf8'));
fixture.units = [
  { id: 'a', name: 'a', group: 'a', cost: 1, slots: 1, traits: { 测试: 1 } },
  { id: 'b', name: 'b', group: 'b', cost: 1, slots: 1, traits: { 测试: 1 } },
  { id: 'c', name: 'c', group: 'c', cost: 1, slots: 1, traits: {} }
];
fixture.traits = [{ name: '测试', levels: [2, 4], counted: true }]; fixture.emblems = [{ name: '测试' }];
const base = E.normalizeOptions(fixture, { population: 2, emblem: null });
const one = E.solveOne(fixture, base, { target: 1 });
assert.equal(one.count, 1); assert.ok(one.board.every(u => ['a', 'b'].includes(u.id)));
const zero = E.solveOne(fixture, base, { target: 0 });
assert.equal(zero.count, 0); assert.ok(zero.board.some(u => u.id === 'c'));
assert.throws(() => E.normalizeOptions(data, { population: 0 }));
assert.throws(() => E.normalizeOptions(data, { evolutions: ['斗士'] }));

const automaticOptions = E.normalizeOptions(data, { population: 6, emblem: '花仙子', evolutionCount: 2, timeLimit: 15000 });
const automatic = E.solveOne(data, automaticOptions, { target: 8 });
const choices = [];
for (let i = 0; i < data.evolutions.length; i++) for (let j = i + 1; j < data.evolutions.length; j++) {
  const fixed = E.solveOne(data, E.normalizeOptions(data, { population: 6, emblem: '花仙子', evolutions: [data.evolutions[i], data.evolutions[j]], timeLimit: 15000 }), { target: 8 });
  if (fixed.status === 'optimal') choices.push(fixed.difficulty);
}
assert.equal(automatic.status, 'optimal'); assert.equal(automatic.selectedEvolutions.length, 2);
close(automatic.difficulty, Math.min(...choices), '次数联合优化与全部固定组合一致');
const remembered = E.solveOne(data, E.normalizeOptions(data, { population: 6, emblem: '花仙子', evolutionCount: 2, fixedEvolutions: ['法师'], timeLimit: 15000 }), { target: 8 });
assert.ok(remembered.selectedEvolutions.includes('法师')); assert.equal(remembered.selectedEvolutions.length, 2);
const excludedOptions = E.normalizeOptions(data, { population: 8, excludedUnits: ['卡兹克'] });
assert.ok(E.prepare(data, excludedOptions).every(u => u.name !== '卡兹克'));
close(E.unitValues(data, excludedOptions)['100330'].slotProbability, E.unitValues(data, E.normalizeOptions(data))['100330'].slotProbability, '禁用保留商店分母');
assert.throws(() => E.normalizeOptions(data, { evolutionCount: 1, excludedUnits: ['卡兹克'] }));

const plans = [11, 9, 10].map((count, i) => ({ count, value: [.2, 1.2, 1.1][i], board: [1] }));
assert.equal(E.sortPlans(plans).map(p => p.count).join(), '9,10,11');
assert.equal(E.sortPlans(plans, 'traits').map(p => p.count).join(), '11,10,9');
assert.equal(plans.map(p => p.count).join(), '11,9,10');
const boundary = E.fitValueBoundary(plans);
assert.equal(boundary.lowerCount, 1); assert.ok(boundary.threshold > .2 && boundary.threshold < 1.1);
close(E.fitValueBoundary(plans.map(p => ({ ...p, value: p.value * 7 }))).threshold, boundary.threshold * 7, '对数分界的缩放不变性');
assert.equal(E.fitValueBoundary(plans.slice(0, 1)).threshold, null);
assert.equal(E.fitValueBoundary(plans.map(p => ({ ...p, value: 1 }))).threshold, null);
close(E.lossBoundary(data.lossReference).threshold, data.lossReference.boundary.threshold, '统一分界');

const slots = { ...data, traits: [{ name: 'a', levels: [2, 4], counted: true }, { name: 'b', levels: [2, 4], counted: true }, { name: 'unused', levels: [3, 5], counted: true }], units: [
  { id: 'core', name: 'core', group: 'core', cost: 1, slots: 1, traits: { a: 1, b: 1 } },
  { id: 'a1', name: 'a1', group: 'a1', cost: 2, slots: 1, traits: { a: 1, unused: 1 } },
  { id: 'b1', name: 'b1', group: 'b1', cost: 2, slots: 1, traits: { b: 1, unused: 1 } },
  { id: 'a2', name: 'a2', group: 'a2', cost: 1, slots: 1, traits: { a: 1 } },
  { id: 'b2', name: 'b2', group: 'b2', cost: 2, slots: 1, traits: { b: 1 } },
  { id: 'costly', name: 'costly', group: 'costly', cost: 3, slots: 1, traits: { a: 1 } }
] };
const slotOptions = { population: 3, level: 8, emblem: null, owned: ['core', 'a1', 'b1'] };
const described = E.solveOne(slots, E.normalizeOptions(slots, slotOptions), { target: 2 });
assert.equal(described.lineup.find(s => s.unit.name === 'core').kind, 'unit');
assert.equal(described.lineup.find(s => s.unit.name === 'a1').candidates.map(c => c.name).sort().join(), 'a1,a2');
const noAlternative = E.solveOne(slots, E.normalizeOptions(slots, { ...slotOptions, excludedUnits: ['a2'] }), { target: 2 });
assert.equal(noAlternative.lineup.find(s => s.unit.name === 'a1').kind, 'unit');
const multiple = { ...slots, emblems: [{ name: 'a' }, { name: 'b' }] };
for (const emblems of [[], ['a'], ['a', 'b'], ['a', 'a', 'b']]) {
  const expected = { a: 1 + emblems.filter(n => n === 'a').length, b: 1 + emblems.filter(n => n === 'b').length };
  const count = Object.values(expected).filter(n => n >= 2).length;
  const result = E.solveOne(multiple, E.normalizeOptions(multiple, { population: 1, level: 8, emblems, owned: ['core'] }), { target: count });
  assert.equal(result.status, 'optimal'); assert.equal(result.count, count); assert.equal(result.value, 100);
  assert.equal(result.counts.a, expected.a); assert.equal(result.counts.b, expected.b);
}
for (let crowns = 0; crowns <= 3; crowns++) {
  const o = E.normalizeOptions(data, { population: 8 + crowns, crowns });
  assert.equal(o.level, 8);
  close(E.unitValues(data, o)['100330'].slotProbability, E.unitValues(data, E.normalizeOptions(data, { population: 8 }))['100330'].slotProbability, '冠冕保持商店概率');
}
console.log(`网页引擎回归通过：${checked} 组 Python 对照、转职组合计数、冠冕商店概率、进化联合优化、双排序、分界和方案外替换。`);

const orderedFixture = { ...data, emblems: [], traits: [{ name: 'a', levels: [2, 4], counted: true }],
  units: Array.from({ length: 20 }, (_, i) => ({ id: 'u' + String(i).padStart(2, '0'), name: 'unit' + String(i).padStart(2, '0'), group: String(i), cost: 1, slots: 1, traits: {} })) };
for (const owned of [[], ['unit03', 'unit17']]) for (const units of [orderedFixture.units, [...orderedFixture.units].reverse()]) {
  const fixture = { ...orderedFixture, units };
  const result = E.solveOne(fixture, E.normalizeOptions(fixture, { population: 2, level: 3, emblems: [], owned, inherited: units.map(u => u.name) }), { target: 0 });
  assert.equal(result.status, 'optimal');
  assert.equal(result.board.map(u => u.id).sort().join(), owned.length ? 'u03,u17' : 'u00,u01');
}

async function verifyMatrix() {
  const jobs = ['裁决使', '迅捷射手', '狂战士', '法师'];
  const fixture = { ...data, emblems: [], traits: [...['a', 'b', ...jobs].map(name => ({ name, levels: [2, 4], counted: true })), { name: '宿敌', levels: [1, 2], counted: true }], units: [
    { id: 'a', name: 'a', group: 'a', cost: 1, slots: 1, traits: { a: 1, 法师: 1 } },
    { id: 'b', name: 'b', group: 'b', cost: 1, slots: 1, traits: { b: 1, 迅捷射手: 1 } },
    { id: 'c', name: 'c', group: 'c', cost: 2, slots: 1, traits: { a: 1, 狂战士: 1 } },
    { id: 'd', name: 'd', group: 'd', cost: 2, slots: 1, traits: { b: 1, 裁决使: 1 } },
    { id: 'k', name: '卡兹克', group: '卡兹克', cost: 3, slots: 1, traits: { 宿敌: 1 } },
    { id: 'x', name: 'x', group: 'x', cost: 3, slots: 1, traits: { a: 1, b: 1 } }
  ] };
  const cache = new Map(), raw = { emblems: [], population: 4, level: 3, crowns: 1, evolutionCount: 1, fixedEvolutions: ['法师'], owned: ['a'] };
  const before = await E.rank(fixture, raw, () => {}, cache);
  const cells = cache.values().next().value;
  assert.equal(cells.size, 12);
  for (const cell of cells.values()) {
    const inherited = new Set(cell.predecessors.flatMap(p => [...cells.get(p.join(',')).acquiredUnits]));
    assert.equal([...inherited].sort().join(), [...cell.inheritedUnits].sort().join());
    const acquired = new Set([...inherited, ...cell.plans.flatMap(p => p.board.map(u => u.name))]);
    assert.equal([...acquired].sort().join(), [...cell.acquiredUnits].sort().join());
    for (const plan of cell.plans) {
      const values = E.unitValues(fixture, cell.options);
      const expected = plan.board.reduce((sum, u) => sum + values[u.id].difficulty, 0);
      close(plan.difficulty, expected, '继承状态成本重算'); close(plan.loss, 1 / plan.value, '损失倒数');
      assert.ok(plan.board.filter(u => inherited.has(u.name)).every(u => values[u.id].difficulty === 0));
    }
    if (!cell.evolutionCount) assert.ok(!inherited.has('卡兹克'));
  }
  let visits = 0;
  await E.rank(fixture, { ...raw, population: 2, level: 2, crowns: 0 }, p => { if (p.phase === 'state') visits++; }, cache);
  assert.equal(visits, 0);
  const plan = E.sortPlans(before.plans)[0], added = plan.board.find(u => !['a', '卡兹克'].includes(u.name)).name;
  const after = await E.rank(fixture, { ...raw, owned: ['a', added], memory: before.memory }, () => {}, cache);
  assert.ok([...before.inheritedUnits].every(n => after.inheritedUnits.includes(n)));
  const same = after.plans.find(p => p.count === plan.count);
  assert.ok(same.ownedUsed >= plan.ownedUsed + 1);
  const restored = await E.rank(fixture, { ...raw, owned: ['a', added], memory: JSON.parse(JSON.stringify(after.memory)) });
  assert.ok([...after.inheritedUnits].every(n => restored.inheritedUnits.includes(n)));
  const removed = await E.rank(fixture, { ...raw, memory: JSON.parse(JSON.stringify(after.memory)) });
  assert.ok([...after.inheritedUnits].filter(n => n !== added).every(n => removed.inheritedUnits.includes(n)));
  for (const name of ['拉克丝 (地狱火)', '卡兹克']) {
    const request = { population: 3, level: 3, crowns: 0, evolutionCount: 0, emblems: ['主宰'], owned: [name] };
    const cache = new Map();
    const before = await E.rank(data, request, () => {}, cache);
    const group = data.units.find(u => u.name === name).group;
    const sameHero = data.units.filter(u => u.group === group).map(u => u.name);
    const warm = await E.rank(data, { ...request, owned: [], memory: before.memory }, () => {}, cache);
    const legacy = JSON.parse(JSON.stringify(before.memory)); legacy.owned = [];
    const cold = await E.rank(data, { ...request, owned: [], memory: legacy });
    for (const row of [warm, cold]) {
      assert.ok(!row.inheritedUnits.some(n => sameHero.includes(n)));
      assert.ok(before.inheritedUnits.filter(n => !sameHero.includes(n)).every(n => row.inheritedUnits.includes(n)));
      assert.ok(row.plans.every(p => p.board.every(u => !sameHero.includes(u.name))));
      assert.equal(E.unitValues(data, row.options)[data.units.find(u => u.name === name).id].difficulty, Infinity);
    }
  }
  const rootRequest = { population: 1, level: 1, crowns: 0, evolutionCount: 0, emblems: ['主宰'], owned: [] };
  const rootBefore = await E.rank(data, rootRequest);
  const legacyMemory = JSON.parse(JSON.stringify(rootBefore.memory));
  legacyMemory.states.push({ state: [10, 0, 0], cards: ['拉克丝', '洛'] });
  const cleaned = await E.rank(data, { ...rootRequest, memory: legacyMemory });
  const futureRecord = cleaned.memory.states.find(row => row.state.join() === '10,0,0');
  assert.equal(futureRecord.cards.join(), '洛');
  const rejected = await E.rank(fixture, { ...raw, excludedUnits: [added], memory: after.memory });
  assert.ok(!rejected.inheritedUnits.includes(added));
  const b = E.fitLossBoundary(plans);
  close(b.threshold, 1 / E.fitValueBoundary(plans).threshold, '损失分界转换');
  console.log('三维矩阵验证通过：12 个状态、前置卡池并集、零成本继承、因果方向和缓存复用。');
}
verifyMatrix().catch(error => { console.error(error); process.exitCode = 1; });
