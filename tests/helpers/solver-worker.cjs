const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const base = path.join(workerData.root, 'web');
const ctx = { console, setTimeout, clearTimeout, performance, URL, location: { href: pathToFileURL(path.join(base, 'worker.js')).href },
  Module: require(path.join(base, 'vendor/highs.js')),
  fetch: async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(base, url), 'utf8')) }), postMessage: message => parentPort.postMessage(message) };
ctx.self = ctx;
vm.createContext(ctx);
ctx.importScripts = (...urls) => urls.filter(url => url !== './vendor/highs.js').forEach(url => vm.runInContext(fs.readFileSync(path.join(base, url), 'utf8'), ctx, { filename: url }));
vm.runInContext(fs.readFileSync(path.join(base, 'worker.js'), 'utf8'), ctx, { filename: 'worker.js' });
parentPort.on('message', message => ctx.onmessage({ data: message }));
