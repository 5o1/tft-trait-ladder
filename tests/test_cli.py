import argparse
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from traitladder.__main__ import main, populations


class CLITests(unittest.TestCase):
    def test_json_output(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = main(["斗士转职", "-p", "1,3", "--json"])
        result = json.loads(out.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual(result["emblem"], "斗士")
        self.assertEqual([r["population"] for r in result["results"]], [1, 3])
        self.assertTrue(all(r["status"] == "optimal" for r in result["results"]))

    def test_interactive_input(self):
        with patch("builtins.input", return_value="法师纹章"):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                with contextlib.redirect_stderr(io.StringIO()):
                    code = main(["-p", "2"])
        self.assertEqual(code, 0)
        self.assertIn("全局羁绊计数 +1", out.getvalue())
        self.assertNotIn("转职给", out.getvalue())

    def test_invalid_emblem_is_actionable(self):
        with contextlib.redirect_stderr(io.StringIO()) as err:
            with self.assertRaises(SystemExit) as exc:
                main(["宝石骑士"])
        self.assertEqual(exc.exception.code, 2)
        self.assertIn("可选", err.getvalue())

    def test_population_parser(self):
        self.assertEqual(populations("4,6，8-10,8"), [4, 6, 8, 9, 10])
        for value in ("", "0", "21", "3-1", "1-999999999", "a", "1--3"):
            with self.assertRaises(argparse.ArgumentTypeError):
                populations(value)

    def test_text_lineup_renders_placeholders(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            with contextlib.redirect_stderr(io.StringIO()):
                code = main(["裁决使", "-p", "4"])
        self.assertEqual(code, 0)
        self.assertIn("【任意", out.getvalue())
        self.assertIn("可选：", out.getvalue())

    def test_value_json_contains_each_feasible_trait_count(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            with contextlib.redirect_stderr(io.StringIO()):
                code = main(["裁决使", "-p", "3", "--json"])
        result = json.loads(out.getvalue())["results"][0]
        self.assertEqual(code, 0)
        self.assertEqual(result["reachable_max_traits"], 2)
        self.assertEqual([r["target_traits"] for r in result["plans"]], [0, 1, 2])

    def test_max_only_keeps_theoretical_mode(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            with contextlib.redirect_stderr(io.StringIO()):
                code = main(["裁决使", "-p", "3", "--max-only", "--json"])
        result = json.loads(out.getvalue())["results"][0]
        self.assertEqual(code, 0)
        self.assertEqual(result["max_traits"], 4)
        self.assertNotIn("plans", result)

    def test_pool_state_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.json"
            path.write_text(json.dumps({"owned": ["阿兹尔", "费德提克"], "taken": {"维迦": 29}}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as out:
                with contextlib.redirect_stderr(io.StringIO()):
                    code = main(["裁决使", "-p", "3", "--trait-counts", "4", "--pool-state", str(path), "--json"])
        self.assertEqual(code, 0)
        plan = json.loads(out.getvalue())["results"][0]["plans"][0]
        self.assertEqual(plan["target_traits"], 4)
        veigar = next(u for u in plan["unit_values"] if u["name"] == "维迦")
        self.assertEqual(veigar["remaining_copies"], 1)
        self.assertEqual(veigar["tier_pool"], 391)

    def test_custom_shop_data(self):
        from traitladder.value import DEFAULT_SHOP_DATA
        profile = json.loads(DEFAULT_SHOP_DATA.read_text(encoding="utf-8"))
        profile["odds_by_level"]["3"] = [0, 0, 1, 0, 0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "shop.json"
            path.write_text(json.dumps(profile), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as out:
                with contextlib.redirect_stderr(io.StringIO()):
                    code = main(["裁决使", "-p", "3", "--trait-counts", "2", "--shop-data", str(path), "--json"])
        self.assertEqual(code, 0)
        plan = json.loads(out.getvalue())["results"][0]["plans"][0]
        self.assertTrue(all(u["cost"] == 3 or row["inherited"] for u, row in zip(plan["board"], plan["unit_values"])))


if __name__ == "__main__":
    unittest.main()
