"""生成内嵌脚本和数据的单页预览，游戏图片使用外部链接。"""
import base64
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def main():
    web = ROOT / 'web'
    html = (web / 'index.html').read_text(encoding='utf-8')
    css = (web / 'style.css').read_text(encoding='utf-8')
    svg = {}
    for name in ('frame', 'crest'):
        svg[name] = 'data:image/svg+xml;base64,' + base64.b64encode((web / 'assets' / f'{name}.svg').read_bytes()).decode()
    css = css.replace('./assets/frame.svg', svg['frame'])
    font = base64.b64encode((web / 'assets' / 'fonts' / 'DejaVuMathTeXGyre.ttf').read_bytes()).decode()
    css = css.replace('./assets/fonts/DejaVuMathTeXGyre.ttf', 'data:font/ttf;base64,' + font)
    license_text = (web / 'assets' / 'fonts' / 'LICENSE-DejaVu.txt').read_text(encoding='utf-8')
    css = '/*\n' + license_text + '\n*/\n' + css
    html = html.replace('./assets/crest.svg', svg['crest'])
    html = re.sub(r'\s*<link rel="stylesheet"[^>]*>', '', html)
    html = re.sub(r'\s*<script src="\./(?:i18n|engine|app)\.js" defer></script>', '', html)
    data = json.loads((web / 'data.json').read_text(encoding='utf-8'))
    engine = (web / 'engine.js').read_text(encoding='utf-8')
    app = (web / 'app.js').read_text(encoding='utf-8').replace('./assets/crest.svg', svg['crest'])
    worker = (web / 'worker.js').read_text(encoding='utf-8').split('\n', 1)[1]
    wasm = base64.b64encode((web / 'vendor' / 'highs.wasm').read_bytes()).decode()
    solver = (web / 'vendor' / 'highs.js').read_text(encoding='utf-8')
    solve_worker = (web / 'solve-worker.js').read_text(encoding='utf-8').split('\n', 1)[1]
    solve_source = solver + '\n' + engine + '\n' + solve_worker
    embedded = 'const embeddedWasm=Uint8Array.from(atob(' + json.dumps(wasm) + '), c => c.charCodeAt(0));\n'
    embedded += 'const solveWorkerSource=' + json.dumps(solve_source, ensure_ascii=False) + ';\nlet solveWorkerURL;\n'
    # highs 1.15.4 ignores wasmBinary; instantiate the embedded bytes through its supported hook.
    worker = worker.replace("Module({ locateFile: file => new URL('./vendor/' + file, self.location.href).href })",
                            'Module({ instantiateWasm(imports, receive) { const instance = new WebAssembly.Instance(new WebAssembly.Module(embeddedWasm), imports); receive(instance); return instance.exports; } })')
    worker = worker.replace("new Worker('./solve-worker.js')", 'new Worker(solveWorkerURL ||= URL.createObjectURL(new Blob([solveWorkerSource], {type:"text/javascript"})))')
    worker = worker.replace("worker.postMessage({ type: 'init', data });", "worker.postMessage({ type: 'init', data, wasm: embeddedWasm });")
    solver_license = '\n'.join((web / 'vendor' / name).read_text(encoding='utf-8')
                               for name in ('LICENSE-highs-js.txt', 'LICENSE-HiGHS.txt'))
    worker_source = '/*\n' + solver_license + '\n*/\n' + solver + '\n' + engine + '\n' + embedded + '\nconst embeddedWorkerData=' + json.dumps(data, ensure_ascii=False) + ';\nself.fetch=async()=>new Response(JSON.stringify(embeddedWorkerData),{headers:{"Content-Type":"application/json"}});\n' + worker
    bootstrap = 'const embeddedData=' + json.dumps(data, ensure_ascii=False) + ';\nconst nativeFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=(url,options)=>String(url).endsWith("data.json")?Promise.resolve(new Response(JSON.stringify(embeddedData),{headers:{"Content-Type":"application/json"}})):nativeFetch(url,options);\n'
    bootstrap += 'const InlineNativeWorker=globalThis.Worker;const inlineWorkerSource=' + json.dumps(worker_source, ensure_ascii=False) + ';\nglobalThis.Worker=class extends InlineNativeWorker{constructor(){super(URL.createObjectURL(new Blob([inlineWorkerSource],{type:"text/javascript"})));}};\n'
    i18n = (web / 'i18n.js').read_text(encoding='utf-8')
    script = bootstrap + i18n + '\n' + engine + '\n' + app
    output = ROOT / 'results'
    output.mkdir(exist_ok=True)
    standalone = html.replace('</head>', '<style>' + css + '</style></head>').replace('</body>', '<script>' + script.replace('</script', '<\\/script') + '</script></body>')
    path = output / 'traitladder-preview.html'
    path.write_text(standalone, encoding='utf-8')
    print(path, path.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
