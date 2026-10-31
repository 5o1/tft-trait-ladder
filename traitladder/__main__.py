import argparse
import json
import math
from pathlib import Path
import sys

from .data import load_data, normalize_emblems, order_trait_names
from .solver import solve


def integer_ranges(text, minimum, maximum, label):
    values = set()
    try:
        for part in text.replace("，", ",").split(","):
            ends = part.split("-")
            if len(ends) == 1:
                values.add(int(part))
            elif len(ends) == 2 and int(ends[0]) <= int(ends[1]):
                if not minimum <= int(ends[0]) <= int(ends[1]) <= maximum:
                    raise ValueError()
                values.update(range(int(ends[0]), int(ends[1]) + 1))
            else:
                raise ValueError()
        if not values or min(values) < minimum or max(values) > maximum:
            raise ValueError()
    except ValueError:
        raise argparse.ArgumentTypeError(f"{label}应为 {minimum}–{maximum}，支持 4,6,8-10 格式") from None
    return sorted(values)


def populations(text):
    return integer_ranges(text, 1, 20, "人口")


def trait_counts(text):
    return integer_ranges(text, 0, 24, "羁绊数量")


def main(argv=None):
    parser = argparse.ArgumentParser(description="S18 羁绊天梯 / 拼盘天梯：转职组合下各人口、各羁绊数量的最易获取方案")
    parser.add_argument("emblem", nargs="?", help="转职名称，多个用逗号分隔；无转职输入「无」")
    parser.add_argument("--list", action="store_true", help="列出所有可用转职")
    parser.add_argument("-p", "--populations", type=populations, default=populations("1-10"))
    parser.add_argument("--evolutions", default="", help="固定的卡兹克进化，逗号分隔")
    parser.add_argument("--evolution-count", type=int, choices=range(5), help="可分配的进化次数，进化职业由求解器选择")
    parser.add_argument("--lux", default="auto", help="auto 自动选择形态；none 禁用；或指定形态羁绊")
    parser.add_argument("--time-limit", type=float, help="每次求解秒数上限；一个人口有多次求解，默认不限时")
    parser.add_argument("--json", action="store_true", help="输出机器可读 JSON")
    parser.add_argument("--max-only", action="store_true", help="只求理论最大羁绊数，不考虑商店获取难度")
    parser.add_argument("--shop-level", type=int, choices=range(1, 11), help="商店等级；默认等于人口。额外人口时可单独指定")
    parser.add_argument("--trait-counts", type=trait_counts, help="只计算指定羁绊数量，例如 2-5；默认列出所有可行数量")
    parser.add_argument("--owned", default="", help="已经拥有的弈子名，逗号分隔；其获取难度记 0")
    parser.add_argument("--exclude", default="", help="禁用弈子名称，逗号分隔")
    parser.add_argument("--pool-state", help="JSON 文件：owned 是已拥有弈子列表，taken 是除此以外的各英雄离池张数")
    parser.add_argument("--shop-data", help="自定义商店概率及卡池配置 JSON；默认 data/shop.json")
    parser.add_argument("--sort", choices=("value", "traits"), default="value", help="同人口方案排序：value 损失优先，traits 羁绊优先")
    args = parser.parse_args(argv)
    try:
        data = load_data()
        if args.list:
            print("\n".join(data.emblems))
            return 0
        emblem_text = args.emblem
        if emblem_text is None:
            print("可选转职：" + "、".join(data.emblems), file=sys.stderr)
            emblem_text = input("请输入转职，多个用逗号分隔（或「无」）：")
        emblem = normalize_emblems([n.strip() for n in emblem_text.replace("，", ",").split(",") if n.strip()], data)
        if args.time_limit is not None and (not math.isfinite(args.time_limit) or args.time_limit <= 0):
            raise ValueError("时间限制必须是正数")
        evolutions = tuple(s.strip() for s in args.evolutions.replace("，", ",").split(",") if s.strip())
        excluded_units = tuple(s.strip() for s in args.exclude.replace("，", ",").split(",") if s.strip())
        from .solver import prepare_units
        prepare_units(data, evolutions=evolutions, lux=args.lux, excluded_units=excluded_units, evolution_count=args.evolution_count)
        from .value import load_shop_data, rank_population
        shop = load_shop_data(args.shop_data) if not args.max_only else None
        state = json.loads(Path(args.pool_state).read_text(encoding="utf-8")) if args.pool_state else {}
        if not isinstance(state, dict) or not isinstance(state.get("owned", []), list) or not isinstance(state.get("taken", {}), dict):
            raise ValueError("卡池状态须为 JSON 对象，owned 为弈子名列表，taken 为离池张数对象")
        if any(not isinstance(n, str) for n in state.get("owned", [])):
            raise ValueError("owned 中每项须为弈子名")
        owned = set(state.get("owned", [])) | {n.strip() for n in args.owned.replace("，", ",").split(",") if n.strip()}
        taken = state.get("taken", {})
        if not args.json:
            print(f"S18 羁绊天梯 / 拼盘天梯 | 转职：{'、'.join(order_trait_names(data, emblem)) or '无'} | {data.version}")
            print("计分：已激活的多档羁绊；单档及独有羁绊不计分。")
            print("每枚转职按对应的全局羁绊计数 +1 计算。")
            print(f"条件：卡兹克进化：{'、'.join(order_trait_names(data, evolutions)) or '无'}；拉克丝：{args.lux}")
            print("按人口等级、冠冕和进化次数递推。" if not args.max_only else "每个人口分别求解。")
            if not args.max_only:
                print("损失 = (1 + 新增获取成本) / 100；越小越优先。")
                print("模型：独立商店格、静态卡池。")
        results = []
        for p in args.populations:
            print(f"正在计算 {p} 人口…", file=sys.stderr, flush=True)
            options = dict(evolutions=evolutions, lux=args.lux,
                           time_limit=args.time_limit,
                           excluded_units=excluded_units, evolution_count=args.evolution_count)
            if args.max_only:
                result = solve(data, p, emblem, **options)
            else:
                from .api import calculate
                result = calculate({"emblems": emblem, "population": p, "shop_level": args.shop_level,
                                    "trait_counts": args.trait_counts, "owned": sorted(owned), "taken": taken,
                                    "sort": args.sort, "minimum_traits": 0, **options}, data=data, shop_data=shop)["results"][0]
            results.append(result)
            if not args.json:
                if args.max_only:
                    print_result(result)
                else:
                    print_ranking(result, args.sort)
        if args.json:
            print(json.dumps({"version": data.version, "emblems": list(emblem), "emblem": emblem[0] if len(emblem) == 1 else None,
                              "scoring": "activated_multi_tier_traits",
                              "conditions": {"emblem_mode": "global_plus_one",
                                             "evolutions": evolutions,
                                             "lux": args.lux,
                                             "max_only": args.max_only, "sort_mode": args.sort,
                                             "owned": sorted(owned), "taken": taken,
                                             "excluded_units": excluded_units},
                              "shop_model": shop, "results": results}, ensure_ascii=False, indent=2, allow_nan=False))
        return 2 if any(r["status"] != "optimal" for r in results) else 0
    except (ValueError, EOFError, OSError) as exc:
        parser.error(str(exc) or "未输入转职")
    except ImportError:
        parser.exit(1, "缺少 scipy>=1.11。请使用虚拟环境安装：python -m pip install -r requirements.txt\n")
    except KeyboardInterrupt:
        parser.exit(130, "\n已取消计算。\n")


