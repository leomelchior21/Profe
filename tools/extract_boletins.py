# -*- coding: utf-8 -*-
"""
Extrator dos boletins (PDF) -> dataset normalizado.

Entrada : source/*.pdf  (um PDF por turma, uma pagina por aluno)
Saidas  : data/boletins.csv            (tabela "tidy", uma linha por aluno x disciplina x bimestre)
          data/dados.js              (dataset embutido, para o painel rodar 100% offline via file://)

Regras de leitura:
  - Colunas da tabela do boletim, por bimestre: NB (nota bimestral), R (recuperacao), MB (media bimestral), FA (faltas)
  - Asterisco (*) significa disciplina sem nota numerica (ex.: MAKER, MUSICA, TEATRO)
  - Campo vazio  -> None (nunca tratado como zero)
  - "nota" = MB quando registrada; caso contrario NB (bimestre em andamento sem MB registrada no boletim)
"""

import csv
import json
import os
import re
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, "source")
DATA_DIR = os.path.join(ROOT, "data")
WEB_DATA_DIR = os.path.join(ROOT, "web", "js")

PDFS = ["9a_3o bi.pdf", "9b_3o bi.pdf", "9c_3o bi.pdf", "9d_3o bi.pdf"]

STATUS_WORDS = {"Cursando", "Transferido"}
SKIP_SUBJECTS = {None, "", "COMPONENTES\nCURRICULARES", "Cursando", "Transferido"}

# indices das colunas dentro da tabela detectada
COL_SUBJECT = 0
COL_BLOCKS = [1, 5, 9, 13]      # NB, R, MB, FA de cada bimestre
COL_TOTAL_PONTOS = 17
COL_TF = 18
COL_FR = 19


