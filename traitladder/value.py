"""按等级商店概率和同费卡池占比，直接计算搜卡难度。"""
from collections import Counter
from functools import lru_cache
import json
from math import exp, expm1, floor, isfinite, log, log1p
from pathlib import Path

from .data import normalize_emblems

DEFAULT_SHOP_DATA = Path(__file__).resolve().parent.parent / "data" / "shop.json"


def load_shop_data(path=None):
    raw = json.loads(Path(path or DEFAULT_SHOP_DATA).read_text(encoding="utf-8"))
    odds = {int(k): tuple(v) for k, v in raw["odds_by_level"].items()}
    for level, row in odds.items():
        if level < 1 or len(row) != 5 or any(not isfinite(p) or not 0 <= p <= 1 for p in row):
            raise ValueError("商店概率须为 5 个 0–1 之间的有限数")
        if abs(sum(row) - 1) > 1e-9:
            raise ValueError("每个等级的商店费用概率之和必须为 1")
    copies = {int(k): v for k, v in raw["copies_per_unit"].items()}
    if set(copies) != set(range(1, 6)) or any(type(v) is not int or v <= 0 for v in copies.values()):
        raise ValueError("每费单英雄卡池数量须为正整数，且包含 1–5 费")
    slots = raw["slots_per_shop"]
    if type(slots) is not int or slots <= 0:
        raise ValueError("每次商店格数须为正整数")
    return {"odds": odds, "copies": copies, "slots": slots, "source": str(path or DEFAULT_SHOP_DATA)}


def shop_hit_probability(slot_probability, slots=5):
    """独立格近似下，一次商店至少出现一张目标卡的概率。"""
    if slot_probability == 1:
        return 1.0
    return -expm1(slots * log1p(-slot_probability))


def unit_values(data, level, *, owned=(), inherited=(), taken=None, shop_data=None):
    shop = shop_data or load_shop_data()
    if level not in shop["odds"]:
        raise ValueError(f"商店概率配置不包含等级 {level}，请指定 --shop-level 或更新 --shop-data")
    by_name = {u.name: u for u in data.units}
    owned = set(owned)
    inherited = set(inherited)
    if inherited - by_name.keys():
        raise ValueError("未知继承弈子：" + "、".join(sorted(inherited - by_name.keys())))
    if owned - by_name.keys():
        raise ValueError("未知已拥有弈子：" + "、".join(sorted(owned - by_name.keys())))
    owned_groups = [by_name[n].group for n in owned]
    if len(set(owned_groups)) != len(owned_groups):
        raise ValueError("已拥有弈子中不能包含不同拉克丝形态")
    groups = {u.group: u.cost for u in data.units}
    taken = dict(taken or {})
    if taken.keys() - groups.keys():
        raise ValueError("未知离池弈子：" + "、".join(sorted(taken.keys() - groups.keys())))
    remaining = {}
    for group, cost in groups.items():
        count = taken.get(group, 0)
        if type(count) is not int or count < 0:
            raise ValueError("离池张数须为非负整数")
        remaining[group] = shop["copies"][cost] - count - int(group in owned_groups)
        if remaining[group] < 0:
            raise ValueError(f"{group} 的离池张数超过卡池总量")
    totals = Counter()
    for group, count in remaining.items():
        totals[groups[group]] += count
    forms = [u for u in data.units if u.group == "拉克丝" and len(u.traits) > 1]
    owned_lux = next((n for n in owned if by_name[n].group == "拉克丝" and len(by_name[n].traits) > 1), None)
    values = {}
    for u in data.units:
        probability = (shop["odds"][level][u.cost - 1] * remaining[u.group] / totals[u.cost]
                       if totals[u.cost] else 0.0)
        if u.group == "拉克丝":
            # 各形态属于同一个英雄池；非基础形态均匀分布是显式模型假设。
            form_share = (float(u.name == owned_lux) if owned_lux else
                          (1 / len(forms) if len(u.traits) > 1 else 0.0))
            probability *= form_share
        hit = shop_hit_probability(probability, shop["slots"])
        is_owned = u.name in owned or (u.group == "拉克丝" and "拉克丝" in owned)
        locked_form = u.group == "拉克丝" and owned_lux and u.name != owned_lux
        difficulty = float("inf") if locked_form else (0.0 if is_owned or u.name in inherited else (1 / hit if hit > 0 else float("inf")))
        values[u.id] = {"name": u.name, "cost": u.cost, "owned": is_owned,
                        "inherited": u.name in inherited,
                        "slot_probability": probability, "shop_hit_probability": hit,
                        "difficulty": difficulty,
                        "remaining_copies": remaining[u.group], "tier_pool": totals[u.cost]}
    return values


