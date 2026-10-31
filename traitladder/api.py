"""JSON 计算接口与 HTTP 服务。"""
from dataclasses import asdict
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import json
from pathlib import Path

from .data import load_data, normalize_emblems
from .value import rank_matrix


@lru_cache(maxsize=1)
def catalog():
    return load_data()


def calculate(request, *, data=None, shop_data=None):
    """计算 JSON 请求中的各人口方案、排序和自动分界。"""
    if not isinstance(request, dict):
        raise ValueError("请求体应为 JSON 对象")
    fields = {"emblem", "emblems", "population", "populations", "crowns", "shop_level", "evolutions", "fixed_evolutions", "evolution_count",
              "excluded_units", "owned", "taken", "lux", "time_limit", "trait_counts", "minimum_traits", "sort", "memory"}
    unknown = request.keys() - fields
    if unknown:
        raise ValueError("未知参数：" + "、".join(sorted(unknown)))
    data = data or catalog()
    if "emblem" in request and "emblems" in request:
        raise ValueError("请选择 emblems 参数")
    emblems = normalize_emblems(request.get("emblems", request.get("emblem")), data)
    populations = request.get("populations", [request.get("population", 8)])
    if not isinstance(populations, list) or not populations:
        raise ValueError("populations 应为人口整数列表")
    if any(type(p) is not int or not 1 <= p <= 20 for p in populations):
        raise ValueError("人口须为 1–20 的整数")
    crowns = request.get("crowns", 0)
    if type(crowns) is not int or not 0 <= crowns <= 3:
        raise ValueError("冠冕数量应为 0–3")
    for field in ("owned", "excluded_units", "evolutions", "fixed_evolutions"):
        value = request.get(field, [])
        if not isinstance(value, (list, tuple)) or any(not isinstance(n, str) for n in value):
            raise ValueError(field + " 应为名称列表")
    if "population" in request and "populations" in request:
        raise ValueError("请选择 population 或 populations 参数")
    mode = request.get("sort", "value")
    if mode not in ("value", "traits"):
        raise ValueError("sort 应为 value 或 traits")
    if "fixed_evolutions" in request and "evolutions" in request:
        raise ValueError("请选择 fixed_evolutions 参数")
    options = {name: request[name] for name in ("evolution_count", "excluded_units", "lux", "time_limit") if name in request}
    options["evolutions"] = request.get("fixed_evolutions", request.get("evolutions", []))
    from .solver import resolve_evolutions
    fixed, count = resolve_evolutions(options.pop("evolutions"), options.pop("evolution_count", None))
    excluded = set(request.get("excluded_units", []))
    groups = {u.name: u.group for u in data.units}
    owned = [name for name in request.get("owned", []) if name not in excluded and groups.get(name) not in excluded]
    cells = {}
    results = []
    for population in populations:
        level = request["shop_level"] if request.get("shop_level") is not None else population - crowns
        state_crowns = crowns if "crowns" in request or request.get("shop_level") is None else population - level
        if population != level + state_crowns or not 0 <= state_crowns <= 3:
            raise ValueError("阵容人口应等于人口等级加冠冕数量")
        results.append(rank_matrix(data, level, state_crowns, count, emblems, trait_counts=request.get("trait_counts"),
                                   owned=owned, taken=request.get("taken", {}),
                                   evolutions=fixed, shop_data=shop_data, cache=cells, minimum_traits=request.get("minimum_traits", 2), memory=request.get("memory"), **options))
    return {"version": data.version, "emblems": list(emblems), "emblem": emblems[0] if len(emblems) == 1 else None, "sort": mode, "crowns": crowns,
            "excluded_units": list(request.get("excluded_units", [])),
            "fixed_evolutions": list(fixed), "results": results,
            "states": [cells[key] for key in sorted(cells)], "memory": results[-1]["memory"]}


class CalculatorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parent.parent / "web"), **kwargs)

    def send_json(self, status, value):
        payload = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/api/catalog":
            data = catalog()
            self.send_json(200, {"version": data.version, "units": [asdict(u) for u in data.units],
                                 "traits": [asdict(t) for t in data.traits], "emblems": data.emblems})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != "/api/solve":
            self.send_json(404, {"error": "接口路径不存在"})
            return
        try:
            request = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            result = calculate(request)
        except (ValueError, TypeError) as error:
            self.send_json(400, {"error": str(error)})
        except RuntimeError as error:
            self.send_json(500, {"error": str(error)})
        else:
            self.send_json(200, result)


def main():
    parser = argparse.ArgumentParser(description="羁绊天梯 / 拼盘天梯 HTTP API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), CalculatorHandler)
    print(f"http://{args.host}:{args.port} · POST /api/solve")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
