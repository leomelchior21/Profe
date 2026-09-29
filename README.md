# Profe · Painel de aprendizagem

Painel local de leitura pedagógica dos boletins, com visão coletiva, acompanhamento individual, apresentação para famílias e resumo para impressão.

## Abrir

Com Node.js instalado, execute `npm install`, depois `npm start`, e abra **http://127.0.0.1:4173**. O servidor publica somente a pasta `web/`. Para outra hospedagem estática com HTTPS, execute `npm run build` antes de publicar `web/`.

A senha de acesso é a definida para a escola. Ela desbloqueia o dataset criptografado no navegador. Recarregar ou clicar em **Sair** encerra o acesso. Não há armazenamento da senha ou do dataset descriptografado em localStorage/sessionStorage.

## Organização

- **Visão geral:** síntese do recorte ou do estudante.
- **Trajetória:** evolução por bimestre e por disciplina.
- **Disciplinas:** tabela e perfil de notas.
- **Contexto:** distribuição da turma e recuperações.
- **Padrões:** variações, consistência e áreas curriculares.
- **Dados:** registros e origem dos valores.

O painel pede a seleção de um ano escolar antes de mostrar resultados. Após a escolha, mantém todas as análises em uma página contínua; os botões no rodapé levam às seções. Sem aluno selecionado, mostra as turmas daquele ano. Limpar os filtros ou retirar o ano selecionado volta à tela de seleção. O modo reunião e o resumo impresso mostram o percurso anual do estudante.

Antes de **Como ler este modo**, **Merecem atenção** mostra quatro listas de até 20 alunos: maiores médias, menores médias, menores oscilações e maiores oscilações. As duas listas de médias têm seletores independentes de média geral, Ciências exatas, Ciências humanas e Linguagens. Ciências exatas reúne Matemática e as disciplinas de Ciências da Natureza disponíveis naquele ano. Os rankings respeitam ano, turma e disciplina; os de médias também respeitam o bimestre em foco.

A oscilação é o desvio-padrão das médias de todos os bimestres com MB, exigindo pelo menos dois e mantendo as mesmas disciplinas em cada período. As setas mostram a diferença entre a primeira e a última média; os filtros permitem ver subidas, quedas ou nenhuma mudança final. Uma trajetória que sobe e depois cai continua tendo oscilação mesmo quando termina no valor inicial. MB ausente não vira zero; empates são ordenados pelo nome. Clicar em um aluno abre seu percurso.

Média individual e mediana da turma são medidas distintas. As sugestões são baseadas em regras descritivas, sem inferências sobre comportamento ou causas. Lacunas não são convertidas em zero. A configuração da escola e os critérios ficam em `web/js/config.js`.

## Atualizar os boletins

1. Coloque os PDFs em `source/` e execute `python tools/extract_boletins.py` (requer PyMuPDF).
2. O extrator produz `data/boletins.csv` e `data/dados.js`, ambos privados.
3. No PowerShell, defina `$env:PANEL_PASSWORD` com a senha escolhida e execute `npm run protect`. Depois remova a variável com `Remove-Item Env:PANEL_PASSWORD`.
4. Publique apenas `web/`. Nunca publique `data/`, `source/`, `tools/` ou `artifacts/`: contêm dados ou relatórios privados.

O pacote público usa AES-256-GCM, com chave derivada por PBKDF2-SHA-256 (600.000 iterações), salt e IV aleatórios. A senha não está no JavaScript público. O acesso depende de Web Crypto (HTTPS, localhost ou navegador compatível com arquivos locais). A senha é compartilhada: não há contas individuais, revogação de sessões ou limite de tentativas no servidor. Quem já conhece a senha pode copiar os dados desbloqueados. Ao mudar a senha, gere novamente o pacote protegido.

### Relatórios CSV dos 7º anos

Copie os relatórios para `source/` e, com o dataset privado existente em `data/dados.js`, execute:

