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

O painel mantém todas as análises em uma página contínua; os botões no rodapé levam às seções. Sem aluno selecionado, mostra as turmas. O modo reunião e o resumo impresso mostram o percurso anual do estudante.

Média individual e mediana da turma são medidas distintas. As sugestões são baseadas em regras descritivas, sem inferências sobre comportamento ou causas. Lacunas não são convertidas em zero. A configuração da escola e os critérios ficam em `web/js/config.js`.

## Atualizar os boletins

1. Coloque os PDFs em `source/` e execute `python tools/extract_boletins.py` (requer PyMuPDF).
2. O extrator produz `data/boletins.csv` e `data/dados.js`, ambos privados.
3. No PowerShell, defina `$env:PANEL_PASSWORD` com a senha escolhida e execute `npm run protect`. Depois remova a variável com `Remove-Item Env:PANEL_PASSWORD`.
4. Publique apenas `web/`. Nunca publique `data/`, `source/`, `tools/` ou `artifacts/`: contêm dados ou relatórios privados.

O pacote público usa AES-256-GCM, com chave derivada por PBKDF2-SHA-256 (600.000 iterações), salt e IV aleatórios. A senha não está no JavaScript público. O acesso depende de Web Crypto (HTTPS, localhost ou navegador compatível com arquivos locais). A senha é compartilhada: não há contas individuais, revogação de sessões ou limite de tentativas no servidor. Quem já conhece a senha pode copiar os dados desbloqueados. Ao mudar a senha, gere novamente o pacote protegido.

## Vercel Analytics

O build copia o módulo do pacote `@vercel/analytics` para `web/js/vendor/`. Em produção, ele registra visitas à página; nomes e notas de alunos não são incluídos na URL. Para receber os eventos, ative **Web Analytics** no projeto da Vercel e publique uma nova implantação. Em localhost, a coleta fica desligada.

## Verificar

`npm install` instala as dependências de teste e o pacote do Vercel Analytics usado pelo build.

- `node tools/smoke_test.js`: cálculos, lacunas, recuperação, turmas e insights. Sem os arquivos privados locais, defina `PANEL_PASSWORD` para testar o pacote criptografado.
- Defina `$env:PANEL_PASSWORD` e execute `npm test`: testes analíticos e de navegador. Se necessário, execute `npx playwright install chromium` antes.
- Capturas e um PDF de validação são salvos em `artifacts/` (privados, ignorados pelo Git).

Os testes de interface verificam as seções, cinco larguras de tela (320 a 1440 px), oito passos da reunião, filtros, impressão e bloqueio de acesso.
