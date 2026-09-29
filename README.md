# Profe

Painel de aprendizagem local-first para leitura pedagógica dos boletins da Escola Nova Lourenço Castanho.

O painel compara turmas (sem identificar alunos) e oferece um modo de reunião por aluno, com trajetória, perfil por disciplina, contexto da turma, recuperação e pontos de acompanhamento. Todo o processamento acontece no navegador: nenhum dado é enviado para servidores.

## Como rodar

Abra `web/index.html` diretamente no navegador (não precisa de servidor) ou use qualquer servidor estático apontando para `web/`.

## Dados

O painel lê `web/js/dados.js`, gerado a partir dos boletins em `source/` (arquivos PDF) pelo script `tools/extract_boletins.py`. Por conterem dados individuais de estudantes, `source/`, `data/` e `web/js/dados.js` não são versionados neste repositório.

Sem o `dados.js`, a página abre com um aviso pedindo a geração do dataset:

```
python tools/extract_boletins.py
```

## Estrutura

- `web/` — aplicação estática (HTML, CSS e JavaScript, sem dependências externas).
  - `web/js/config.js` — único arquivo a editar para adaptar o painel à escola (nota de referência, áreas, limiares, rótulos).
  - `web/js/analytics.js` — índice de dados, estatísticas e motor de observações.
  - `web/js/charts.js` — gráficos em SVG.
  - `web/js/views.js` — seções do painel (aluno, turma e reunião).
  - `web/js/app.js` — estado, filtros, modos e relatório impresso.
- `tools/` — extração dos boletins e testes (`node tools/smoke_test.js`, `tools/selftest.html`).

## Testes

```
node tools/smoke_test.js
```

O autoteste de interface fica em `tools/selftest.html` (pode ser aberto no navegador ou rodado em Chrome headless).
