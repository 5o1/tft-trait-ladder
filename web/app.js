(() => {
  'use strict';
  const { translate: t, setHTML } = TraitI18n;
  TraitI18n.localize(document);
  document.documentElement.lang = TraitI18n.locale;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numberText = value => t(value).split(/(\d+(?:\.\d+)?)/).map((part, i) => i % 2 ? '<span class="numeric">' + part + '</span>' : esc(part)).join('');
  const aliases = { '阿兹尔': '沙皇', '维迦': '小法', '费德提克': '稻草人', '黛安娜': '皎月', '约里克': '掘墓', '厄斐琉斯': '月男', '拉莫斯': '龙龟', '卡兹克': '螳螂', '雷恩加尔': '狮子狗', '奈德丽': '豹女', '赫卡里姆': '人马', '崔丝塔娜': '小炮', '深红锋喙鸟': '鸡哥', '苍蓝雕纹魔像': '大蓝', '绯红印记树怪': '大红' };
  const state = {
    data: null, emblems: ['裁决使'], population: 8, crowns: 0, lux: 'auto',
    evolutionCount: 0, fixedEvolutions: new Set(), owned: new Set(), excludedUnits: new Set(), gamePool: new Set(),
    results: new Map(), sortModes: new Map(), selectedCount: null, candidateDraft: null, matrixMemory: null,
    worker: null, pending: null, job: 0, generation: 0, busy: false, dirty: true, failure: null, keepRoster: false, baseKey: null, picker: 'emblem', pickerEmblems: null
  };
  let toastTimer;
  let calculationTimer;
  let cancelButtonTimer;
  let rosterView;
  const hero = id => state.data.units.find(u => u.id === id);
  const trait = name => state.data.traits.find(t => t.name === name);
  const orderedTraits = names => TraitEngine.orderTraitNames(state.data, names);
  const costStyle = u => '--cost:var(--cost-' + u.cost + ')';
  const countEmblems = names => new Map(state.data.emblems.map(e => [e.name, Math.min(9, names.filter(n => n === e.name).length)]));
  const effectiveOwned = () => new Set([...state.owned, ...(state.evolutionCount ? ['卡兹克'] : [])]);
  function imageAsset(row, alt, classes, ownership = '') {
    alt = t(alt);
    return row?.image
      ? '<img class="' + classes + '"' + ownership + ' src="' + esc(row.image) + '" data-fallback="' + esc(row.imageFallback || '') + '" data-initial="' + esc(alt.slice(0, 2)) + '" alt="' + esc(alt) + '" referrerpolicy="no-referrer" loading="lazy" decoding="async">'
      : '<span class="' + classes + ' asset-fallback"' + ownership + ' data-initial="' + esc(alt.slice(0, 2) || '无') + '" role="img" aria-label="' + esc(alt) + '"></span>';
  }
  function asset(row, alt = row?.name || '', owned = effectiveOwned()) {
    const unit = Boolean(row?.cost);
    const ownership = unit ? ' data-unit-name="' + esc(row.name) + '" data-owned="' + owned.has(row.name) + '"' : '';
    const form = row?.group === '拉克丝' ? Object.keys(row.traits).find(name => name !== '自然之力！大元素使') : null;
    if (form) {
      const portrait = state.data.units.find(u => u.name === '拉克丝');
      const emblem = state.data.emblems.find(e => e.name === form);
      return '<span class="asset lux-art" data-lux-form="' + esc(form) + '">' +
        imageAsset(portrait, alt, 'lux-base unit-art', ownership) +
        '<span class="lux-form-badge' + (emblem ? '' : ' trait-badge') + '" title="' + esc(form) + '">' +
        imageAsset(emblem || trait(form), form, 'asset') + '</span></span>';
    }
    return imageAsset(row, alt, 'asset' + (unit ? ' unit-art' : ''), ownership);
  }
  function syncOwnership() {
    const owned = effectiveOwned();
    document.querySelectorAll('.unit-art').forEach(el => {
      const value = String(owned.has(el.dataset.unitName));
      if (el.dataset.owned !== value) el.dataset.owned = value;
    });
    document.querySelectorAll('[data-roster-owned]').forEach(card => {
      const held = owned.has(card.dataset.rosterOwned);
      if (card.getAttribute('aria-pressed') !== String(held)) card.setAttribute('aria-pressed', String(held));
    });
  }

  function toast(text) {
    clearTimeout(toastTimer); $('toast').textContent = t(text); $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2500);
  }
  function status(text, kind = '') { setHTML($('calculationStatus'), numberText((kind === 'busy' ? t('正在计算：') : '') + t(text))); $('calculationStatus').className = 'calculation-status ' + kind; $('calculationStatus').dataset.state = kind || 'idle'; }
  function dialog(id) { if (!$(id).open) $(id).showModal(); }
  function persist() {
    try {
      localStorage.setItem('traitladder-s18', JSON.stringify({
        emblems: state.emblems, population: state.population, crowns: state.crowns,
        fixedEvolutions: [...state.fixedEvolutions], evolutionCount: state.evolutionCount,
        owned: [...state.owned], excludedUnits: [...state.excludedUnits], gamePool: [...state.gamePool],
        sortModes: Object.fromEntries(state.sortModes), lux: state.lux, matrixMemory: state.matrixMemory
      }));
    } catch (_) {}
  }
  function options(population = state.population) {
    return {
      emblems: [...state.emblems], population: population + state.crowns, level: population, crowns: state.crowns,
      evolutionCount: state.evolutionCount, fixedEvolutions: [...state.fixedEvolutions],
      owned: [...state.owned], excludedUnits: [...state.excludedUnits],
      lux: state.lux, timeLimit: 8000, memory: state.matrixMemory
    };
  }
  function lockForm(locked) {
    $('conditionsForm').dataset.busy = String(locked);
    document.querySelectorAll('input[name="evolutionCount"]').forEach(el => { el.disabled = Number(el.value) < state.fixedEvolutions.size; });
  }
  function hideCancellation() {
    clearTimeout(cancelButtonTimer); cancelButtonTimer = null;
    $('cancelButton').hidden = true;
  }
  function renderPool() {
    const owned = effectiveOwned();
    const ids = new Set([...state.gamePool, ...state.data.units.filter(u => owned.has(u.name)).map(u => u.id)]);
    const units = [...ids].map(hero).filter(Boolean).sort((a, b) => a.cost - b.cost || t(a.name).localeCompare(t(b.name), TraitI18n.locale));
    $('ownedCount').textContent = owned.size;
    setHTML($('gamePool'), [1, 2, 3, 4, 5].map(cost => {
      const cards = units.filter(u => u.cost === cost);
      if (!cards.length) return '';
      return '<div class="pool-row" data-cost="' + cost + '"><div class="pool-cards">' +
        cards.map(u => '<button type="button" class="pool-card ' + (owned.has(u.name) ? 'selected ' : '') + (state.excludedUnits.has(u.name) ? 'excluded' : '') + '" style="' + costStyle(u) + '" data-pool-id="' + u.id + '" aria-pressed="' + owned.has(u.name) + '" title="' + esc(u.name) + '">' + asset(u) + '<small>' + esc(u.name) + '</small></button>').join('') + '</div></div>';
    }).join(''));
  }
  function renderLuxOptions() {
    const forms = orderedTraits(state.data.units.filter(u => u.group === '拉克丝' && Object.keys(u.traits).length > 1)
      .map(u => Object.keys(u.traits).find(name => name !== '自然之力！大元素使')));
    const choices = [{ name: 'auto', label: '自动' }, { name: 'none', label: '禁用' }, ...forms.map(name => {
      const emblem = state.data.emblems.find(e => e.name === name);
      return { name, label: name, icon: emblem || trait(name), glyph: !emblem };
    })];
    let previousCategory;
    setHTML($('luxOptions'), choices.map(choice => {
      const category = choice.icon ? trait(choice.name)?.category : null;
      const separator = category && previousCategory && category !== previousCategory ? '<span class="trait-group-separator" role="separator" aria-label="职业"></span>' : '';
      if (category) previousCategory = category;
      return separator + '<label class="lux-option" title="' + esc(choice.label) + '">' +
      '<input type="radio" name="lux" value="' + esc(choice.name) + '" aria-label="' + esc(choice.label) + '"' + (state.lux === choice.name ? ' checked' : '') + '>' +
      '<span class="lux-option-face' + (choice.glyph ? ' trait-badge' : '') + '">' + (choice.icon ? asset(choice.icon, choice.label) : esc(choice.label)) + '</span></label>';
    }).join(''));
  }
  function renderConditions() {
    const counts = [...countEmblems(state.emblems)].filter(([, count]) => count > 0);
    setHTML($('emblemPreview'), counts.slice(0, 3).map(([name]) => asset(state.data.emblems.find(e => e.name === name), name)).join(''));
    setHTML($('emblemName'), numberText(counts.length > 1 ? '共 ' + state.emblems.length + ' 枚转职纹章' : counts.length ? counts[0][0] + '纹章' + (counts[0][1] > 1 ? ' × ' + counts[0][1] : '') : '选择转职'));
    $('emblemButton').title = t(counts.map(([name, count]) => name + '纹章 × ' + count).join(' / ') || '选择转职');
    $('emblemButton').setAttribute('aria-label', t('转职：') + ($('emblemButton').title));
    renderLuxOptions();
    setHTML($('crownButtons'), [0, 1, 2, 3].map(n => '<label class="population-tab number-option' + (n === state.crowns ? ' selected' : '') + '"><input type="radio" name="crowns" value="' + n + '" ' + (n === state.crowns ? 'checked' : '') + '><span>' + n + '</span></label>').join(''));
    setHTML($('evolutionButtons'), [0, 1, 2, 3, 4].map(n => '<label class="population-tab number-option' + (n === state.evolutionCount ? ' selected' : '') + '"><input type="radio" name="evolutionCount" value="' + n + '" ' + (n === state.evolutionCount ? 'checked' : '') + ' ' + (n < state.fixedEvolutions.size ? 'disabled' : '') + '><span>' + n + '</span></label>').join(''));
    renderEvolutionPlan();
    $('excludedCount').textContent = state.excludedUnits.size;
    setHTML($('excludedSlots'), [...state.excludedUnits].map(name => state.data.units.find(u => u.name === name)).filter(Boolean).map(u =>
      '<button type="button" class="owned-chip excluded-chip" style="' + costStyle(u) + '" data-remove-excluded="' + esc(u.name) + '" title="' + esc(u.name) + '">' + asset(u) + '</button>').join(''));
    $('shopOdds').title = t(state.population + ' 级商店');
    setHTML($('shopOdds'), state.data.shop.odds_by_level[state.population].map((p, i) =>
      '<span class="cost-' + (i + 1) + '" title="' + (i + 1) + '费">' + Math.round(p * 100) + '%</span>').join(''));
    renderPool(); syncOwnership(); lockForm(state.busy);
  }
  function dirty(keepRoster = false) {
    state.keepRoster = keepRoster;
    state.dirty = true; renderPending(); renderConditions(); persist();
    schedule();
    renderCurrent();
  }
  function schedule() {
    clearTimeout(calculationTimer);
    if (state.busy) cancel();
    state.failure = null;
    status(state.population + ' 级', 'busy');
    calculationTimer = setTimeout(() => { calculationTimer = null; run(); }, 250);
  }
  function setPopulation(value, calculate = false) {
    state.keepRoster = false;
    if (calculate && (state.busy || calculationTimer)) cancel();
    state.population = Math.max(1, Math.min(10, Number(value) || 1));
    state.selectedCount = null;
    renderConditions(); renderPopulationTabs(); persist();
    if (!state.dirty && state.results.has(state.population)) {
      state.failure = null; renderCurrent(); renderResultStatus();
    } else {
      if (calculate) schedule();
      renderCurrent();
    }
  }
  function renderPopulationTabs() {
    const pops = [...new Set([3, 4, 5, 6, 7, 8, 9, 10, state.population])].sort((a, b) => a - b);
    setHTML($('populationTabs'), pops.map(p => '<button type="button" class="population-tab' + (p === state.population ? ' selected' : '') + '" data-population="' + p + '" aria-pressed="' + (p === state.population) + '">' + p + '</button>').join(''));
  }
  const sortMode = () => state.sortModes.get(state.population) || 'value';
  const ordered = () => TraitEngine.sortPlans(state.results.get(state.population)?.plans || [], sortMode());
  const boundary = () => TraitEngine.lossBoundary(state.data.lossReference);
  function selected() { return ordered().find(p => p.count === state.selectedCount) || ordered()[0]; }
  function renderEvolutionPlan() {
    const plan = selected();
    const ready = !state.dirty && !state.busy && plan?.selectedEvolutions?.length === state.evolutionCount;
    const names = ready ? plan.selectedEvolutions : [...state.fixedEvolutions];
    $('evolutionControls').hidden = !names.length;
    setHTML($('evolutionMemory'), orderedTraits(names).map(name => {
      const fixed = state.fixedEvolutions.has(name), tag = fixed ? 'button' : 'span';
      return '<' + tag + ' class="evolution-trait" title="' + esc(name + (fixed ? ' · 点击撤销进化' : '')) + '"' +
        (fixed ? ' type="button" data-unlock-evolution="' + esc(name) + '" aria-label="撤销' + esc(name) + '进化"' : '') + '>' +
        asset(trait(name), name) + '<b>' + esc(name) + '</b>' + (fixed ? '<small>✓ 已确认</small>' : '') + '</' + tag + '>';
    }).join(''));
    $('adoptEvolution').hidden = !ready || names.length <= state.fixedEvolutions.size;
    $('adoptEvolution').disabled = state.dirty || state.busy;
  }
  function renderSorting() {
    $('sortValue').setAttribute('aria-pressed', String(sortMode() === 'value'));
    $('sortTraits').setAttribute('aria-pressed', String(sortMode() === 'traits'));
    const cut = boundary();
    $('valueThreshold').textContent = cut.threshold === null ? '—' : cut.threshold.toFixed(3);
    $('algorithmThreshold').textContent = $('valueThreshold').textContent;
    $('sortSummary').textContent = t(state.population + ' 级 · ' + (sortMode() === 'value' ? '损失 ↑' : '羁绊 ↓'));
  }
  function heroCard(slot, index) {
    const u = slot.unit, flexible = slot.kind === 'placeholder';
    const label = esc(t(flexible ? slot.label : u.name)).replace('Fiddlesticks', 'Fiddle<wbr>sticks');
    const nativeTraits = orderedTraits(Object.keys(u.traits));
    const names = flexible ? [] : nativeTraits.filter(name => trait(name)?.counted).slice(0, 3);
    return '<button type="button"' + (flexible ? ' aria-haspopup="dialog" aria-controls="detailDialog"' + (state.dirty || state.busy ? ' disabled' : '') : ' data-roster-owned="' + esc(u.name) + '" aria-pressed="' + effectiveOwned().has(u.name) + '"') + ' class="champion-card ' + (flexible ? 'flex-card' : '') + '" style="' + costStyle(u) + '" data-slot="' + index + '" data-hero="' + u.id + '" title="' + esc(u.name + ' · ' + nativeTraits.join(' / ')) + '">' +
      '<span class="champion-portrait">' + asset(u) + '<span class="champion-price">' + u.cost + '</span>' +
      (flexible && slot.trait ? '<span class="flex-veil" aria-hidden="true"></span><span class="flex-trait">' + asset(trait(slot.trait), slot.trait) + '</span>' : '') +
      '<span class="champion-traits">' + names.map(name => asset(trait(name), name)).join('') + '</span></span><span class="champion-name">' +
      '<span class="champion-label">' + label + '</span></span></button>';
  }
  function traitRow(item, other = false) {
    const t = trait(item.name);
    return '<div class="trait-row" data-trait="' + esc(item.name) + '"><span class="trait-icon-frame">' + asset(t) +
      '</span><span class="trait-row-name">' + esc(item.name) +
      (other ? '' : '<span class="trait-tier">' + t.levels.map(k => '<span class="' + (k === item.tier ? 'current' : '') + '">' + k + '</span>').join('') + '</span>') +
      '</span><span class="trait-counter">' + item.count + '</span></div>';
  }
  function renderTraitRows(items, other = false) {
    const rows = new Map(items.map(item => [item.name, item]));
    let previousCategory;
    return orderedTraits([...rows.keys()]).map(name => {
      const category = trait(name)?.category;
      const separator = previousCategory && category !== previousCategory ? '<div class="trait-group-separator" role="separator" aria-label="职业"></div>' : '';
      previousCategory = category;
      return separator + traitRow(rows.get(name), other);
    }).join('');
  }
  function renderPending() {
    const label = state.failure || '正在计算';
    const regions = [[$('selectedPlan'), (state.population + state.crowns) + ' 人口'],
      [$('activeTraitsPanel'), '已激活的羁绊'], [$('comparisonPanel'), '候选阵容方案']];
    const heights = regions.map(([panel]) => panel.classList.contains('result-pending') ? null : panel.getBoundingClientRect().height);
    regions.forEach(([panel, heading], i) => {
      if (panel.id === 'selectedPlan' && state.keepRoster) {
        panel.dataset.state = 'updating'; panel.setAttribute('aria-busy', 'true');
        panel.querySelectorAll('.flex-card').forEach(card => { card.disabled = true; });
        return;
      }
      if (!panel.classList.contains('result-pending')) {
        if (heights[i] > 0) panel.style.height = heights[i] + 'px';
        panel.classList.add('result-pending');
        [...panel.children].forEach(child => { child.setAttribute('inert', ''); child.setAttribute('aria-hidden', 'true'); });
      }
      let overlay = [...panel.children].find(child => child.classList.contains('result-overlay'));
      if (!overlay) { overlay = document.createElement('div'); overlay.className = 'result-overlay'; overlay.setAttribute('role', 'status'); panel.append(overlay); }
      setHTML(overlay, (state.failure ? '' : '<span class="calculation-spinner" aria-hidden="true"></span>') +
        '<h2>' + numberText(heading) + '</h2><p>' + esc(label) + '</p>');
      panel.dataset.state = state.failure ? 'incomplete' : 'pending';
      panel.setAttribute('aria-busy', String(!state.failure));
    });
    $('exportButton').disabled = true;
  }
  function clearPending() {
    [$('selectedPlan'), $('activeTraitsPanel'), $('comparisonPanel')].forEach(panel => {
      if (!panel.classList.contains('result-pending')) return;
      [...panel.children].find(child => child.classList.contains('result-overlay'))?.remove();
      panel.style.removeProperty('height'); panel.classList.remove('result-pending');
      [...panel.children].forEach(child => { child.removeAttribute('inert'); child.removeAttribute('aria-hidden'); });
      panel.dataset.state = 'ready'; panel.setAttribute('aria-busy', 'false');
    });
  }
  function renderResultStatus() {
    const rows = [...state.results.values()];
    const count = rows.reduce((n, r) => n + r.plans.filter(p => p.board.length).length, 0);
    const complete = rows.every(r => r.status === 'optimal' || r.status === 'infeasible');
    status(complete ? '✓ 已完成 ' + rows.length + ' 个人口等级的计算，共得到 ' + count + ' 套阵容方案。' :
      '◷ 已计算 ' + rows.length + ' 个人口等级，共得到 ' + count + ' 套阵容方案；部分结果尚未证明最优。');
    $('calculationStatus').dataset.state = complete ? 'complete' : 'partial';
  }
  function renderRoster(plan, result) {
    const panel = $('selectedPlan');
    if (!rosterView || !panel.querySelector('.champion-grid')) {
      setHTML(panel, '<div class="plan-topline"><div class="plan-medal"><b></b><span>羁绊</span></div>' +
        '<div class="plan-heading"><h2></h2></div><div class="value-box"><small>损失</small><b></b></div></div>' +
        '<div class="champion-grid"></div><div class="plan-note"><span></span></div>');
      rosterView = {};
    }
    // 备选弈子在点击占位符时，从最新方案中读取。
    const cardsKey = JSON.stringify(plan.lineup.map(slot => ({ kind: slot.kind, unit: slot.unit, label: slot.label, trait: slot.trait })));
    const grid = panel.querySelector('.champion-grid');
    if (cardsKey !== rosterView.cardsKey) {
      setHTML(grid, plan.lineup.map(heroCard).join(''));
      rosterView.cardsKey = cardsKey;
    }
    const heading = t(result.population + ' 人口'), loss = plan.loss.toFixed(3);
    const note = t((result.status === 'optimal' ? '当前设置下最高可能激活 ' + result.maximum + ' 羁绊' : '当前设置下已找到可激活 ' + result.maximum + ' 羁绊的方案') +
      (plan.count >= 14 ? '；✓ 已达到 14 羁绊。' : ''));
    const countElement = panel.querySelector('.plan-medal b'), headingElement = panel.querySelector('.plan-heading h2');
    const lossElement = panel.querySelector('.value-box b'), noteElement = panel.querySelector('.plan-note>span');
    if (countElement.textContent !== String(plan.count)) countElement.textContent = plan.count;
    if (headingElement.textContent !== heading) setHTML(headingElement, numberText(heading));
    if (lossElement.textContent !== loss) lossElement.textContent = loss;
    if (noteElement.textContent !== note) setHTML(noteElement, numberText(note));
    grid.querySelectorAll('.flex-card').forEach(card => { if (card.disabled) card.disabled = false; });
    syncOwnership();
  }
  function renderCurrent() {
    renderSorting(); renderPopulationTabs(); renderEvolutionPlan();
    const r = state.results.get(state.population), plan = selected();
    if (state.dirty || state.busy || state.failure || !r) { renderPending(); return; }
    clearPending();
    $('selectedPlan').dataset.state = 'ready';
    $('selectedPlan').setAttribute('aria-busy', 'false');
    $('selectedPlan').classList.toggle('below-value-threshold', Boolean(plan && TraitEngine.aboveLossThreshold(plan, boundary().threshold)));
    if (!plan) {
      rosterView = null;
      setHTML($('selectedPlan'), '<div class="empty-state"><img src="./assets/crest.svg" alt=""><h2>' + (r.status === 'limit' ? '◷ 计算尚未完成' : '暂无方案') + '</h2><span>' + numberText(r.maximum === null ? '—' : '已找到 ' + r.maximum + ' 羁绊') + '</span></div>');
      setHTML($('planList'), '<div class="list-empty">—</div>'); setHTML($('traitList'), ''); setHTML($('uncountedList'), '');
      $('uncountedTraits').hidden = true; $('traitTotal').textContent = '—'; return;
    }
    state.selectedCount = plan.count;
    const low = TraitEngine.aboveLossThreshold(plan, boundary().threshold);
    $('selectedPlan').classList.toggle('below-value-threshold', low);
    renderRoster(plan, r);
    const cut = boundary().threshold;
    setHTML($('planList'), ordered().map(p => {
      const faded = TraitEngine.aboveLossThreshold(p, cut);
      return '<button type="button" class="plan-row ' + (p.count === state.selectedCount ? 'selected ' : '') + (faded ? 'below-value-threshold' : '') +
        '" data-plan="' + p.count + '" aria-label="' + p.count + '羁绊，损失' + p.loss.toFixed(3) + (faded ? '，较难获取组' : '') +
        '"><span class="row-trait-count">' + p.count + '</span><span class="row-avatars">' + p.board.map(u =>
          '<span class="mini-portrait" style="' + costStyle(u) + '" title="' + esc(u.name) + '">' + asset(u) + '</span>').join('') +
        '</span><span class="row-value">' + p.loss.toFixed(3) + '<small>' + (p.status === 'optimal' ? '✓ 已证明最优' : '◷ 尚未证明最优') + '</small></span></button>';
    }).join(''));
    $('traitTotal').textContent = plan.count; setHTML($('traitList'), renderTraitRows(plan.active));
    $('uncountedTraits').hidden = !plan.uncounted.length; setHTML($('uncountedList'), renderTraitRows(plan.uncounted, true));
    $('exportButton').disabled = state.dirty;
  }
  function ensureWorker() {
    if (state.worker) return;
    state.worker = new Worker('./worker.js');
    state.worker.onmessage = ({ data }) => {
      if (data.id !== state.job) return;
      if (data.type === 'progress') { status(data.text, 'busy'); return; }
      const pending = state.pending; state.pending = null;
      data.type === 'error' ? pending?.reject(Error(data.message)) : pending?.resolve(data.result);
    };
    state.worker.onerror = event => {
      state.pending?.reject(Error(event.message || '计算线程异常')); state.pending = null;
      state.worker?.terminate(); state.worker = null;
    };
  }
  function askWorker(request) {
    ensureWorker(); state.job++;
    return new Promise((resolve, reject) => { state.pending = { resolve, reject }; state.worker.postMessage({ id: state.job, options: request }); });
  }
  async function run() {
    if (state.busy || !state.data) return;
    const generation = ++state.generation;
    try {
      const base = options(); TraitEngine.normalizeOptions(state.data, base);
      const key = JSON.stringify({ ...base, population: null, level: null, memory: null });
      if (key !== state.baseKey) { state.results.clear(); state.baseKey = key; state.selectedCount = null; }
      state.busy = true; state.dirty = false; state.failure = null; lockForm(true); hideCancellation();
      cancelButtonTimer = setTimeout(() => { cancelButtonTimer = null; if (state.busy) $('cancelButton').hidden = false; }, 500);
      renderCurrent();
      status(base.level + ' 级…', 'busy');
      const result = await askWorker(base);
      if (generation !== state.generation) return;
      state.matrixMemory = result.memory;
      (result.progression || [result]).forEach(row => state.results.set(row.level, row));
      result.acquiredUnits.forEach(name => state.data.units.filter(u => u.name === name).forEach(u => state.gamePool.add(u.id)));
      renderPopulationTabs(); renderPool(); renderCurrent();
      renderResultStatus();
      persist();
    } catch (error) { if (generation === state.generation) { state.failure = '计算未完成'; status(error.message, 'error'); } }
    finally { if (generation === state.generation) { state.busy = false; state.keepRoster = false; lockForm(false); hideCancellation(); renderCurrent(); } }
  }
  function cancel(reset = false) {
    clearTimeout(calculationTimer); calculationTimer = null;
    if (reset === true) { state.worker?.terminate(); state.worker = null; }
    else state.worker?.postMessage({ type: 'cancel' });
    state.job++; state.generation++; state.busy = false;
    state.pending?.reject(Error('已取消')); state.pending = null;
    state.failure = '已取消';
    lockForm(false); hideCancellation(); status('已取消'); renderCurrent();
  }
  function toggleOwned(name, keepRoster = false) {
    if (name === '卡兹克' && state.evolutionCount) { toast('进化锁定'); return; }
    if (state.owned.has(name)) state.owned.delete(name);
    else {
      const u = state.data.units.find(u => u.name === name);
      if (u.group === '拉克丝') [...state.owned].forEach(n => { if (state.data.units.find(c => c.name === n)?.group === '拉克丝') state.owned.delete(n); });
      state.excludedUnits.delete(name);
      state.owned.add(name); state.gamePool.add(u.id);
    }
    dirty(keepRoster);
  }
  function toggleExcluded(name) {
    if (name === '卡兹克' && state.evolutionCount) { toast('进化锁定'); return; }
    if (state.excludedUnits.has(name)) state.excludedUnits.delete(name);
    else { state.excludedUnits.add(name); state.owned.delete(name); }
    dirty();
  }
  function adopt() {
    const plan = selected(); if (!plan || state.busy || state.dirty) return;
    if ([...state.fixedEvolutions].some(t => !plan.selectedEvolutions.includes(t))) return;
    state.fixedEvolutions = new Set([...state.fixedEvolutions, ...plan.selectedEvolutions]); state.evolutionCount = plan.selectedEvolutions.length;
    state.owned.add('卡兹克'); state.gamePool.add(state.data.units.find(u => u.name === '卡兹克').id);
    dirty();
  }
  function unlockEvolution(name) {
    if (!state.fixedEvolutions.delete(name)) return;
    state.evolutionCount--;
    dirty();
  }
  function openPicker(kind) {
    state.picker = kind; $('pickerTitle').textContent = t({ emblem: '转职', owned: '已持有', excluded: '禁卡表' }[kind]);
    state.pickerEmblems = kind === 'emblem' ? countEmblems(state.emblems) : null;
    $('pickerContent').classList.toggle('ban-picker', kind === 'excluded');
    $('pickerContent').classList.toggle('emblem-picker', kind === 'emblem');
    $('pickerSearch').hidden = kind === 'emblem'; $('pickerSearch').value = '';
    renderPicker(); dialog('pickerDialog');
    (kind === 'emblem' ? $('pickerContent').querySelector('.selected .emblem-toggle') || $('pickerContent').querySelector('.emblem-toggle') : $('pickerSearch')).focus();
  }
  function renderPicker() {
    if (state.picker === 'emblem') {
      $('pickerContent').classList.remove('unit-picker');
      let previousCategory;
      setHTML($('pickerContent'), state.data.emblems.map(e => {
        const count = state.pickerEmblems.get(e.name) || 0;
        const category = trait(e.name)?.category;
        const heading = category !== previousCategory ? '<div class="trait-group-heading">' + (category === 'job' ? '职业' : (TraitI18n.locale === 'en' ? '种族羁绊' : '羁绊')) + '</div>' : '';
        previousCategory = category;
        return heading + '<div class="picker-item emblem-item' + (count ? ' selected' : '') + '" data-emblem-item="' + esc(e.name) + '">' +
          '<button type="button" class="emblem-toggle" data-picker-value="' + esc(e.name) + '" aria-pressed="' + Boolean(count) + '" title="' + esc(e.name) + '">' +
          asset(e) + '<span class="picker-label">' + esc(e.name) + '</span></button>' +
          '<div class="emblem-quantity" role="group" aria-label="' + esc(e.name) + '纹章数量"><output aria-live="polite">' + count + '</output>' +
          '<button type="button" data-emblem-name="' + esc(e.name) + '" data-emblem-delta="1" aria-label="增加' + esc(e.name) + '纹章数量"' + (count === 9 ? ' disabled' : '') + '>▴</button>' +
          '<button type="button" data-emblem-name="' + esc(e.name) + '" data-emblem-delta="-1" aria-label="减少' + esc(e.name) + '纹章数量"' + (count === 0 ? ' disabled' : '') + '>▾</button></div></div>';
      }).join(''));
      return;
    }
    const searchText = value => value.toLocaleLowerCase(TraitI18n.locale).normalize('NFKC').replace(/[’']/g, '');
    const terms = searchText($('pickerSearch').value).trim().split(/\s+/).filter(Boolean), owned = effectiveOwned();
    const rows = state.data.units;
    const matches = rows.filter(u => {
      const text = searchText([...TraitI18n.searchNames(u.name), aliases[u.name] || '', ...Object.keys(u.traits || {}).flatMap(TraitI18n.searchNames)].join(' '));
      return terms.every(term => text.includes(term));
    });
    const renderItem = u => {
      const active = state.picker === 'owned' ? owned.has(u.name) : !state.excludedUnits.has(u.name);
      const label = u.label || u.name;
      return '<button type="button" class="picker-item ' + (u.cost ? 'owned-hero ' : '') + (active ? 'selected' : '') + '" data-picker-value="' +
        esc(u.name) + '" aria-pressed="' + active + '" ' + (u.cost ? 'style="' + costStyle(u) + '"' : '') + '>' + asset(u, label) + '<span>' + esc(label) + '</span></button>';
    };
    $('pickerContent').classList.add('unit-picker');
    setHTML($('pickerContent'), [1, 2, 3, 4, 5].map(cost => {
      const cards = matches.filter(u => u.cost === cost).sort((a, b) => t(a.name).localeCompare(t(b.name), TraitI18n.locale));
      return cards.length ? '<section class="picker-cost-group" data-cost="' + cost + '" aria-label="' + cost + '费弈子">' + cards.map(renderItem).join('') + '</section>' : '';
    }).join('') || '<div class="list-empty">—</div>');
  }
  function setEmblemCount(name, value) {
    const count = Math.max(0, Math.min(9, value));
    state.pickerEmblems.set(name, count);
    const item = [...$('pickerContent').querySelectorAll('[data-emblem-item]')].find(el => el.dataset.emblemItem === name);
    item.classList.toggle('selected', count > 0);
    item.querySelector('.emblem-toggle').setAttribute('aria-pressed', String(count > 0));
    item.querySelector('output').textContent = count;
    item.querySelector('[data-emblem-delta="1"]').disabled = count === 9;
    item.querySelector('[data-emblem-delta="-1"]').disabled = count === 0;
  }
  function openSlot(index) {
    const slot = selected()?.lineup[index];
    if (slot?.kind !== 'placeholder' || state.dirty || state.busy) return;
    state.candidateDraft = { candidates: slot.candidates, owned: new Set(state.owned) };
    $('detailTitle').textContent = t(slot.label);
    renderCandidates();
    dialog('detailDialog');
  }
  function renderCandidates() {
    const draft = state.candidateDraft;
    setHTML($('detailContent'), [1, 2, 3, 4, 5].map(cost => {
      const cards = draft.candidates.filter(u => u.cost === cost);
      return cards.length ? '<section class="picker-cost-group" aria-label="' + cost + '费弈子">' + cards.map(u =>
        '<button type="button" class="picker-item owned-hero ' + (draft.owned.has(u.name) ? 'selected' : '') + '" style="' + costStyle(u) +
        '" data-detail-owned="' + esc(u.name) + '" aria-pressed="' + draft.owned.has(u.name) + '">' + asset(u, u.name, draft.owned) + '<span>' + esc(u.name) + '</span></button>').join('') + '</section>' : '';
    }).join(''));
  }
  function toggleCandidateOwned(name) {
    const draft = state.candidateDraft, unit = draft?.candidates.find(u => u.name === name);
    if (!unit) return;
    if (draft.owned.has(name)) draft.owned.delete(name);
    else {
      if (unit.group === '拉克丝') [...draft.owned].forEach(n => { if (state.data.units.find(u => u.name === n)?.group === '拉克丝') draft.owned.delete(n); });
      draft.owned.add(name);
    }
    renderCandidates();
  }
  function clearGame() {
    cancel(true);
    rosterView = null;
    state.emblems = ['裁决使']; state.fixedEvolutions.clear(); state.evolutionCount = 0; state.owned.clear(); state.excludedUnits.clear();
    state.gamePool.clear(); state.results.clear(); state.sortModes.clear(); state.candidateDraft = null; state.matrixMemory = null; state.baseKey = null; state.crowns = 0;
    state.lux = 'auto';
    setPopulation(8); dirty();
  }
  function bind() {
    $('conditionsForm').addEventListener('submit', e => { e.preventDefault(); schedule(); });
    $('emblemButton').onclick = () => openPicker('emblem'); $('ownedButton').onclick = () => openPicker('owned'); $('excludedButton').onclick = () => openPicker('excluded');
    $('luxOptions').addEventListener('change', e => {
      if (e.target.name !== 'lux') return;
      state.lux = e.target.value; dirty();
    });
    $('pickerSearch').oninput = renderPicker;
    $('crownButtons').addEventListener('change', e => {
      if (e.target.name !== 'crowns') return;
      state.crowns = Number(e.target.value); dirty();
    });
    $('evolutionButtons').addEventListener('change', e => {
      if (e.target.name !== 'evolutionCount') return;
      if (state.excludedUnits.has('卡兹克') && e.target.value !== '0') { renderConditions(); toast('卡兹克已禁用'); return; }
      state.evolutionCount = Number(e.target.value); dirty();
    });
    $('cancelButton').onclick = cancel; $('resetButton').onclick = clearGame;
    $('rulesButton').onclick = () => dialog('rulesDialog');
    $('exportButton').onclick = () => {
      const report = { version: state.data.version, emblems: state.emblems, populationLevel: state.population, crowns: state.crowns, evolutionCount: state.evolutionCount, fixedEvolutions: [...state.fixedEvolutions],
        excludedUnits: [...state.excludedUnits], gamePool: [...state.gamePool], sortModes: Object.fromEntries(state.sortModes),
        boundaries: Object.fromEntries([...state.results].map(([p]) => [p, TraitEngine.lossBoundary(state.data.lossReference)])), results: [...state.results.values()], memory: state.matrixMemory };
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'tft-trait-ladder.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.addEventListener('click', e => {
      const b = e.target.closest('button,[role=button]'); if (!b) return;
      if (b.closest('.result-pending')) return;
      if (b.dataset.close) $(b.dataset.close).close();
      if (b.id === 'adoptEvolution') adopt();
      if (b.dataset.unlockEvolution) unlockEvolution(b.dataset.unlockEvolution);
      if (b.dataset.sort) { state.sortModes.set(state.population, b.dataset.sort); state.selectedCount = null; renderCurrent(); persist(); }
      if (b.dataset.removeExcluded) toggleExcluded(b.dataset.removeExcluded);
      if (b.dataset.poolId) toggleOwned(hero(b.dataset.poolId).name);
      if (b.dataset.population) setPopulation(b.dataset.population, true);
      if (b.dataset.plan) { state.selectedCount = Number(b.dataset.plan); renderCurrent(); }
      if (b.dataset.rosterOwned) toggleOwned(b.dataset.rosterOwned, true);
      else if (b.dataset.slot !== undefined) openSlot(Number(b.dataset.slot));
      if (b.dataset.emblemDelta !== undefined) {
        const name = b.dataset.emblemName;
        setEmblemCount(name, (state.pickerEmblems.get(name) || 0) + Number(b.dataset.emblemDelta));
      }
      if (b.dataset.pickerValue !== undefined) {
        if (state.picker === 'emblem') {
          const name = b.dataset.pickerValue;
          setEmblemCount(name, state.pickerEmblems.get(name) ? 0 : 1);
        }
        else if (state.picker === 'excluded') { toggleExcluded(b.dataset.pickerValue); renderPicker(); }
        else { toggleOwned(b.dataset.pickerValue); renderPicker(); }
      }
      if (b.dataset.detailOwned) toggleCandidateOwned(b.dataset.detailOwned);
    });
    document.addEventListener('pointerover', e => {
      const card = e.target.closest('[data-slot]'); if (!card) return;
      const u = selected()?.lineup[Number(card.dataset.slot)]?.unit;
      document.querySelectorAll('#traitList [data-trait]').forEach(row => row.classList.toggle('highlight', Boolean(u?.traits[row.dataset.trait])));
    });
    document.addEventListener('pointerout', e => { if (e.target.closest('[data-slot]')) document.querySelectorAll('.trait-row.highlight').forEach(row => row.classList.remove('highlight')); });
    document.addEventListener('error', e => {
      if (!(e.target instanceof HTMLImageElement) || (!e.target.classList.contains('asset') && !e.target.classList.contains('unit-art'))) return;
      const img = e.target;
      if (img.dataset.fallback && !img.dataset.triedFallback) { img.dataset.triedFallback = '1'; img.src = img.dataset.fallback; return; }
      const fallback = document.createElement('span'); fallback.className = img.className + ' asset-fallback'; fallback.dataset.initial = img.dataset.initial || img.alt.slice(0, 2);
      if (img.dataset.unitName) { fallback.dataset.unitName = img.dataset.unitName; fallback.dataset.owned = img.dataset.owned; }
      fallback.setAttribute('role', 'img'); fallback.setAttribute('aria-label', img.alt); img.replaceWith(fallback);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[role=button]')) e.target.click(); });
    $('detailDialog').addEventListener('close', () => {
      const draft = state.candidateDraft; state.candidateDraft = null;
      if (!draft || JSON.stringify([...draft.owned].sort()) === JSON.stringify([...state.owned].sort())) return;
      state.owned = draft.owned;
      state.owned.forEach(name => {
        const u = state.data.units.find(unit => unit.name === name);
        state.excludedUnits.delete(name); state.excludedUnits.delete(u.group); state.gamePool.add(u.id);
      });
      dirty();
    });
    $('pickerDialog').addEventListener('close', () => {
      if (!state.pickerEmblems) return;
      const emblems = state.data.emblems.flatMap(e => Array(state.pickerEmblems.get(e.name) || 0).fill(e.name));
      state.pickerEmblems = null;
      if (JSON.stringify([...state.emblems].sort()) === JSON.stringify([...emblems].sort())) return;
      state.emblems = emblems; dirty();
    });
    document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => {
      if (e.target !== d) return; const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    }));
  }
  async function init() {
    try {
      state.data = await fetch('./data.json').then(r => { if (!r.ok) throw Error('资料载入失败'); return r.json(); });
      const emblemRows = new Map(state.data.emblems.map(e => [e.name, e]));
      state.data.emblems = orderedTraits([...emblemRows.keys()]).map(name => emblemRows.get(name));
      try {
        const saved = JSON.parse(localStorage.getItem('traitladder-s18') || 'null');
        if (saved) {
          state.emblems = [...countEmblems(saved.emblems || (saved.emblem ? [saved.emblem] : []))].flatMap(([name, count]) => Array(count).fill(name));
          state.population = saved.population || 8;
          state.crowns = [0, 1, 2, 3].includes(saved.crowns) ? saved.crowns : 0;
          if (saved.crowns === undefined && saved.levelManual && saved.level && [0, 1, 2, 3].includes(saved.population - saved.level)) {
            state.population = saved.level; state.crowns = saved.population - saved.level;
          }
          state.fixedEvolutions = new Set((saved.fixedEvolutions || saved.evolutions || []).filter(n => state.data.evolutions.includes(n)));
          state.evolutionCount = Math.max(state.fixedEvolutions.size, [0, 1, 2, 3, 4].includes(saved.evolutionCount) ? saved.evolutionCount : state.fixedEvolutions.size);
          state.owned = new Set((saved.owned || []).filter(n => state.data.units.some(u => u.name === n)));
          state.excludedUnits = new Set((saved.excludedUnits || []).filter(n => state.data.units.some(u => u.name === n)));
          state.gamePool = new Set((saved.gamePool || []).filter(id => Boolean(hero(id))));
          state.sortModes = new Map(Object.entries(saved.sortModes || {}).filter(([, mode]) => ['value', 'traits'].includes(mode)).map(([p, mode]) => [Number(p), mode]));
          state.lux = saved.lux || 'auto';
          state.matrixMemory = saved.matrixMemory || null;
        }
      } catch (_) {}
      setHTML($('dataVersion'), numberText(state.data.version.split(' / ')[0] + ' · ' + state.data.version.split(' / ').at(-1).split(' ')[0]));
      bind(); setPopulation(state.population); renderSorting(); await run();
    } catch (error) { status(error.message, 'error'); }
  }
  init();
})();
