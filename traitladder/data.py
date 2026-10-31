"""从随项目保存的腾讯 S18 数据快照构建计算数据。"""
from dataclasses import dataclass
import json
from pathlib import Path

SOURCE = Path(__file__).resolve().parent.parent / "data" / "source"
EVOLUTIONS = ("裁决使", "迅捷射手", "狂战士", "法师")


@dataclass(frozen=True)
class Trait:
    name: str
    levels: tuple[int, ...]
    counted: bool
    category: str = "race"


@dataclass(frozen=True)
class Unit:
    id: str
    name: str
    cost: int
    slots: int
    group: str
    traits: dict[str, int]


@dataclass(frozen=True)
class Dataset:
    units: tuple[Unit, ...]
    traits: tuple[Trait, ...]
    emblems: tuple[str, ...]
    version: str = "test"


def order_trait_names(data, names):
    order = {t.name: (int(t.category == "job"), i) for i, t in enumerate(data.traits)}
    return tuple(sorted(names, key=lambda name: (*order.get(name, (2, len(data.traits))), name)))


def load_data() -> Dataset:
    def read(name):
        return json.loads((SOURCE / f"{name}.json").read_text(encoding="utf-8"))

    chess, races, jobs, equip = (read(n) for n in ("chess", "race", "job", "equip"))
    if any(d["season"] != "2026.S18" for d in (chess, races, jobs, equip)):
        raise ValueError("数据并非 2026.S18，请检查数据快照")
    traits = tuple(
        Trait(row["name"], tuple(sorted(map(int, row["level"]))), len(row["level"]) > 1, category)
        for category, rows in (("race", races["data"]), ("job", jobs["data"])) for row in rows
    )
    known = {t.name for t in traits}
    units = []
    for row in chess["data"]:
        if not 1 <= int(row["price"]) <= 5:
            continue  # 筛选可购买弈子。
        names = [n for n in (row["races"] + "," + row["jobs"]).split(",") if n]
        if set(names) - known:
            raise ValueError(f"弈子含有未知羁绊：{row['displayName']}")
        contributions = dict.fromkeys(names, 1)
        is_lux = "Lux" in row["hero_EN_name"]
        dragon = row["displayName"] == "远古巨龙"
        if is_lux:
            for name in names:
                if name != "自然之力！大元素使":
                    contributions[name] = 2
        if dragon:
            contributions["峡谷野怪"] = 2
        units.append(Unit(row["chessId"], row["displayName"], int(row["price"]),
                          2 if dragon else 1, "拉克丝" if is_lux else row["displayName"],
                          contributions))
    trait_order = {t.name: i for i, t in enumerate(traits)}
    emblems = tuple(sorted({r["name"].removesuffix("纹章") for r in equip["data"]
                            if r["name"].endswith("纹章")
                            and r["name"].removesuffix("纹章") in known}, key=trait_order.__getitem__))
    return Dataset(tuple(units), traits, emblems, f"{chess['season']} / CDN {chess['version']} / {chess['time']}")


def normalize_emblem(value: str, data: Dataset) -> str | None:
    value = value.strip()
    if value in ("无", "无转职", "none", "0"):
        return None
    for suffix in ("纹章", "转职"):
        value = value.removesuffix(suffix)
    if value not in data.emblems:
        raise ValueError(f"无效转职「{value}」。可选：{'、'.join(data.emblems)}；或输入「无」")
    return value


def normalize_emblems(value, data: Dataset) -> tuple[str, ...]:
    """将转职名称或列表转换为逐枚计数的名称元组。"""
    if value is None:
        return ()
    names = [value] if isinstance(value, str) else value
    if not isinstance(names, (list, tuple)) or any(not isinstance(n, str) for n in names):
        raise ValueError("转职应为名称或名称列表")
    return tuple(name for item in names if (name := normalize_emblem(item, data)) is not None)
