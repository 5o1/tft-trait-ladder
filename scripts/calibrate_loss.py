"""用标准三维矩阵标定跨状态统一的商店数分界。"""
import json
from pathlib import Path
import sys
import scipy

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from traitladder.data import load_data
from traitladder.value import fit_difficulty_boundary, rank_matrix


def main():
    data = load_data()
    cells = {}
    rank_matrix(data, 10, 3, 4, [], cache=cells)
    if any(row["status"] != "optimal" for row in cells.values()):
        raise RuntimeError("标准矩阵包含待完成的最优性证明")
    selected = [(state, p) for state, row in cells.items() for p in row["plans"]
                if 2 <= p["target_traits"] <= 14 and p["difficulty"] > 0]
    plans = [p for _, p in selected]
    boundary = fit_difficulty_boundary(plans)
    result = {"id": "s18-standard-matrix-v5", "data_version": data.version, "metric": "difficulty", "unit": "shops",
              "calibration_scale": "log(100/(1+D))",
              "ordering": "difficulty_owned_unit_id_trait_catalog",
              "inheritance": "selected-plan-v1", "selection_ordering": "rounded_difficulty_traits_desc",
              "levels": [1, 10], "crowns": [0, 3], "evolution_counts": [0, 4],
              "emblems": [], "owned": [], "minimum_traits": 2, "trait_counts": [2, 14],
              "sample": "positive_additional_difficulty", "state_count": len(cells),
              "sample_count": len(plans), "all_optimal": True, "scipy_version": scipy.__version__, "boundary": boundary,
              "samples": [{"state": list(state), "traits": p["target_traits"], "difficulty": p["difficulty"]}
                          for state, p in selected]}
    path = ROOT / "data" / "loss-reference.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(cells)} 个状态，{len(plans)} 个正成本样本，统一商店数分界 {boundary['threshold']:.9f}")


if __name__ == "__main__":
    main()
