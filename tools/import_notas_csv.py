"""Importa relatórios gerais de notas sem substituir as demais turmas do painel."""

import argparse
import csv
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIELDS = [
    "ano_letivo", "ano", "curso", "turma", "aluno", "ra", "status", "materia",
    "bimestre", "nota", "nb", "recuperacao", "mb", "fa", "total_pontos", "tf", "fr",
    "fonte_pagina", "avaliacoes_origem",
]


def number(value):
    value = value.strip()
    if value in ("", "*"):
        return None
    if not re.fullmatch(r"\d+(?:[,.]\d+)?", value):
        raise ValueError("Valor numérico inválido: " + repr(value))
    result = float(value.replace(",", "."))
    if not 0 <= result <= 10:
        raise ValueError("Nota fora da escala 0–10: " + value)
    return result


def read_report(path, sum_components=False):
    raw = path.read_bytes()
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        content = raw.decode("cp1252")
    rows = list(csv.reader(io.StringIO(content), delimiter=";"))
    years = set(re.findall(r"\b\d{2}/\d{2}/(20\d{2})\b", content))
    if len(years) != 1:
        raise ValueError(f"{path.name}: ano do relatório ausente ou ambíguo")
    year = int(years.pop())
    records, identities, subjects = [], {}, set()
    identity, blocks = None, None
    for line, row in enumerate(rows, 1):
        row = [cell.strip() for cell in row]
        if "RA.:" in row:
            if identity and not subjects:
                raise ValueError(f"{path.name}:{line}: aluno sem disciplinas")
            ra_index = row.index("RA.:")
            ra = next((v for v in row[ra_index + 1:] if v), "")
            if not re.fullmatch(r"\d{6,9}", ra) or ra in identities:
                raise ValueError(f"{path.name}:{line}: RA inválido ou duplicado")
            identity = {"ra": ra, "ano_letivo": year, "curso": "EF", "status": None}
            identities[ra] = identity
            blocks, subjects = None, set()
        elif "Nome.:" in row:
            if identity is None:
                raise ValueError(f"{path.name}:{line}: nome sem RA")
            identity["aluno"] = next(v for v in row[row.index("Nome.:") + 1:] if v)
        elif "Turma.:" in row:
            if identity is None:
                raise ValueError(f"{path.name}:{line}: turma sem RA")
            label = next(v for v in row[row.index("Turma.:") + 1:] if v)
            match = re.fullmatch(r"EF\s*(\d+)\s*([A-Z])", label)
            if not match:
                raise ValueError(f"{path.name}:{line}: turma inválida")
            identity.update(ano=match[1], turma=match[1] + match[2])
        elif "P1" in row:
            starts = [i for i, value in enumerate(row) if value == "P1"]
            if len(starts) != 4:
                raise ValueError(f"{path.name}:{line}: esperados quatro bimestres")
            blocks = []
            for start, end in zip(starts, starts[1:] + [len(row)]):
                block = {row[i]: i for i in range(start, end) if row[i] in
                         {"P1", "P2", "P3", "P4", "PB", "NP", "NB", "RE", "MB"}}
                if set(block) != {"P1", "P2", "P3", "P4", "PB", "NP", "NB", "RE", "MB"}:
                    raise ValueError(f"{path.name}:{line}: cabeçalho incompleto")
                blocks.append(block)
        elif row and row[0] and identity:
            if blocks is None or not all(identity.get(k) for k in ("aluno", "turma")):
                raise ValueError(f"{path.name}:{line}: disciplina antes do cabeçalho")
            subject = re.sub(r"\s+", " ", row[0])
            if subject in subjects:
                raise ValueError(f"{path.name}:{line}: disciplina duplicada")
            subjects.add(subject)
            emitted = False
            for bimester, block in enumerate(blocks, 1):
                source = {label: row[index] for label, index in block.items()}
                if not any(source.values()):
                    continue
                values = {label: number(value) for label, value in source.items()}
                # Neste relatório NP e NB são parcelas; NB isolada não é a nota final.
                nb = (round(values["NP"] + values["NB"], 2)
                      if sum_components and values["NP"] is not None and values["NB"] is not None
                      else None)
                mb = values["MB"]
                records.append({
                    **identity, "materia": subject, "bimestre": bimester,
                    "nota": mb,
                    "nb": nb, "recuperacao": values["RE"], "mb": mb,
                    "fa": None, "total_pontos": None, "tf": None, "fr": None,
                    "fonte_pagina": f"{path.name}#L{line}", "avaliacoes_origem": source,
                })
                emitted = True
            if not emitted:
                # Preserva aluno/disciplina sem transformar vazios ou totais em zero.
                records.append({
                    **identity, "materia": subject, "bimestre": 1,
                    "nota": None, "nb": None, "recuperacao": None, "mb": None,
                    "fa": None, "total_pontos": None, "tf": None, "fr": None,
                    "fonte_pagina": f"{path.name}#L{line}", "avaliacoes_origem": {},
                })
    if not identities or not subjects or set(identities) != {r["ra"] for r in records}:
        raise ValueError(f"{path.name}: relatório vazio ou alunos sem disciplinas")
    return records


def merge_dataset(dataset, records, sources):
    scopes = {(r["ano_letivo"], r["turma"]) for r in records}
    preserved = [r for r in dataset["registros"] if (r["ano_letivo"], r["turma"]) not in scopes]
    existing_ids = {r["ra"] for r in preserved}
    if existing_ids & {r["ra"] for r in records}:
        raise ValueError("RA já cadastrado em outra turma; resolva o conflito antes de importar")
    combined = preserved + records
    keys = {(r["ano_letivo"], r["ra"], r["materia"], r["bimestre"]) for r in combined}
    if len(keys) != len(combined):
        raise ValueError("Registros duplicados na importação")
    meta = dict(dataset["meta"])
    active_sources = {r["fonte_pagina"].split("#", 1)[0] for r in preserved}
    meta.update(
        gerado_de=list(dict.fromkeys([s for s in meta["gerado_de"] if s in active_sources] + sources)),
        total_alunos=len({r["ra"] for r in combined}), total_registros=len(combined),
        eventos_recuperacao=sum(r["recuperacao"] is not None for r in combined),
        aviso="Dataset extraído de boletins PDF e relatórios CSV. Campos vazios = null, nunca zero.",
    )
    return {"meta": meta, "registros": combined}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--somar-np-nb", action="store_true",
                        help="Usa NP + NB como nota anterior à recuperação. Comparações usam somente MB.")
    args = parser.parse_args()
    target = ROOT / "data/dados.js"
    original = target.read_text(encoding="utf-8").split("window.SCHOOL_DATA =", 1)[1].strip().removesuffix(";")
    incoming = [r for path in args.files for r in read_report(path, args.somar_np_nb)]
    result = merge_dataset(json.loads(original), incoming, [p.name for p in args.files])
    target.write_text("/* GERADO AUTOMATICAMENTE pelos importadores de boletins. */\nwindow.SCHOOL_DATA = " +
                      json.dumps(result, ensure_ascii=False) + ";\n", encoding="utf-8")
    with (ROOT / "data/boletins.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        for record in result["registros"]:
            writer.writerow({**record, "avaliacoes_origem": json.dumps(record.get("avaliacoes_origem", {}), ensure_ascii=False)})
    for turma in sorted({r["turma"] for r in incoming}):
        print(f"{turma}: {len({r['ra'] for r in incoming if r['turma'] == turma})} alunos")
    print(f"Total: {result['meta']['total_alunos']} alunos; {result['meta']['total_registros']} registros")


if __name__ == "__main__":
    main()