def print_result(r):
    if "value_score" in r:
        print(f"\n  {r['target_traits']} 羁绊", end="：")
    else:
        print(f"\n{r['population']} 人口", end="：")
    if r["status"] == "infeasible":
        print("当前条件下无解")
        return
    if r["max_traits"] is None:
        print("达到时间限制，尚未找到可行阵容")
        return
    if "value_score" in r:
        label = "已证明此羁绊数下损失最小" if r["status"] == "optimal" else "未证明损失最小"
        print(f"损失 {r['loss']:.3f}，新增获取成本 {r['difficulty']:.2f}（{label}）")
    elif r["status"] == "optimal":
        print(f"最多 {r['max_traits']} 个有效羁绊（已证明最优，{r['seconds']} 秒）")
    else:
        print(f"已找到 {r['max_traits']} 个，上界 {r['upper_bound']}；未证明最优")
    print("  阵容：" + "、".join(
        (u["label"] if u["kind"] == "placeholder" else u["name"])
        + ("(2人口)" if u["slots"] == 2 else "") for u in r["lineup"]))
    if r.get("selected_evolutions"):
        print("  进化：" + "、".join(r["selected_evolutions"]))
    for u in r["lineup"]:
        if u["kind"] == "placeholder":
            print(f"  {u['label']}可选：" + "、".join(c["name"] for c in u["candidates"]))
    if any(u["kind"] == "placeholder" for u in r["lineup"]):
        print("  占位符各选一名，与其他位置不重复；拉克丝合计最多一名。")
        if "value_score" in r:
            print("  评分采用：" + "、".join(u["example"] for u in r["lineup"] if u["kind"] == "placeholder"))
            print("  更换备选后按实际选卡重算价值。")
    print("  计分羁绊：" + ("、".join(f"{t['count']}{t['name']}" for t in r["active_traits"]) or "无"))
    if r["uncounted_traits"]:
        print("  激活但不计分：" + "、".join(t["name"] for t in r["uncounted_traits"]))


def print_ranking(r, sort_mode="value"):
    from .value import sort_plans
    theoretical_label = "理论最多" if r["theoretical_status"] == "optimal" else "理论已找到"
    reachable_label = "商店可获取最多" if r["reachable_status"] == "optimal" else "商店可获取已找到"
    print(f"\n{r['population']} 人口 / {r['shop_level']} 级商店："
          f"{theoretical_label} {r['theoretical_max_traits']}，{reachable_label} {r['reachable_max_traits']}")
    print("  排序：" + ("损失优先，同损失时羁绊数优先" if sort_mode == "value" else "羁绊优先，同羁绊数时损失优先"))
    for plan in sort_plans(r["plans"], sort_mode):
        print_result(plan)
    if r["unavailable_counts"]:
        print("  当前条件下无解的羁绊数量：" + "、".join(map(str, r["unavailable_counts"])))
    if r["unresolved_counts"]:
        print("  达到时间限制、尚未完成的羁绊数量：" + "、".join(map(str, r["unresolved_counts"])))


if __name__ == "__main__":
    raise SystemExit(main())