def parse_num(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s == "*":
        return None
    s = s.replace(" ", "").replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def words_in_band(words, label_x, label_y, x_min, x_max, y_tol=13):
    out = []
    for x0, y0, x1, y1, t, *_ in words:
        if x0 >= x_min and x0 <= x_max and label_y - 6 <= y0 <= label_y + y_tol:
            out.append((round(y0, 1), x0, t))
    out.sort()
    return " ".join(t for _, _, t in out)


def student_identity(page):
    words = page.get_text("words")
    labels = {}
    for x0, y0, x1, y1, t, *_ in words:
        if t in ("ALUNO:", "R.A.:", "TURMA:", "LETIVO:"):
            labels[t] = (x0, y0)

    ra = None
    if "R.A.:" in labels:
        lx, ly = labels["R.A.:"]
        for x0, y0, x1, y1, t, *_ in words:
            if abs(y0 - ly) < 3 and x0 > lx + 5 and re.fullmatch(r"\d{6,9}", t):
                ra = t
                break

    nome = None
    if "ALUNO:" in labels and ra:
        lx, ly = labels["ALUNO:"]
        nome = words_in_band(words, lx, ly, lx + 5, 405)
        nome = re.sub(r"\s+", " ", nome).strip(" :")

    turma = None
    if "TURMA:" in labels:
        lx, ly = labels["TURMA:"]
        toks = [t for x0, y0, x1, y1, t, *_ in words if abs(y0 - ly) < 3 and x0 > lx + 5]
        turma = " ".join(toks).strip()

    ano_letivo = None
    if "LETIVO:" in labels:
        lx, ly = labels["LETIVO:"]
        for x0, y0, x1, y1, t, *_ in words:
            if abs(y0 - ly) < 3 and x0 > lx + 5 and re.fullmatch(r"20\d\d", t):
                ano_letivo = int(t)
                break

    return {"ra": ra, "nome": nome, "turma": turma, "ano_letivo": ano_letivo}


def page_status(text):
    for s in ("Transferido", "Cursando"):
        if s in text:
            return s
    return None


def parse_table(page):
    tabs = page.find_tables()
    if not tabs.tables:
        return None, "sem tabela detectada"
    table = tabs.tables[0]
    if table.col_count != 20:
        return None, "tabela com %d colunas (esperado 20)" % table.col_count
    return table.extract(), None


def main():
    registros = []
    problemas = []
    total_paginas = 0
    sem_aluno = 0

    for pdf in PDFS:
        path = os.path.join(SOURCE_DIR, pdf)
        doc = pymupdf.open(path)
        for page in doc:
            total_paginas += 1
            ident = student_identity(page)
            text = page.get_text()
            status = page_status(text)

            if not ident["ra"] or not ident["nome"] or not ident["turma"]:
                if "Cursando" in text or "Transferido" in text:
                    problemas.append((pdf, page.number + 1, "identidade incompleta: %s" % ident))
                continue

            m = re.search(r"EF\s*(\d+)\s*([A-Z])", ident["turma"])
            ano_escolar = m.group(1) if m else None
            turma = (m.group(1) + m.group(2)) if m else ident["turma"].replace(" ", "")
            curso = "EF"

            rows, err = parse_table(page)
            if rows is None:
                problemas.append((pdf, page.number + 1, err))
                sem_aluno += 1
                continue

            for row in rows:
                subject = row[COL_SUBJECT]
                if subject in SKIP_SUBJECTS or subject is None:
                    continue
                subject = re.sub(r"\s+", " ", str(subject)).strip()

                for bi, start in enumerate(COL_BLOCKS):
                    nb = parse_num(row[start])
                    rec = parse_num(row[start + 1])
                    mb = parse_num(row[start + 2])
                    fa = parse_num(row[start + 3])

                    if nb is None and rec is None and mb is None and fa is None:
                        continue

                    nota = mb if mb is not None else nb

                    registros.append({
                        "ano_letivo": ident["ano_letivo"],
                        "ano": ano_escolar,
                        "curso": curso,
                        "turma": turma,
                        "aluno": ident["nome"],
                        "ra": ident["ra"],
                        "status": status,
                        "materia": subject,
                        "bimestre": bi + 1,
                        "nota": nota,
                        "nb": nb,
                        "recuperacao": rec,
                        "mb": mb,
                        "fa": fa,
                        "total_pontos": parse_num(row[COL_TOTAL_PONTOS]) if bi == 0 else None,
                        "tf": parse_num(row[COL_TF]) if bi == 0 else None,
                        "fr": parse_num(row[COL_FR]) if bi == 0 else None,
                        "fonte_pagina": "%s#%d" % (pdf, page.number + 1),
                    })

    # -------- validacao / resumo --------
    alunos = {}
    for r in registros:
        alunos.setdefault(r["ra"], r["aluno"])

    com_nota = [r for r in registros if r["nota"] is not None]
    com_rec = [r for r in registros if r["recuperacao"] is not None]

    print("paginas lidas     :", total_paginas)
    print("alunos unicos     :", len(alunos))
    print("registros         :", len(registros))
    print("registros c/ nota :", len(com_nota))
    print("eventos recuperacao:", len(com_rec))
    if problemas:
        print("PROBLEMAS:")
        for p in problemas:
            print("  ", p)

    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(WEB_DATA_DIR, exist_ok=True)

    cols = ["ano_letivo", "ano", "curso", "turma", "aluno", "ra", "status", "materia",
            "bimestre", "nota", "nb", "recuperacao", "mb", "fa", "total_pontos", "tf", "fr", "fonte_pagina"]
    csv_path = os.path.join(DATA_DIR, "boletins.csv")
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in registros:
            w.writerow(r)
    print("csv               :", csv_path)

    meta = {
        "escola": "ESCOLA NOVA LOURENÇO CASTANHO",
        "gerado_de": PDFS,
        "total_alunos": len(alunos),
        "total_registros": len(registros),
        "eventos_recuperacao": len(com_rec),
        "aviso": "Dataset extratificado dos boletins PDF (fonte original). Campos vazios = None, nunca zero.",
    }
    js_path = os.path.join(DATA_DIR, "dados.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("/* GERADO AUTOMATICAMENTE por tools/extract_boletins.py - nao editar manualmente. */\n")
        f.write("window.SCHOOL_DATA = ")
        f.write(json.dumps({"meta": meta, "registros": registros}, ensure_ascii=False))
        f.write(";\n")
    print("js                :", js_path)


if __name__ == "__main__":
    sys.exit(main())
