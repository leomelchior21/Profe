/* ============================================================================
   ANALYTICS — motor analítico determinístico
   ----------------------------------------------------------------------------
   Contém:
     - Stats: funções estatísticas básicas (sem dependências externas)
     - Store: carrega e indexa os dados, responde a consultas com escopo (filtros)
     - Insights: detecção determinística de padrões + pontos de acompanhamento
   Nenhum dado sai do navegador. Nenhuma inferência comportamental é gerada.
   ========================================================================== */

window.Analytics = (function () {
  'use strict';

  var CFG = window.CONFIG;

  /* ---------------------------------------------------------------- helpers */

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /* valor de um aluno conforme o recorte: disciplina e/ou bimestre */
  function valorDoAluno(sd, materia, bimestre) {
    if (!sd) return null;
    if (materia) {
      var m = sd.numericas.filter(function (x) { return norm(x.nome) === norm(materia); })[0];
      if (!m) return null;
      if (bimestre) {
        var s = m.serie.filter(function (x) { return x.bimestre === bimestre && x.nota != null; })[0];
        return s ? s.nota : null;
      }
      return m.media;
    }
    if (bimestre) {
      var p = sd.mediaPorBimestre.filter(function (x) { return x.bimestre === bimestre; })[0];
      return p ? p.media : null;
    }
    return sd.mediaGeral;
  }

  function fmt1(v) {
    if (v == null || isNaN(v)) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function fmtSigned(v) {
    if (v == null || isNaN(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v)
      .toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  }

  function rotuloBimestre(bi) {
    return CFG.rotulos.bimestres[bi - 1] || (bi + 'º bimestre');
  }

  function rotuloBimestreCurto(bi) {
    return CFG.rotulos.bimestresCurto[bi - 1] || (bi + 'º bi');
  }

  /* ------------------------------------------------------------------ Stats */

  var Stats = {
    mean: function (a) {
      var v = a.filter(function (x) { return x != null && !isNaN(x); });
      if (!v.length) return null;
      var s = 0;
      for (var i = 0; i < v.length; i++) s += v[i];
      return s / v.length;
    },
    median: function (a) {
      var v = a.filter(function (x) { return x != null && !isNaN(x); }).slice().sort(function (x, y) { return x - y; });
      if (!v.length) return null;
      var m = Math.floor(v.length / 2);
      return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    },
    quantile: function (a, q) {
      var v = a.filter(function (x) { return x != null && !isNaN(x); }).slice().sort(function (x, y) { return x - y; });
      if (!v.length) return null;
      if (v.length === 1) return v[0];
      var pos = (v.length - 1) * q;
      var lo = Math.floor(pos), hi = Math.ceil(pos);
      if (lo === hi) return v[lo];
      return v[lo] + (v[hi] - v[lo]) * (pos - lo);
    },
    sd: function (a) {
      var v = a.filter(function (x) { return x != null && !isNaN(x); });
      if (v.length < 2) return null;
      var m = Stats.mean(v), s = 0;
      for (var i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m);
      return Math.sqrt(s / v.length);
    },
    min: function (a) {
      var v = a.filter(function (x) { return x != null && !isNaN(x); });
      return v.length ? Math.min.apply(null, v) : null;
    },
    max: function (a) {
      var v = a.filter(function (x) { return x != null && !isNaN(x); });
      return v.length ? Math.max.apply(null, v) : null;
    },
    range: function (a) {
      var mn = Stats.min(a), mx = Stats.max(a);
      return (mn == null || mx == null) ? null : mx - mn;
    },
    round1: function (v) { return v == null ? null : Math.round(v * 10) / 10; },
    round2: function (v) { return v == null ? null : Math.round(v * 100) / 100; }
  };

  /* ---------------------------------------------------------------- datasets */

  var DATA = null;      // {meta, registros}
  var INDEX = null;     // índices derivados
  var cache = {};       // cache de consultas por chave

  function index() {
    if (INDEX) return INDEX;
    var alunos = {};            // ra -> aluno base
    var materiasGlobais = {};   // nome -> {numerica: bool, temFA: bool}
    var anosLetivos = {}, anos = {}, turmas = {}, bimestresComNota = {};

    DATA.registros.forEach(function (r) {
      var a = alunos[r.ra];
      if (!a) {
        a = alunos[r.ra] = {
          ra: r.ra, nome: r.aluno, turma: r.turma, ano: r.ano, curso: r.curso,
          anoLetivo: r.ano_letivo, status: r.status, recs: []
        };
      }
      a.recs.push(r);
      var m = materiasGlobais[r.materia] || (materiasGlobais[r.materia] = { nome: r.materia, numerica: false, temFA: false });
      if (r.nota != null) m.numerica = true;
      if (r.fa != null) m.temFA = true;
      if (r.ano_letivo != null) anosLetivos[r.ano_letivo] = true;
      if (r.ano != null) anos[r.ano] = true;
      if (r.turma != null) turmas[r.turma] = true;
      if (r.nota != null && r.bimestre) bimestresComNota[r.bimestre] = true;
    });

    INDEX = {
      alunos: alunos,
      materiasGlobais: materiasGlobais,
      anosLetivos: Object.keys(anosLetivos).map(Number).sort(),
      anos: Object.keys(anos).sort(),
      turmas: Object.keys(turmas).sort(),
      bimestresComNota: Object.keys(bimestresComNota).map(Number).sort(function (a, b) { return a - b; })
    };
    return INDEX;
  }

  /* nome de exibição / apelido / área */
  function nomeExibicao(m) {
    var mapa = CFG.nomesExibicao || {};
    for (var k in mapa) { if (norm(k) === norm(m)) return mapa[k]; }
    return m;
  }

  function apelido(m) {
    var n = nomeExibicao(m);
    var mapa = CFG.apelidos || {};
    for (var k in mapa) { if (norm(k) === norm(n)) return mapa[k]; }
    return n.length > 12 ? n.slice(0, 11) + '…' : n;
  }

  function areaDe(m) {
    var ma = (CFG.areas || []);
    for (var i = 0; i < ma.length; i++) {
      for (var j = 0; j < ma[i].disciplinas.length; j++) {
        if (norm(ma[i].disciplinas[j]) === norm(m)) return ma[i].nome;
      }
    }
    return 'Outras';
  }

  function materiaSemNota(m) {
    var lista = CFG.disciplinasSemNota || [];
    for (var i = 0; i < lista.length; i++) if (norm(lista[i]) === norm(m)) return true;
    return false;
  }

  function ordemMaterias(a, b) {
    var ia = CFG.areas.map(function (x) { return x.nome; }).indexOf(areaDe(a));
    var ib = CFG.areas.map(function (x) { return x.nome; }).indexOf(areaDe(b));
    if (ia < 0) ia = 999; if (ib < 0) ib = 999;
    if (ia !== ib) return ia - ib;
    return nomeExibicao(a).localeCompare(nomeExibicao(b), 'pt-BR');
  }

  /* ------------------------------------------------------------------- Store */

  var Store = {
    init: function (data) {
      DATA = data;
      INDEX = null;
      cache = {};
    },

    meta: function () { return DATA.meta; },

    /* opções para os filtros (cascata) */
    opcoes: function (scope) {
      var ix = index();
      scope = scope || {};
      var alunos = Object.keys(ix.alunos).map(function (k) { return ix.alunos[k]; });
      if (scope.anoLetivo) alunos = alunos.filter(function (a) { return String(a.anoLetivo) === String(scope.anoLetivo); });
      if (scope.ano) alunos = alunos.filter(function (a) { return String(a.ano) === String(scope.ano); });
      if (scope.turma) alunos = alunos.filter(function (a) { return a.turma === scope.turma; });
      var turmas = {}; alunos.forEach(function (a) { turmas[a.turma] = true; });
      var materias = Object.keys(ix.materiasGlobais).sort(ordemMaterias).map(function (k) {
        return { nome: k, rotulo: nomeExibicao(k), numerica: ix.materiasGlobais[k].numerica, semNota: materiaSemNota(k) };
      });
      return {
        anosLetivos: ix.anosLetivos,
        anos: ix.anos,
        turmas: Object.keys(turmas).sort(),
        alunos: alunos.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }),
        materias: materias,
        materiasNumericas: materias.filter(function (m) { return m.numerica && !m.semNota; }),
        bimestres: ix.bimestresComNota
      };
    },

    aluno: function (ra) { return index().alunos[ra] || null; },

    alunosDoEscopo: function (scope) {
      var ix = index();
      return Object.keys(ix.alunos).map(function (k) { return ix.alunos[k]; }).filter(function (a) {
        if (scope.anoLetivo && String(a.anoLetivo) !== String(scope.anoLetivo)) return false;
        if (scope.ano && String(a.ano) !== String(scope.ano)) return false;
        if (scope.turma && a.turma !== scope.turma) return false;
        return true;
      });
    },

    /* -------------------------------------------------- dados do aluno (escopo) */

    studentData: function (ra, scope) {
      var key = 'sd|' + ra + '|' + JSON.stringify(scope || {});
      if (cache[key]) return cache[key];
      var aluno = Store.aluno(ra);
      if (!aluno) return null;

      var recs = aluno.recs.filter(function (r) {
        if (scope.anoLetivo && String(aluno.anoLetivo) !== String(scope.anoLetivo)) return false;
        if (scope.ano && String(aluno.ano) !== String(scope.ano)) return false;
        if (scope.turma && aluno.turma !== scope.turma) return false;
        return true;
      });

      var porMateria = {};
      recs.forEach(function (r) {
        var s = porMateria[r.materia] || (porMateria[r.materia] = {});
        s[r.bimestre] = r;
      });

      var bimestres = {};
      var materias = Object.keys(porMateria).sort(ordemMaterias).map(function (nome) {
        var serie = [];
        Object.keys(porMateria[nome]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (bi) {
          var r = porMateria[nome][bi];
          serie.push({ bimestre: bi, nota: r.nota, nb: r.nb, recuperacao: r.recuperacao, mb: r.mb, fa: r.fa });
          if (r.nota != null) bimestres[bi] = true;
        });
        var notas = serie.filter(function (x) { return x.nota != null; }).map(function (x) { return x.nota; });
        var deltas = [];
        for (var i = 1; i < serie.length; i++) {
          if (serie[i].nota != null && serie[i - 1].nota != null) {
            deltas.push({ de: serie[i - 1].bimestre, para: serie[i].bimestre, valor: Stats.round2(serie[i].nota - serie[i - 1].nota) });
          }
        }
        var variacaoTotal = (notas.length >= 2) ? Stats.round2(notas[notas.length - 1] - notas[0]) : null;
        var L = CFG.limiares;
        var tendencia = 'insuficiente';
        if (notas.length >= L.minimoPeriodosTendencia && variacaoTotal != null) {
          if (variacaoTotal >= L.tendenciaSubiu) tendencia = 'up';
          else if (variacaoTotal <= L.tendenciaCaiu) tendencia = 'down';
          else if (Math.abs(variacaoTotal) <= L.estavelVariacao) tendencia = 'stable';
          else tendencia = 'neutra';
        }
        var dp = Stats.sd(notas);
        var faixa = Stats.range(notas);
        var categoriaOscilacao = null;
        if (dp != null) {
          if (dp <= L.oscilacaoMuitoEstavelDP) categoriaOscilacao = 'muito-estavel';
          else if (dp <= L.oscilacaoEstavelDP) categoriaOscilacao = 'estavel';
          else if (dp < L.altaOscilacaoDP) categoriaOscilacao = 'moderada';
          else categoriaOscilacao = 'alta';
        }
        return {
          nome: nome, rotulo: nomeExibicao(nome), apelido: apelido(nome), area: areaDe(nome),
          semNota: materiaSemNota(nome),
          serie: serie,
          notas: notas,
          n: notas.length,
          media: Stats.round2(Stats.mean(notas)),
          mediana: Stats.round2(Stats.median(notas)),
          dp: Stats.round2(dp),
          faixa: Stats.round2(faixa),
          minimo: Stats.min(notas), maximo: Stats.max(notas),
          deltas: deltas,
          deltaRecente: deltas.length ? deltas[deltas.length - 1].valor : null,
          periodoRecente: deltas.length ? deltas[deltas.length - 1] : null,
          variacaoTotal: variacaoTotal,
          tendencia: tendencia,
          oscilacao: categoriaOscilacao,
          fa: serie.reduce(function (s, x) { return s + (x.fa || 0); }, 0)
        };
      });

      var bimestresOrdenados = Object.keys(bimestres).map(Number).sort(function (a, b) { return a - b; });
      var numericas = materias.filter(function (m) { return m.n > 0; });

      var mediaPorBimestre = bimestresOrdenados.map(function (bi) {
        var vals = numericas.map(function (m) {
          var s = m.serie.filter(function (x) { return x.bimestre === bi && x.nota != null; })[0];
          return s ? s.nota : null;
        });
        return { bimestre: bi, media: Stats.round2(Stats.mean(vals)), n: vals.filter(function (v) { return v != null; }).length };
      });

      var mediasDisciplinas = numericas.map(function (m) { return m.media; });
      var mediaGeral = Stats.round2(Stats.mean(mediasDisciplinas));
      var dpGeral = Stats.round2(Stats.sd(mediasDisciplinas));
      var faixaGeral = Stats.round2(Stats.range(mediasDisciplinas));

      var recuperacoes = [];
      numericas.forEach(function (m) {
        m.serie.forEach(function (s) {
          if (s.recuperacao != null) {
            recuperacoes.push({
              materia: m.nome, rotulo: m.rotulo, bimestre: s.bimestre,
              nb: s.nb, recuperacao: s.recuperacao, mb: s.mb,
              ganho: (s.mb != null && s.nb != null) ? Stats.round2(s.mb - s.nb) : null
            });
          }
        });
      });

      var frs = recs.filter(function (r) { return r.fr != null; }).map(function (r) { return r.fr; });
      var tfs = {};
      recs.forEach(function (r) { if (r.tf != null) tfs[r.materia + '|' + r.fonte_pagina] = r.tf; });
      var faltasTotais = Object.keys(tfs).reduce(function (s, k) { return s + tfs[k]; }, 0);

      var data = {
        aluno: aluno,
        scope: scope,
        materias: materias,
        numericas: numericas,
        semNota: materias.filter(function (m) { return m.n === 0; }),
        bimestres: bimestresOrdenados,
        mediaPorBimestre: mediaPorBimestre,
        mediaGeral: mediaGeral,
        dpGeral: dpGeral,
        faixaGeral: faixaGeral,
        mediasDisciplinas: mediasDisciplinas,
        recuperacoes: recuperacoes,
        frequenciaMedia: Stats.round2(Stats.mean(frs)),
        faltasTotais: Object.keys(tfs).length ? faltaTotalUnica(aluno, scope) : null
      };
      cache[key] = data;
      return data;
    },

    /* ------------------------------------------------- contexto da turma */

    classContext: function (studentData, materia, bimestre) {
      if (!studentData) return null;
      var turma = studentData.aluno.turma;
      var scope = { anoLetivo: studentData.aluno.anoLetivo, ano: studentData.aluno.ano, turma: turma };
      var values = [];
      Store.alunosDoEscopo(scope).forEach(function (a) {
        var sd = Store.studentData(a.ra, scope);
        var m = sd.numericas.filter(function (x) { return norm(x.nome) === norm(materia); })[0];
        if (!m) return;
        var v = null;
        if (bimestre) {
          var s = m.serie.filter(function (x) { return x.bimestre === bimestre && x.nota != null; })[0];
          v = s ? s.nota : null;
        } else {
          v = m.media;
        }
        if (v != null) values.push({ ra: a.ra, valor: v });
      });
      var vals = values.map(function (v) { return v.valor; });
      var box = {
        min: Stats.min(vals), q1: Stats.round2(Stats.quantile(vals, 0.25)),
        mediana: Stats.round2(Stats.median(vals)), q3: Stats.round2(Stats.quantile(vals, 0.75)),
        max: Stats.max(vals), media: Stats.round2(Stats.mean(vals)), n: vals.length
      };
      var meu = values.filter(function (v) { return v.ra === studentData.aluno.ra; })[0];
      return { values: values, vals: vals, box: box, aluno: meu ? meu.valor : null, n: vals.length };
    },

    /* mediana da turma por disciplina (para o perfil) */
    classMedians: function (studentData, bimestre) {
      var out = {};
      studentData.numericas.forEach(function (m) {
        var ctx = Store.classContext(studentData, m.nome, bimestre);
        out[m.nome] = ctx && ctx.n >= CFG.limiares.minimoAlunosTurma ? { mediana: ctx.box.mediana, n: ctx.n } : null;
      });
      return out;
    },

    /* mediana da turma por área curricular (para o gráfico de áreas) */
    classAreaMedians: function (studentData, bimestre) {
      var areas = Insights.areaAverages(studentData, bimestre).map(function (a) { return a.nome; });
      var turma = studentData.aluno.turma;
      var scope = { anoLetivo: studentData.aluno.anoLetivo, ano: studentData.aluno.ano, turma: turma };
      var porArea = {};
      areas.forEach(function (a) { porArea[a] = []; });
      Store.alunosDoEscopo(scope).forEach(function (a) {
        var sd = Store.studentData(a.ra, scope);
        Insights.areaAverages(sd, bimestre).forEach(function (ar) {
          if (ar.media != null && porArea[ar.nome]) porArea[ar.nome].push(ar.media);
        });
      });
      var out = {};
      Object.keys(porArea).forEach(function (a) {
        out[a] = porArea[a].length >= CFG.limiares.minimoAlunosTurma
          ? { mediana: Stats.round2(Stats.median(porArea[a])), n: porArea[a].length } : null;
      });
      return out;
    },

    /* -------------------------------------------------------- coorte / turmas */

    cohort: function (scope, opts) {
      scope = scope || {};
      opts = opts || {};
      var porTurma = {};
      Store.alunosDoEscopo(scope).forEach(function (a) {
        var t = a.turma;
        var c = porTurma[t] || (porTurma[t] = { turma: t, alunos: [], comNota: 0 });
        c.alunos.push(a);
      });
      var turmas = Object.keys(porTurma).sort();
      var resumo = turmas.map(function (t) {
        var sdList = porTurma[t].alunos.map(function (a) {
          return Store.studentData(a.ra, { anoLetivo: a.anoLetivo, ano: a.ano, turma: a.turma });
        });
        var comNota = sdList.filter(function (sd) { return sd && valorDoAluno(sd, opts.materia, opts.bimestre) != null; });
        var medias = comNota.map(function (sd) { return valorDoAluno(sd, opts.materia, opts.bimestre); })
          .filter(function (v) { return v != null; });
        var frs = comNota.map(function (sd) { return sd.frequenciaMedia; }).filter(function (x) { return x != null; });
        var recs = comNota.reduce(function (s, sd) {
          return s + sd.recuperacoes.filter(function (r) {
            return (!opts.materia || norm(r.materia) === norm(opts.materia)) &&
              (!opts.bimestre || r.bimestre === Number(opts.bimestre));
          }).length;
        }, 0);
        return {
          turma: t,
          nAlunos: sdList.length,
          nComNota: medias.length,
          medianaMedia: medias.length ? Stats.round2(Stats.median(medias)) : null,
          media: medias.length ? Stats.round2(Stats.mean(medias)) : null,
          faixa: medias.length ? Stats.round2(Stats.range(medias)) : null,
          valores: medias,
          frequenciaMedia: Stats.round2(Stats.mean(frs)),
          recuperacoes: recs,
          alunosComNota: comNota
        };
      });
      return resumo;
    },

    /* mediana por disciplina e turma: rows = disciplinas, cols = turmas */
    cohortSubjectMedians: function (scope, bimestre) {
      var turmas = Store.opcoes(scope).turmas;
      var materias = Store.opcoes(scope).materiasNumericas;
      var rows = materias.map(function (m) {
        return {
          materia: m.nome, rotulo: m.rotulo,
          valores: turmas.map(function (t) {
            var vals = [];
            Store.alunosDoEscopo({ anoLetivo: scope.anoLetivo, ano: scope.ano, turma: t }).forEach(function (a) {
              var sd = Store.studentData(a.ra, { anoLetivo: a.anoLetivo, ano: a.ano, turma: a.turma });
              var mm = sd.numericas.filter(function (x) { return norm(x.nome) === norm(m.nome); })[0];
              if (!mm) return;
              var v = mm.media;
              if (bimestre) {
                var s = mm.serie.filter(function (x) { return x.bimestre === bimestre && x.nota != null; })[0];
                v = s ? s.nota : null;
              }
              if (v != null) vals.push(v);
            });
            return { turma: t, mediana: Stats.round2(Stats.median(vals)), n: vals.length };
          })
        };
      });
      return { turmas: turmas, rows: rows };
    },

    /* evolução da mediana das médias de cada turma por bimestre */
    cohortEvolution: function (scope, opts) {
      opts = opts || {};
      var turmas = Store.opcoes(scope).turmas;
      var bimestres = opts.bimestre ? [opts.bimestre] : index().bimestresComNota.slice();
      return {
        turmas: turmas,
        bimestres: bimestres,
        materia: opts.materia || null,
        series: turmas.map(function (t) {
          var pontos = {};
          var sds = Store.alunosDoEscopo({ anoLetivo: scope.anoLetivo, ano: scope.ano, turma: t }).map(function (a) {
            return Store.studentData(a.ra, { anoLetivo: a.anoLetivo, ano: a.ano, turma: a.turma });
          });
          sds.forEach(function (sd) {
            if (opts.materia) {
              var m = sd.numericas.filter(function (x) { return norm(x.nome) === norm(opts.materia); })[0];
              if (!m) return;
              m.serie.forEach(function (s) {
                if (s.nota != null) (pontos[s.bimestre] = pontos[s.bimestre] || []).push(s.nota);
              });
              return;
            }
            sd.mediaPorBimestre.forEach(function (p) {
              if (p.media == null) return;
              (pontos[p.bimestre] = pontos[p.bimestre] || []).push(p.media);
            });
          });
          var serie = bimestres.map(function (bi) {
            var v = pontos[bi];
            return { bimestre: bi, media: v ? Stats.round2(Stats.median(v)) : null, n: v ? v.length : 0 };
          });
          return { turma: t, serie: serie, alunos: sds.length };
        })
      };
    },

    /* distribuição dos valores dos alunos por turma (sem nomes) */
    cohortDistribution: function (scope, opts) {
      return Store.cohort(scope, opts).map(function (c) {
        var vals = c.valores;
        return {
          turma: c.turma, n: vals.length, valores: vals,
          box: {
            min: Stats.min(vals), q1: Stats.round2(Stats.quantile(vals, 0.25)),
            mediana: Stats.round2(Stats.median(vals)), q3: Stats.round2(Stats.quantile(vals, 0.75)),
            max: Stats.max(vals), media: Stats.round2(Stats.mean(vals)), n: vals.length
          }
        };
      });
    },

    /* disciplina -> médias por aluno (para histogramas/box do modo turma) */
    subjectDistributionByClass: function (scope, materia, bimestre) {
      var turmas = Store.opcoes(scope).turmas;
      return turmas.map(function (t) {
        var vals = [];
        Store.alunosDoEscopo({ anoLetivo: scope.anoLetivo, ano: scope.ano, turma: t }).forEach(function (a) {
          var sd = Store.studentData(a.ra, { anoLetivo: a.anoLetivo, ano: a.ano, turma: a.turma });
          var m = sd.numericas.filter(function (x) { return norm(x.nome) === norm(materia); })[0];
          if (!m) return;
          var v = m.media;
          if (bimestre) {
            var s = m.serie.filter(function (x) { return x.bimestre === bimestre && x.nota != null; })[0];
            v = s ? s.nota : null;
          }
          if (v != null) vals.push(v);
        });
        return { turma: t, valores: vals };
      });
    }
  };

  /* faltas totais por aluno: TF é anual e repetido em cada bimestre; conta uma vez por disciplina */
  function faltaTotalUnica(aluno, scope) {
    var porDisciplina = {}, total = 0;
    aluno.recs.forEach(function (r) {
      if (r.tf == null) return;
      porDisciplina[r.materia] = r.tf;
    });
    Object.keys(porDisciplina).forEach(function (k) { total += porDisciplina[k]; });
    return Math.round(total * 10) / 10;
  }

  /* ------------------------------------------------- Insights (determinístico) */

  var Insights = {
    /* categorias de oscilação com rótulos legíveis */
    rotuloOscilacao: function (cat) {
      return ({
        'muito-estavel': 'Muito estável',
        'estavel': 'Estável',
        'moderada': 'Oscilação moderada',
        'alta': 'Alta oscilação'
      })[cat] || '—';
    },

    tendenciaRotulo: function (t) {
      return ({
        up: 'Crescimento no período',
        down: 'Queda no período',
        stable: 'Estabilidade no período',
        neutra: 'Variação pequena entre períodos',
        insuficiente: 'Períodos insuficientes para tendência'
      })[t] || '—';
    },

    /* insights por aluno: sempre observação de dados + evidência numérica */
    student: function (sd) {
      var out = [];
      if (!sd || !sd.numericas.length) return out;
      var L = CFG.limiares;
      var ref = CFG.notaReferencia;

      function ev(rotulo, valor) { return { rotulo: rotulo, valor: valor }; }

      /* 1. trajetória da média geral */
      var mpb = sd.mediaPorBimestre.filter(function (p) { return p.media != null; });
      if (mpb.length >= L.minimoPeriodosTendencia) {
        var prim = mpb[0], ult = mpb[mpb.length - 1];
        var varTotal = Stats.round2(ult.media - prim.media);
        var tipo = varTotal >= L.tendenciaSubiu ? 'crescimento'
          : varTotal <= L.tendenciaCaiu ? 'queda'
          : Math.abs(varTotal) <= L.estavelVariacao ? 'estabilidade' : 'neutro';
        var texto;
        if (tipo === 'estabilidade') texto = 'A média geral ficou estável entre o ' + rotuloBimestre(prim.bimestre) + ' e o ' + rotuloBimestre(ult.bimestre) + ' (' + fmt1(prim.media) + ' → ' + fmt1(ult.media) + ').';
        else if (tipo === 'crescimento') texto = 'A média geral cresceu entre o ' + rotuloBimestre(prim.bimestre) + ' e o ' + rotuloBimestre(ult.bimestre) + ' (' + fmt1(prim.media) + ' → ' + fmt1(ult.media) + ').';
        else if (tipo === 'queda') texto = 'A média geral caiu entre o ' + rotuloBimestre(prim.bimestre) + ' e o ' + rotuloBimestre(ult.bimestre) + ' (' + fmt1(prim.media) + ' → ' + fmt1(ult.media) + ').';
        else texto = 'A média geral variou pouco entre o ' + rotuloBimestre(prim.bimestre) + ' e o ' + rotuloBimestre(ult.bimestre) + ' (' + fmt1(prim.media) + ' → ' + fmt1(ult.media) + ').';
        out.push({
          tipo: tipo === 'neutro' ? 'estabilidade' : tipo, tom: tipo === 'crescimento' ? 'positivo' : tipo === 'queda' ? 'atencao' : 'neutro',
          titulo: 'Média geral', texto: texto,
          evidencias: [ev('1º período', fmt1(prim.media)), ev('último período', fmt1(ult.media)), ev('variação', fmtSigned(varTotal))]
        });
      }

      /* 2. tendências por disciplina (crescimento / queda) */
      var ups = sd.numericas.filter(function (m) { return m.tendencia === 'up'; }).sort(function (a, b) { return b.variacaoTotal - a.variacaoTotal; });
      var downs = sd.numericas.filter(function (m) { return m.tendencia === 'down'; }).sort(function (a, b) { return a.variacaoTotal - b.variacaoTotal; });
      ups.slice(0, 2).forEach(function (m) {
        out.push({
          tipo: 'tendencia-alta', tom: 'positivo', disciplina: m.nome,
          titulo: 'Crescimento em ' + m.rotulo,
          texto: 'Há tendência de crescimento em ' + m.rotulo + ' no período (' + fmt1(m.notas[0]) + ' → ' + fmt1(m.notas[m.notas.length - 1]) + ').',
          evidencias: [ev('primeira nota', fmt1(m.notas[0])), ev('última nota', fmt1(m.notas[m.notas.length - 1])), ev('variação', fmtSigned(m.variacaoTotal))]
        });
      });
      downs.slice(0, 2).forEach(function (m) {
        out.push({
          tipo: 'tendencia-baixa', tom: 'atencao', disciplina: m.nome,
          titulo: 'Queda em ' + m.rotulo,
          texto: m.rotulo + ' apresentou queda entre as notas registradas (' + fmt1(m.notas[0]) + ' → ' + fmt1(m.notas[m.notas.length - 1]) + ').',
          evidencias: [ev('primeira nota', fmt1(m.notas[0])), ev('última nota', fmt1(m.notas[m.notas.length - 1])), ev('variação', fmtSigned(m.variacaoTotal))]
        });
      });

      /* 3. mudanças recentes (do penúltimo para o último período) */
      sd.numericas.forEach(function (m) {
        if (!m.periodoRecente) return;
        var d = m.periodoRecente;
        if (Math.abs(d.valor) >= L.mudancaRecente) out.push({
          tipo: d.valor > 0 ? 'mudanca-recente-alta' : 'mudanca-recente-baixa',
          tom: d.valor > 0 ? 'positivo' : 'atencao', disciplina: m.nome,
          titulo: (d.valor > 0 ? 'Melhora' : 'Queda') + ' recente em ' + m.rotulo,
          texto: m.rotulo + (d.valor > 0 ? ' subiu' : ' caiu') + ' do ' + rotuloBimestre(d.de) + ' para o ' + rotuloBimestre(d.para) + '.',
          evidencias: [ev(rotuloBimestreCurto(d.de), fmt1(notaDe(m, d.de))), ev(rotuloBimestreCurto(d.para), fmt1(notaDe(m, d.para))), ev('variação', fmtSigned(d.valor))]
        });
      });

      /* 4. oscilação */
      var altas = sd.numericas.filter(function (m) { return m.oscilacao === 'alta'; }).sort(function (a, b) { return b.dp - a.dp; });
      altas.slice(0, 2).forEach(function (m) {
        out.push({
          tipo: 'alta-oscilacao', tom: 'neutro', disciplina: m.nome,
          titulo: 'Oscilação em ' + m.rotulo,
          texto: 'As notas de ' + m.rotulo + ' oscilam mais que as das demais disciplinas (faixa de ' + fmt1(m.minimo) + ' a ' + fmt1(m.maximo) + ').',
          evidencias: [ev('desvio-padrão', fmt1(m.dp)), ev('faixa', fmt1(m.minimo) + ' – ' + fmt1(m.maximo))]
        });
      });
      var estaveisAlto = sd.numericas.filter(function (m) {
        return (m.oscilacao === 'muito-estavel' || m.oscilacao === 'estavel') && m.media != null && ref != null && m.media >= ref;
      });
      if (estaveisAlto.length && altas.length === 0 && estaveisAlto.length >= 2) {
        var nomes = estaveisAlto.slice(0, 3).map(function (m) { return m.rotulo; }).join(', ');
        out.push({
          tipo: 'baixa-oscilacao', tom: 'positivo',
          titulo: 'Estabilidade das notas',
          texto: 'As notas se mantêm estáveis em ' + nomes + '.',
          evidencias: estaveisAlto.slice(0, 3).map(function (m) { return ev(m.apelido, 'desvio-padrão ' + fmt1(m.dp)); })
        });
      }

      /* 5. pontos fortes e de atenção (comparação com a própria média) */
      if (sd.numericas.length >= L.minimoDisciplinasResumo && sd.mediaGeral != null) {
        var fortes = sd.numericas.filter(function (m) { return m.media != null && m.media >= sd.mediaGeral + L.forcaDiferenca; })
          .sort(function (a, b) { return b.media - a.media; });
        var atencao = sd.numericas.filter(function (m) { return m.media != null && m.media <= sd.mediaGeral + L.atencaoDiferenca; })
          .sort(function (a, b) { return a.media - b.media; });
        fortes.slice(0, 3).forEach(function (m) {
          out.push({
            tipo: 'forca', tom: 'positivo', disciplina: m.nome,
            titulo: 'Ponto forte: ' + m.rotulo,
            texto: m.rotulo + ' está acima da média geral do aluno (' + fmt1(m.media) + ' contra ' + fmt1(sd.mediaGeral) + ').',
            evidencias: [ev('média na disciplina', fmt1(m.media)), ev('média geral do aluno', fmt1(sd.mediaGeral)), ev('diferença', fmtSigned(Stats.round2(m.media - sd.mediaGeral)))]
          });
        });
        atencao.slice(0, 3).forEach(function (m) {
          out.push({
            tipo: 'atencao', tom: 'atencao', disciplina: m.nome,
            titulo: 'Ponto de atenção: ' + m.rotulo,
            texto: m.rotulo + ' está abaixo da média geral do aluno (' + fmt1(m.media) + ' contra ' + fmt1(sd.mediaGeral) + ').',
            evidencias: [ev('média na disciplina', fmt1(m.media)), ev('média geral do aluno', fmt1(sd.mediaGeral)), ev('diferença', fmtSigned(Stats.round2(m.media - sd.mediaGeral)))]
          });
        });
      }

      /* 6. disciplinas abaixo da referência da escola */
      if (ref != null) {
        var abaixoRef = sd.numericas.filter(function (m) { return m.media != null && m.media < ref; });
        var acimaRef = sd.numericas.filter(function (m) { return m.media != null && m.media >= ref; });
        if (sd.numericas.length >= L.minimoDisciplinasResumo) {
          out.push({
            tipo: 'referencia', tom: abaixoRef.length > acimaRef.length ? 'atencao' : 'neutro',
            titulo: 'Comparação com a referência da escola',
            texto: acimaRef.length + ' das ' + sd.numericas.length + ' disciplinas com nota têm média igual ou acima da referência (' + fmt1(ref) + ').',
            evidencias: [ev('acima da referência', String(acimaRef.length)), ev('abaixo da referência', String(abaixoRef.length)), ev('referência', fmt1(ref))]
          });
        }
      }

      /* 7. diferença entre áreas */
      var areas = Insights.areaAverages(sd);
      var comMedia = areas.filter(function (a) { return a.media != null; });
      if (comMedia.length >= 2) {
        var max = comMedia.reduce(function (x, y) { return y.media > x.media ? y : x; });
        var min = comMedia.reduce(function (x, y) { return y.media < x.media ? y : x; });
        var dif = Stats.round2(max.media - min.media);
        if (dif >= L.diferencaArea) out.push({
          tipo: 'diferenca-area', tom: 'neutro', area: max.nome,
          titulo: 'Diferença entre áreas',
          texto: 'O desempenho em ' + max.nome + ' está acima do desempenho em ' + min.nome + ' (' + fmt1(max.media) + ' contra ' + fmt1(min.media) + ').',
          evidencias: [ev(max.nome, fmt1(max.media)), ev(min.nome, fmt1(min.media)), ev('diferença', fmtSigned(dif))]
        });
      }

      /* 8. períodos atípicos */
      sd.numericas.forEach(function (m) {
        if (m.n < 3 || m.media == null) return;
        m.serie.forEach(function (s) {
          if (s.nota == null) return;
          var desvio = Math.abs(s.nota - m.media);
          if (desvio >= L.outlierDesvio) out.push({
            tipo: 'periodo-atipico', tom: 'neutro', disciplina: m.nome,
            titulo: 'Resultado atípico em ' + m.rotulo,
            texto: 'O resultado de ' + m.rotulo + ' no ' + rotuloBimestre(s.bimestre) + ' (' + fmt1(s.nota) + ') destoa dos demais períodos (média ' + fmt1(m.media) + ').',
            evidencias: [ev('nota do período', fmt1(s.nota)), ev('média da disciplina', fmt1(m.media)), ev('desvio', fmtSigned(Stats.round2(s.nota - m.media)))]
          });
        });
      });

      /* 9. recuperação */
      if (sd.recuperacoes.length) {
        var comGanho = sd.recuperacoes.filter(function (r) { return r.ganho != null; });
        var ganhos = comGanho.map(function (r) { return r.ganho; });
        var ganhoMedio = Stats.round2(Stats.mean(ganhos));
        out.push({
          tipo: 'recuperacao', tom: 'neutro',
          titulo: 'Recuperação',
          texto: 'Houve recuperação em ' + sd.recuperacoes.length + (sd.recuperacoes.length === 1 ? ' disciplina' : ' disciplinas') + ', com ganho médio de ' + fmtSigned(ganhoMedio) + ' ponto(s) após a recuperação.',
          evidencias: [ev('eventos', String(sd.recuperacoes.length)), ev('ganho médio', fmtSigned(ganhoMedio))]
        });
        comGanho.filter(function (r) { return r.ganho >= L.impactoRecuperacao; }).slice(0, 2).forEach(function (r) {
          out.push({
            tipo: 'recuperacao-impacto', tom: 'positivo', disciplina: r.materia,
            titulo: 'Impacto da recuperação em ' + r.rotulo,
            texto: 'A recuperação alterou a média de ' + r.rotulo + ' no ' + rotuloBimestre(r.bimestre) + ' (antes ' + fmt1(r.nb) + '; recuperação ' + fmt1(r.recuperacao) + '; média final ' + fmt1(r.mb) + ').',
            evidencias: [ev('nota antes', fmt1(r.nb)), ev('recuperação', fmt1(r.recuperacao)), ev('média final', fmt1(r.mb)), ev('ganho', fmtSigned(r.ganho))]
          });
        });
      }

      /* 10. frequência (observação neutra, apenas se registrada) */
      if (sd.frequenciaMedia != null && sd.frequenciaMedia < 100) {
        out.push({
          tipo: 'frequencia', tom: 'neutro',
          titulo: 'Frequência registrada',
          texto: 'A frequência média registrada nas disciplinas é de ' + fmtPct(sd.frequenciaMedia) + '.',
          evidencias: [ev('frequência média', fmtPct(sd.frequenciaMedia))]
        });
      }

      return Insights.priorizar(out);
    },

    /* Evita repetição: para cada disciplina mantém, por tom, apenas a observação
       mais relevante (prioridade por tipo) e limita o total por grupo. */
    priorizar: function (lista) {
      var prioridade = {
        forca: 1, 'tendencia-baixa': 1, 'tendencia-alta': 2,
        'atencao': 2, 'mudanca-recente-baixa': 3, 'mudanca-recente-alta': 3,
        'periodo-atipico': 4, 'recuperacao-impacto': 5, 'baixa-oscilacao': 5,
        'recuperacao': 6, 'frequencia': 6, 'alta-oscilacao': 6
      };
      var escolhidos = {}, porChave = {}, neutros = [];
      lista.sort(function (a, b) { return (prioridade[a.tipo] || 9) - (prioridade[b.tipo] || 9); });

      lista.forEach(function (i) {
        if (!i.disciplina) { neutros.push(i); return; }
        var chave = i.disciplina + '|' + i.tom;
        if (porChave[chave]) return;
        porChave[chave] = true;
        (escolhidos[i.tom] = escolhidos[i.tom] || []).push(i);
      });

      var lim = { positivo: 4, atencao: 4, neutro: 4 };
      var restante = {};
      Object.keys(escolhidos).forEach(function (tom) {
        var lista2 = escolhidos[tom];
        restante[tom] = lista2.slice(lim[tom] || 4);
        escolhidos[tom] = lista2.slice(0, lim[tom] || 4);
      });

      /* neutros sem disciplina: limita e prioriza tipos mais informativos */
      var ordemNeutros = { 'recuperacao': 1, 'referencia': 2, 'diferenca-area': 3, 'alta-oscilacao': 4, 'media': 5, 'baixa-oscilacao': 6, 'frequencia': 7 };
      neutros.sort(function (a, b) { return (ordemNeutros[a.tipo] || 9) - (ordemNeutros[b.tipo] || 9); });
      var neutrosEscolhidos = neutros.slice(0, lim.neutro);

      var res = [];
      Object.keys(escolhidos).forEach(function (tom) { res = res.concat(escolhidos[tom]); });
      res = res.concat(neutrosEscolhidos);
      return res;
    },

    /* médias por área para um aluno */
    areaAverages: function (sd, bimestre) {
      var porArea = {};
      sd.numericas.forEach(function (m) {
        var v = m.media;
        if (bimestre) {
          var s = m.serie.filter(function (x) { return x.bimestre === bimestre && x.nota != null; })[0];
          v = s ? s.nota : null;
        }
        if (v == null) return;
        (porArea[m.area] = porArea[m.area] || []).push(v);
      });
      var ordem = CFG.areas.map(function (a) { return a.nome; });
      var nomes = Object.keys(porArea).sort(function (a, b) {
        var ia = ordem.indexOf(a), ib = ordem.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      return nomes.map(function (n) {
        var vals = porArea[n];
        return { nome: n, media: Stats.round2(Stats.mean(vals)), disciplinas: vals.length,
          mediasBimestre: sd.bimestres.map(function (bi) {
            var vs = [];
            sd.numericas.filter(function (m) { return m.area === n; }).forEach(function (m) {
              var s = m.serie.filter(function (x) { return x.bimestre === bi && x.nota != null; })[0];
              if (s) vs.push(s.nota);
            });
            return { bimestre: bi, media: Stats.round2(Stats.mean(vs)) };
          })
        };
      });
    },

    /* pontos para acompanhar: gerados a partir dos padrões, sem prescrever intervenção.
       No máximo uma sugestão por disciplina (a de maior prioridade), para evitar repetição. */
    monitoring: function (sd) {
      var out = [];
      if (!sd || !sd.numericas.length) return out;
      var ref = CFG.notaReferencia;
      var L = CFG.limiares;

      sd.numericas.forEach(function (m) {
        var candidatos = [];
        if (m.tendencia === 'down' || (m.periodoRecente && m.periodoRecente.valor <= -L.mudancaRecente)) {
          candidatos.push({ prio: 1, origem: 'tendencia', texto: 'Acompanhar se a queda recente em ' + m.rotulo + ' se mantém no próximo período.' });
        }
        if (m.oscilacao === 'alta') {
          candidatos.push({ prio: 2, origem: 'oscilacao', texto: 'Verificar a estabilidade das notas de ' + m.rotulo + ' ao longo do próximo bimestre.' });
        }
        if (ref != null && m.media != null && m.media < ref && m.tendencia !== 'up') {
          candidatos.push({ prio: 3, origem: 'referencia', texto: 'Comparar o próximo resultado de ' + m.rotulo + ' com os bimestres anteriores (referência da escola: ' + fmt1(ref) + ').' });
        }
        if (m.tendencia === 'up' || (m.periodoRecente && m.periodoRecente.valor >= L.mudancaRecente)) {
          candidatos.push({ prio: 4, origem: 'tendencia', texto: 'Observar se a melhora em ' + m.rotulo + ' se consolida nos próximos registros.' });
        }
        m.serie.forEach(function (s) {
          if (s.nota == null || m.n < 3 || m.media == null) return;
          if (Math.abs(s.nota - m.media) >= L.outlierDesvio) {
            candidatos.push({ prio: 5, origem: 'atipico', texto: 'Observar se o resultado de ' + m.rotulo + ' no ' + rotuloBimestre(s.bimestre) + ' (' + fmt1(s.nota) + ') se repete ou se aproxima dos demais períodos.' });
          }
        });
        sd.recuperacoes.forEach(function (r) {
          if (r.materia === m.nome) candidatos.push({ prio: 6, origem: 'recuperacao', texto: 'Acompanhar se o resultado de ' + r.rotulo + ' se mantém após a recuperação.' });
        });
        if (candidatos.length) {
          candidatos.sort(function (a, b) { return a.prio - b.prio; });
          out.push(candidatos[0]);
        }
      });
      out.sort(function (a, b) { return a.prio - b.prio; });
      /* diversifica: no máximo 3 sugestões do mesmo tipo antes de completar as demais */
      var porTipo = {}, final = [];
      out.forEach(function (x) { if (final.length < 6 && (porTipo[x.prio] || 0) < 3) { final.push(x); porTipo[x.prio] = (porTipo[x.prio] || 0) + 1; } });
      out.forEach(function (x) { if (final.length < 6 && final.indexOf(x) < 0) final.push(x); });
      return final.slice(0, 6);
    }
  };

  function notaDe(m, bi) {
    var s = m.serie.filter(function (x) { return x.bimestre === bi; })[0];
    return s ? s.nota : null;
  }

  return {
    Stats: Stats, Store: Store, Insights: Insights,
    norm: norm, fmt1: fmt1, fmtSigned: fmtSigned, fmtPct: fmtPct,
    rotuloBimestre: rotuloBimestre, rotuloBimestreCurto: rotuloBimestreCurto,
    nomeExibicao: nomeExibicao, apelido: apelido, areaDe: areaDe, materiaSemNota: materiaSemNota,
    ordemMaterias: ordemMaterias
  };
})();
