"""二元整数规划：选择弈子，累加全局转职计数并判断羁绊激活。"""
from collections import Counter, defaultdict
from dataclasses import replace
from math import floor, isfinite
from time import monotonic

from .data import Dataset, EVOLUTIONS, normalize_emblems, order_trait_names


def resolve_evolutions(evolutions=(), evolution_count=None):
    fixed = tuple(evolutions)
    if len(set(fixed)) != len(fixed) or set(fixed) - set(EVOLUTIONS):
        raise ValueError("固定进化应为四种职业的互异子集")
    count = len(fixed) if evolution_count is None else evolution_count
    if type(count) is not int or not len(fixed) <= count <= len(EVOLUTIONS):
        raise ValueError("进化次数应为固定进化数量到 4 之间的整数")
    return fixed, count


def prepare_units(data, max_cost=5, evolutions=(), lux="auto", excluded_units=(), evolution_count=None):
    if max_cost not in range(1, 6):
        raise ValueError("最高费用须为 1–5")
    evolutions, count = resolve_evolutions(evolutions, evolution_count)
    if isinstance(excluded_units, str):
        raise ValueError("excluded_units 应为弈子名称列表")
    excluded = set(excluded_units)
    known = {u.name for u in data.units} | {u.group for u in data.units}
    if excluded - known:
        raise ValueError("未知禁用弈子：" + "、".join(sorted(excluded - known)))
    if count and "卡兹克" in excluded:
        raise ValueError("卡兹克的进化与禁用条件冲突")
    forms = {n for u in data.units if u.group == "拉克丝" for n in u.traits
             if n != "自然之力！大元素使"}
    if lux not in {"auto", "none"} | forms:
        raise ValueError("拉克丝形态无效，可选 auto、none 或 " + "、".join(sorted(forms)))
    units = []
    for u in data.units:
        if u.name in excluded or u.group in excluded:
            continue
        if u.cost > max_cost:
            continue
        if u.group == "拉克丝":
            if lux == "none" or (lux != "auto" and lux not in u.traits):
                continue
        if u.name == "卡兹克":
            u = replace(u, traits={**u.traits, **dict.fromkeys(evolutions, 1)})
        units.append(u)
    if count and not any(u.name == "卡兹克" for u in units):
        raise ValueError("指定进化需要允许 3 费卡兹克登场")
    return tuple(units)


def evaluate(data: Dataset, board, emblem):
    """根据阵容贡献重算已激活羁绊。"""
    if len({u.group for u in board}) != len(board):
        raise ValueError("阵容存在重复弈子或多种拉克丝形态")
    counts = Counter()
    for u in board:
        counts.update(u.traits)
    counts.update(normalize_emblems(emblem, data))
    if counts["日蚀骑士"] >= 3 and counts["月蚀骑士"] >= 3:
        counts["日月双蚀"] = 1
    active, uncounted = [], []
    traits = {t.name: t for t in data.traits}
    for name in order_trait_names(data, traits):
        t = traits[name]
        count = counts[t.name]
        # 日月双蚀的原始门槛为 0，实际条件由日/月蚀联动决定。
        if count > 0 and count >= min(t.levels):
            item = {"name": t.name, "count": count,
                    "tier": max(n for n in t.levels if n <= count)}
            (active if t.counted else uncounted).append(item)
    return active, uncounted


