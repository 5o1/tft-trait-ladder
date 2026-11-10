/* DOM 操作与真实 Worker 线程的长期交互回归。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Worker as Thread } from 'node:worker_threads';
import { parseHTML } from './vendor/linkedom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saved = new Map(), threads = [], errors = [];
const catalogTraits = JSON.parse(fs.readFileSync(path.join(root, 'web/data.json'), 'utf8')).traits;
function assertTraitOrder(names) {
  const rank = name => { const i = catalogTraits.findIndex(t => t.name === name); return (catalogTraits[i].category === 'job' ? catalogTraits.length : 0) + i; };
  assert.deepEqual(names.map(rank), [...names.map(rank)].sort((a, b) => a - b));
}
function boot(languages = ['zh-CN']) {
  const { window, document, HTMLImageElement, HTMLElement, Event } = parseHTML(fs.readFileSync(path.join(root, 'web/index.html'), 'utf8'));
  const requests = [], statuses = [];
  class Worker {
    constructor() {
      this.thread = new Thread(path.join(root, 'tests/helpers/solver-worker.cjs'), { workerData: { root } }); threads.push(this.thread);
      this.thread.on('message', data => {
        this.onmessage?.({ data });
        statuses.push(document.getElementById('calculationStatus').textContent);
      });
      this.thread.on('error', error => { errors.push(error.message); this.onerror?.({ message: error.message }); });
    }
    postMessage(message) { if (message.options) requests.push(JSON.parse(JSON.stringify(message.options))); this.thread.postMessage(message); }
    terminate() { return this.thread.terminate(); }
  }
  HTMLElement.prototype.showModal = function () { this.setAttribute('open', ''); this.open = true; };
  HTMLElement.prototype.close = function () { this.removeAttribute('open'); this.open = false; this.dispatchEvent(new Event('close')); };
  HTMLElement.prototype.scrollIntoView = function () {};
  HTMLElement.prototype.focus = function () {};
  HTMLElement.prototype.getBoundingClientRect = function () { return { height: 0, width: 0, top: 0, left: 0, right: 0, bottom: 0 }; };
  const value = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
  if (!value.set) Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    get() { return (this.querySelector('option[selected]') || this.querySelector('option'))?.value || ''; },
    set(v) { const options = [...this.querySelectorAll('option')]; options.forEach(o => o.removeAttribute('selected')); options.find(o => o.getAttribute('value') === String(v))?.setAttribute('selected', ''); }
  });
  const ctx = { console, document, window, HTMLImageElement, HTMLElement, Event, Worker, setTimeout, clearTimeout, navigator: { languages },
    localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) },
    fetch: async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, 'web', url), 'utf8')) }), URL, Blob };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'web/i18n.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'web/engine.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'web/app.js'), 'utf8'), ctx);
  const $ = id => document.getElementById(id);
  async function until(test, message, timeout = 90000) {
    const start = Date.now();
    while (!test()) {
      if ($('calculationStatus').className.includes('error') || Date.now() - start > timeout) throw Error(message + '\n' + $('calculationStatus').textContent);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  const ready = () => until(() => ['complete', 'partial'].includes($('calculationStatus').dataset.state) && $('conditionsForm').dataset.busy === 'false', '等待计算完成');
  function click(selector) { const el = document.querySelector(selector); assert.ok(el, selector); el.click(); }
  function input(id, v) { $(id).value = v; $(id).dispatchEvent(new Event('change', { bubbles: true })); }
  function evolution(n) { const el = document.querySelector('input[name="evolutionCount"][value="' + n + '"]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  function crown(n) { const el = document.querySelector('input[name="crowns"][value="' + n + '"]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  function lux(value) { const el = document.querySelector('input[name="lux"][value="' + value + '"]'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
  async function recalculate(action) { const before = requests.length; action(); await until(() => requests.length > before, '等待自动计算'); await ready(); }
  return { document, $, click, input, evolution, crown, lux, until, ready, recalculate, requests, statuses, i18n: ctx.TraitI18n };
}
function assertEnglish(ui) {
  const chinese = /[\u3400-\u9fff]/u;
  assert.ok(!chinese.test(ui.document.body.textContent), ui.document.body.textContent.match(/.{0,25}[\u3400-\u9fff].{0,25}/gu)?.join('\n'));
  for (const el of ui.document.querySelectorAll('[title],[alt],[aria-label],[placeholder]')) {
    for (const attribute of ['title', 'alt', 'aria-label', 'placeholder']) {
      assert.ok(!chinese.test(el.getAttribute(attribute) || ''), el.outerHTML);
    }
  }
  assert.ok(ui.statuses.every(text => !chinese.test(text)), ui.statuses.find(text => chinese.test(text)));
}
try {
  let ui = boot();
  await ui.ready();
  assert.match(ui.$('calculationStatus').textContent, /^✓ 已完成 \d+ 个人口等级的计算，共得到 \d+ 套阵容方案。$/);
  assert.equal(ui.document.querySelectorAll('#populationTabs').length, 1);
  assert.equal(ui.$('population'), null);
  assert.equal(ui.$('shopLevel'), null);
  assert.equal(ui.$('maxCost'), null);
  assert.ok(ui.$('conditionsForm').contains(ui.$('luxOptions')));
  assert.deepEqual([...ui.document.querySelectorAll('.population-controls>.population-nav .small-heading')].map(el => el.textContent), ['冠冕', '人口等级', '卡兹克进化次数']);
  assert.equal(ui.document.querySelectorAll('#crownButtons input[type="radio"]').length, 4);
  assert.ok(ui.document.querySelector('.sidebar').contains(ui.$('gamePoolPanel')));
  assert.equal(ui.$('navCalculator'), null);
  assert.equal(ui.document.querySelector('[data-open-rules]'), null);
  assert.ok(ui.$('boundaryBadge').textContent.startsWith('损失阈值'));
  assert.ok(ui.$('rulesDialog').textContent.includes('灰色头像表示你尚未持有'));
  assert.ok(ui.$('rulesDialog').textContent.includes('数值标红'));
  assert.equal(ui.$('sortValue').textContent, '损失 ↑');
  assert.equal(ui.document.querySelector('.comparison-head').lastElementChild.textContent, '损失');
  for (const el of ui.document.querySelectorAll('.row-value, .value-box b')) assert.match(el.textContent.split('✓')[0].split('◷')[0].trim(), /^(0|\d+\.\d)$/);
  assert.ok(ui.document.querySelector('[data-copy="copy17"]').textContent.includes('损失 D'));
  assert.ok(ui.document.querySelector('[data-copy="copy17"]').textContent.includes('无需补牌时为 0'));
  assert.ok([...ui.document.querySelectorAll('[data-plan]')].every(el => /羁绊，损失[\d.]+/.test(el.getAttribute('aria-label'))));
  assert.equal(ui.$('ownedSlots'), null);
  assert.equal(ui.$('calculateButton'), null);
  assert.equal(ui.$('conditionsForm').contains(ui.$('cancelButton')), false);
  assert.ok(ui.document.querySelector('.header-actions').contains(ui.$('cancelButton')));
  assert.equal(ui.$('cancelButton').textContent, '取消计算');
  assert.equal(ui.document.querySelectorAll('#selectedPlan .champion-card').length, 8);
  for (const label of ui.document.querySelectorAll('.row-value small')) assert.match(label.textContent, /^(✓ 已证明最优|◷ 尚未证明最优)$/);
  assert.ok(ui.document.querySelector('#selectedPlan img[src^="https://"]'));
  assert.equal(ui.document.querySelector('#populationTabs [aria-pressed="true"]').textContent, '8');
  assertTraitOrder([...ui.document.querySelectorAll('#traitList [data-trait]')].map(el => el.dataset.trait));
  assertTraitOrder([...ui.document.querySelectorAll('#luxOptions input[name="lux"]')].map(el => el.value).filter(name => !['auto', 'none'].includes(name)));
  for (const card of ui.document.querySelectorAll('#selectedPlan .champion-card')) assertTraitOrder([...card.querySelectorAll('.champion-traits .asset')].map(el => el.getAttribute('alt')));

  const frozenPanels = [['selectedPlan', 480.5], ['activeTraitsPanel', 670], ['comparisonPanel', 920]].map(([id, height]) => {
    const panel = ui.$(id), content = [...panel.children], measurements = { count: 0 };
    panel.getBoundingClientRect = () => { measurements.count++; return { height, width: 400 }; };
    return { panel, height, content, measurements };
  });
  const previousCard = ui.document.querySelector('[data-roster-owned]');
  const previousOwned = JSON.parse(saved.get('traitladder-s18')).owned;
  await ui.recalculate(() => {
    ui.click('[data-population="9"]');
    assert.equal(ui.$('selectedPlan').dataset.state, 'pending');
    assert.equal(ui.$('selectedPlan').getAttribute('aria-busy'), 'true');
    assert.equal(ui.document.querySelector('#selectedPlan .result-overlay h2').textContent, '9 人口');
    for (const { panel, height, content } of frozenPanels) {
      assert.equal(panel.style.height, height + 'px');
      assert.ok(panel.classList.contains('result-pending'));
      assert.equal(panel.querySelectorAll('.result-overlay').length, 1);
      assert.ok(panel.querySelector('.result-overlay .calculation-spinner'));
      assert.ok(content.every(child => child.parentElement === panel && child.hasAttribute('inert') && child.getAttribute('aria-hidden') === 'true'));
    }
    previousCard.click();
    assert.deepEqual(JSON.parse(saved.get('traitladder-s18')).owned, previousOwned);
    assert.ok(ui.$('exportButton').disabled);
  });
  for (const { panel, measurements } of frozenPanels) {
    assert.equal(panel.style.getPropertyValue('height') || '', '');
    assert.equal(panel.querySelector('.result-overlay'), null);
    assert.ok(!panel.classList.contains('result-pending'));
    assert.ok([...panel.children].every(child => !child.hasAttribute('inert') && !child.hasAttribute('aria-hidden')));
    assert.equal(measurements.count, 1);
  }
  assert.equal(ui.document.querySelector('.plan-heading h2').textContent, '9 人口');
  assert.equal(ui.$('selectedPlan').getAttribute('aria-busy'), 'false');
  const beforeCachedPopulation = ui.requests.length;
  ui.click('[data-population="8"]');
  assert.equal(ui.$('selectedPlan').dataset.state, 'ready');
  assert.equal(ui.document.querySelector('.plan-heading h2').textContent, '8 人口');
  assert.equal(ui.requests.length, beforeCachedPopulation);

  ui.click('#emblemButton'); assert.ok(ui.$('pickerDialog').open);
  assert.equal(ui.$('pickerSearch').hidden, true);
  assert.equal(ui.document.querySelectorAll('[data-picker-value]').length, 20);
  assert.equal(ui.document.querySelector('[data-picker-value=""]'), null);
  assertTraitOrder([...ui.document.querySelectorAll('[data-emblem-item]')].map(el => el.dataset.emblemItem));
  assert.deepEqual([...ui.document.querySelectorAll('.trait-group-heading')].map(el => el.textContent), ['羁绊', '职业']);
  const beforePicker = ui.requests.length;
  ui.click('[data-picker-value="裁决使"]'); ui.click('[data-picker-value="裁决使"]'); ui.click('[data-picker-value="斗士"]');
  ui.click('[data-picker-value="法师"]'); ui.click('[data-picker-value="法师"]');
  assert.equal(ui.$('pickerDialog').open, true);
  assert.equal(ui.document.querySelector('[data-picker-value="裁决使"]').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.document.querySelector('[data-picker-value="斗士"]').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.document.querySelector('[data-picker-value="法师"]').getAttribute('aria-pressed'), 'false');
  const emblemItem = ui.document.querySelector('[data-emblem-item="裁决使"]');
  for (let i = 0; i < 10; i++) ui.click('[data-emblem-name="裁决使"][data-emblem-delta="1"]');
  assert.equal(emblemItem.querySelector('output').textContent, '9');
  assert.equal(emblemItem.querySelector('[data-emblem-delta="1"]').disabled, true);
  for (let i = 0; i < 8; i++) ui.click('[data-emblem-name="裁决使"][data-emblem-delta="-1"]');
  assert.equal(emblemItem.querySelector('output').textContent, '1');
  assert.equal(ui.document.querySelector('[data-emblem-item="裁决使"]'), emblemItem);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(ui.requests.length, beforePicker);
  await ui.recalculate(() => ui.click('[data-close="pickerDialog"]'));
  assert.equal(ui.$('pickerDialog').open, false);
  assert.equal(ui.document.querySelector('#pickerDialog .dialog-footer'), null);
  assert.equal(ui.document.querySelectorAll('#pickerDialog [data-close]').length, 1);
  assert.equal(ui.requests.length, beforePicker + 1);
  assert.deepEqual([...ui.requests.at(-1).emblems].sort(), ['斗士', '裁决使'].sort());
  assert.equal(ui.$('emblemName').textContent, '共 2 枚转职纹章');
  await ui.recalculate(() => { ui.click('#emblemButton'); ui.click('[data-picker-value="斗士"]'); ui.click('[data-close="pickerDialog"]'); });
  const afterPicker = ui.requests.length;
  ui.click('#emblemButton'); ui.click('[data-picker-value="斗士"]'); ui.click('[data-picker-value="斗士"]'); ui.click('[data-close="pickerDialog"]');
  await new Promise(resolve => setTimeout(resolve, 350)); assert.equal(ui.requests.length, afterPicker);

  const orderedRows = () => [...ui.document.querySelectorAll('[data-plan]')];
  const byValue = orderedRows().map(row => Number(row.dataset.plan));
  const calls = ui.requests.length;
  const selectedBeforeSort = ui.document.querySelector('.plan-row.selected').dataset.plan;
  const selectionsBeforeSort = JSON.parse(saved.get('traitladder-s18')).selections;
  ui.click('#sortTraits');
  assert.equal(ui.document.querySelector('.plan-row.selected').dataset.plan, selectedBeforeSort);
  assert.deepEqual(JSON.parse(saved.get('traitladder-s18')).selections, selectionsBeforeSort);
  const byTraits = orderedRows().map(row => Number(row.dataset.plan));
  assert.deepEqual(byTraits, [...byTraits].sort((a, b) => b - a));
  ui.click('#sortValue'); assert.deepEqual(orderedRows().map(row => Number(row.dataset.plan)), byValue);
  assert.equal(ui.requests.length, calls);
  const cut = Number(ui.$('valueThreshold').textContent);
  assert.ok(cut > 0);
  for (const row of orderedRows()) assert.equal(row.classList.contains('below-value-threshold'), Number(row.querySelector('.row-value').firstChild.textContent) > cut);

  ui.click('[data-population="4"]');
  assert.equal(ui.document.querySelector('.plan-heading h2').textContent, '4 人口');
  ui.click('#sortTraits'); ui.click('[data-plan="5"]');
  assert.equal(JSON.parse(saved.get('traitladder-s18')).selections['4,0,0'], 5);
  const fixedCard = ui.document.querySelector('.champion-card:not(.flex-card)');
  assert.equal(fixedCard.tagName, 'BUTTON');
  const flex = ui.document.querySelector('.champion-card.flex-card'); assert.ok(flex);
  flex.click(); assert.ok(ui.$('detailDialog').open);
  const beforeCandidate = ui.requests.length, beforeOwned = JSON.parse(saved.get('traitladder-s18')).owned;
  const candidate = ui.document.querySelector('[data-detail-owned]').dataset.detailOwned;
  ui.click('[data-detail-owned="' + candidate + '"]');
  assert.ok(ui.$('detailDialog').open);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(ui.requests.length, beforeCandidate);
  assert.deepEqual(JSON.parse(saved.get('traitladder-s18')).owned, beforeOwned);
  ui.click('[data-detail-owned="' + candidate + '"]'); ui.click('[data-close="detailDialog"]');
  await new Promise(resolve => setTimeout(resolve, 350)); assert.equal(ui.requests.length, beforeCandidate);
  flex.click(); ui.click('[data-detail-owned="' + candidate + '"]');
  await ui.recalculate(() => ui.click('[data-close="detailDialog"]'));
  assert.ok(ui.requests.at(-1).owned.includes(candidate));
  assert.equal(ui.requests.length, beforeCandidate + 1);
  await ui.recalculate(() => ui.click('[data-population="8"]')); assert.equal(ui.$('sortValue').getAttribute('aria-pressed'), 'true');
  ui.click('[data-population="4"]'); assert.equal(ui.$('sortTraits').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.document.querySelector('.plan-row.selected').dataset.plan, '5');
  assert.equal(ui.requests.at(-1).selections['4,0,0'], 5);

  await ui.recalculate(() => ui.lux('none'));
  assert.equal(ui.requests.at(-1).lux, 'none');
  assert.ok(ui.document.querySelector('input[name="lux"][value="none"]').hasAttribute('checked'));
  await ui.recalculate(() => ui.lux('auto'));

  await ui.recalculate(() => ui.crown(1));
  assert.equal(ui.requests.at(-1).population, 5); assert.equal(ui.requests.at(-1).level, 4);
  assert.equal(ui.requests.at(-1).crowns, 1);
  assert.ok(ui.document.querySelector('.plan-heading h2').textContent.startsWith('5 人口'));
  const odds = ui.$('shopOdds').textContent;
  await ui.recalculate(() => ui.crown(3));
  assert.equal(ui.requests.at(-1).population, 7); assert.equal(ui.requests.at(-1).level, 4);
  assert.equal(ui.$('shopOdds').textContent, odds);
  await ui.recalculate(() => ui.crown(0));

  const pool = new Set([...ui.document.querySelectorAll('[data-pool-id]')].map(b => b.dataset.poolId));
  assert.ok(pool.size > 8);
  const costs = [...ui.document.querySelectorAll('.pool-row')].map(row => Number(row.dataset.cost));
  assert.deepEqual(costs, [...costs].sort());
  const shown = [...ui.document.querySelectorAll('#selectedPlan .champion-card:not(.flex-card)')].find(card => card.querySelector('.unit-art').dataset.owned === 'false');
  const name = shown.querySelector('.unit-art').dataset.unitName;
  const instances = () => [...ui.document.querySelectorAll('.unit-art')].filter(el => el.dataset.unitName === name);
  assert.ok(instances().length >= 3);
  assert.ok(instances().every(el => el.dataset.owned === 'false'));
  const card = [...ui.document.querySelectorAll('[data-pool-id]')].find(el => el.querySelector('.unit-art').dataset.unitName === name);
  const secondCard = [...ui.document.querySelectorAll('#selectedPlan [data-roster-owned]')].find(el => el.dataset.rosterOwned !== name);
  assert.ok(secondCard);
  const secondName = secondCard.dataset.rosterOwned;
  const secondOwned = !JSON.parse(saved.get('traitladder-s18')).owned.includes(secondName);
  const originalRoster = ui.$('selectedPlan').querySelector('.champion-grid');
  const beforeRosterRequests = ui.requests.length;
  await ui.recalculate(() => {
    shown.click();
    assert.ok(!ui.$('detailDialog').open);
    assert.ok(instances().every(el => el.dataset.owned === 'true'));
    assert.equal(ui.$('selectedPlan').dataset.state, 'updating');
    assert.equal(ui.$('selectedPlan').querySelector('.champion-grid'), originalRoster);
    assert.equal(ui.$('selectedPlan').querySelector('.result-overlay'), null);
    assert.ok(!originalRoster.hasAttribute('inert'));
    secondCard.click();
    assert.equal(ui.$('selectedPlan').querySelector('.champion-grid'), originalRoster);
    assert.equal(secondCard.querySelector('.unit-art').dataset.owned, String(secondOwned));
    assert.equal(ui.$('activeTraitsPanel').dataset.state, 'pending');
    assert.equal(ui.$('comparisonPanel').dataset.state, 'pending');
  });
  assert.equal(ui.requests.length, beforeRosterRequests + 1);
  assert.ok(ui.requests.at(-1).owned.includes(name));
  assert.equal(ui.requests.at(-1).owned.includes(secondName), secondOwned);
  assert.ok(instances().every(el => el.dataset.owned === 'true'));
  assert.ok(ui.document.querySelector('[data-pool-id="' + card.dataset.poolId + '"]').classList.contains('selected'));
  assert.ok([...pool].every(id => ui.document.querySelector('[data-pool-id="' + id + '"]')));

  await ui.recalculate(() => {
    ui.click('#ownedButton'); assert.equal(ui.$('pickerSearch').hidden, false);
    ui.$('pickerSearch').value = '沙皇'; ui.$('pickerSearch').dispatchEvent(new ui.document.defaultView.Event('input'));
    if (ui.document.querySelector('[data-picker-value="阿兹尔"]').getAttribute('aria-pressed') === 'true') ui.click('[data-picker-value="阿兹尔"]');
    ui.click('[data-picker-value="阿兹尔"]');
  });
  ui.click('[data-close="pickerDialog"]'); assert.ok(ui.document.querySelector('#gamePool .pool-card.selected[title="阿兹尔"]'));
  await ui.recalculate(() => { ui.click('#excludedButton'); ui.click('[data-picker-value="阿兹尔"]'); });
  ui.click('[data-close="pickerDialog"]'); assert.ok(ui.requests.at(-1).excludedUnits.includes('阿兹尔'));
  assert.ok(!ui.requests.at(-1).owned.includes('阿兹尔'));
  assert.equal(ui.document.querySelector('#gamePool .pool-card[title="阿兹尔"]').getAttribute('aria-pressed'), 'false');
  assert.ok(!ui.document.querySelector('#selectedPlan .champion-card[title^="阿兹尔"]'));

  await ui.recalculate(() => ui.crown(1));
  await ui.recalculate(() => ui.evolution(1));
  assert.equal(ui.document.querySelectorAll('#evolutionButtons input[type="radio"]').length, 5);
  assert.equal(ui.document.querySelectorAll('#evolutionMemory>.evolution-trait').length, 1);
  await ui.recalculate(() => ui.click('#adoptEvolution'));
  const fixed = JSON.parse(saved.get('traitladder-s18')).fixedEvolutions;
  assert.equal(fixed.length, 1);
  assert.equal(ui.document.querySelector('input[name="evolutionCount"][value="0"]').disabled, true);
  await ui.recalculate(() => ui.click('[data-population="5"]'));
  assert.deepEqual(ui.requests.at(-1).fixedEvolutions, fixed);

  ui = boot(); await ui.ready();
  assert.equal(ui.document.querySelectorAll('#evolutionMemory>.evolution-trait').length, 1);
  assert.equal(ui.requests[0].evolutionCount, 1);
  assert.equal(ui.requests[0].crowns, 1);
  assert.equal(ui.requests[0].population, ui.requests[0].level + 1);
  assert.deepEqual(ui.requests[0].fixedEvolutions, fixed);
  assert.deepEqual(ui.requests[0].selections, JSON.parse(saved.get('traitladder-s18')).selections);
  assert.equal(ui.requests[0].selections['4,0,0'], 5);
  assert.ok(ui.document.querySelectorAll('[data-pool-id]').length >= pool.size);
  const beforeUnlock = JSON.parse(saved.get('traitladder-s18'));
  await ui.recalculate(() => ui.click('[data-unlock-evolution="' + fixed[0] + '"]'));
  const unlocked = JSON.parse(saved.get('traitladder-s18'));
  assert.deepEqual(unlocked.fixedEvolutions, []);
  assert.equal(unlocked.evolutionCount, beforeUnlock.evolutionCount - 1);
  assert.equal(unlocked.population, beforeUnlock.population);
  assert.equal(unlocked.crowns, beforeUnlock.crowns);
  assert.deepEqual(unlocked.owned, beforeUnlock.owned);
  assert.deepEqual(unlocked.excludedUnits, beforeUnlock.excludedUnits);
  assert.deepEqual(ui.requests.at(-1).fixedEvolutions, []);
  assert.equal(ui.requests.at(-1).evolutionCount, beforeUnlock.evolutionCount - 1);
  assert.ok(ui.document.querySelector('input[name="evolutionCount"][value="0"]').hasAttribute('checked'));
  assert.equal(ui.document.querySelector('input[name="evolutionCount"][value="0"]').disabled, false);
  await ui.recalculate(() => ui.click('#resetButton'));
  const reset = JSON.parse(saved.get('traitladder-s18'));
  assert.deepEqual(reset.fixedEvolutions, []); assert.deepEqual(reset.owned, []); assert.deepEqual(reset.excludedUnits, []);
  assert.equal(reset.evolutionCount, 0);
  assert.equal(reset.crowns, 0);
  assert.equal(reset.lux, 'auto');
  assert.deepEqual(reset.selections, {});
  assert.equal(ui.document.querySelectorAll('#evolutionMemory>.evolution-trait').length, 0);
  assert.equal(ui.document.querySelector('#populationTabs [aria-pressed="true"]').textContent, '8');

  saved.set('traitladder-s18', JSON.stringify({ population: 4, emblems: ['主宰'], owned: ['卡兹克'], evolutionCount: 0 }));
  ui = boot(); await ui.ready();
  const originalCards = [...ui.document.querySelectorAll('#selectedPlan .champion-card')];
  const originalImages = originalCards.map(card => card.querySelector('.unit-art'));
  const rakan = originalCards.find(card => card.dataset.rosterOwned === '洛');
  assert.ok(rakan);
  for (const expected of ['true', 'false']) {
    await ui.recalculate(() => rakan.click());
    const current = [...ui.document.querySelectorAll('#selectedPlan .champion-card')];
    assert.ok(current.every((card, i) => card === originalCards[i] && card.querySelector('.unit-art') === originalImages[i]));
    assert.equal(rakan.querySelector('.unit-art').dataset.owned, expected);
  }
  const rivalSlot = ui.document.querySelector('#selectedPlan .flex-card');
  assert.ok(rivalSlot);
  await ui.recalculate(() => { ui.click('#ownedButton'); ui.click('[data-picker-value="雷恩加尔"]'); });
  ui.click('[data-close="pickerDialog"]');
  assert.equal(ui.document.querySelector('#selectedPlan .flex-card'), rivalSlot);
  rivalSlot.click();
  assert.equal(ui.document.querySelector('[data-detail-owned="雷恩加尔"]').getAttribute('aria-pressed'), 'true');
  ui.click('[data-detail-owned="雷恩加尔"]');
  await ui.recalculate(() => ui.click('[data-close="detailDialog"]'));
  rivalSlot.click();
  assert.equal(ui.document.querySelector('[data-detail-owned="雷恩加尔"]').getAttribute('aria-pressed'), 'false');
  ui.click('[data-close="detailDialog"]');

  ui.click('#emblemButton');
  const beforeQuantity = ui.requests.length;
  ui.click('[data-emblem-name="主宰"][data-emblem-delta="1"]');
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(ui.requests.length, beforeQuantity);
  await ui.recalculate(() => ui.click('[data-close="pickerDialog"]'));
  assert.deepEqual(ui.requests.at(-1).emblems, ['主宰', '主宰']);
  ui = boot(); await ui.ready();
  assert.deepEqual(ui.requests[0].emblems, ['主宰', '主宰']);
  ui.click('#emblemButton');
  const quantityItem = ui.document.querySelector('[data-emblem-item="主宰"]');
  assert.equal(quantityItem.querySelector('output').textContent, '2');
  for (let i = 0; i < 3; i++) ui.click('[data-emblem-name="主宰"][data-emblem-delta="-1"]');
  assert.equal(quantityItem.querySelector('output').textContent, '0');
  assert.equal(quantityItem.querySelector('[data-emblem-delta="-1"]').disabled, true);
  await ui.recalculate(() => ui.click('[data-close="pickerDialog"]'));
  assert.deepEqual(ui.requests.at(-1).emblems, []);
  assert.equal(ui.$('emblemName').textContent, '选择转职');
  ui.click('#rulesButton'); assert.ok(ui.$('rulesDialog').open); ui.click('[data-close="rulesDialog"]');

  const beforeLanguageChange = JSON.parse(saved.get('traitladder-s18'));
  ui = boot([]); await ui.ready();
  assert.equal(ui.document.documentElement.lang, 'en');
  assert.equal(ui.document.title, 'TFT Trait Ladder · Set 18');
  assert.equal(ui.i18n.translate('卡兹克'), "Kha'Zix");
  assert.equal(ui.document.querySelector('.population-nav .small-heading').textContent, "Tactician's Crowns");
  assert.match(ui.$('calculationStatus').textContent, /^✓ Calculated \d+ player levels and found \d+ lineups\.$/);
  assert.equal(ui.$('emblemName').textContent, 'Choose emblems');
  assert.deepEqual(ui.requests[0].owned, beforeLanguageChange.owned);
  assert.deepEqual(ui.requests[0].memory, beforeLanguageChange.matrixMemory);
  assert.equal(ui.document.querySelector('.plan-heading h2').textContent, '4 slots');
  assert.ok(ui.$('algorithmTitle').textContent.includes('How lineups are calculated'));
  assert.ok(ui.document.querySelector('.algorithm-body var'));
  assert.equal(ui.$('algorithmThreshold').textContent, ui.$('valueThreshold').textContent);
  assertEnglish(ui);
  for (const { name } of JSON.parse(fs.readFileSync(path.join(root, 'web/data.json'), 'utf8')).units.concat(catalogTraits)) {
    assert.ok(!/[\u3400-\u9fff]/u.test(ui.i18n.translate(name)), name);
  }
  const englishCards = [...ui.document.querySelectorAll('#selectedPlan .champion-card')];
  const englishOwnedCard = englishCards.find(card => card.hasAttribute('data-roster-owned'));
  await ui.recalculate(() => englishOwnedCard.click());
  assert.ok(englishCards.every((card, i) => card === ui.document.querySelectorAll('#selectedPlan .champion-card')[i]));
  assertEnglish(ui);
  ui.click('#emblemButton');
  assert.deepEqual([...ui.document.querySelectorAll('.trait-group-heading')].map(el => el.textContent), ['Origins', 'Classes']);
  assertEnglish(ui);
  await ui.recalculate(() => { ui.click('[data-emblem-name="主宰"][data-emblem-delta="1"]'); ui.click('[data-close="pickerDialog"]'); });
  assert.equal(ui.$('emblemName').textContent, 'Juggernaut Emblem');
  assertEnglish(ui);
  ui.click('#ownedButton'); assertEnglish(ui);
  ui.$('pickerSearch').value = 'lux';
  ui.$('pickerSearch').dispatchEvent(new ui.document.defaultView.Event('input'));
  assert.equal(ui.document.querySelectorAll('[data-picker-value]').length, 1);
  assert.equal(ui.document.querySelector('[data-picker-value]').dataset.pickerValue, '拉克丝');
  const searchCards = text => {
    ui.$('pickerSearch').value = text;
    ui.$('pickerSearch').dispatchEvent(new ui.document.defaultView.Event('input'));
    return [...ui.document.querySelectorAll('[data-picker-value]')].map(card => card.dataset.pickerValue).sort();
  };
  for (const [name, alias] of [['Brawler', 'Bruiser'], ['Spellweaver', 'Arcanist'], ['Sprykin', 'Yordle']]) {
    const expected = searchCards(name);
    assert.ok(expected.length > 0);
    assert.deepEqual(searchCards(alias), expected);
  }
  ui.click('[data-close="pickerDialog"]');
  ui.click('#excludedButton'); assertEnglish(ui); ui.click('[data-close="pickerDialog"]');
  ui.document.querySelector('#selectedPlan .flex-card').click();
  assert.match(ui.$('detailTitle').textContent, /^Any /);
  assertEnglish(ui); ui.click('[data-close="detailDialog"]');
  await ui.recalculate(() => ui.evolution(1));
  assertEnglish(ui);
  await ui.recalculate(() => ui.click('#adoptEvolution'));
  assert.match(ui.$('evolutionMemory').textContent, /✓ Confirmed/);
  assertEnglish(ui);
  const confirmed = JSON.parse(saved.get('traitladder-s18'));
  ui = boot(['zh-TW', 'en-US']); await ui.ready();
  assert.equal(ui.document.documentElement.lang, 'zh-CN');
  assert.equal(ui.$('resetButton').textContent, '重置');
  assert.deepEqual(ui.requests[0].fixedEvolutions, confirmed.fixedEvolutions);
  assert.deepEqual(ui.requests[0].owned, confirmed.owned);
  ui.click('#ownedButton');
  ui.$('pickerSearch').value = "Kha'Zix";
  ui.$('pickerSearch').dispatchEvent(new ui.document.defaultView.Event('input'));
  assert.equal(ui.document.querySelectorAll('[data-picker-value]').length, 1);
  assert.equal(ui.document.querySelector('[data-picker-value]').dataset.pickerValue, '卡兹克');
  ui.click('[data-close="pickerDialog"]');
  ui = boot(['en-GB', 'zh-CN']); await ui.ready();
  assert.equal(ui.document.documentElement.lang, 'en'); assertEnglish(ui);
  assert.equal(ui.i18n.translate('1 人口'), '1 slot');
  assert.equal(ui.i18n.translate('当前设置下最高可能激活 1 羁绊'), 'The current settings can activate at most 1 trait.');
  assert.equal(ui.i18n.translate('✓ 已完成 1 个人口等级的计算，共得到 1 套阵容方案。'), '✓ Calculated 1 player level and found 1 lineup.');
  assert.equal(ui.i18n.translate('✓ 已完成 2 个人口等级的计算，共得到 3 套阵容方案。'), '✓ Calculated 2 player levels and found 3 lineups.');
  for (const [browser, expected] of [[{}, 'en'], [{ language: 'fr-FR' }, 'en'], [{ language: 'zh-Hant' }, 'zh-CN'], [{ languages: ['fr-FR', 'zh-CN'] }, 'zh-CN']]) {
    assert.equal(ui.i18n.detectLanguage(browser), expected);
  }
  saved.set('traitladder-s18', JSON.stringify({ population: 1, emblems: [], owned: ['卡兹克'], evolutionCount: 0 }));
  ui = boot(['en-US']); await ui.ready();
  assert.equal(ui.document.querySelector('.plan-heading h2').textContent, '1 slot');
  assert.equal(ui.$('calculationStatus').textContent, '✓ Calculated 1 player level and found 1 lineup.');
  assert.equal(ui.document.querySelector('.plan-note').textContent, 'The current settings can activate at most 1 trait.');
  assertEnglish(ui);
  saved.set('traitladder-s18', JSON.stringify({ population: 3, emblems: ['主宰'], owned: ['拉克丝 (地狱火)'], lux: 'auto' }));
  ui = boot(); await ui.ready();
  const luxPool = () => ui.document.querySelector('#gamePool .pool-card[title="拉克丝"]');
  const luxPicker = () => ui.document.querySelector('[data-picker-value="拉克丝"]');
  assert.deepEqual(ui.requests.at(-1).owned, ['拉克丝']);
  assert.equal(ui.requests.at(-1).lux, '地狱火');
  assert.equal(ui.document.querySelectorAll('#gamePool .pool-card[title^="拉克丝"]').length, 1);
  assert.ok(luxPool().querySelector('[data-lux-form="地狱火"]'));
  ui.click('#ownedButton');
  assert.equal(ui.document.querySelectorAll('[data-picker-value^="拉克丝"]').length, 1);
  assert.ok(luxPicker().querySelector('[data-lux-form="地狱火"]'));
  await ui.recalculate(() => ui.click('[data-picker-value="拉克丝"]'));
  assert.deepEqual(ui.requests.at(-1).owned, []);
  assert.equal(ui.requests.at(-1).lux, '地狱火');
  assert.equal(luxPicker().getAttribute('aria-pressed'), 'false');
  ui.click('[data-close="pickerDialog"]');
  await ui.recalculate(() => ui.lux('花仙子'));
  assert.ok(luxPool().querySelector('[data-lux-form="花仙子"]'));
  assert.equal(luxPool().querySelector('.unit-art').dataset.owned, 'false');
  await ui.recalculate(() => { ui.click('#ownedButton'); ui.click('[data-picker-value="拉克丝"]'); });
  assert.deepEqual(ui.requests.at(-1).owned, ['拉克丝']);
  assert.equal(ui.requests.at(-1).lux, '花仙子');
  assert.equal(luxPicker().querySelector('.unit-art').dataset.owned, 'true');
  assert.ok(luxPicker().querySelector('[data-lux-form="花仙子"]'));
  ui.click('[data-close="pickerDialog"]');
  await ui.recalculate(() => ui.lux('auto'));
  assert.deepEqual(ui.requests.at(-1).owned, ['拉克丝']);
  assert.equal(luxPool().querySelector('.lux-form-badge'), null);
  assert.equal(luxPool().querySelector('.unit-art').dataset.owned, 'true');
  await ui.recalculate(() => { ui.click('#excludedButton'); ui.click('[data-picker-value="拉克丝"]'); });
  assert.deepEqual(ui.requests.at(-1).owned, []);
  assert.deepEqual(ui.requests.at(-1).excludedUnits, ['拉克丝']);
  assert.equal(luxPicker().getAttribute('aria-pressed'), 'false');
  ui.click('[data-close="pickerDialog"]');
  ui = boot(); await ui.ready();
  assert.equal(ui.requests[0].lux, 'auto');
  assert.deepEqual(ui.requests[0].owned, []);
  assert.deepEqual(ui.requests[0].excludedUnits, ['拉克丝']);
  assert.equal(luxPool().querySelector('.lux-form-badge'), null);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('DOM + Worker 交互回归通过：重算时保持区域高度、阵容连续持有操作、人口缓存、转职关闭后计算、冠冕与进化、双排序、卡池、本局记忆、中英文界面与浏览器语言识别。');
} finally { await Promise.all(threads.map(thread => thread.terminate())); }
