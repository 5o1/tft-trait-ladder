from collections import Counter
from itertools import combinations
from math import inf, isfinite, log
import random
import unittest

from traitladder.data import Dataset, Trait, Unit, load_data
from traitladder.solver import solve, prepare_units
from traitladder.value import load_shop_data, load_loss_reference, rank_population, rank_matrix, shop_hit_probability, unit_values, sort_plans, value_boundary, loss_boundary, fit_value_boundary, fit_loss_boundary, matrix_scope, restore_matrix_memory


def brute_by_trait_count(data, population, weights):
    best = {}
    for size in range(1, min(population, len(data.units)) + 1):
        for board in combinations(data.units, size):
            if sum(u.slots for u in board) != population or len({u.group for u in board}) != size:
                continue
            if any(not isfinite(weights[u.id]) for u in board):
                continue
            counts = Counter()
            for u in board:
                counts.update(u.traits)
            k = sum(t.counted and counts[t.name] >= min(t.levels) for t in data.traits)
            difficulty = sum(weights[u.id] for u in board)
            best[k] = min(best.get(k, inf), difficulty)
    return best


class ValueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_data()
        cls.shop = load_shop_data()

    def test_single_shop_probability_has_no_observation_horizon(self):
        self.assertEqual(shop_hit_probability(0), 0)
        self.assertEqual(shop_hit_probability(1), 1)
        self.assertAlmostEqual(shop_hit_probability(.1), 1 - .9 ** 5)

    def test_inherited_cards_have_zero_cost_and_separate_ownership(self):
        fresh = unit_values(self.data, 3)
        inherited = unit_values(self.data, 3, inherited=["阿兹尔"])
        row = next(v for v in inherited.values() if v["name"] == "阿兹尔")
        self.assertEqual(row["difficulty"], 0)
        self.assertTrue(row["inherited"])
        self.assertFalse(row["owned"])
        for key in fresh:
            self.assertEqual(fresh[key]["tier_pool"], inherited[key]["tier_pool"])
            self.assertEqual(fresh[key]["slot_probability"], inherited[key]["slot_probability"])

    def test_matrix_inherits_three_predecessors_and_matches_exhaustive_search(self):
        jobs = ("裁决使", "迅捷射手", "狂战士", "法师")
        traits = tuple(Trait(t, (2, 4), True) for t in ("a", "b", *jobs)) + (Trait("宿敌", (1, 2), True),)
        units = (Unit("a", "a", 1, 1, "a", {"a": 1, "法师": 1}),
                 Unit("b", "b", 1, 1, "b", {"b": 1, "迅捷射手": 1}),
                 Unit("c", "c", 2, 1, "c", {"a": 1, "狂战士": 1}),
                 Unit("d", "d", 2, 1, "d", {"b": 1, "裁决使": 1}),
                 Unit("k", "卡兹克", 3, 1, "卡兹克", {"宿敌": 1}),
                 Unit("x", "x", 3, 1, "x", {"a": 1, "b": 1}))
        data = Dataset(units, traits, ())
        cells = {}
        rank_matrix(data, 3, 1, 1, [], owned=["a"], evolutions=["法师"], cache=cells)
        self.assertEqual(len(cells), 12)
        for (level, crowns, e), row in cells.items():
            inherited = set().union(*(set(cells[tuple(p)]["acquired_units"]) for p in row["predecessors"]))
            self.assertEqual(set(row["inherited_units"]), inherited)
            self.assertEqual(set(row["acquired_units"]), inherited | {u["name"] for p in row["plans"] for u in p["board"]})
            owned = ["a", *(["卡兹克"] if e else [])]
            values = unit_values(data, level, owned=owned, inherited=inherited)
            pool = prepare_units(data, evolutions=["法师"] if e else [])
            best, best_held = {}, {}
            for board in combinations(pool, level + crowns):
                if e and all(u.name != "卡兹克" for u in board):
                    continue
                difficulty = sum(values[u.id]["difficulty"] for u in board)
                if not isfinite(difficulty):
                    continue
                counts = Counter()
                for u in board:
                    counts.update(u.traits)
                k = sum(t.counted and counts[t.name] >= min(t.levels) for t in traits)
                held_count = sum(u.name in owned for u in board)
                if difficulty < best.get(k, inf) - 1e-9:
                    best[k], best_held[k] = difficulty, held_count
                elif abs(difficulty - best.get(k, inf)) <= 1e-9:
                    best_held[k] = max(best_held[k], held_count)
            for plan in row["plans"]:
                self.assertEqual(plan["status"], "optimal")
                self.assertAlmostEqual(plan["difficulty"], best[plan["target_traits"]])
                self.assertEqual(plan["owned_used"], best_held[plan["target_traits"]])
                self.assertAlmostEqual(plan["loss"], 1 / plan["value_score"])
                self.assertTrue(all(v["difficulty"] == 0 for v in plan["unit_values"] if v["inherited"] or v["owned"]))
            if not e:
                self.assertNotIn("卡兹克", inherited)
        count = len(cells)
        rank_matrix(data, 2, 0, 1, [], owned=["a"], evolutions=["法师"], cache=cells)
        self.assertEqual(len(cells), count)

    def test_fresh_pool_probabilities_and_denominator(self):
        values = unit_values(self.data, 3)
        by_name = {r["name"]: r for r in values.values()}
        self.assertAlmostEqual(by_name["洛"]["slot_probability"], .75 * 30 / 420)
        self.assertAlmostEqual(by_name["慎"]["slot_probability"], .25 * 25 / 325)
        self.assertEqual(by_name["阿兹尔"]["difficulty"], inf)
        expected_hit = 1 - (1 - .75 / 14) ** 5
        self.assertAlmostEqual(by_name["洛"]["difficulty"], 1 / expected_hit)
        # 同费卡池采用完整赛季总量。
        result = rank_population(self.data, 3, "裁决使", max_cost=1, trait_counts=[2])
        self.assertTrue(all(r["tier_pool"] == 420 for r in result["plans"][0]["unit_values"]))

    def test_owned_units_and_contested_pool(self):
        values = unit_values(self.data, 3, owned=["阿兹尔"], taken={"洛": 29})
        by_name = {r["name"]: r for r in values.values()}
        self.assertEqual(by_name["阿兹尔"]["difficulty"], 0)
        self.assertEqual(by_name["阿兹尔"]["remaining_copies"], 17)
        self.assertEqual(by_name["阿兹尔"]["tier_pool"], 251)
        self.assertAlmostEqual(by_name["洛"]["slot_probability"], .75 / 391)
        self.assertGreater(by_name["洛"]["difficulty"], by_name["霞"]["difficulty"])
        with self.assertRaises(ValueError):
            unit_values(self.data, 3, owned=["洛"], taken={"洛": 30})

    def test_lux_forms_share_one_pool_group(self):
        units = (Unit("base", "拉克丝", 5, 1, "拉克丝", {"unique": 1}),
                 Unit("a", "拉克丝 (a)", 5, 1, "拉克丝", {"a": 2, "unique": 1}),
                 Unit("b", "拉克丝 (b)", 5, 1, "拉克丝", {"b": 2, "unique": 1}),
                 Unit("other", "other", 5, 1, "other", {}))
        data = Dataset(units, (), ())
        values = unit_values(data, 10)
        self.assertEqual(values["a"]["tier_pool"], 18)
        self.assertAlmostEqual(values["a"]["slot_probability"], .25 / 2 / 2)
        self.assertEqual(values["base"]["slot_probability"], 0)
        self.assertAlmostEqual(sum(r["slot_probability"] for r in values.values()), .25)
        values = unit_values(data, 10, owned=["拉克丝 (a)"])
        self.assertEqual(values["a"]["difficulty"], 0)
        self.assertEqual(values["b"]["slot_probability"], 0)
        values = unit_values(data, 10, owned=["拉克丝 (a)"], inherited=["拉克丝 (b)"])
        self.assertEqual(values["b"]["difficulty"], inf)
        scope = matrix_scope(data, None, (), (), "auto", {}, 0)
        memory = {"scope": scope, "owned": [], "states": [{"state": [10, 0, 0], "cards": [u.name for u in units]}]}
        restored = restore_matrix_memory(data, memory, scope, set())
        self.assertEqual(restored[(10, 0, 0)], {"拉克丝 (a)", "拉克丝 (b)", "other"})

    def test_best_score_per_exact_trait_count_matches_exhaustive_search(self):
        rng = random.Random(1801)
        for case in range(12):
            traits = tuple(Trait(t, (2, 4), True) for t in ("a", "b", "c"))
            units = tuple(Unit(str(i), str(i), 1, rng.choice((1, 1, 2)),
                               str(i // 2) if i < 2 else str(i),
                               {t.name: 1 for t in traits if rng.random() < .45}) for i in range(8))
            data = Dataset(units, traits, ())
            weights = {u.id: rng.choice((0.0, 1.2, 3.7, 13.1, inf)) for u in units}
            for population in (2, 3, 4):
                expected = brute_by_trait_count(data, population, weights)
                for k in range(4):
                    with self.subTest(case=case, population=population, k=k):
                        r = solve(data, population, None, target_traits=k, unit_difficulties=weights)
                        if k not in expected:
                            self.assertEqual(r["status"], "infeasible")
                        else:
                            self.assertEqual(r["status"], "optimal")
                            self.assertEqual(r["max_traits"], k)
                            self.assertAlmostEqual(r["difficulty"], expected[k])
                            self.assertAlmostEqual(r["difficulty_lower_bound"], expected[k])
                            self.assertAlmostEqual(r["value_score"], 100 / (1 + expected[k]))

    def test_complete_lineup_order_matches_exhaustive_search(self):
        traits = tuple(Trait(t, (2, 4), True) for t in ("a", "b"))
        units = tuple(Unit(f"u{i:02}", f"unit{i:02}", 1, 2 if i == 19 else 1,
                           "shared" if i < 2 else str(i),
                           {t: 1 for t, active in (("a", i % 2 == 0), ("b", i % 3 == 0)) if active}) for i in range(20))
        held = {"unit03", "unit17"}
        rng = random.Random(180431)
        for weights in ({u.id: 0.0 for u in units}, {u.id: rng.choice((0.0, 1.25, 2.5, inf)) for u in units}):
            weights.update({u.id: 0 for u in units if u.name in held})
            for population in (2, 3):
                expected = {}
                for size in range(1, population + 1):
                    for board in combinations(units, size):
                        if sum(u.slots for u in board) != population or len({u.group for u in board}) != size:
                            continue
                        cost = sum(weights[u.id] for u in board)
                        if not isfinite(cost):
                            continue
                        counts = Counter()
                        for u in board:
                            counts.update(u.traits)
                        k = sum(counts[t.name] >= 2 for t in traits)
                        order = (cost, -sum(u.name in held for u in board), tuple(sorted(u.id for u in board)))
                        expected[k] = min(expected.get(k, (inf, 0, ())), order)
                for ordered_units in (units, tuple(reversed(units))):
                    for k, order in expected.items():
                        result = solve(Dataset(ordered_units, traits, ()), population, None,
                                       target_traits=k, unit_difficulties=weights, owned_units=held)
                        self.assertEqual(result["status"], "optimal")
                        self.assertAlmostEqual(result["difficulty"], order[0])
                        self.assertEqual(result["owned_used"], -order[1])
                        self.assertEqual(tuple(sorted(u["id"] for u in result["board"])), order[2])

    def test_three_population_cannot_shop_for_three_costs(self):
        result = rank_population(self.data, 3, "裁决使")
        self.assertEqual(result["theoretical_max_traits"], 4)
        self.assertEqual(result["reachable_max_traits"], 2)
        self.assertEqual([r["target_traits"] for r in result["plans"]], [0, 1, 2])
        for plan in result["plans"]:
            self.assertTrue(all(u["cost"] == 1 for u in plan["board"]))
            self.assertTrue(all(c["difficulty"] < inf for s in plan["lineup"]
                                if s["kind"] == "placeholder" for c in s["candidates"]))
        unavailable = rank_population(self.data, 3, "裁决使", trait_counts=[3, 4])
        self.assertEqual(unavailable["plans"], [])
        self.assertEqual(unavailable["unavailable_counts"], [3, 4])

    def test_owned_three_costs_can_be_used_at_level_three(self):
        r = rank_population(self.data, 3, "裁决使", owned=["阿兹尔", "费德提克"], trait_counts=[4])
        self.assertEqual(r["reachable_max_traits"], 4)
        self.assertEqual(len(r["plans"]), 1)
        self.assertEqual({u["name"] for u in r["plans"][0]["board"]}, {"维迦", "阿兹尔", "费德提克"})

    def test_shop_level_is_independent_of_population(self):
        r = rank_population(self.data, 3, "裁决使", shop_level=7, trait_counts=[4])
        self.assertEqual(r["reachable_max_traits"], 4)
        self.assertEqual(r["plans"][0]["status"], "optimal")
        with self.assertRaises(ValueError):
            rank_population(self.data, 11, "裁决使")

    def test_value_uses_odds_instead_of_always_preferring_cheap_units(self):
        traits = (Trait("a", (2, 4), True),)
        units = tuple(Unit(str(i), str(i), 1 if i < 2 else 2, 1, str(i), {"a": 1}) for i in range(4))
        data = Dataset(units, traits, ())
        for level, expected_cost in ((3, 1), (7, 2)):
            r = rank_population(data, 2, None, shop_level=level, trait_counts=[1])
            self.assertEqual({u["cost"] for u in r["plans"][0]["board"]}, {expected_cost})

    def test_all_owned_example_has_full_value(self):
        r = rank_population(self.data, 3, "裁决使", owned=["洛", "霞", "约里克"], trait_counts=[2])
        self.assertEqual(r["plans"][0]["difficulty"], 0)
        self.assertEqual(r["plans"][0]["value_score"], 100)

    def test_evolved_khazix_is_automatically_owned(self):
        options = dict(evolutions=("裁决使",), trait_counts=[2, 3])
        automatic = rank_population(self.data, 3, "裁决使", **options)
        explicit = rank_population(self.data, 3, "裁决使", owned=["卡兹克"], **options)
        self.assertEqual(automatic["status"], "optimal")
        self.assertEqual(automatic["effective_owned"], ["卡兹克"])
        self.assertEqual(automatic["reachable_max_traits"], 3)
        for auto, other in zip(automatic["plans"], explicit["plans"]):
            self.assertEqual(auto["target_traits"], other["target_traits"])
            self.assertAlmostEqual(auto["difficulty"], other["difficulty"])
            kha = next(u for u in auto["unit_values"] if u["name"] == "卡兹克")
            self.assertTrue(kha["owned"])
            self.assertEqual(kha["difficulty"], 0)
            self.assertEqual(kha["slot_probability"], 0)

    def test_rival_placeholder_preserves_full_pool_after_optimization(self):
        for owned in (["卡兹克", "雷恩加尔"], ["卡兹克"], ["雷恩加尔"]):
            result = rank_population(self.data, 1, None, shop_level=8, owned=owned, trait_counts=[1])
            plan = result["plans"][0]
            slot = plan["lineup"][0]
            self.assertEqual(plan["difficulty"], 0)
            self.assertEqual(slot["label"], "【任意宿敌】")
            self.assertEqual({u["name"] for u in slot["candidates"]}, {"卡兹克", "雷恩加尔"})
        result = rank_population(self.data, 1, None, shop_level=8, owned=["卡兹克"],
                                 excluded_units=["雷恩加尔"], trait_counts=[1])
        self.assertEqual(result["plans"][0]["lineup"][0]["kind"], "unit")

    def test_evolved_khazix_removal_is_not_counted_twice(self):
        r = rank_population(self.data, 7, "裁决使", evolutions=("裁决使",),
                            owned=["卡兹克"], trait_counts=[2])
        kha = next(u for u in r["plans"][0]["unit_values"] if u["name"] == "卡兹克")
        self.assertEqual(kha["remaining_copies"], 17)
        self.assertEqual(kha["tier_pool"], 251)

    def test_ladder14_requires_more_than_one_evolution_at_ten_population(self):
        for evolutions in ((), ("狂战士",), ("裁决使",), ("迅捷射手",), ("法师",)):
            with self.subTest(evolutions=evolutions):
                result = solve(self.data, 10, "裁决使", evolutions=evolutions)
                self.assertEqual(result["status"], "optimal")
                self.assertEqual(result["max_traits"], 13)
        result = solve(self.data, 10, "裁决使", max_cost=4,
                       evolutions=("狂战士", "迅捷射手"), target_traits=14)
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(result["max_traits"], 14)
        self.assertIn("卡兹克", {u["name"] for u in result["board"]})
        self.assertTrue(all(u["cost"] <= 4 for u in result["board"]))

    def test_automatic_evolutions_match_fixed_choice_optima(self):
        values = unit_values(self.data, 6, owned=["卡兹克"])
        weights = {key: row["difficulty"] for key, row in values.items()}
        automatic = solve(self.data, 6, "花仙子", target_traits=8, evolution_count=2, unit_difficulties=weights)
        expected = []
        ordered = []
        trait_order = {t.name: i for i, t in enumerate(self.data.traits)}
        for chosen in combinations(("裁决使", "迅捷射手", "狂战士", "法师"), 2):
            result = solve(self.data, 6, "花仙子", target_traits=8, evolutions=chosen, unit_difficulties=weights)
            if result["status"] == "optimal":
                expected.append(result["difficulty"])
                ordered.append((result["difficulty"], tuple(sorted(u["id"] for u in result["board"])), tuple(sorted(trait_order[t] for t in chosen))))
        self.assertEqual(automatic["status"], "optimal")
        self.assertEqual(len(automatic["selected_evolutions"]), 2)
        self.assertAlmostEqual(automatic["difficulty"], min(expected))
        self.assertEqual((automatic["difficulty"], tuple(sorted(u["id"] for u in automatic["board"])), tuple(sorted(trait_order[t] for t in automatic["selected_evolutions"]))), min(ordered))
        locked = solve(self.data, 6, "花仙子", target_traits=8, evolutions=("法师",), evolution_count=2, unit_difficulties=weights)
        self.assertIn("法师", locked["selected_evolutions"])
        self.assertEqual(len(locked["selected_evolutions"]), 2)

    def test_sort_modes_keep_the_same_candidates(self):
        plans = [{"board": [1], "target_traits": k, "value_score": v} for k, v in ((11, .638), (9, 1.305), (10, 1.116))]
        self.assertEqual([p["target_traits"] for p in sort_plans(plans)], [9, 10, 11])
        self.assertEqual([p["target_traits"] for p in sort_plans(plans, "traits")], [11, 10, 9])
        self.assertEqual([p["target_traits"] for p in plans], [11, 9, 10])

    def test_boundary_minimizes_log_variance_and_scales_with_values(self):
        numbers = [.2, .21, 1.1, 1.2, 1.3]
        plans = [{"board": [1], "target_traits": i + 2, "value_score": value} for i, value in enumerate(numbers)]
        result = fit_value_boundary(plans)
        losses = fit_loss_boundary(plans)
        self.assertAlmostEqual(losses["threshold"], 1 / result["threshold"])
        self.assertEqual(losses["higher_count"], result["lower_count"])
        xs = list(map(log, numbers))
        losses = []
        for k in range(1, len(xs)):
            parts = (xs[:k], xs[k:])
            losses.append(sum(sum((x - sum(group) / len(group)) ** 2 for x in group) for group in parts))
        self.assertAlmostEqual(result["within_class_sse"], min(losses))
        self.assertEqual(sum(v < result["threshold"] for v in numbers), result["lower_count"])
        scaled = fit_value_boundary([{**p, "value_score": p["value_score"] * 7} for p in reversed(plans)])
        self.assertAlmostEqual(scaled["threshold"], result["threshold"] * 7)
        self.assertIsNone(fit_value_boundary(plans[:1])["threshold"])
        self.assertIsNone(fit_value_boundary([{**p, "value_score": 1} for p in plans])["threshold"])

    def test_global_loss_boundary_is_independent_of_current_candidates(self):
        cutoff = loss_boundary()["threshold"]
        for values in ([], [100], [100, 100, 100], [1, 2, 3], [.001, 10, 99]):
            plans = [{"board": [1], "target_traits": k + 2, "value_score": v} for k, v in enumerate(values)]
            self.assertEqual(loss_boundary(plans)["threshold"], cutoff)
            self.assertAlmostEqual(value_boundary(plans)["threshold"], 1 / cutoff)
        self.assertGreater(cutoff, .01)

    def test_published_loss_boundary_matches_reference_samples(self):
        reference = load_loss_reference()
        self.assertEqual(reference["data_version"], self.data.version)
        self.assertEqual(len(reference["samples"]), reference["sample_count"])
        plans = []
        for row in reference["samples"]:
            self.assertGreater(row["difficulty"], 0)
            self.assertAlmostEqual(row["loss"], (1 + row["difficulty"]) / 100)
            plans.append({"board": [1], "target_traits": row["traits"], "value_score": 1 / row["loss"]})
        fitted = fit_loss_boundary(plans)
        for key, expected in reference["boundary"].items():
            if isinstance(expected, float):
                self.assertAlmostEqual(fitted[key], expected)
            else:
                self.assertEqual(fitted[key], expected)


if __name__ == "__main__":
    unittest.main()
