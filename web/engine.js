(function (root) {
  'use strict';
  const unique = xs => [...new Set(xs)];
  const groupOf = u => u.group;
  function orderTraitNames(data, names) {
    const order = new Map(data.traits.map((t, i) => [t.name, { group: t.category === 'job' ? 1 : 0, index: i }]));
    return [...names].sort((a, b) => {
      const first = order.get(a), second = order.get(b);
      return (first?.group ?? 2) - (second?.group ?? 2) || (first?.index ?? data.traits.length) - (second?.index ?? data.traits.length) || (a < b ? -1 : a > b ? 1 : 0);
    });
  }
  function emblemList(data, value) {
    const names = value == null ? [] : typeof value === 'string' ? [value] : value;
    if (!Array.isArray(names) || names.some(n => typeof n !== 'string' || !data.emblems.some(e => e.name === n))) throw Error('请选择有效的转职。');
    return [...names];
  }
  function normalizeOptions(data, raw = {}) {
    const o = { emblem: '裁决使', population: 8, level: null, evolutions: [], fixedEvolutions: [], excludedUnits: [], owned: [], inherited: [], taken: {}, lux: 'auto', minimumTraits: 2, timeLimit: 8000, ...raw };
    delete o.memory;
    o.selections = normalizeSelections(raw.selections);
    o.crowns = raw.crowns ?? 0;
    if (!Number.isInteger(o.crowns) || o.crowns < 0 || o.crowns > 3) throw Error('冠冕数量应为 0–3。');
    o.population = Number(o.population); o.level = Number(o.level || Math.min(o.population - o.crowns, 10));
    o.evolutions = unique(raw.fixedEvolutions ?? raw.evolutions ?? []);
    o.fixedEvolutions = o.evolutions;
    o.evolutionCount = raw.evolutionCount ?? o.evolutions.length;
    o.owned = unique(o.owned); o.inherited = unique(o.inherited); o.excludedUnits = unique(o.excludedUnits);
    o.emblems = emblemList(data, raw.emblems ?? o.emblem);
    o.emblem = o.emblems.length === 1 ? o.emblems[0] : null;
    if (!Number.isInteger(o.population) || o.population < 1 || o.population > 20) throw Error('人口应为 1–20。');
    if (!data.shop.odds_by_level[o.level]) throw Error('请选择有效的商店等级。');
    if (!Number.isInteger(o.minimumTraits) || o.minimumTraits < 0 || o.minimumTraits > Math.max(2, data.traits.filter(t => t.counted).length)) throw Error('请选择有效的起始羁绊数。');
    if (o.evolutions.some(e => !data.evolutions.includes(e))) throw Error('螳螂进化选项无效。');
    if (!Number.isInteger(o.evolutionCount) || o.evolutionCount < o.evolutions.length || o.evolutionCount > 4) throw Error('进化次数与本局记录冲突。');
    if (o.evolutionCount) o.owned = unique([...o.owned, '卡兹克']);
    const known = new Set(data.units.map(u => u.name));
    if (o.excludedUnits.some(n => !known.has(n))) throw Error('禁用列表中包含未知弈子。');
    if (o.evolutionCount && o.excludedUnits.includes('卡兹克')) throw Error('卡兹克的进化与禁用条件冲突。');
    if (o.owned.some(n => !known.has(n))) throw Error('已持有的弈子名称无效。');
    if (o.inherited.some(n => !known.has(n))) throw Error('继承卡池中包含未知弈子。');
    const forms = o.owned.filter(n => data.units.find(u => u.name === n).group === '拉克丝');
    if (forms.length > 1) throw Error('拉克丝只能拥有一种形态。');
    return o;
  }
  function unitValues(data, o) {
    const groups = new Map(data.units.map(u => [u.group, u.cost]));
    const ownedGroups = new Set(data.units.filter(u => o.owned.includes(u.name)).map(groupOf));
    for (const key of Object.keys(o.taken)) if (!groups.has(key)) throw Error('卡池中存在未知弈子：' + key);
    const remain = {}, totals = [0, 0, 0, 0, 0, 0];
    for (const [g, c] of groups) {
      const taken = Number(o.taken[g] || 0);
      if (!Number.isInteger(taken) || taken < 0) throw Error('离池张数必须为非负整数。');
      remain[g] = data.shop.copies_per_unit[c] - taken - Number(ownedGroups.has(g));
      if (remain[g] < 0) throw Error(g + ' 的离池张数超过卡池总量。');
      totals[c] += remain[g];
    }
    const forms = data.units.filter(u => u.group === '拉克丝' && Object.keys(u.traits).length > 1);
    const ownedLux = forms.find(u => o.owned.includes(u.name));
    const values = {};
    for (const u of data.units) {
      let p = totals[u.cost] ? data.shop.odds_by_level[o.level][u.cost - 1] * remain[u.group] / totals[u.cost] : 0;
      if (u.group === '拉克丝') p *= ownedLux ? Number(u.id === ownedLux.id) : (forms.some(f => f.id === u.id) ? 1 / forms.length : 0);
      const q = p === 1 ? 1 : -Math.expm1(data.shop.slots_per_shop * Math.log1p(-p));
      const owned = o.owned.includes(u.name) || (u.group === '拉克丝' && o.owned.includes('拉克丝'));
      const inherited = o.inherited.includes(u.name);
      const lockedForm = u.group === '拉克丝' && ownedLux && u.id !== ownedLux.id;
      values[u.id] = { slotProbability: p, shopProbability: q, difficulty: lockedForm ? Infinity : (owned || inherited ? 0 : (q ? 1 / q : Infinity)), owned, inherited };
    }
    return values;
  }
  function prepare(data, o) {
    const hasLuxForms = data.units.some(u => u.group === '拉克丝' && Object.keys(u.traits).length > 1);
    return data.units.filter(u => !o.excludedUnits.includes(u.name) && !o.excludedUnits.includes(u.group) && (u.group !== '拉克丝' || ((!hasLuxForms || Object.keys(u.traits).length > 1) && o.lux !== 'none' && (o.lux === 'auto' || u.traits[o.lux]))))
      .map(u => u.name === '卡兹克' ? { ...u, traits: { ...u.traits, ...Object.fromEntries(o.evolutions.map(t => [t, 1])) } } : u);
  }
  function evaluate(data, board, emblem) {
    const groups = board.map(groupOf);
    if (unique(groups).length !== groups.length) throw Error('结果包含重复弈子或多种拉克丝。');
    const counts = {};
    for (const u of board) for (const [t, n] of Object.entries(u.traits)) counts[t] = (counts[t] || 0) + n;
    for (const name of emblemList(data, emblem)) counts[name] = (counts[name] || 0) + 1;
    if (counts['日蚀骑士'] >= 3 && counts['月蚀骑士'] >= 3) counts['日月双蚀'] = 1;
    const active = [], uncounted = [];
    const traits = new Map(data.traits.map(t => [t.name, t]));
    for (const name of orderTraitNames(data, data.traits.map(t => t.name))) {
      const t = traits.get(name);
      const count = counts[t.name] || 0;
      if (count > 0 && count >= Math.min(...t.levels)) {
        const entry = { name: t.name, count, tier: Math.max(...t.levels.filter(v => v <= count)) };
        (t.counted ? active : uncounted).push(entry);
      }
    }
    return { active, uncounted, counts };
  }
  function modelFor(data, units, o, values, target, theoretical) {
    const scored = data.traits.filter(t => t.counted);
    const weighted = target !== null;
    const automatic = o.evolutionCount > o.evolutions.length ? data.evolutions.filter(t => !o.evolutions.includes(t)) : [];
    const model = { optimize: 'objective', opType: weighted ? 'min' : 'max', constraints: { population: { equal: o.population } }, variables: {}, binaries: {}, options: { time_limit: o.timeLimit / 1000, mip_rel_gap: 0, mip_abs_gap: 0, output_flag: false } };
    const groups = new Map();
    units.forEach((u, i) => {
      const key = 'x' + i, v = { objective: weighted ? (Number.isFinite(values[u.id].difficulty) ? values[u.id].difficulty : 0) : 0, population: u.slots };
      model.variables[key] = v; model.binaries[key] = 1;
      if (!groups.has(u.group)) groups.set(u.group, []);
      groups.get(u.group).push(key);
      if (!theoretical && !Number.isFinite(values[u.id].difficulty)) { model.constraints['ban' + i] = { equal: 0 }; v['ban' + i] = 1; }
      if (['卡兹克', '雷恩加尔'].includes(u.name)) { model.constraints.rivals = { max: 1 }; v.rivals = 1; }
      if (o.evolutionCount && u.name === '卡兹克') { model.constraints.kha = { equal: 1 }; v.kha = 1; }
    });
    if (o.evolutionCount && !units.some(u => u.name === '卡兹克')) throw Error('当前条件与卡兹克进化冲突。');
    if (automatic.length) {
      model.constraints.evolutionCount = { equal: o.evolutionCount - o.evolutions.length };
      automatic.forEach((t, i) => { model.variables['evo' + i] = { objective: 0, evolutionCount: 1 }; model.binaries['evo' + i] = 1; });
    }
    let g = 0;
    for (const members of groups.values()) if (members.length > 1) { const c = 'group' + g++; model.constraints[c] = { max: 1 }; members.forEach(k => model.variables[k][c] = 1); }
    scored.forEach((t, j) => {
      const lo = 'lo' + j, hi = 'hi' + j, y = 'y' + j, threshold = Math.min(...t.levels), bonus = o.emblems.filter(n => n === t.name).length;
      const bigM = Math.max(threshold, units.reduce((s, u) => s + (u.traits[t.name] || 0), bonus) + Number(automatic.includes(t.name)));
      model.constraints[lo] = { min: -bonus }; model.constraints[hi] = { max: threshold - 1 - bonus };
      units.forEach((u, i) => { const n = u.traits[t.name] || 0; if (n) { model.variables['x' + i][lo] = n; model.variables['x' + i][hi] = n; } });
      automatic.forEach((name, i) => { if (name === t.name) { model.variables['evo' + i][lo] = 1; model.variables['evo' + i][hi] = 1; } });
      model.variables[y] = { objective: weighted ? 0 : 1, [lo]: -threshold, [hi]: -bigM };
      model.binaries[y] = 1;
      if (weighted) model.variables[y].traitCount = 1;
    });
    if (weighted) model.constraints.traitCount = { equal: target };
    return model;
  }
  function solveModel(model) {
    const keys = Object.keys(model.variables);
    const expression = field => keys.filter(k => model.variables[k][field]).map(k => {
      const value = model.variables[k][field];
      return `${value < 0 ? '-' : '+'} ${Math.abs(value)} ${k}`;
    }).join(' ') || `0 ${keys[0]}`;
    const rows = [];
    for (const [name, bounds] of Object.entries(model.constraints)) {
      for (const [bound, sign] of [['equal', '='], ['min', '>='], ['max', '<=']]) {
        if (bounds[bound] !== undefined) rows.push(` ${name}_${bound}: ${expression(name)} ${sign} ${bounds[bound]}`);
      }
    }
    const lp = [model.opType === 'min' ? 'Minimize' : 'Maximize', ` obj: ${expression(model.optimize)}`,
      'Subject To', ...rows, 'Binary', ...Object.keys(model.binaries).map(k => ' ' + k), 'End'].join('\n');
    return root.highs.withModel({ format: 'lp', data: lp }, native => {
      native.options.set(model.options);
      native.run();
      const status = native.getModelStatus(), codes = root.highs.constants.modelStatus;
      if (![codes.optimal, codes.infeasible, codes.timeLimit].includes(status)) throw Error('HiGHS: ' + status);
      const feasible = native.info.get('primal_solution_status') === root.highs.constants.solutionStatus.feasible;
      const values = feasible ? native.getSolution().colValue : null;
      const solution = feasible ? Object.fromEntries(keys.map(key => [key, values[native.getColByName(key)]])) : {};
      return { optimal: status === codes.optimal, infeasible: status === codes.infeasible,
        feasible, solution, evaluation: native.getObjectiveValue() };
    });
  }
  function solveOne(data, o, { target = null, theoretical = false } = {}) {
    const candidatePool = prepare(data, o);
    let units = candidatePool;
    const values = unitValues(data, o);
    const kha = units.find(u => u.name === '卡兹克'), rengar = units.find(u => u.name === '雷恩加尔');
    if (kha && rengar) {
      const sameRole = kha.slots === rengar.slots && Object.keys(kha.traits).length === Object.keys(rengar.traits).length && Object.entries(rengar.traits).every(([t, n]) => kha.traits[t] === n);
      if (o.evolutionCount || (sameRole && values[kha.id].difficulty < values[rengar.id].difficulty)) units = units.filter(u => u.name !== '雷恩加尔');
    }
    const model = modelFor(data, units, o, values, target, theoretical);
    const start = performance.now();
    let answer = solveModel(model);
    const proof = answer.optimal;
    const primaryEvaluation = answer.evaluation;
    let ownedPreferenceStatus = 'optimal';
    let canonicalStatus = 'optimal';
    if (target !== null && !theoretical && proof && answer.feasible) {
      const initial = answer.solution;
      const optimum = units.reduce((sum, u, i) => sum + (initial['x' + i] > .5 ? values[u.id].difficulty : 0), 0);
      const secondaryUnits = units.filter(u => values[u.id].difficulty <= optimum).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const automatic = o.evolutionCount > o.evolutions.length ? data.evolutions.filter(t => !o.evolutions.includes(t)) : [];
      // 按弈子编号和职业目录逐位排序，每段使用 16 位整数权重。
      const keys = [...secondaryUnits.map((_, i) => 'x' + i), ...orderTraitNames(data, automatic).map(name => 'evo' + automatic.indexOf(name))];
      const fixed = new Map();
      let heldCount;
      for (let offset = 0; offset < keys.length; offset += 16) {
        const remaining = o.timeLimit - (performance.now() - start);
        if (remaining <= 0) { canonicalStatus = 'limit'; if (offset === 0) ownedPreferenceStatus = 'limit'; break; }
        const secondaryModel = modelFor(data, secondaryUnits, o, values, target, theoretical);
        if (optimum > 0) secondaryModel.constraints.primaryCost = { max: 1 };
        if (heldCount !== undefined) secondaryModel.constraints.heldCount = { equal: heldCount };
        const block = keys.slice(offset, offset + 16), priority = 2 ** block.length;
        secondaryUnits.forEach((u, i) => {
          const variable = secondaryModel.variables['x' + i];
          if (optimum > 0) variable.primaryCost = values[u.id].difficulty / optimum;
          variable.heldCount = Number(values[u.id].owned);
          variable.objective = offset === 0 ? -priority * variable.heldCount : 0;
        });
        fixed.forEach((value, key) => { const name = 'fixed_' + key; secondaryModel.constraints[name] = { equal: value }; secondaryModel.variables[key][name] = 1; });
        block.forEach((key, i) => { secondaryModel.variables[key].objective -= 2 ** (block.length - i - 1); });
        secondaryModel.options.time_limit = remaining / 1000;
        const preferred = solveModel(secondaryModel);
        const solution = preferred.solution;
        const integral = Object.entries(solution).every(([k, v]) => !(k.startsWith('x') || k.startsWith('y') || k.startsWith('evo')) || Math.abs(v - Math.round(v)) <= 1e-5);
        const complete = preferred.optimal;
        if (offset === 0) ownedPreferenceStatus = complete ? 'optimal' : 'limit';
        if (!preferred.feasible || !integral) { canonicalStatus = 'limit'; break; }
        answer = preferred; units = secondaryUnits;
        if (!complete) { canonicalStatus = 'limit'; break; }
        heldCount ??= secondaryUnits.filter((u, i) => solution['x' + i] > .5 && values[u.id].owned).length;
        block.forEach(key => fixed.set(key, Math.round(solution[key] || 0)));
        const slotsFixed = secondaryUnits.reduce((sum, u, i) => sum + (fixed.get('x' + i) === 1 ? u.slots : 0), 0);
        const evolutionsFixed = automatic.filter((_, i) => fixed.get('evo' + i) === 1).length;
        if (slotsFixed === o.population && evolutionsFixed === o.evolutionCount - o.evolutions.length) {
          break;
        }
      }
    }
    const elapsed = performance.now() - start;
    const raw = answer.solution;
    if (!answer.feasible) return { population: o.population, status: answer.infeasible ? 'infeasible' : 'limit', target, elapsed, board: [], active: [], uncounted: [] };
    const automatic = o.evolutionCount > o.evolutions.length ? data.evolutions.filter(t => !o.evolutions.includes(t)) : [];
    const selectedEvolutions = orderTraitNames(data, data.evolutions.filter(t => o.evolutions.includes(t) || automatic.some((name, i) => name === t && raw['evo' + i] > .5)));
    const resolvedUnits = units.map(u => u.name === '卡兹克' ? { ...u, traits: { ...u.traits, ...Object.fromEntries(selectedEvolutions.map(t => [t, 1])) } } : u);
    const resolvedPool = candidatePool.map(u => u.name === '卡兹克' ? { ...u, traits: { ...u.traits, ...Object.fromEntries(selectedEvolutions.map(t => [t, 1])) } } : u);
    const board = resolvedUnits.filter((u, i) => (raw['x' + i] || 0) > .5);
    for (const [key, v] of Object.entries(raw)) if ((key.startsWith('x') || key.startsWith('y') || key.startsWith('evo')) && Math.abs(v - Math.round(v)) > 1e-5) {
      return { population: o.population, status: 'limit', target, elapsed, board: [], active: [], uncounted: [] };
    }
    const actual = evaluate(data, board, o.emblems);
    if (board.reduce((s, u) => s + u.slots, 0) !== o.population || (target !== null && actual.active.length !== target)) throw Error('浏览器计算结果未通过人口或羁绊校验。');
    if (board.some(u => u.name === '卡兹克') && board.some(u => u.name === '雷恩加尔')) throw Error('结果违反宿敌条件。');
    if (o.evolutionCount && !board.some(u => u.name === '卡兹克')) throw Error('结果缺少已进化卡兹克。');
    if (selectedEvolutions.length !== o.evolutionCount) throw Error('进化次数校验失败。');
    const difficulty = board.reduce((s, u) => s + values[u.id].difficulty, 0);
    if (!theoretical && !Number.isFinite(difficulty)) throw Error('结果包含当前无法获取的弈子。');
    const result = { population: o.population, level: o.level, status: proof && ownedPreferenceStatus === 'optimal' && canonicalStatus === 'optimal' ? 'optimal' : 'limit', difficultyStatus: proof ? 'optimal' : 'limit', target, elapsed, board, ...actual, count: actual.active.length, selectedEvolutions,
      ownedPreferenceStatus, canonicalStatus, ownedUsed: board.filter(u => values[u.id].owned).length,
      difficulty: Number.isFinite(difficulty) ? difficulty : null };
    if (target !== null && Math.abs(difficulty - primaryEvaluation) > 1e-4 * Math.max(1, difficulty)) throw Error('价值目标未通过独立校验。');
    if (target === null && Math.abs(actual.active.length - primaryEvaluation) > 1e-5) throw Error('最大羁绊目标未通过独立校验。');
    const names = new Set(actual.active.map(t => t.name));
    const activated = new Set([...actual.active, ...actual.uncounted].map(t => t.name));
    result.lineup = board.map((u, index) => {
      const relevant = Object.keys(u.traits).filter(t => activated.has(t));
      if (relevant.length !== 1 || (u.name === '卡兹克' && o.evolutionCount)) return { kind: 'unit', unit: u };
      const trait = relevant[0] || null, contribution = trait ? u.traits[trait] : 0, others = board.filter((_, i) => i !== index), occupied = new Set(others.map(groupOf));
      const candidates = resolvedPool.filter(c => {
        if (c.cost > u.cost || occupied.has(c.group) || c.slots !== u.slots || !Number.isFinite(values[c.id].difficulty) || (trait && (c.traits[trait] || 0) < contribution)) return false;
        const b = [...others, c];
        if (b.some(x => x.name === '卡兹克') && b.some(x => x.name === '雷恩加尔')) return false;
        const a = evaluate(data, b, o.emblems).active;
        return [...names].every(name => a.some(t => t.name === name));
      }).sort((a, b) => values[a.id].difficulty - values[b.id].difficulty || a.cost - b.cost);
      if (!candidates.some(c => c.group !== u.group)) return { kind: 'unit', unit: u };
      return { kind: 'placeholder', unit: u, trait, contribution, label: trait ? (contribution === 1 ? '任意' + trait : trait + '位 · 至少' + contribution + '计数') : '任意弈子', candidates };
    });
    return result;
  }
  async function rankPopulation(data, raw, progress = () => {}, current = () => true, solveTargets) {
    const o = normalizeOptions(data, raw), plans = [];
    progress({ phase: 'max', text: '求解上限…' });
    const reachable = solveOne(data, o);
    if (!reachable.board.length) return { population: o.population, level: o.level, status: reachable.status, maximum: null, plans, options: o };
    const maximum = reachable.count;
    const start = Math.min(o.minimumTraits, maximum);
    const targets = o.targets?.length ? o.targets : Array.from({ length: Math.max(0, Math.min(maximum, 14) - start + 1) }, (_, i) => i + start);
    if (!o.targets?.length && maximum > 14) targets.push(maximum);
    if (solveTargets) {
      if (!current()) throw Error('已取消');
      let done = 0;
      const results = await solveTargets(o, targets, target => {
        if (!current()) return;
        progress({ phase: 'plan', done: ++done, total: targets.length, target, text: target + ' 羁绊…' });
      });
      if (!current()) throw Error('已取消');
      for (const p of results) if (p.board.length || p.status === 'limit') plans.push(p);
    } else for (let i = 0; i < targets.length; i++) {
      if (!current()) throw Error('已取消');
      const target = targets[i];
      progress({ phase: 'plan', done: i, total: targets.length, target, text: target + ' 羁绊…' });
      const p = solveOne(data, o, { target });
      if (p.board.length) plans.push(p);
      else if (p.status === 'limit') plans.push(p);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { population: o.population, level: o.level, status: reachable.status === 'optimal' && plans.every(p => p.status === 'optimal') ? 'optimal' : 'limit', maximum, plans, options: o };
  }
  function matrixScope(data, o) {
    return { inheritance: 'selected-plan-v1', version: data.version, emblems: [...o.emblems].sort(), fixed_evolutions: [...o.fixedEvolutions],
      excluded_units: [...o.excludedUnits].sort(), lux: o.lux,
      taken: Object.keys(o.taken).sort().map(n => [n, o.taken[n]]), minimum_traits: o.minimumTraits,
      shop: { levels: Object.entries(data.shop.odds_by_level).map(([l, row]) => [Number(l), [...row]]).sort((a, b) => a[0] - b[0]),
        copies: [1, 2, 3, 4, 5].map(c => data.shop.copies_per_unit[c]), slots: data.shop.slots_per_shop } };
  }
  function normalizeSelections(selections = {}) {
    if (!selections || typeof selections !== 'object' || Array.isArray(selections)) throw Error('selections 应为状态到羁绊数的对象');
    for (const [key, count] of Object.entries(selections)) {
      const state = key.split(',').map(Number), [l, c, e] = state;
      if (state.length !== 3 || !state.every(Number.isInteger) || state.join(',') !== key || l < 1 || l > 10 || c < 0 || c > 3 || e < 0 || e > 4) throw Error('selections 状态坐标无效');
      if (!Number.isInteger(count)) throw Error('selections 羁绊数应为整数');
    }
    return { ...selections };
  }
  const dependsOn = (state, source) => state.every((v, i) => v >= source[i]);
  const selectionChanges = (previous, current) => unique([...Object.keys(previous), ...Object.keys(current)])
    .filter(key => previous[key] !== current[key]).map(key => key.split(',').map(Number));
  function selectPlan(result, requested) {
    let chosen = result.plans.find(p => p.count === requested);
    const selectionStatus = chosen ? 'user' : requested == null ? 'default' : 'fallback';
    chosen ||= sortPlans(result.plans)[0];
    Object.assign(result, { requestedCount: requested ?? null, selectedCount: chosen?.count ?? null, selectionStatus,
      acquiredUnits: unique([...result.inheritedUnits, ...chosen?.board.map(u => u.name) || []]).sort() });
  }
  function snapshotMemory(cells) {
    const states = [...cells].map(([key, row]) => ({ state: key.split(',').map(Number), cards: [...row.acquiredUnits] }))
      .sort((a, b) => a.state[0] - b.state[0] || a.state[1] - b.state[1] || a.state[2] - b.state[2]);
    return { scope: cells.scope, owned: [...cells.owned].sort(), selections: cells.selections, states };
  }
  async function rank(data, raw, progress = () => {}, cache = new Map(), current = () => true, solveTargets) {
    const o = normalizeOptions(data, raw), crowns = o.population - o.level;
    if (o.targets?.length) o.minimumTraits = Math.min(o.minimumTraits, ...o.targets);
    if (!Number.isInteger(crowns) || crowns < 0 || crowns > 3) throw Error('阵容人口应等于人口等级加冠冕数量。');
    const context = JSON.stringify({ ...o, population: null, level: null, crowns: null, evolutionCount: null, inherited: [], targets: null,
      selections: null, owned: [...raw.owned || []].sort(), fixedEvolutions: o.fixedEvolutions });
    const held = [...raw.owned || []], scope = matrixScope(data, o);
    // Legacy raw.memory is accepted but never used as a computation input.
    let cells = cache.get(context);
    if (!cells) {
      cells = new Map(); cells.scope = scope; cells.owned = held; cells.selections = o.selections;
      cache.clear(); cache.set(context, cells);
    } else {
      const changed = selectionChanges(cells.selections, o.selections);
      for (const [key, row] of cells) {
        const state = key.split(',').map(Number);
        if (changed.some(source => key !== source.join(',') && dependsOn(state, source))) cells.delete(key);
        else {
          row.options.selections = { ...o.selections };
          if (changed.some(source => key === source.join(','))) selectPlan(row, o.selections[key]);
        }
      }
      cells.selections = o.selections;
    }
    const key = (l, c, e) => [l, c, e].join(',');
    async function visit(l, c, e) {
      if (!current()) throw Error('已取消');
      if (cells.has(key(l, c, e))) return cells.get(key(l, c, e));
      const parents = l > 1 ? [[l - 1, c, e]] : [];
      if (c) parents.push([l, c - 1, e]);
      if (e) parents.push([l, c, e - 1]);
      const inherited = new Set(), previous = [];
      for (const parent of parents) {
        const row = await visit(...parent); previous.push(row);
        row.acquiredUnits.forEach(name => inherited.add(name));
      }
      const label = l + '级 / 冠冕' + c + ' / 进化' + e;
      progress({ phase: 'state', text: label });
      const result = await rankPopulation(data, { ...o, owned: raw.owned || [], population: l + c, level: l, crowns: c,
        fixedEvolutions: o.fixedEvolutions.slice(0, e), evolutionCount: e, inherited: [...inherited], targets: null },
        p => progress({ ...p, text: label + ' · ' + p.text }), current, solveTargets);
      if (!current()) throw Error('已取消');
      const candidates = unique([...previous.flatMap(row => row.candidateUnits), ...result.plans.flatMap(p => p.board.map(u => u.name))]);
      Object.assign(result, { crowns: c, evolutionCount: e, inheritedUnits: [...inherited].sort(), candidateUnits: candidates.sort(),
        predecessors: parents, progressionStatus: result.status === 'optimal' && previous.every(r => r.progressionStatus === 'optimal') ? 'optimal' : 'limit' });
      selectPlan(result, o.selections[key(l, c, e)]);
      cells.set(key(l, c, e), result);
      return result;
    }
    const target = await visit(o.level, crowns, o.evolutionCount);
    return { ...target, plans: o.targets?.length ? target.plans.filter(p => o.targets.includes(p.count)) : target.plans,
      memory: snapshotMemory(cells),
      progression: Array.from({ length: o.level }, (_, i) => cells.get(key(i + 1, crowns, o.evolutionCount))) };
  }
  function sortPlans(plans, mode = 'value') {
    if (!['value', 'traits'].includes(mode)) throw Error('无效的方案排序方式。');
    // 1e-7 shops preserves the previous 1e-9 loss tie precision.
    const rounded = p => Math.round(p.difficulty * 1e7);
    return plans.filter(p => p.board.length).sort((a, b) => mode === 'traits'
      ? b.count - a.count || rounded(a) - rounded(b)
      : rounded(a) - rounded(b) || b.count - a.count);
  }

  function fitValueBoundary(plans) {
    const values = plans.filter(p => p.board.length && p.count >= 2 && Number.isFinite(p.difficulty) && p.difficulty >= 0).map(p => 100 / (1 + p.difficulty)).sort((a, b) => a - b);
    if (values.length < 2) return { threshold: null, reason: 'insufficient_candidates' };
    const xs = values.map(Math.log);
    if (xs.at(-1) - xs[0] <= 1e-12) return { threshold: null, reason: 'equal_values' };
    const offset = xs[0], sums = [0], squares = [0], n = xs.length;
    xs.forEach(x => { const centered = x - offset; sums.push(sums.at(-1) + centered); squares.push(squares.at(-1) + centered * centered); });
    let best = null;
    for (let k = 1; k < n; k++) {
      const gap = xs[k] - xs[k - 1]; if (gap <= 1e-12) continue;
      const sse = Math.max(0, squares[k] - sums[k] ** 2 / k) + Math.max(0, squares[n] - squares[k] - (sums[n] - sums[k]) ** 2 / (n - k));
      if (!best || sse < best.sse - 1e-12 || (Math.abs(sse - best.sse) <= 1e-12 && gap > best.gap)) best = { sse, k, gap };
    }
    const low = sums[best.k] / best.k + offset, high = (sums[n] - sums[best.k]) / (n - best.k) + offset;
    return { threshold: Math.exp((low + high) / 2), method: 'minimum_within_class_log_variance', lowerCount: best.k,
      higherCount: n - best.k, lowerGeometricMean: Math.exp(low), higherGeometricMean: Math.exp(high), withinClassSSE: best.sse };
  }
  function fitDifficultyBoundary(plans) {
    const b = fitValueBoundary(plans);
    return b.threshold === null ? b : { threshold: 100 / b.threshold - 1, method: b.method,
      lowerCount: b.higherCount, higherCount: b.lowerCount, lowerCenter: 100 / b.higherGeometricMean - 1,
      higherCenter: 100 / b.lowerGeometricMean - 1, withinClassSSE: b.withinClassSSE };
  }
  function difficultyBoundary(reference) {
    const b = reference.boundary;
    return { threshold: b.threshold, method: 'fixed_global_reference', referenceId: reference.id,
      lowerCount: b.lower_count, higherCount: b.higher_count, lowerCenter: b.lower_center,
      higherCenter: b.higher_center, withinClassSSE: b.within_class_sse };
  }
  function aboveDifficultyThreshold(plan, threshold) { return Number.isFinite(threshold) && Number.isFinite(plan.difficulty) && plan.difficulty > threshold; }
  root.TraitEngine = { normalizeOptions, normalizeSelections, dependsOn, selectPlan, unitValues, prepare, evaluate, modelFor, solveOne, rankPopulation, rank, sortPlans, orderTraitNames, difficultyBoundary, aboveDifficultyThreshold, fitValueBoundary, fitDifficultyBoundary };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TraitEngine;
})(globalThis);
