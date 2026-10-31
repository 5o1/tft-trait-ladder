"""识别方案外同费或低费弈子支持的羁绊位。"""
from .solver import evaluate


def describe_lineup(data, board, emblem, pool, *, evolutions=(), rivals_together=False):
    active, uncounted = evaluate(data, board, emblem)
    active_names = {t["name"] for t in active}
    activated_names = active_names | {t["name"] for t in uncounted}
    lineup = []
    for index, unit in enumerate(board):
        relevant = activated_names.intersection(unit.traits)
        fixed = {"kind": "unit", "name": unit.name, "id": unit.id, "slots": unit.slots}
        if len(relevant) != 1 or (evolutions and unit.name == "卡兹克"):
            lineup.append(fixed)
            continue
        trait = next(iter(relevant), None)
        contribution = unit.traits[trait] if trait else 0
        others = board[:index] + board[index + 1:]
        occupied = {u.group for u in others}
        other_names = {u.name for u in others}
        candidates = []
        for candidate in sorted(pool, key=lambda u: (u.cost, u.name)):
            if candidate.cost > unit.cost or candidate.slots != unit.slots or candidate.group in occupied:
                continue
            if trait and candidate.traits.get(trait, 0) < contribution:
                continue
            if not rivals_together and {"卡兹克", "雷恩加尔"} <= other_names | {candidate.name}:
                continue
            replacement_active, _ = evaluate(data, others + [candidate], emblem)
            if not active_names <= {t["name"] for t in replacement_active}:
                continue
            candidates.append({"id": candidate.id, "name": candidate.name, "group": candidate.group})
        if not any(c["group"] != unit.group for c in candidates):
            lineup.append(fixed)
            continue
        if trait is None:
            label = "【任意弈子】"
        elif contribution == 1:
            label = f"【任意{trait}】"
        else:
            label = f"【{trait}位：贡献至少{contribution}计数】"
        lineup.append({"kind": "placeholder", "label": label, "trait": trait,
                       "min_contribution": contribution, "slots": unit.slots,
                       "example": unit.name, "candidates": candidates})
    return lineup