def solve(data: Dataset, population: int, emblem: str | list[str] | tuple[str, ...] | None, *, max_cost=5,
          evolutions=(), lux="auto", rivals_together=False, time_limit=None,
          target_traits=None, unit_difficulties=None, excluded_units=(), evolution_count=None, owned_units=()):
    if type(population) is not int or not 1 <= population <= 20:
        raise ValueError("人口须为 1–20 的整数")
    emblem = normalize_emblems(emblem, data)
    bonuses = Counter(emblem)
    if time_limit is not None and (not isfinite(time_limit) or time_limit <= 0):
        raise ValueError("时间限制必须是正数")
    import numpy as np
    from scipy.optimize import Bounds, LinearConstraint, milp
    from scipy.sparse import coo_matrix

    evolutions, count = resolve_evolutions(evolutions, evolution_count)
    candidate_pool = prepare_units(data, max_cost, evolutions, lux, excluded_units, count)
    units = candidate_pool
    kha = next((u for u in units if u.name == "卡兹克"), None)
    rengar = next((u for u in units if u.name == "雷恩加尔"), None)
    if not rivals_together and kha and rengar:
        same_role = kha.slots == rengar.slots and kha.traits == rengar.traits
        cheaper = unit_difficulties[kha.id] < unit_difficulties[rengar.id] if unit_difficulties is not None else kha.cost < rengar.cost
        if count or (same_role and cheaper):
            units = tuple(u for u in units if u.name != "雷恩加尔")
    scored = [t for t in data.traits if t.counted]
    n, m = len(units), len(scored)
    if target_traits is not None and (type(target_traits) is not int or not 0 <= target_traits <= m):
        raise ValueError("目标羁绊数量须为 0 到计分羁绊总数之间的整数")
    value_mode = target_traits is not None and unit_difficulties is not None
    # x_i: 弈子登场；y_t: 羁绊激活。每枚转职全局贡献对应羁绊 +1。
    automatic = tuple(t for t in EVOLUTIONS if t not in evolutions) if count > len(evolutions) else ()
    size = n + m + len(automatic)
    rows, lows, highs = [], [], []

    def constraint(coefficients, low=-np.inf, high=np.inf):
        rows.append(coefficients)
        lows.append(low)
        highs.append(high)

    constraint({i: u.slots for i, u in enumerate(units)}, population, population)
    groups = defaultdict(list)
    for i, u in enumerate(units):
        groups[u.group].append(i)
    for group in groups.values():
        if len(group) > 1:
            constraint(dict.fromkeys(group, 1), high=1)
    if not rivals_together:
        constraint({i: 1 for i, u in enumerate(units) if u.name in ("卡兹克", "雷恩加尔")}, high=1)
    if count:
        constraint({i: 1 for i, u in enumerate(units) if u.name == "卡兹克"}, 1, 1)
    if automatic:
        constraint({n + m + i: 1 for i in range(len(automatic))}, count - len(evolutions), count - len(evolutions))
    for j, t in enumerate(scored):
        contributions = {i: u.traits[t.name] for i, u in enumerate(units) if t.name in u.traits}
        contributions.update({n + m + i: 1 for i, name in enumerate(automatic) if name == t.name})
        bonus = bonuses[t.name]
        threshold = min(t.levels)
        # threshold*y <= count；count <= threshold-1+M*y。
        constraint({**contributions, n + j: -threshold}, low=-bonus)
        big_m = max(sum(contributions.values()) + bonus, threshold)
        constraint({**contributions, n + j: -big_m}, high=threshold - 1 - bonus)
    if target_traits is not None:
        constraint({n + j: 1 for j in range(m)}, target_traits, target_traits)
    row_indices, col_indices, values = [], [], []
    for row, coefficients in enumerate(rows):
        for col, value in coefficients.items():
            row_indices.append(row)
            col_indices.append(col)
            values.append(value)
    matrix = coo_matrix((values, (row_indices, col_indices)), shape=(len(rows), size)).tocsc()
    objective = np.zeros(size)
    upper_bounds = np.ones(size)
    if not value_mode:
        objective[n:n + m] = -1
    if unit_difficulties is not None:
        for i, u in enumerate(units):
            difficulty = unit_difficulties[u.id]
            if difficulty != difficulty or difficulty < 0:
                raise ValueError("搜卡难度须为非负数或正无穷")
            if not isfinite(difficulty):
                upper_bounds[i] = 0
            elif value_mode:
                objective[i] = difficulty
    options = {"mip_rel_gap": 0.0}
    if time_limit is not None:
        options["time_limit"] = time_limit
    start = monotonic()
    result = milp(objective, integrality=np.ones(size), bounds=Bounds(0, upper_bounds),
                  constraints=LinearConstraint(matrix, lows, highs), options=options)
    held = set(owned_units)
    preference_status = "optimal"
    canonical_status = "optimal"
    if value_mode and result.status == 0:
        optimum = sum(unit_difficulties[u.id] for i, u in enumerate(units) if result.x[i] > .5)
        canonical_units = sorted((i for i, u in enumerate(units) if unit_difficulties[u.id] <= optimum), key=lambda i: units[i].id)
        # 按弈子编号和职业目录逐位排序，每段使用 16 位整数权重。
        keys = canonical_units + [n + m + automatic.index(name) for name in order_trait_names(data, automatic)]
        lower = np.zeros(size)
        upper = upper_bounds.copy()
        for i, u in enumerate(units):
            if unit_difficulties[u.id] > optimum:
                upper[i] = 0
        held_vector = np.zeros(size)
        held_vector[:n] = [int(u.name in held) for u in units]
        constraints = [LinearConstraint(matrix, lows, highs), LinearConstraint(objective, result.fun, result.fun)]
        fixed = set()
        for offset in range(0, len(keys), 16):
            remaining = None if time_limit is None else time_limit - (monotonic() - start)
            if remaining is not None and remaining <= 0:
                canonical_status = "limit"
                if offset == 0:
                    preference_status = "limit"
                break
            block = keys[offset:offset + 16]
            secondary = np.zeros(size)
            if offset == 0:
                secondary -= 2 ** len(block) * held_vector
            for position, col in enumerate(block):
                secondary[col] -= 2 ** (len(block) - position - 1)
            secondary_options = {**options, **({"time_limit": remaining} if remaining is not None else {})}
            preferred = milp(secondary, integrality=np.ones(size), bounds=Bounds(lower, upper),
                             constraints=constraints, options=secondary_options)
            if preferred.status not in (0, 1):
                raise RuntimeError("阵容排序求解失败：" + preferred.message)
            if offset == 0:
                preference_status = "optimal" if preferred.status == 0 else "limit"
            if preferred.x is not None:
                result.x = preferred.x
            if preferred.status != 0 or preferred.x is None:
                canonical_status = "limit"
                break
            if offset == 0:
                held_count = round(float(held_vector @ result.x))
                constraints.append(LinearConstraint(held_vector, held_count, held_count))
            for col in block:
                lower[col] = upper[col] = round(result.x[col])
                fixed.add(col)
            slots_fixed = sum(u.slots for i, u in enumerate(units) if i in fixed and lower[i] == 1)
            evolutions_fixed = sum(lower[i] == 1 for i in range(n + m, size) if i in fixed)
            if slots_fixed == population and evolutions_fixed == count - len(evolutions):
                break
    elapsed = round(monotonic() - start, 3)
    status = {0: "optimal", 1: "limit", 2: "infeasible"}.get(result.status, "error")
    loss_status = status
    if status == "optimal" and (preference_status == "limit" or canonical_status == "limit"):
        status = "limit"
    output = {"population": population, "status": status, "max_traits": None,
              "upper_bound": None, "active_traits": [], "uncounted_traits": [],
              "board": [], "lineup": [], "seconds": elapsed, "selected_evolutions": [], "emblems": list(emblem),
              "owned_preference_status": preference_status, "canonical_status": canonical_status, "loss_status": loss_status}
    if value_mode:
        output.update(target_traits=target_traits, difficulty=None, difficulty_lower_bound=None,
                      value_score=None, value_upper_bound=None, loss=None, loss_lower_bound=None)
    if result.status not in (0, 1, 2):
        raise RuntimeError("优化器失败：" + result.message)
    bound = getattr(result, "mip_dual_bound", None)
    if bound is not None and isfinite(bound):
        if value_mode:
            output["difficulty_lower_bound"] = max(0.0, float(bound))
            output["value_upper_bound"] = 100 / (1 + max(0.0, float(bound)))
            output["loss_lower_bound"] = (1 + max(0.0, float(bound))) / 100
        else:
            output["upper_bound"] = floor(-bound + 1e-6)
    if result.x is None:
        return output
    selected_evolutions = order_trait_names(data, (t for t in EVOLUTIONS if t in evolutions or any(t == name and result.x[n + m + i] > .5 for i, name in enumerate(automatic))))
    units = tuple(replace(u, traits={**u.traits, **dict.fromkeys(selected_evolutions, 1)}) if u.name == "卡兹克" else u for u in units)
    board = [u for i, u in enumerate(units) if result.x[i] > 0.5]
    active, uncounted = evaluate(data, board, emblem)
    if sum(u.slots for u in board) != population:
        raise RuntimeError("优化结果人口校验失败")
    if (target_traits is not None and len(active) != target_traits) or (not value_mode and len(active) != round(-result.fun)):
        raise RuntimeError("优化结果羁绊计数校验失败")
    if value_mode:
        difficulty = sum(unit_difficulties[u.id] for u in board)
        if abs(difficulty - result.fun) > 1e-5 * max(1, difficulty):
            raise RuntimeError("优化结果搜卡难度校验失败")
        output.update(difficulty=difficulty, value_score=100 / (1 + difficulty),
                      loss=(1 + difficulty) / 100,
                      upper_bound=target_traits)
    output.update(max_traits=len(active), active_traits=active, uncounted_traits=uncounted,
                  owned_used=sum(u.name in held for u in board),
                  selected_evolutions=list(selected_evolutions),
                  board=[{"id": u.id, "name": u.name, "cost": u.cost, "slots": u.slots,
                          "traits": u.traits} for u in board])
    from .lineup import describe_lineup
    candidates = [replace(u, traits={**u.traits, **dict.fromkeys(selected_evolutions, 1)}) if u.name == "卡兹克" else u
                  for u in candidate_pool if unit_difficulties is None or isfinite(unit_difficulties[u.id])]
    output["lineup"] = describe_lineup(data, board, emblem, candidates, evolutions=selected_evolutions,
                                       rivals_together=rivals_together)
    return output
