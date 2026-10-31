"""运行所有转职 × 1–10 人口，保存最大值和求解证明状态。"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from traitladder.data import load_data
from traitladder.solver import solve


def main():
    data = load_data()
    rows = []
    for emblem in (None, *data.emblems):
        results = [solve(data, p, emblem, time_limit=30) for p in range(1, 11)]
        if any(r["status"] != "optimal" or r["max_traits"] != r["upper_bound"] for r in results):
            raise RuntimeError(f"{emblem}: 至少一项未证明最优")
        row = {"emblem": emblem, "max_traits": [r["max_traits"] for r in results],
               "status": [r["status"] for r in results],
               "seconds": [r["seconds"] for r in results]}
        rows.append(row)
        print(emblem or "无转职", row["max_traits"], flush=True)
    report = {"version": data.version, "emblem_mode": "global_plus_one",
              "scoring": "activated_multi_tier_traits", "populations": list(range(1, 11)),
              "conditions": {"max_cost": 5, "evolutions": [], "lux": "auto", "rivals_together": False},
              "solves": len(rows) * 10, "rows": rows}
    output = Path(__file__).resolve().parent.parent / "docs" / "verification.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已验证 {report['solves']} 组，记录：{output}")


if __name__ == "__main__":
    main()