def sort_plans(plans, mode="value"):
    """为同一人口的可行方案生成指定顺序。"""
    if mode not in ("value", "traits"):
        raise ValueError("排序方式应为 value 或 traits")
    ready = [p for p in plans if p["board"]]
    if mode == "value":
        return sorted(ready, key=lambda p: (floor(p["difficulty"] * 1e7 + 0.5), -p["target_traits"]))
    return sorted(ready, key=lambda p: (-p["target_traits"], floor(p["difficulty"] * 1e7 + 0.5)))


def fit_value_boundary(plans):
    """为给定基准样本计算最小类内对数方差分界。"""
    values = sorted(100 / (1 + p["difficulty"]) for p in plans
                    if p["board"] and p["target_traits"] >= 2
                    and p.get("difficulty") is not None and isfinite(p["difficulty"]) and p["difficulty"] >= 0)
    if len(values) < 2:
        return {"threshold": None, "reason": "insufficient_candidates"}
    xs = [log(v) for v in values]
    if xs[-1] - xs[0] <= 1e-12:
        return {"threshold": None, "reason": "equal_values"}
    # 平移提高前缀方差计算的数值稳定性。
    offset = xs[0]
    centered = [x - offset for x in xs]
    sums, squares = [0.0], [0.0]
    for x in centered:
        sums.append(sums[-1] + x)
        squares.append(squares[-1] + x * x)
    n = len(xs)
    best = None
    for k in range(1, n):
        if xs[k] - xs[k - 1] <= 1e-12:
            continue
        sse = max(0.0, squares[k] - sums[k] ** 2 / k)
        sse += max(0.0, squares[n] - squares[k] - (sums[n] - sums[k]) ** 2 / (n - k))
        gap = xs[k] - xs[k - 1]
        if best is None or sse < best[0] - 1e-12 or (abs(sse - best[0]) <= 1e-12 and gap > best[2]):
            best = (sse, k, gap)
    sse, k, _ = best
    low_mean = sums[k] / k + offset
    high_mean = (sums[n] - sums[k]) / (n - k) + offset
    return {"threshold": exp((low_mean + high_mean) / 2),
            "method": "minimum_within_class_log_variance", "lower_count": k,
            "higher_count": n - k, "lower_geometric_mean": exp(low_mean),
            "higher_geometric_mean": exp(high_mean), "within_class_sse": sse}


def fit_difficulty_boundary(plans):
    """在 log(V) 上标定后，将分界和组中心转换为 D 坐标。"""
    result = fit_value_boundary(plans)
    if result["threshold"] is None:
        return result
    return {"threshold": 100 / result["threshold"] - 1, "method": "minimum_within_class_log_variance",
            "lower_count": result["higher_count"], "higher_count": result["lower_count"],
            "lower_center": 100 / result["higher_geometric_mean"] - 1,
            "higher_center": 100 / result["lower_geometric_mean"] - 1, "within_class_sse": result["within_class_sse"]}


@lru_cache(maxsize=1)
def load_difficulty_reference():
    return json.loads((DEFAULT_SHOP_DATA.parent / "loss-reference.json").read_text(encoding="utf-8"))


def difficulty_boundary(plans=()):
    reference = load_difficulty_reference()
    return {**reference["boundary"], "method": "fixed_global_reference", "reference_id": reference["id"]}


def matrix_scope(data, emblem, fixed, excluded, lux, taken, minimum_traits, shop_data=None):
    shop = shop_data or load_shop_data()
    return {"inheritance": "selected-plan-v1", "version": data.version, "emblems": sorted(normalize_emblems(emblem, data)),
            "fixed_evolutions": list(fixed), "excluded_units": sorted(excluded), "lux": lux,
            "taken": [[n, k] for n, k in sorted((taken or {}).items())],
            "minimum_traits": minimum_traits,
            "shop": {"levels": [[l, list(row)] for l, row in sorted(shop["odds"].items())],
                     "copies": [shop["copies"][c] for c in range(1, 6)], "slots": shop["slots"]}}


