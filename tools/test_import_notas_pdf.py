"""Validação com dados fictícios dos relatórios gerais PDF."""

import unittest
from types import SimpleNamespace

from import_notas_pdf import LABELS, SUBJECTS, extract_rows, records_from_table, update_dataset


class ImportPDFTest(unittest.TestCase):
    def setUp(self):
        self.student = {"ra": "20000001", "aluno": "ALUNO FICTÍCIO", "turma": "9A",
                        "ano": "9", "ano_letivo": 2026, "curso": "EF", "status": None}
        self.rows = [[None] * 37, [None] + LABELS * 4]
        self.rows += [[subject] + [""] * 36 for subject in sorted(SUBJECTS)]
        self.rows[2][1:10] = ["10,\n0", "0,0", "", "", "8,0", "4,5", "3,6", "9,0", "8,3"]
        self.rows[2][10:19] = ["", "", "", "", "", "0", "0", "", "0"]
        self.rows[2][19:28] = ["7", "", "", "", "", "4", "3", "", ""]

    def test_mb_only_zero_wrapped_numbers_and_missing_grade(self):
        records = records_from_table(self.rows, self.student, "novo.pdf#1")
        self.assertEqual(len(records), 64)
        self.assertEqual((records[0]["nota"], records[0]["nb"]), (8.3, 8.1))
        self.assertEqual(records[1]["nota"], 0)
        self.assertIsNone(records[2]["nota"])
        self.assertEqual(records[2]["nb"], 7)
        self.assertIsNone(records[3]["nota"])
        self.assertTrue(all(r["nota"] == r["mb"] for r in records))

    def test_replaces_grades_preserves_attendance_and_seventh_grade(self):
        incoming = records_from_table(self.rows, self.student, "novo.pdf#1")
        old = [{**r, "nota": 6, "mb": 6, "fa": 2, "tf": 4, "fr": 95,
                "status": "Cursando", "fonte_pagina": "antigo.pdf#1"} for r in incoming]
        seventh = {**old[0], "ra": "20000002", "ano": "7", "turma": "7A", "fonte_pagina": "7A.csv#L1"}
        dataset = {"meta": {"gerado_de": ["antigo.pdf", "7A.csv"]}, "registros": old + [seventh]}
        result, _ = update_dataset(dataset, incoming, ["novo.pdf"])
        self.assertEqual(result["registros"][0], seventh)
        updated = result["registros"][1:]
        self.assertEqual(updated[0]["nota"], 8.3)
        self.assertIsNone(updated[2]["nota"])
        self.assertTrue(all(r["fa"] == 2 and r["fr"] == 95 and r["status"] == "Cursando" for r in updated))
        self.assertTrue(all(r["fonte_frequencia"] == "antigo.pdf#1" for r in updated))
        self.assertEqual(update_dataset(result, incoming, ["novo.pdf"])[0], result)
        self.assertEqual(set(result["meta"]["gerado_de"]), {"antigo.pdf", "novo.pdf", "7A.csv"})
        with self.assertRaises(ValueError):
            update_dataset(dataset, [{**r, "ra": "20000003"} for r in incoming], ["novo.pdf"])

    def test_truncated_subjects_and_invalid_header(self):
        for row in self.rows[2:]:
            if row[0] == "MAKER : INOVAÇÃO E CRIAÇÃO":
                row[0] = "MAKER : INOVAÇÃO E CRIA"
            if row[0] == "ORIENTAÇÃO EDUCACIONAL":
                row[0] = "ORIENTAÇÃO EDUCACIONA"
        records = records_from_table(self.rows, self.student, "novo.pdf#1")
        self.assertEqual({r["materia"] for r in records}, SUBJECTS)
        self.rows[1][-1] = "NB"
        with self.assertRaises(ValueError):
            records_from_table(self.rows, self.student, "novo.pdf#1")

    def test_extracts_rows_after_broken_grid_and_wrapped_ten(self):
        subjects = sorted(SUBJECTS)
        words = [(10, 100 + i * 20, 110, 109 + i * 20, s) for i, s in enumerate(subjects)]
        # MB do primeiro bimestre (nona coluna), com 10,0 em duas linhas.
        words += [(283, 98, 295, 107, "10,"), (286, 108, 292, 117, "0"),
                  (283, 400, 295, 409, "7,5"), (400, 500, 450, 510, "29/09/2026")]
        words += [(125 + i * 20, 80, 135 + i * 20, 90, label) for i, label in enumerate(LABELS * 4)]
        page = SimpleNamespace(get_text=lambda mode: words)
        records = records_from_table(extract_rows(page), self.student, "novo.pdf#1")
        self.assertEqual(records[0]["nota"], 10)
        self.assertEqual(records[-4]["nota"], 7.5)
        self.assertEqual({r["materia"] for r in records}, SUBJECTS)


if __name__ == "__main__":
    unittest.main()
