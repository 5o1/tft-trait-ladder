"""用独立穷举对照整数规划，覆盖真实棋池与特殊规则。"""
from collections import Counter
from dataclasses import replace
from itertools import combinations
import random
import unittest

from traitladder.data import Dataset, Trait, Unit, load_data, normalize_emblem
from traitladder.solver import evaluate, prepare_units, solve


def brute_force(data, population, emblem, **options):
    units = prepare_units(data, options.get("max_cost", 5), options.get("evolutions", ()),
                          options.get("lux", "auto"))
    best = None
    # 独立累加阵容贡献并比较激活门槛。
    for count in range(1, min(population, len(units)) + 1):
        for board in combinations(units, count):
            if sum(u.slots for u in board) != population:
                continue
            if len({u.group for u in board}) != len(board):
                continue
            names = {u.name for u in board}
            if not options.get("rivals_together", False) and {"卡兹克", "雷恩加尔"} <= names:
                continue
            if options.get("evolutions") and "卡兹克" not in names:
                continue
            totals = Counter()
            for u in board:
                for trait, value in u.traits.items():
                    totals[trait] += value
            for name in ([emblem] if isinstance(emblem, str) else emblem or ()):
                totals[name] += 1
            score = sum(t.counted and totals[t.name] >= min(t.levels) for t in data.traits)
            best = score if best is None else max(best, score)
    return best


class SolverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_data()

    def assert_optimal_matches_brute(self, data, population, emblem, **options):
        expected = brute_force(data, population, emblem, **options)
        result = solve(data, population, emblem, **options)
        if expected is None:
            self.assertEqual(result["status"], "infeasible")
        else:
            self.assertEqual(result["status"], "optimal")
            self.assertEqual(result["max_traits"], expected)
            self.assertEqual(result["upper_bound"], expected)

    def test_random_small_rosters_against_exhaustive_search(self):
        rng = random.Random(180)
        for case in range(16):
            traits = (Trait("a", (2, 4), True), Trait("b", (3, 5), True),
                      Trait("c", (1, 2), True), Trait("unique", (1,), False))
            units = tuple(Unit(str(i), str(i), rng.randint(1, 5), rng.choice((1, 1, 2)),
                               str(i // 2) if i < 2 else str(i),
                               {t.name: rng.choice((1, 1, 2)) for t in traits if rng.random() < .5})
                          for i in range(8))
            data = Dataset(units, traits, ("a", "b", "c"))
            for pop in (1, 3, 5):
                for emblem in (None, "a", "b", "c", ("a", "b"), ("a", "a", "c")):
                    with self.subTest(case=case, population=pop, emblem=emblem):
                        self.assert_optimal_matches_brute(data, pop, emblem)

    def test_real_one_cost_pool(self):
        for emblem in (None, "斗士", "法师", "花仙子", "绝命花妖"):
            for pop in (1, 2, 3, 4):
                with self.subTest(population=pop, emblem=emblem):
                    self.assert_optimal_matches_brute(self.data, pop, emblem, max_cost=1)

    def test_every_emblem_with_complete_roster_at_two_population(self):
        for emblem in self.data.emblems:
            with self.subTest(emblem=emblem):
                self.assert_optimal_matches_brute(self.data, 2, emblem)

    def test_special_contributions_and_lux_exclusivity(self):
        dragon = next(u for u in self.data.units if u.name == "远古巨龙")
        self.assertEqual((dragon.slots, dragon.traits["峡谷野怪"]), (2, 2))
        forms = [u for u in self.data.units if u.group == "拉克丝"]
        self.assertEqual(len(forms), 10)
        lux = next(u for u in forms if "花仙子" in u.traits)
        self.assertEqual(lux.traits["花仙子"], 2)
        active, _ = evaluate(self.data, [lux], None)
        self.assertIn("花仙子", {t["name"] for t in active})
        with self.assertRaises(ValueError):
            evaluate(self.data, forms[:2], None)
        # 在真实特殊弈子构成的小池中，检查人口、形态互斥和全局转职共同约束。
        pool = replace(self.data, units=tuple(forms + [dragon] + list(self.data.units[:4])))
        for pop in (1, 2, 3, 4):
            self.assert_optimal_matches_brute(pool, pop, "花仙子")

    def test_global_emblem_adds_one_even_with_native_or_evolved_trait(self):
        fighter = next(u for u in self.data.units if u.name == "可酷伯")
        data = replace(self.data, units=(fighter,))
        result = solve(data, 1, "斗士")
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(result["max_traits"], 1)
        self.assertNotIn("emblem_holder", result)
        active, _ = evaluate(data, [fighter], "斗士")
        self.assertIn({"name": "斗士", "count": 2, "tier": 2}, active)
        kha = next(u for u in prepare_units(self.data, evolutions=("法师",)) if u.name == "卡兹克")
        active, _ = evaluate(self.data, [kha], "法师")
        self.assertIn({"name": "法师", "count": 2, "tier": 2}, active)

    def test_rivals_and_evolution(self):
        names = {"卡兹克", "雷恩加尔", "费德提克", "黛安娜", "阿卡丽", "韦鲁斯"}
        pool = replace(self.data, units=tuple(u for u in self.data.units if u.name in names))
        for together in (False, True):
            for evolutions in ((), ("法师",), ("狂战士", "法师", "裁决使", "迅捷射手")):
                for pop in (1, 2, 4):
                    self.assert_optimal_matches_brute(pool, pop, "法师", evolutions=evolutions,
                                                     rivals_together=together)
        result = solve(pool, 4, "护卫", evolutions=("法师",))
        self.assertIn("卡兹克", {u["name"] for u in result["board"]})

    def test_scoring_and_eclipse(self):
        by_name = {u.name: u for u in self.data.units}
        board = [by_name[n] for n in ("蕾欧娜", "凯尔", "瑟庄妮", "黛安娜", "厄斐琉斯", "拉露恩")]
        active, uncounted = evaluate(self.data, board, None)
        self.assertIn("月蚀骑士", {t["name"] for t in active})
        self.assertTrue({"日蚀骑士", "日月双蚀", "月华神女"} <= {t["name"] for t in uncounted})
        active, uncounted = evaluate(self.data, [by_name["费德提克"]], None)
        self.assertEqual([t["name"] for t in active], ["绝命花妖"])
        self.assertEqual(uncounted, [])

    def test_higher_tiers_count_as_one_trait(self):
        traits = (Trait("a", (2, 4), True), Trait("unique", (1,), False))
        units = tuple(Unit(str(i), str(i), 1, 1, str(i), {"a": 1, "unique": 1})
                      for i in range(4))
        data = Dataset(units, traits, ("a",))
        result = solve(data, 4, "a")
        self.assertEqual(result["max_traits"], 1)
        self.assertEqual(result["active_traits"], [{"name": "a", "count": 5, "tier": 4}])

    def test_timed_out_run_does_not_claim_optimal(self):
        result = solve(self.data, 10, "法师", time_limit=0.000001)
        self.assertEqual(result["status"], "limit")

    def test_invalid_input(self):
        self.assertEqual(normalize_emblem(" 斗士纹章 ", self.data), "斗士")
        self.assertIsNone(normalize_emblem("无", self.data))
        for invalid in ("日蚀骑士", "魔战士", "不存在"):
            with self.assertRaises(ValueError):
                normalize_emblem(invalid, self.data)
        for evolutions in (("法师", "法师"), ("斗士",)):
            with self.assertRaises(ValueError):
                prepare_units(self.data, evolutions=evolutions)
        with self.assertRaises(ValueError):
            prepare_units(self.data, max_cost=2, evolutions=("法师",))
        for p in (0, 21, 2.5):
            with self.assertRaises(ValueError):
                solve(self.data, p, None)
        for limit in (0, -1, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                solve(self.data, 2, None, time_limit=limit)


if __name__ == "__main__":
    unittest.main()
