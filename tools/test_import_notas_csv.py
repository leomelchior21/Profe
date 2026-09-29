"""Casos sintéticos: nenhuma identidade ou nota real é versionada nos testes."""

import csv
import tempfile
import unittest
from pathlib import Path

from import_notas_csv import merge_dataset, read_report


class ImportReportTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / "7A.csv"
        self.labels = ["P1", "P2", "P3", "P4", "PB", "NP", "NB", "RE", "MB"]
        self.rows = [
            ["", "RA.:", "20000001"], ["", "Nome.:", "ALUNO FICTÍCIO"],
            ["", "Turma.:", "EF 7A"], ["", *self.labels * 4],
            ["CIÊNCIAS", "9", "", "", "", "8", "5", "3,7", "9", "8,5",
             "", "", "", "", "", "0", "0", "", "0",
             "7", "", "", "", "", "2,8", "", "", "", *[""] * 9],
            ["ARTES VISUAIS", "", "", "", "", "", "", "*", "", "*", *[""] * 27],
            ["", "25/09/2026 06:48"],
        ]

    def write(self, encoding="cp1252"):
        with self.path.open("w", encoding=encoding, newline="") as stream:
            csv.writer(stream, delimiter=";").writerows(self.rows)

    def test_mb_only_preserves_zero_missing_and_source(self):
        self.write()
        records = read_report(self.path, sum_components=True)
        first, zero, partial, art = records
        self.assertEqual(first["aluno"], "ALUNO FICTÍCIO")
        self.assertEqual(first["materia"], "CIÊNCIAS")
        self.assertEqual((first["ano_letivo"], first["turma"]), (2026, "7A"))
        self.assertEqual((first["nota"], first["nb"], first["recuperacao"]), (8.5, 8.7, 9))
        self.assertEqual(first["avaliacoes_origem"]["NB"], "3,7")
        self.assertEqual(first["fonte_pagina"], "7A.csv#L5")
        self.assertEqual(zero["nota"], 0)
        self.assertIsNone(partial["nota"])
        self.assertIsNone(partial["nb"])
        self.assertIsNone(art["nota"])
        self.assertTrue(all(r["fa"] is None and r["status"] is None for r in records))
        self.assertFalse(any(r["bimestre"] == 4 for r in records))

    def test_utf8_and_no_implicit_component_sum(self):
        self.write("utf-8-sig")
        first = read_report(self.path)[0]
        self.assertEqual(first["nota"], 8.5)
        self.assertEqual(first["materia"], "CIÊNCIAS")
        self.assertIsNone(first["nb"])

    def test_merge_preserves_other_classes_and_is_repeatable(self):
        self.write()
        incoming = read_report(self.path, True)
        ninth = {**incoming[0], "turma": "9A", "ano": "9", "ra": "20000002", "fonte_pagina": "9A.pdf#1"}
        dataset = {"meta": {"gerado_de": ["9A.pdf"]}, "registros": [ninth]}
        merged = merge_dataset(dataset, incoming, [self.path.name])
        self.assertEqual(merged["registros"][0], ninth)
        self.assertEqual(merged["meta"]["total_alunos"], 2)
        self.assertEqual(merge_dataset(merged, incoming, [self.path.name]), merged)
        with self.assertRaises(ValueError):
            merge_dataset(dataset, incoming * 2, [self.path.name])
        with self.assertRaises(ValueError):
            merge_dataset(dataset, [{**r, "ra": ninth["ra"]} for r in incoming], [self.path.name])

    def test_rejects_invalid_grade_and_incomplete_header(self):
        self.rows[4][9] = "11"
        self.write()
        with self.assertRaises(ValueError):
            read_report(self.path)
        self.rows[4][9] = "8,5"
        self.rows[3][9] = ""
        self.write()
        with self.assertRaises(ValueError):
            read_report(self.path)


if __name__ == "__main__":
    unittest.main()
