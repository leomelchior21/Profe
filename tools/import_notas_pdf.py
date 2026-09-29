"""Atualiza notas pelos relatórios gerais PDF; comparações usam somente MB."""

import argparse
import re
from collections import Counter
from pathlib import Path

import pymupdf

from import_notas_csv import merge_dataset, number, read_dataset, write_dataset

LABELS = ["P1", "P2", "P3", "P4", "PB", "NP", "NB", "RE", "MB"]
SUBJECTS = {
    "LÍNGUA PORTUGUESA", "BIOLOGIA", "EDUCAÇÃO FÍSICA", "ESPANHOL", "FÍSICA",
    "GEOGRAFIA", "HISTÓRIA", "INGLÊS", "MAKER : INOVAÇÃO E CRIAÇÃO", "MATEMÁTICA",
    "MÚSICA", "ORIENTAÇÃO EDUCACIONAL", "PRODUÇÃO DE TEXTO", "PROJETO DE VIDA", "QUÍMICA", "TEATRO",
}
ALIASES = {"MAKER : INOVAÇÃO E CRIA": "MAKER : INOVAÇÃO E CRIAÇÃO",
           "ORIENTAÇÃO EDUCACIONA": "ORIENTAÇÃO EDUCACIONAL"}


def identity(page):
    words = page.get_text("words")

    def after(label):
        matches = [w for w in words if w[4] == label]
        if len(matches) != 1:
            raise ValueError("Identificação ausente ou ambígua: " + label)
        anchor = matches[0]
        return " ".join(w[4] for w in sorted(words, key=lambda w: w[0])
                        if abs(w[1] - anchor[1]) < 2 and w[0] >= anchor[2])

    ra, name = after("RA.:"), after("Nome.:")
    turma = re.match(r"EF\s*(\d+)\s*([A-Z])\b", after("Turma.:"))
    years = set(re.findall(r"\b\d{2}/\d{2}/(20\d{2})\b", page.get_text()))
    if not re.fullmatch(r"\d{6,9}", ra) or not name or not turma or len(years) != 1:
        raise ValueError("Identificação do aluno ou ano do relatório inválido")
    return {"ra": ra, "aluno": name, "ano": turma[1], "turma": turma[1] + turma[2],
            "curso": "EF", "ano_letivo": int(years.pop()), "status": None}


def records_from_table(rows, student, source):
    if len(rows) != 18 or rows[1][1:] != LABELS * 4:
        raise ValueError(source + ": cabeçalho ou quantidade de disciplinas inesperado")
    records, seen = [], set()
    for row in rows[2:]:
        subject = re.sub(r"\s+", " ", row[0] or "").strip()
        subject = ALIASES.get(subject, subject)
        if subject not in SUBJECTS or subject in seen or len(row) != 37:
            raise ValueError(source + ": disciplina inválida ou duplicada")
        seen.add(subject)
        for bi in range(4):
            raw = {label: (row[1 + bi * 9 + offset] or "").strip() for offset, label in enumerate(LABELS)}
            values = {label: number(re.sub(r"\s+", "", value)) for label, value in raw.items()}
            nb = (round(values["NP"] + values["NB"], 2)
                  if values["NP"] is not None and values["NB"] is not None else None)
            records.append({**student, "materia": subject, "bimestre": bi + 1,
                            "nota": values["MB"], "nb": nb, "mb": values["MB"],
                            "recuperacao": values["RE"], "fa": None, "tf": None, "fr": None,
                            "total_pontos": None, "fonte_pagina": source, "avaliacoes_origem": raw})
    return records


def read_report(path):
    records, seen = [], set()
    with pymupdf.open(path) as document:
        for page in document:
            student = identity(page)
            if student["ra"] in seen:
                raise ValueError(path.name + ": aluno duplicado")
            seen.add(student["ra"])
            records.extend(records_from_table(extract_rows(page), student, f"{path.name}#{page.number + 1}"))
    if not records:
        raise ValueError(path.name + ": relatório vazio")
    return records


