import io
import json
import unittest
from math import inf

from traitladder.api import CalculatorHandler, calculate
from traitladder.data import load_data
from traitladder.value import unit_values
from traitladder.value import sort_plans


class APITests(unittest.TestCase):
    def test_withdrawn_units_recover_shop_cost_and_preserve_other_history(self):
        data = load_data()
        for name, population in (("拉克丝 (地狱火)", 3), ("卡兹克", 3), ("慎", 2)):
            request = {"emblems": ["主宰"], "population": population, "evolution_count": 0}
            before = calculate({**request, "owned": [name]})
            group = next(u.group for u in data.units if u.name == name)
            same_hero = {u.name for u in data.units if u.group == group}
            for recorded_owned in ([name], []):
                memory = json.loads(json.dumps(before["memory"]))
                memory["owned"] = recorded_owned
                after = calculate({**request, "owned": [], "memory": memory})
                row = after["results"][0]
                self.assertFalse(same_hero & set(row["inherited_units"]))
                self.assertTrue((set(before["results"][0]["inherited_units"]) - same_hero) <= set(row["inherited_units"]))
                self.assertTrue(all(u["name"] not in same_hero for p in row["plans"] for u in p["board"]))
                value = next(v for v in unit_values(data, population, inherited=row["inherited_units"]).values() if v["name"] == name)
                self.assertEqual(value["difficulty"], inf)

    def test_owned_round_trip_preserves_history_and_order(self):
        request = {"emblems": ["主宰"], "population": 4, "evolution_count": 0}
        previous = None
        board = None
        for owned in (["卡兹克"], ["卡兹克", "洛"], ["卡兹克"], ["卡兹克", "洛"], ["卡兹克"]):
            result = calculate({**request, "owned": owned, **({"memory": json.loads(json.dumps(previous["memory"]))} if previous else {})})
            row = result["results"][0]
            plan = next(p for p in row["plans"] if p["target_traits"] == 3)
            ids = tuple(sorted(u["id"] for u in plan["board"]))
            if previous:
                self.assertTrue(set(previous["results"][0]["inherited_units"]) <= set(row["inherited_units"]))
                self.assertEqual(ids, board)
            self.assertEqual(plan["loss"], .01)
            self.assertEqual(plan["canonical_status"], "optimal")
            board, previous = ids, result

    def test_adding_held_card_preserves_ancestral_memory_and_prefers_held_cards(self):
        request = {"emblems": ["裁决使"], "population": 8, "evolution_count": 0}
        before = calculate(request)
        old_row = before["results"][0]
        old = sort_plans(old_row["plans"])[0]
        name = next(s["name"] for s in old["lineup"] if s["kind"] == "unit" and s["name"] != "拉克丝")
        after = calculate({**request, "owned": [name], "memory": before["memory"]})
        row = after["results"][0]
        self.assertTrue(set(old_row["inherited_units"]) <= set(row["inherited_units"]))
        values = unit_values(load_data(), 8, owned=[name], inherited=row["inherited_units"])
        self.assertLessEqual(sum(values[u["id"]]["difficulty"] for u in old["board"]), old["difficulty"] + 1e-9)
        same = next(p for p in row["plans"] if p["target_traits"] == old["target_traits"])
        self.assertGreaterEqual(same["owned_used"], 1)
        self.assertEqual(row["loss_boundary"]["threshold"], old_row["loss_boundary"]["threshold"])
    def test_crowns_derive_shop_level_from_total_slots(self):
        for crowns in range(4):
            request = {"emblems": ["裁决使", "法师"], "population": 3 + crowns}
            automatic = calculate({**request, "crowns": crowns})
            explicit = calculate({**request, "shop_level": 3})
            row = automatic["results"][0]
            self.assertEqual(row["population"], 3 + crowns)
            self.assertEqual(row["shop_level"], 3)
            self.assertEqual(row["crowns"], crowns)
            self.assertEqual([(p["target_traits"], p["difficulty"]) for p in row["plans"]],
                             [(p["target_traits"], p["difficulty"]) for p in explicit["results"][0]["plans"]])

    def test_multiple_emblems_and_repeated_emblem_counts(self):
        data = load_data()
        for emblems in (["花仙子", "主宰"], ["花仙子", "花仙子", "主宰"], []):
            result = calculate({"emblems": emblems, "population": 3}, data=data)
            self.assertEqual(result["emblems"], emblems)
            for plan in result["results"][0]["plans"]:
                totals = {}
                for unit in plan["board"]:
                    for name, count in unit["traits"].items():
                        totals[name] = totals.get(name, 0) + count
                for name in emblems:
                    totals[name] = totals.get(name, 0) + 1
                expected = {t.name: totals[t.name] for t in data.traits if t.counted and totals.get(t.name, 0) >= min(t.levels)}
                self.assertEqual({t["name"]: t["count"] for t in plan["active_traits"]}, expected)
                self.assertEqual(plan["target_traits"], len(expected))

    def test_exclusion_keeps_full_shop_pool(self):
        result = calculate({"emblem": "花仙子", "population": 8, "trait_counts": [9], "excluded_units": ["卡兹克"]})
        plan = result["results"][0]["plans"][0]
        self.assertEqual(result["excluded_units"], ["卡兹克"])
        self.assertTrue(all(u["name"] != "卡兹克" for u in plan["board"]))
        self.assertTrue(all(u["tier_pool"] == 252 for u in plan["unit_values"] if u["cost"] == 3))
        self.assertEqual(unit_values(load_data(), 8)["100330"]["tier_pool"], 252)

    def test_banned_owned_card_is_removed_before_matrix_recalculation(self):
        result = calculate({"emblems": [], "population": 4, "owned": ["阿兹尔"], "excluded_units": ["阿兹尔"]})
        for state in result["states"]:
            self.assertNotIn("阿兹尔", state["effective_owned"])
            self.assertNotIn("阿兹尔", state["inherited_units"])
            self.assertTrue(all(u["name"] != "阿兹尔" for p in state["plans"] for u in p["board"]))

    def test_count_and_fixed_memory_are_output_constraints(self):
        result = calculate({"emblem": "花仙子", "population": 6, "trait_counts": [8], "evolution_count": 2, "fixed_evolutions": ["法师"]})
        state = result["results"][0]
        self.assertEqual(state["evolution_count"], 2)
        self.assertEqual(state["fixed_evolutions"], ["法师"])
        self.assertIn("卡兹克", state["effective_owned"])
        self.assertIn("法师", state["plans"][0]["selected_evolutions"])
        self.assertEqual(len(state["plans"][0]["selected_evolutions"]), 2)

    def test_http_json_contract(self):
        def request(payload):
            body = json.dumps(payload).encode()
            handler = object.__new__(CalculatorHandler)
            handler.path = "/api/solve"
            handler.headers = {"Content-Length": str(len(body))}
            handler.rfile = io.BytesIO(body)
            response = []
            handler.send_json = lambda status, value: response.append((status, value))
            handler.do_POST()
            return response[0]
        status, body = request({"emblem": "花仙子", "population": 3, "trait_counts": [2, 3]})
        self.assertEqual(status, 200)
        self.assertEqual(set(body["results"][0]["orderings"]), {"value", "traits"})
        status, body = request({"emblem": "花仙子", "population": 6, "evolution_count": 1, "excluded_units": ["卡兹克"]})
        self.assertEqual(status, 400)
        self.assertIn("冲突", body["error"])


if __name__ == "__main__":
    unittest.main()
