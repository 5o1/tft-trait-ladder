from itertools import product
import unittest

from traitladder.data import Dataset, Trait, Unit, load_data
from traitladder.lineup import describe_lineup
from traitladder.solver import evaluate, prepare_units, solve


class LineupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_data()
        cls.by_name = {u.name: u for u in cls.data.units}

    def test_existing_board_units_are_excluded_from_alternatives(self):
        names = ("洛", "维迦", "约里克", "阿兹尔", "费德提克", "莉莉娅", "伊莉丝")
        board = [self.by_name[n] for n in names]
        lineup = describe_lineup(self.data, board, "裁决使", self.data.units)
        self.assertEqual(lineup[0]["name"], "洛")
        self.assertEqual(lineup[-1]["kind"], "unit")
        self.assertEqual(lineup[-1]["name"], "伊莉丝")

    def test_single_activated_trait_has_same_or_lower_cost_alternative(self):
        names = ("维迦", "阿兹尔", "费德提克", "奥恩")
        board = [self.by_name[n] for n in names]
        flex = describe_lineup(self.data, board, "裁决使", self.data.units)[-1]
        self.assertEqual(flex["label"], "【任意护卫】")
        self.assertEqual({c["name"] for c in flex["candidates"]}, {"奥恩", "蕾欧娜"})
        for candidate in flex["candidates"]:
            replacement = self.by_name[candidate["name"]]
            self.assertLessEqual(replacement.cost, board[-1].cost)
            self.assertNotIn(replacement.group, {u.group for u in board[:-1]})
            active, _ = evaluate(self.data, board[:-1] + [replacement], "裁决使")
            self.assertEqual(len(active), 5)
        pool = [u for u in self.data.units if u.name != "蕾欧娜"]
        self.assertEqual(describe_lineup(self.data, board, "裁决使", pool)[-1]["kind"], "unit")

    def test_multiple_activated_traits_keep_unit_name(self):
        for names in [("拉克丝 (花仙子)",), ("远古巨龙", "苍蓝哨戒")]:
            board = [self.by_name[n] for n in names]
            slot = describe_lineup(self.data, board, "绝命花妖", self.data.units)[0]
            self.assertEqual(slot["kind"], "unit")
            self.assertEqual(slot["name"], names[0])

    def test_zero_activated_traits_keep_unit_name(self):
        result = solve(self.data, 1, None, max_cost=1)
        self.assertEqual(result["max_traits"], 0)
        self.assertEqual(result["lineup"][0]["kind"], "unit")

    def test_single_trait_has_alternatives_and_evolved_khazix_stays_fixed(self):
        kha = self.by_name["卡兹克"]
        slot = describe_lineup(self.data, [kha], None, self.data.units)[0]
        self.assertEqual(slot["label"], "【任意宿敌】")
        self.assertEqual({u["name"] for u in slot["candidates"]}, {"卡兹克", "雷恩加尔"})
        pool = prepare_units(self.data, evolutions=("法师",))
        kha = next(u for u in pool if u.name == "卡兹克")
        slot = describe_lineup(self.data, [kha], None, pool, evolutions=("法师",))[0]
        self.assertEqual(slot["kind"], "unit")

    def test_multiple_placeholders_preserve_all_active_traits(self):
        # 共同核心同时提供 a、b；两个挂件分别补一个羁绊。
        # irrelevant 保持未激活状态。
        traits = (Trait("a", (2, 4), True), Trait("b", (2, 4), True),
                  Trait("irrelevant", (3, 5), True))
        core = Unit("core", "core", 1, 1, "core", {"a": 1, "b": 1})
        units = (core, Unit("a1", "a1", 1, 1, "a1", {"a": 1, "irrelevant": 1}),
                 Unit("b1", "b1", 1, 1, "b1", {"b": 1, "irrelevant": 1}),
                 Unit("a2", "a2", 1, 1, "a2", {"a": 1}),
                 Unit("b2", "b2", 1, 1, "b2", {"b": 1}))
        data = Dataset(units, traits, ())
        lineup = describe_lineup(data, list(units[:3]), None, units)
        by_id = {u.id: u for u in units}
        for a, b in product(lineup[1]["candidates"], lineup[2]["candidates"]):
            active, _ = evaluate(data, [core, by_id[a["id"]], by_id[b["id"]]], None)
            self.assertEqual({t["name"] for t in active}, {"a", "b"})

    def test_alternatives_preserve_slots_and_trait_contribution(self):
        traits = (Trait("a", (2, 4), True), Trait("b", (3, 5), True))
        original = Unit("original", "original", 3, 2, "original", {"a": 2, "b": 1})
        same = Unit("same", "same", 2, 2, "same", {"a": 2})
        single = Unit("single", "single", 1, 1, "single", {"a": 1})
        expensive = Unit("expensive", "expensive", 4, 2, "expensive", {"a": 2})
        units = (original, same, single, expensive)
        data = Dataset(units, traits, ())
        flex = describe_lineup(data, [original], None, units)[0]
        self.assertEqual((flex["slots"], flex["min_contribution"]), (2, 2))
        self.assertEqual({c["name"] for c in flex["candidates"]}, {"original", "same"})


if __name__ == "__main__":
    unittest.main()
