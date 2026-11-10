importScripts('./vendor/highs.js', './engine.js');
const highsReady = Module({ locateFile: file => new URL('./vendor/' + file, self.location.href).href });
let data;
const matrix = new Map();
let activeId;
let pool;
function createTargetPool(data) {
  const size = Math.max(1, Math.min((globalThis.navigator?.hardwareConcurrency || 2) - 1, 4));
  const slots = [];
  let nextJobId = 0, stopped = false;
  function cancel(error = Error('已取消')) {
    stopped = true;
    for (const slot of slots) {
      slot.worker.terminate();
      slot.rejectReady(error);
      slot.pending?.reject(error);
      slot.pending = null;
    }
  }
  async function solveTargets(o, targets, complete) {
    let cursor = 0;
    const results = new Array(targets.length);
    try {
      if (!slots.length) for (let i = 0; i < size; i++) {
        const worker = new Worker('./solve-worker.js');
        const slot = { worker, pending: null };
        slot.ready = new Promise((resolve, reject) => { slot.resolveReady = resolve; slot.rejectReady = reject; });
        // Initialization and job errors use the same pool cancellation path.
        slot.ready.catch(() => {});
        slots.push(slot);
        worker.onmessage = ({ data: reply }) => {
          if (reply.type === 'error') { cancel(Error(reply.message)); return; }
          if (reply.type === 'ready') { slot.resolveReady(); return; }
          if (slot.pending?.jobId !== reply.jobId) return;
          const pending = slot.pending; slot.pending = null;
          pending.resolve(reply.result);
        };
        worker.onerror = event => { event.preventDefault?.(); cancel(Error(event.message || '子 Worker 求解失败')); };
        worker.postMessage({ type: 'init', data });
      }
      await Promise.all(slots.map(async slot => {
        await slot.ready;
        while (cursor < targets.length) {
          if (stopped) throw Error('已取消');
          const index = cursor++, target = targets[index], jobId = ++nextJobId;
          results[index] = await new Promise((resolve, reject) => {
            slot.pending = { jobId, resolve, reject };
            slot.worker.postMessage({ jobId, o, target });
          });
          if (stopped) throw Error('已取消');
          complete(target);
        }
      }));
      return results;
    } catch (error) { cancel(error); throw error; }
  }
  return { solveTargets, cancel };
}
onmessage = async ({ data: message }) => {
  if (message.type === 'cancel') { activeId = null; pool?.cancel(); pool = null; return; }
  const { id, options } = message;
  if (activeId != null) { pool?.cancel(); pool = null; }
  activeId = id;
  try {
    globalThis.highs = await highsReady;
    data ||= await fetch('./data.json').then(r => { if (!r.ok) throw Error('资料加载失败'); return r.json(); });
    if (activeId !== id) return;
    if (typeof Worker !== 'undefined') pool ||= createTargetPool(data);
    const result = await TraitEngine.rank(data, { ...options, selections: options.selections || {} }, progress => {
      if (activeId === id) postMessage({ id, type: 'progress', ...progress });
    }, matrix, () => activeId === id, pool?.solveTargets);
    if (activeId !== id) return;
    activeId = null;
    postMessage({ id, type: 'result', result });
  } catch (error) {
    if (activeId !== id) return;
    activeId = null; pool?.cancel(); pool = null;
    postMessage({ id, type: 'error', message: error.message || String(error) });
  }
};
