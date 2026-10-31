importScripts('./vendor/solver.js', './engine.js');
let data;
const matrix = new Map();
let activeId;
onmessage = async ({ data: message }) => {
  if (message.type === 'cancel') { activeId = null; return; }
  const { id, options } = message;
  activeId = id;
  try {
    data ||= await fetch('./data.json').then(r => { if (!r.ok) throw Error('资料加载失败'); return r.json(); });
    const result = await TraitEngine.rank(data, options, progress => postMessage({ id, type: 'progress', ...progress }), matrix, () => activeId === id);
    postMessage({ id, type: 'result', result });
  } catch (error) { postMessage({ id, type: 'error', message: error.message || String(error) }); }
};
