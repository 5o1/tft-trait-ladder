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
    worker_source = (web / 'vendor' / 'solver.js').read_text(encoding='utf-8') + '\n' + engine + '\nconst embeddedWorkerData=' + json.dumps(data, ensure_ascii=False) + ';\nself.fetch=async()=>new Response(JSON.stringify(embeddedWorkerData),{headers:{"Content-Type":"application/json"}});\n' + worker
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
