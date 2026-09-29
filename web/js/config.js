/* ============================================================================
   CONFIG — Painel de Aprendizagem (Boletins 2026)
   ----------------------------------------------------------------------------
   Único arquivo que você precisa editar para adaptar o painel à escola.
   Nada aqui depende da quantidade de turmas, alunos, disciplinas ou bimestres:
   tudo isso é lido dos dados (web/js/dados.js).
   ========================================================================== */

window.CONFIG = {

  escola: 'Escola Nova Lourenço Castanho',
  produto: 'Profe',
  subtitulo: 'Leitura pedagógica dos resultados por aluno',

  /* Nota de referência da escola.
     Se null, nenhuma linha de referência é mostrada nos gráficos. */
  notaReferencia: 6.0,
  rotuloReferencia: 'Média de referência da escola',

  escala: { min: 0, max: 10 },

  /* ---------------------------------------------------------------------
     LIMIARES ANALÍTICOS (regras determinísticas do motor de padrões)
     Ajuste os números para calibrar a sensibilidade das leituras.
     --------------------------------------------------------------------- */
  limiares: {
    tendenciaSubiu: 0.75,       // última nota - primeira nota >= valor => TREND_UP
    tendenciaCaiu: -0.75,       // última nota - primeira nota <= valor => TREND_DOWN
    estavelVariacao: 0.25,      // |mudança| <= valor => "estável"
    mudancaRecente: 0.5,        // |último delta| >= valor => mudança recente relevante
    oscilacaoMuitoEstavelDP: 0.25,  // desvio-padrão <= valor
    oscilacaoEstavelDP: 0.45,       // desvio-padrão <= valor
    altaOscilacaoDP: 0.90,          // desvio-padrão >= valor => alta oscilação
    forcaDiferenca: 0.50,       // disciplina >= média geral do aluno + valor => ponto forte
    atencaoDiferenca: -0.50,    // disciplina <= média geral do aluno + valor => atenção
    abaixoReferencia: true,     // sinalizar disciplinas abaixo da nota de referência
    impactoRecuperacao: 0.50,   // ganho (MB - NB) >= valor => recuperação com impacto relevante
    diferencaArea: 0.50,        // diferença entre áreas >= valor => diferença relevante
    outlierDesvio: 1.00,        // |nota - média da disciplina| >= valor => período atípico
    minimoPeriodosTendencia: 2, // nunca calcular tendência com menos períodos
    minimoDisciplinasResumo: 3, // mínimo de disciplinas para resumos "X de N"
    minimoAlunosTurma: 5        // mínimo de alunos com nota para exibir distribuição da turma
  },

  /* ---------------------------------------------------------------------
     ÁREAS CURRICULARES
     Agrupa disciplinas para leitura por área. Os nomes são comparados sem
     acentos e sem diferenciar maiúsculas/minúsculas.
     --------------------------------------------------------------------- */
  areas: [
    {
      nome: 'Linguagens',
      disciplinas: ['Língua Portuguesa', 'Produção de Texto', 'Inglês', 'Espanhol']
    },
    {
      nome: 'Matemática',
      disciplinas: ['Matemática']
    },
    {
      nome: 'Ciências da Natureza',
      disciplinas: ['Ciências', 'Física', 'Química', 'Biologia']
    },
    {
      nome: 'Ciências Humanas',
      disciplinas: ['História', 'Geografia']
    }
  ],

  /* Disciplinas avaliadas sem nota numérica (aparecem como chips informativos,
     nunca como barras/linhas numéricas). Comparadas sem acentos. */
  disciplinasSemNota: [
    'Artes Visuais', 'Maker : Inovação e Criação', 'Música', 'Teatro',
    'Educação Física', 'Orientação Educacional', 'Projeto de Vida'
  ],

  /* Nomes de exibição e apelidos para eixos de gráficos (comparação sem acentos). */
  nomesExibicao: {
    'Língua Portuguesa': 'Língua Portuguesa',
    'Produção de Texto': 'Produção de Texto',
    'Matemática': 'Matemática',
    'Ciências': 'Ciências',
    'Artes Visuais': 'Artes Visuais',
    'Química': 'Química',
    'Física': 'Física',
    'Biologia': 'Biologia',
    'História': 'História',
    'Geografia': 'Geografia',
    'Inglês': 'Inglês',
    'Espanhol': 'Espanhol',
    'Maker : Inovação e Criação': 'Maker: Inovação e Criação',
    'Educação Física': 'Educação Física',
    'Música': 'Música',
    'Teatro': 'Teatro',
    'Orientação Educacional': 'Orientação Educacional',
    'Projeto de Vida': 'Projeto de Vida'
  },
  apelidos: {
    'Língua Portuguesa': 'Português',
    'Produção de Texto': 'Produção',
    'Matemática': 'Matemática',
    'Química': 'Química',
    'Física': 'Física',
    'Biologia': 'Biologia',
    'História': 'História',
    'Geografia': 'Geografia',
    'Inglês': 'Inglês',
    'Espanhol': 'Espanhol'
  },

  /* Número máximo de disciplinas destacadas por padrão na trajetória. */
  destaquesTrajetoria: 5,

  /* ---------------------------------------------------------------------
     RÓTULOS
     --------------------------------------------------------------------- */
  rotulos: {
    bimestres: ['1º bimestre', '2º bimestre', '3º bimestre', '4º bimestre'],
    bimestresCurto: ['1º bi', '2º bi', '3º bi', '4º bi'],
    diasDaSemana: null
  },

  /* ---------------------------------------------------------------------
     RELATÓRIO IMPRESSO
     --------------------------------------------------------------------- */
  relatorio: {
    incluirTrajetoria: true,
    incluirPerfilDisciplinas: true,
    incluirFrequencia: true,
    incluirMedianaTurma: true,
    incluirPontosFortes: true,
    incluirPontosAtencao: true,
    incluirNotaReferencia: true,
    rodape: 'Documento gerado localmente pelo painel. Contém dados individuais do estudante — uso interno da escola.'
  }
};