```powershell
python tools/import_notas_csv.py --somar-np-nb source/7A_25.09.csv source/7B_25.09.csv source/7C_25.09.csv
```

A importação substitui apenas as turmas e anos letivos presentes nos arquivos, preservando as demais turmas. Pode ser repetida sem duplicar alunos. Os CSVs podem estar em UTF-8 ou Windows-1252; o ano letivo vem da data do relatório.

Nos CSVs, as comparações usam exclusivamente **MB**. MB vazia permanece sem nota, mesmo com avaliações parciais preenchidas. `--somar-np-nb` registra a soma das parcelas NP + NB como nota anterior à recuperação; as parcelas originais ficam em `avaliacoes_origem`, e a origem inclui o arquivo e a linha. Asteriscos e campos vazios não viram zero; faltas, frequência e situação de matrícula não são inferidas.

Depois, defina `PANEL_PASSWORD`, execute `npm run protect` e `npm test`, e remova a variável. Publique somente o pacote criptografado. Se reexecutar o extrator dos boletins antigos, importe novamente os CSVs e os relatórios gerais PDF antes de proteger os dados.

### Relatórios gerais PDF dos 9º anos

Com PyMuPDF instalado e os novos PDFs em `source/`, atualize o dataset privado existente:

```powershell
python tools/import_notas_pdf.py "source/Relatorio 9A 1.pdf" "source/Relatorio 9B 1.pdf" "source/Relatorio 9C.pdf" "source/Relatorio 9D.pdf"
```

As notas e recuperações vêm dos novos relatórios. As comparações usam **somente MB**, inclusive quando há NP e NB preenchidas; MB ausente fica sem nota. NP + NB fica registrada como nota anterior à recuperação, com as parcelas originais preservadas. Os nomes truncados de disciplinas são normalizados, e números quebrados em duas linhas no PDF são recompostos.

Faltas, frequência e situação de matrícula são preservadas dos boletins anteriores, pois não constam nesses relatórios. Suas fontes aparecem separadas na tabela de dados detalhados. As demais turmas permanecem intactas. A importação interrompe se o relatório omitir algum aluno já cadastrado na turma. Depois, execute `npm run protect` e `npm test` com `PANEL_PASSWORD` definida, removendo a variável ao terminar.

## Vercel Analytics

O build copia o módulo do pacote `@vercel/analytics` para `web/js/vendor/`. Em produção, ele registra visitas à página; nomes e notas de alunos não são incluídos na URL. Para receber os eventos, ative **Web Analytics** no projeto da Vercel e publique uma nova implantação. Em localhost, a coleta fica desligada.

O build também coloca uma versão calculada pelo conteúdo nas URLs de CSS e JavaScript, para carregar os arquivos atualizados ao abrir ou recarregar uma nova publicação.

## Verificar

`npm install` instala as dependências de teste e o pacote do Vercel Analytics usado pelo build.

- `node tools/smoke_test.js`: cálculos, lacunas, recuperação, turmas e insights. Sem os arquivos privados locais, defina `PANEL_PASSWORD` para testar o pacote criptografado.
- `node tools/ranking_test.js`: rankings com dados fictícios, filtros, áreas, empates, zeros, lacunas e oscilação entre todos os bimestres.
- `python -B tools/test_import_notas_csv.py`: importação CSV com dados fictícios, MB ausente, zeros, acentos, preservação das outras turmas e reimportação sem duplicatas.
- `python -B tools/test_import_notas_pdf.py`: importação PDF com dados fictícios, notas atualizadas, MB ausente, números quebrados em linhas e preservação da frequência com sua origem.
- Defina `$env:PANEL_PASSWORD` e execute `npm test`: testes analíticos e de navegador. Se necessário, execute `npx playwright install chromium` antes.
- Capturas e um PDF de validação são salvos em `artifacts/` (privados, ignorados pelo Git).

Os testes de interface verificam as seções, cinco larguras de tela (320 a 1440 px), oito passos da reunião, filtros, impressão e bloqueio de acesso.