def normalize_selections(selections):
    if selections is None:
        return {}
    if not isinstance(selections, dict):
        raise ValueError("selections 应为状态到羁绊数的对象")
    for key, count in selections.items():
        try:
            state = tuple(map(int, key.split(",")))
        except (AttributeError, ValueError):
            raise ValueError("selections 状态坐标无效") from None
        if (len(state) != 3 or key != ",".join(map(str, state)) or
                not (1 <= state[0] <= 10 and 0 <= state[1] <= 3 and 0 <= state[2] <= 4)):
            raise ValueError("selections 状态坐标无效")
        if type(count) is not int:
            raise ValueError("selections 羁绊数应为整数")
    return dict(selections)


def depends_on(state, source):
    return all(a >= b for a, b in zip(state, source))


def select_plan(result, requested):
    chosen = next((p for p in result["plans"] if p["target_traits"] == requested), None)
    status = "user" if chosen else "default" if requested is None else "fallback"
    if chosen is None:
        chosen = next(iter(sort_plans(result["plans"])), None)
    result.update(requested_trait_count=requested, selected_trait_count=chosen["target_traits"] if chosen else None,
                  selection_status=status,
                  acquired_units=sorted(set(result["inherited_units"]) |
                                        {u["name"] for u in chosen["board"]} if chosen else
                                        set(result["inherited_units"])))


def snapshot_matrix_memory(scope, owned, cells, selections):
    """Export current cells for inspection; incoming memory never drives computation."""
    return {"scope": scope, "owned": sorted(owned), "selections": selections,
            "states": [{"state": list(key), "cards": row["acquired_units"]}
                       for key, row in sorted(cells.items())]}


def rank_population(data, population, emblem, *, shop_level=None, trait_counts=None,
                    owned=(), inherited=(), taken=None, shop_data=None, evolution_count=None, minimum_traits=0, **options):
    from .solver import solve, resolve_evolutions

    emblem = normalize_emblems(emblem, data)
    level = population if shop_level is None else shop_level
    fixed, count = resolve_evolutions(options.get("evolutions", ()), evolution_count)
    options = {**options, "evolutions": fixed, "evolution_count": count}
    owned = set(owned)
    if count:
        # 已进化的卡兹克按已拥有计价。
        owned.add("卡兹克")
    values = unit_values(data, level, owned=owned, inherited=inherited, taken=taken, shop_data=shop_data)
    difficulties = {identifier: row["difficulty"] for identifier, row in values.items()}
    theoretical = solve(data, population, emblem, **options)
    reachable = solve(data, population, emblem, unit_difficulties=difficulties, **options)
    upper = reachable["upper_bound"]
    if upper is None:
        upper = sum(t.counted for t in data.traits)
    counts = sorted(set(trait_counts)) if trait_counts is not None else range(min(minimum_traits, upper), upper + 1)
    if any(type(k) is not int or not 0 <= k <= sum(t.counted for t in data.traits) for k in counts):
        raise ValueError("羁绊数量须为 0 到计分羁绊总数之间的整数")
    plans, unavailable, unresolved = [], [], []
    for k in counts:
        if reachable["status"] == "infeasible" or k > upper:
            unavailable.append(k)
            continue
        result = solve(data, population, emblem, target_traits=k,
                       unit_difficulties=difficulties, owned_units=owned, **options)
        if result["status"] == "infeasible":
            unavailable.append(k)
            continue
        if result["status"] != "optimal":
            unresolved.append(k)
        if result["max_traits"] is not None:
            result["unit_values"] = [values[u["id"]] for u in result["board"]]
            # 占位符继续展示，同时按单卡获取难度排列备选。
            for slot in result["lineup"]:
                if slot["kind"] == "placeholder":
                    for candidate in slot["candidates"]:
                        candidate["difficulty"] = values[candidate["id"]]["difficulty"]
                    slot["candidates"].sort(key=lambda c: (c["difficulty"], c["name"]))
            plans.append(result)
    status = "limit" if unresolved or theoretical["status"] == "limit" or reachable["status"] == "limit" else "optimal"
    if reachable["status"] == "infeasible":
        status = "infeasible"
    return {"population": population, "shop_level": level, "status": status, "emblems": list(emblem),
            "effective_owned": sorted(owned),
            "inherited_units": sorted(set(inherited)),
            "evolution_count": count, "fixed_evolutions": list(fixed),
            "excluded_units": sorted(set(options.get("excluded_units", ()))),
            "theoretical_max_traits": theoretical["max_traits"],
            "theoretical_status": theoretical["status"],
            "reachable_max_traits": reachable["max_traits"], "reachable_status": reachable["status"],
            "orderings": {mode: [p["target_traits"] for p in sort_plans(plans, mode)]
                          for mode in ("value", "traits")},
            "difficulty_boundary": difficulty_boundary(plans),
            "plans": plans, "unavailable_counts": unavailable, "unresolved_counts": unresolved}


