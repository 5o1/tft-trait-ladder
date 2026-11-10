importScripts('./vendor/highs.js', './engine.js');
let data;
onmessage = async ({ data: message }) => {
  try {
    if (message.type === 'init') {
      data = message.data;
      globalThis.highs = await Module(message.wasm ? {
        instantiateWasm(imports, receive) {
          const instance = new WebAssembly.Instance(new WebAssembly.Module(message.wasm), imports);
          receive(instance); return instance.exports;
        }
      } : { locateFile: file => new URL('./vendor/' + file, self.location.href).href });
      postMessage({ type: 'ready' });
      return;
    }
    const { jobId, o, target } = message;
    const result = TraitEngine.solveOne(data, o, { target });
    postMessage({ jobId, result });
  } catch (error) {
    postMessage({ type: 'error', jobId: message.jobId, message: error.message || String(error) });
  }
};
