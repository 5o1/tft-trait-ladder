"""核验所有转职、1–10 人口的逐羁绊数价值优化。"""
from collections import Counter
import json
from math import isclose
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from traitladder.data import load_data
from traitladder.value import rank_population, unit_values


def main():
    data = load_data()
    rows, count = [], 0
    for emblem in (None, *data.emblems):
        for population in range(1, 11):
            ranking = rank_population(data, population, emblem, time_limit=30)
            if ranking["status"] != "optimal":
                raise RuntimeError(f"{emblem} {population} 人口尚未完成证明")
            values = unit_values(data, population)
            scores = []
            for plan in ranking["plans"]:
                if plan["status"] != "optimal":
                    raise RuntimeError("价值最优证明未完成")
                totals = Counter()
                for unit in plan["board"]:
                    totals.update(unit["traits"])
                if emblem:
                    totals[emblem] += 1
                actual = sum(t.counted and totals[t.name] >= min(t.levels) for t in data.traits)
                difficulty = sum(values[u["id"]]["difficulty"] for u in plan["board"])
                assert actual == plan["target_traits"]
                assert sum(u["slots"] for u in plan["board"]) == population
                assert isclose(difficulty, plan["difficulty"], rel_tol=1e-9, abs_tol=1e-9)
                assert isclose(difficulty, plan["difficulty_lower_bound"], rel_tol=1e-6, abs_tol=1e-6)
                assert isclose(plan["value_score"], 100 / (1 + difficulty), rel_tol=1e-9)
                scores.append({"traits": actual, "difficulty": round(difficulty, 6),
                               "value": round(plan["value_score"], 6)})
                count += 1
            rows.append({"emblem": emblem, "population": population,
                         "theoretical_max": ranking["theoretical_max_traits"],
                         "reachable_max": ranking["reachable_max_traits"], "plans": scores})
        print(f"{emblem or '无转职'}：1–10 人口核验通过", flush=True)
    report = {"version": data.version, "model": "sum_inverse_single_shop_hit_probability",
              "score": "100/(1+difficulty)", "shop_data": "data/shop.json", "owned": [], "taken": {},
              "population_cases": len(rows), "optimal_plans": count, "rows": rows}
    output = Path(__file__).resolve().parent.parent / "docs" / "value_verification.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(rows)} 组人口条件，{count} 个价值最优方案，全部通过。记录：{output}")


if __name__ == "__main__":
    main()