def rank_matrix(data, level, crowns, evolution_count, emblem, *, owned=(), evolutions=(),
                trait_counts=None, taken=None, shop_data=None, cache=None, minimum_traits=2, memory=None, selections=None, **options):
    """递推人口等级、冠冕和进化次数，继承相邻前置状态选中方案的已收集弈子。"""
    from .solver import resolve_evolutions

    fixed, evolution_count = resolve_evolutions(evolutions, evolution_count)
    if type(level) is not int or not 1 <= level <= 10:
        raise ValueError("人口等级须为 1–10")
    if type(crowns) is not int or not 0 <= crowns <= 3:
        raise ValueError("冠冕数量应为 0–3")
    if type(minimum_traits) is not int or not 0 <= minimum_traits <= max(2, sum(t.counted for t in data.traits)):
        raise ValueError("起始羁绊数应为有效整数")
    if trait_counts is not None:
        if any(type(k) is not int or not 0 <= k <= sum(t.counted for t in data.traits) for k in trait_counts):
            raise ValueError("羁绊数量须为 0 到计分羁绊总数之间的整数")
        minimum_traits = min([minimum_traits, *trait_counts])
    cells = cache if cache is not None else {}
    owned = set(owned)
    scope = matrix_scope(data, emblem, fixed, options.get("excluded_units", ()), options.get("lux", "auto"), taken, minimum_traits, shop_data)
    selections = normalize_selections(selections)
    # Accept legacy memory as an ignored compatibility input.
    changed = [key for key, row in cells.items()
               if row.get("requested_trait_count") != selections.get(",".join(map(str, key)))]
    for key in list(cells):
        if any(key != source and depends_on(key, source) for source in changed):
            del cells[key]
    for key in changed:
        if key in cells:
            select_plan(cells[key], selections.get(",".join(map(str, key))))

    def visit(l, c, e):
        key = (l, c, e)
        if key in cells:
            return cells[key]
        parents = [(l - 1, c, e)] if l > 1 else []
        if c:
            parents.append((l, c - 1, e))
        if e:
            parents.append((l, c, e - 1))
        previous = [visit(*parent) for parent in parents]
        inherited = set().union(*(set(row["acquired_units"]) for row in previous))
        result = rank_population(data, l + c, emblem, shop_level=l, owned=owned,
                                 inherited=inherited, taken=taken, shop_data=shop_data,
                                 evolutions=fixed[:e], evolution_count=e, minimum_traits=minimum_traits, **options)
        candidates = set().union(*(set(row["candidate_units"]) for row in previous))
        candidates.update(u["name"] for plan in result["plans"] for u in plan["board"])
        result.update(crowns=c, inherited_units=sorted(inherited), candidate_units=sorted(candidates),
                      predecessors=[list(parent) for parent in parents],
                      progression_status="optimal" if result["status"] == "optimal" and all(row["progression_status"] == "optimal" for row in previous) else "limit")
        select_plan(result, selections.get(",".join(map(str, key))))
        cells[key] = result
        return result

    target = visit(level, crowns, evolution_count)
    selected = dict(target)
    if trait_counts is not None:
        counts = set(trait_counts)
        if any(type(k) is not int or not 0 <= k <= sum(t.counted for t in data.traits) for k in counts):
            raise ValueError("羁绊数量须为 0 到计分羁绊总数之间的整数")
        selected["plans"] = [p for p in target["plans"] if p["target_traits"] in counts]
        selected["unavailable_counts"] = sorted(counts - {p["target_traits"] for p in target["plans"]} - set(target["unresolved_counts"]))
        selected["unresolved_counts"] = sorted(counts & set(target["unresolved_counts"]))
        selected["orderings"] = {mode: [p["target_traits"] for p in sort_plans(selected["plans"], mode)] for mode in ("value", "traits")}
        selected["difficulty_boundary"] = difficulty_boundary(selected["plans"])
    selected["progression"] = [cells[(l, crowns, evolution_count)] for l in range(1, level + 1)]
    selected["memory"] = snapshot_matrix_memory(scope, owned, cells, selections)
    return selected
