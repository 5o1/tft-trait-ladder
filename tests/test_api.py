import io
import json
import unittest
from math import inf

from traitladder.api import CalculatorHandler, calculate
from traitladder.data import Dataset, Trait, Unit, load_data
from traitladder.value import unit_values
from traitladder.value import rank_matrix, sort_plans


class APITests(unittest.TestCase):
    def test_selected_plan_inheritance_fallback_and_memory(self):
        data = Dataset((Unit("a", "a", 1, 1, "a", {}),
                        Unit("b", "b", 1, 1, "b", {"t": 1}),
                        Unit("c", "c", 1, 1, "c", {"t": 1, "s": 1}),
                        Unit("d", "d", 1, 1, "d", {})),
                       (Trait("t", (2,), True), Trait("s", (1,), True)), ())
        request = {"population": 3, "emblems": [], "minimum_traits": 0}
        before = calculate(request, data=data)
        parent = before["states"][1]
        child = before["results"][0]
        self.assertEqual(parent["selected_trait_count"], parent["orderings"]["value"][0])
        self.assertEqual(parent["selected_trait_count"], 2)
        self.assertIn("a", parent["candidate_units"])
        self.assertNotIn("a", parent["acquired_units"])
        self.assertNotIn("a", child["inherited_units"])
        plan = next(p for p in child["plans"] if p["target_traits"] == 2)
        value = next(v for v in plan["unit_values"] if v["name"] == "a")
        self.assertFalse(value["inherited"])
        self.assertGreater(value["difficulty"], 0)
        changed = calculate({**request, "selections": {"2,0,0": 1}, "memory": before["memory"]}, data=data)
        row = changed["results"][0]
        self.assertIn("a", row["inherited_units"])
        self.assertNotIn("b", row["inherited_units"])
        self.assertEqual(changed["states"][1]["selection_status"], "user")
        a = next(v for p in row["plans"] for v in p["unit_values"] if v["name"] == "a")
        self.assertEqual(a["difficulty"], 0)
        fallback = calculate({**request, "selections": {"2,0,0": 999}, "memory": changed["memory"]}, data=data)
        self.assertEqual(fallback["states"][1]["selection_status"], "fallback")
        self.assertEqual(fallback["states"][1]["requested_trait_count"], 999)
        self.assertEqual(fallback["states"][1]["selected_trait_count"], 2)
        self.assertEqual(fallback["results"][0]["inherited_units"], child["inherited_units"])
        # 不同羁绊数同损失时选更多羁绊，并直接决定默认继承。
        tied = calculate({**request, "owned": ["a", "c", "d"], "selections": {"2,0,0": 2}}, data=data)
        row = tied["results"][0]
        self.assertEqual(row["orderings"]["value"], [2, 1, 0])
        self.assertEqual(row["selected_trait_count"], 2)
        one, two = (next(p for p in row["plans"] if p["target_traits"] == k) for k in (1, 2))
        self.assertEqual(one["difficulty"], two["difficulty"])
        self.assertEqual(one["difficulty"], 0)
        self.assertEqual(one["owned_used"], len(one["board"]))
        self.assertEqual(two["owned_used"], len(two["board"]) - 1)
        self.assertIn("b", row["inherited_units"])
        cells = {}
        rank_matrix(data, 3, 0, 0, [], minimum_traits=0, cache=cells)
        root, plans = cells[(1, 0, 0)], cells[(2, 0, 0)]["plans"]
        rank_matrix(data, 3, 0, 0, [], minimum_traits=0, selections={"2,0,0": 1}, cache=cells)
        self.assertIs(cells[(1, 0, 0)], root)
        self.assertIs(cells[(2, 0, 0)]["plans"], plans)
        self.assertNotIn("b", cells[(3, 0, 0)]["inherited_units"])
        # 旧记忆将候选并集当作已收集，不能迁移成新继承来源。
        legacy = {**before["memory"], "scope": dict(before["memory"]["scope"])}
        del legacy["scope"]["inheritance"]
        legacy["states"][1]["cards"].append("a")
        clean = calculate({**request, "memory": legacy}, data=data)
        self.assertNotIn("a", clean["results"][0]["inherited_units"])

    def test_lux_ownership_uses_the_separate_form_setting(self):
        request = {"population": 1, "emblems": [], "owned": ["拉克丝"], "minimum_traits": 0}
        memory = None
        for form in ("地狱火", "花仙子", "auto", "none"):
            result = calculate({**request, "lux": form, "memory": memory})
            row = result["results"][0]
            self.assertEqual(row["effective_owned"], ["拉克丝"])
            lux_plans = [p for p in row["plans"] if any(u["name"].startswith("拉克丝") for u in p["board"])]
            if form == "none":
                self.assertFalse(lux_plans)
            else:
                self.assertTrue(lux_plans)
                for plan in lux_plans:
                    self.assertEqual(plan["owned_used"], 1)
                    self.assertEqual(plan["difficulty"], 0)
                    for unit in plan["board"]:
                        if unit["name"].startswith("拉克丝"):
                            self.assertNotEqual(unit["name"], "拉克丝")
                            if form != "auto":
                                self.assertIn(form, unit["traits"])
            memory = result["memory"]
        owned = calculate({**request, "lux": "地狱火"})
        withdrawn = calculate({**request, "lux": "地狱火", "owned": [], "memory": owned["memory"]})
        self.assertFalse(any(u["name"].startswith("拉克丝") for p in withdrawn["results"][0]["plans"] for u in p["board"]))
        banned = calculate({**request, "lux": "地狱火", "excluded_units": ["拉克丝"]})
        self.assertEqual(banned["results"][0]["effective_owned"], [])

    def test_withdrawn_units_recover_shop_cost_from_current_inputs(self):
        data = load_data()
        for name, population in (("拉克丝", 3), ("拉克丝 (地狱火)", 3), ("卡兹克", 3), ("慎", 2)):
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
                fresh = calculate({**request, "owned": []})["results"][0]
                self.assertEqual(row["inherited_units"], fresh["inherited_units"])
                self.assertEqual(row["acquired_units"], fresh["acquired_units"])
                self.assertTrue(all(u["name"] not in same_hero for p in row["plans"] for u in p["board"]))
                value = next(v for v in unit_values(data, population, inherited=row["inherited_units"]).values() if v["name"] == name)
                self.assertEqual(value["difficulty"], inf)

    def test_owned_round_trip_uses_current_inputs(self):
        request = {"emblems": ["主宰"], "population": 4, "evolution_count": 0}
        previous = None
        for owned in (["卡兹克"], ["卡兹克", "洛"], ["卡兹克"], ["卡兹克", "洛"], ["卡兹克"]):
            result = calculate({**request, "owned": owned, **({"memory": json.loads(json.dumps(previous["memory"]))} if previous else {})})
            row = result["results"][0]
            plan = next(p for p in row["plans"] if p["target_traits"] == 3)
            fresh = calculate({**request, "owned": owned})["results"][0]
            self.assertEqual(row["inherited_units"], fresh["inherited_units"])
            self.assertEqual(row["orderings"], fresh["orderings"])
            self.assertEqual(plan["board"], next(p for p in fresh["plans"] if p["target_traits"] == 3)["board"])
            self.assertNotIn("阿卡丽", row["inherited_units"])
            costs = unit_values(load_data(), 4, owned=owned, inherited=row["inherited_units"])
            expected = sum(costs[u["id"]]["difficulty"] for u in plan["board"])
            self.assertEqual(plan["difficulty"], expected)
            self.assertGreater(plan["difficulty"], 0)
            self.assertEqual(plan["canonical_status"], "optimal")
            previous = result

    def test_adding_held_card_recomputes_inheritance_and_prefers_held_cards(self):
        request = {"emblems": ["裁决使"], "population": 8, "evolution_count": 0}
        before = calculate(request)
        old_row = before["results"][0]
        old = sort_plans(old_row["plans"])[0]
        name = next(s["name"] for s in old["lineup"] if s["kind"] == "unit" and s["name"] != "拉克丝")
        after = calculate({**request, "owned": [name], "memory": before["memory"]})
        row = after["results"][0]
        fresh = calculate({**request, "owned": [name]})["results"][0]
        self.assertEqual(row["inherited_units"], fresh["inherited_units"])
        self.assertEqual(row["acquired_units"], fresh["acquired_units"])
        values = unit_values(load_data(), 8, owned=[name], inherited=row["inherited_units"])
        self.assertLessEqual(sum(values[u["id"]]["difficulty"] for u in old["board"]), old["difficulty"] + 1e-9)
        same = next(p for p in row["plans"] if p["target_traits"] == old["target_traits"])
        self.assertGreaterEqual(same["owned_used"], 1)
        self.assertEqual(row["difficulty_boundary"]["threshold"], old_row["difficulty_boundary"]["threshold"])
    def test_progression_is_path_independent(self):
        def comparable(value):
            if isinstance(value, dict):
                return {k: comparable(v) for k, v in value.items() if k != "seconds"}
            if isinstance(value, list):
                return [comparable(v) for v in value]
            return value

        owned = ["洛", "霞", "卡蜜尔", "约里克", "维迦"]
        request = dict(population=6, emblems=["裁决使"], crowns=0, evolution_count=0,
                       owned=owned, selections={"5,0,0": 6})
        direct = calculate(request)
        paths = [
            [dict(population=5, owned=owned[:-1], selections={})],
            [dict(population=5, selections={"5,0,0": 5}),
             dict(selections={"5,0,0": 6, "6,0,0": 8})],
        ]
        for path in paths:
            memory = None
            for changes in path:
                memory = calculate({**request, **changes, "memory": memory})["memory"]
            actual = calculate({**request, "memory": memory})
            self.assertEqual(comparable(actual), comparable(direct))

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