def extract_rows(page):
    # Células com "10,0" quebrado em duas linhas interrompem a grade de alguns
    # PDFs. Usa as colunas do cabeçalho e as linhas de texto de cada disciplina,
    # sem depender das células que o detector omite depois dessas quebras.
    words = page.get_text("words")
    headings = sorted((w for w in words if w[4] in LABELS), key=lambda w: w[0])
    if [w[4] for w in headings] != LABELS * 4 or max(w[1] for w in headings) - min(w[1] for w in headings) > 2:
        raise ValueError("Cabeçalho de notas não reconhecido")
    centers = [(w[0] + w[2]) / 2 for w in headings]
    edges = ([centers[0] - (centers[1] - centers[0]) / 2] +
             [(a + b) / 2 for a, b in zip(centers, centers[1:])] +
             [centers[-1] + (centers[-1] - centers[-2]) / 2])
    left = edges[0]
    top = max(w[3] for w in headings)
    footer = min(w[1] for w in words if re.fullmatch(r"\d{2}/\d{2}/20\d{2}", w[4]))
    subject_words = sorted((w for w in words if w[0] < left and top <= w[1] < footer - 2),
                           key=lambda w: (w[1], w[0]))
    lines = []
    for word in subject_words:
        if not lines or abs(word[1] - lines[-1][0]) > 2:
            lines.append((word[1], []))
        lines[-1][1].append(word)
    rows = [[None] * 37, [None] + LABELS * 4]
    for index, (y, tokens) in enumerate(lines):
        bottom = lines[index + 1][0] - 4 if index + 1 < len(lines) else footer - 2
        row = [" ".join(w[4] for w in sorted(tokens, key=lambda w: w[0]))]
        for x0, x1 in zip(edges, edges[1:]):
            values = sorted((w for w in words if x0 <= (w[0] + w[2]) / 2 < x1 and y - 4 <= w[1] < bottom),
                            key=lambda w: (w[1], w[0]))
            row.append("\n".join(w[4] for w in values))
        rows.append(row)
    return rows


def record_key(record):
    return record["ano_letivo"], record["ra"], record["materia"], record["bimestre"]


def update_dataset(previous, incoming, sources):
    old = {record_key(r): r for r in previous["registros"]}
    scopes = {(r["ano_letivo"], r["turma"]) for r in incoming}
    old_ids = {r["ra"] for r in previous["registros"] if (r["ano_letivo"], r["turma"]) in scopes}
    new_ids = {r["ra"] for r in incoming}
    if old_ids - new_ids:
        raise ValueError("O relatório omite alunos existentes; revise antes de substituir as turmas")
    enriched = []
    for row in incoming:
        row = dict(row)
        existing = old.get(record_key(row))
        if existing:
            # O relatório novo não informa frequência nem situação de matrícula.
            for key in ("fa", "tf", "fr", "status"):
                row[key] = existing[key]
            if any(row[key] is not None for key in ("fa", "tf", "fr")):
                row["fonte_frequencia"] = existing.get("fonte_frequencia", existing["fonte_pagina"])
            if row["status"] is not None:
                row["fonte_status"] = existing.get("fonte_status", existing["fonte_pagina"])
        enriched.append(row)
    result = merge_dataset(previous, enriched, sources)
    extra_sources = [r[field].split("#", 1)[0] for r in result["registros"]
                     for field in ("fonte_frequencia", "fonte_status") if r.get(field)]
    result["meta"]["gerado_de"] = list(dict.fromkeys(result["meta"]["gerado_de"] + extra_sources))
    result["meta"]["aviso"] = (
        "Comparações usam somente MB dos relatórios de notas. MB ausente = null, nunca zero. "
        "Frequência e situação de matrícula dos boletins anteriores são preservadas com origem própria.")
    changes = Counter()
    for row in incoming:
        existing = old.get(record_key(row))
        if existing and row["nota"] != existing["nota"]:
            changes[f"{row['bimestre']}º bi: notas alteradas"] += 1
        if row["mb"] is not None and (not existing or existing["mb"] is None):
            changes[f"{row['bimestre']}º bi: MB acrescentadas"] += 1
    return result, changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()
    previous = read_dataset()
    incoming = [r for path in args.files for r in read_report(path)]
    result, changes = update_dataset(previous, incoming, [path.name for path in args.files])
    write_dataset(result)
    for turma in sorted({r["turma"] for r in incoming}):
        print(f"{turma}: {len({r['ra'] for r in incoming if r['turma'] == turma})} alunos")
    for label, count in sorted(changes.items()):
        print(f"{label}: {count}")
    print(f"Total do painel: {result['meta']['total_alunos']} alunos")


if __name__ == "__main__":
    main()
