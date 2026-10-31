"""自动重载开发服务器。"""
from http.server import ThreadingHTTPServer
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
CLIENT = """(()=>{let revision;async function poll(){try{const r=await fetch('/__dev/version',{cache:'no-store'});if(r.ok){const state=await r.json();if(revision&&revision!==state.revision){location.reload();return}revision=state.revision}}catch{}setTimeout(poll,800)}poll()})();"""


def snapshot():
    result = {}
    for directory in (ROOT / "traitladder", ROOT / "web", ROOT / "data"):
        for path in directory.rglob("*"):
            if path.is_file() and path.suffix in {".py", ".js", ".css", ".html", ".json", ".svg"}:
                stat = path.stat()
                result[str(path)] = (stat.st_mtime_ns, stat.st_size)
    exporter = ROOT / "scripts" / "export_web_data.py"
    result[str(exporter)] = (exporter.stat().st_mtime_ns, exporter.stat().st_size)
    return result


def run_server(host, port, state_path):
    from .api import CalculatorHandler

    class DevelopmentHandler(CalculatorHandler):
        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            route = self.path.split("?", 1)[0]
            if route == "/__dev/version":
                self.send_json(200, json.loads(Path(state_path).read_text()))
            elif route == "/__dev/client.js":
                self.send_bytes(CLIENT.encode(), "text/javascript; charset=utf-8")
            elif route in ("/", "/index.html"):
                html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
                html = html.replace("</body>", '<script src="/__dev/client.js"></script></body>')
                self.send_bytes(html.encode("utf-8"), "text/html; charset=utf-8")
            else:
                super().do_GET()

        def send_bytes(self, content, content_type):
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    server = ThreadingHTTPServer((host, port), DevelopmentHandler)
    print(f"开发服务 http://{host}:{port} · PID {__import__('os').getpid()}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def stop(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=4)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def supervise(host, port):
    child = None
    with tempfile.TemporaryDirectory(prefix="traitladder-dev-") as temp:
        state = Path(temp) / "state.json"

        def revision():
            state.write_text(json.dumps({"revision": str(time.time_ns())}), encoding="utf-8")

        def launch():
            return subprocess.Popen([sys.executable, "-u", "-m", "traitladder.dev", "--child", "--host", host,
                                     "--port", str(port), "--state", str(state)], cwd=ROOT)

        previous = snapshot()
        revision()
        child = launch()
        try:
            while True:
                if child.poll() is not None:
                    return child.returncode
                time.sleep(.4)
                current = snapshot()
                changed = {p for p in previous.keys() | current.keys() if previous.get(p) != current.get(p)}
                if not changed:
                    continue
                backend = any(p.endswith(".py") or p.startswith(str(ROOT / "data")) for p in changed)
                if backend:
                    stop(child)
                    subprocess.run([sys.executable, str(ROOT / "scripts" / "export_web_data.py")], cwd=ROOT, check=True)
                    revision()
                    child = launch()
                    print("后端已自动重载", flush=True)
                else:
                    revision()
                    print("页面已更新", flush=True)
                previous = snapshot()
        except KeyboardInterrupt:
            return 0
        finally:
            stop(child)


def main():
    parser = argparse.ArgumentParser(description="羁绊天梯 / 拼盘天梯自动重载服务")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--state", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.child:
        run_server(args.host, args.port, args.state)
    else:
        raise SystemExit(supervise(args.host, args.port))


if __name__ == "__main__":
    main()
