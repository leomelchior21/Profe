/* ============================================================================
   VIEWS — seções do painel (modo aluno, modo turma e relatório impresso)
   ----------------------------------------------------------------------------
   Todas as seções são funções que devolvem um elemento DOM. Reaproveitadas por:
     - painel normal (app.js)
     - modo reunião (app.js)
     - resumo impresso (app.js)
   ========================================================================== */

window.Views = (function () {
  'use strict';

  var A = window.Analytics;
  var C = window.Components;
  var Ch = window.Charts;
  var CFG = window.CONFIG;

  var REF = CFG.notaReferencia;
  var LIM = CFG.limiares;

  function h(base, ctx) { return Math.round(base * (ctx && ctx.meeting ? 1.28 : 1)); }
  function esc(s) { return C.esc(s); }
  function f1(v) { return A.fmt1(v); }
  function fs(v) { return A.fmtSigned(v); }
  function pct(v) { return A.fmtPct(v); }
  function rb(bi) { return A.rotuloBimestre(bi); }
  function rbc(bi) { return A.rotuloBimestreCurto(bi); }
  function notaBi(m, bi) { var s = m.serie.filter(function (x) { return x.bimestre === bi; })[0]; return s ? s.nota : null; }

  /* cor estável por disciplina (mesma em todos os gráficos) */
  function mapaCores(sd) {
    var todas = Object.keys(A.Store.opcoes({}).materias.reduce(function (acc, m) { acc[m.nome] = 1; return acc; }, {})).sort(A.ordemMaterias);
    var cores = {};
    todas.forEach(function (n, i) { cores[n] = Ch.paletteCategoria(i); });
    return cores;
  }

  /* destaques padrão da trajetória: maiores médias, menores médias e maiores variações */
  function destaquesPadrao(lista) {
    var dest = {};
    var porMedia = lista.filter(function (m) { return m.media != null; }).slice()
      .sort(function (a, b) { return b.media - a.media; });
    if (porMedia.length) { dest[porMedia[0].nome] = 1; if (porMedia[1]) dest[porMedia[1].nome] = 1; }
    if (porMedia.length > 1) { dest[porMedia[porMedia.length - 1].nome] = 1; if (porMedia[porMedia.length - 2]) dest[porMedia[porMedia.length - 2].nome] = 1; }
    lista.filter(function (m) { return m.variacaoTotal != null; }).slice()
      .sort(function (a, b) { return Math.abs(b.variacaoTotal) - Math.abs(a.variacaoTotal); })
      .slice(0, 2).forEach(function (m) { dest[m.nome] = 1; });
    return dest;
  }

  /* --------------------------------------------------------------------------
     Contexto da turma pré-computado (distribuições, medianas por disciplina)
     -------------------------------------------------------------------------- */
  function classData(sd) {
    var scope = { anoLetivo: sd.aluno.anoLetivo, ano: sd.aluno.ano, turma: sd.aluno.turma };
    var alunos = A.Store.alunosDoEscopo(scope);
    var porMateria = {}, porBimestre = {};

    alunos.forEach(function (a) {
      var sd2 = A.Store.studentData(a.ra, scope);
      if (!sd2) return;
      sd2.numericas.forEach(function (m) {
        var pm = porMateria[m.nome] || (porMateria[m.nome] = { ano: [], bi: {}, nome: m.nome });
        if (m.media != null) pm.ano.push(m.media);
        m.serie.forEach(function (s) {
          if (s.nota != null) (pm.bi[s.bimestre] = pm.bi[s.bimestre] || []).push(s.nota);
        });
      });
      sd2.mediaPorBimestre.forEach(function (p) {
        if (p.media != null) (porBimestre[p.bimestre] = porBimestre[p.bimestre] || []).push(p.media);
      });
    });

    function box(vals) {
      if (!vals || !vals.length) return null;
      return {
        min: A.Stats.min(vals), q1: A.Stats.round2(A.Stats.quantile(vals, 0.25)),
        mediana: A.Stats.round2(A.Stats.median(vals)), q3: A.Stats.round2(A.Stats.quantile(vals, 0.75)),
        max: A.Stats.max(vals), media: A.Stats.round2(A.Stats.mean(vals)), n: vals.length
      };
    }

    Object.keys(porMateria).forEach(function (n) {
      var pm = porMateria[n];
      pm.boxAno = box(pm.ano);
      pm.boxBi = {};
      Object.keys(pm.bi).forEach(function (bi) { pm.boxBi[bi] = box(pm.bi[bi]); });
    });
    Object.keys(porBimestre).forEach(function (bi) {
      var b = porBimestre[bi];
      porBimestre[bi] = box(b);
    });

    return { nAlunos: alunos.length, porMateria: porMateria, porBimestre: porBimestre };
  }

  /* mediana da turma para uma disciplina em um escopo de período */
  function medianaClasse(cd, materia, bimestre) {
    var pm = cd.porMateria[materia];
    if (!pm) return null;
    var b = bimestre ? pm.boxBi[bimestre] : pm.boxAno;
    if (!b || b.n < LIM.minimoAlunosTurma) return null;
    return b;
  }

  /* --------------------------------------------------------------------------
     1) Cabeçalho do aluno + fatos
     -------------------------------------------------------------------------- */
  function cabecalhoAluno(ctx) {
    var sd = ctx.sd;
    var sec = document.createElement('section');
    sec.className = 'student-head';
    sec.id = 'aluno';
    sec.setAttribute('data-secao', 'aluno');

    var alunos = A.Store.opcoes(ctx.scope).alunos;
    var posicao = alunos.findIndex(function (a) { return a.ra === sd.aluno.ra; });
    var anterior = posicao > 0 ? alunos[posicao - 1] : null;
    var proximo = posicao >= 0 && posicao < alunos.length - 1 ? alunos[posicao + 1] : null;
    var grid = document.createElement('div');
    grid.className = 'student-head-grid';
    function botaoNavegacao(aluno, direcao) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'student-switch student-switch-' + direcao;
      btn.disabled = !aluno;
      btn.setAttribute('aria-label', aluno ? (direcao === 'prev' ? 'Aluno anterior: ' : 'Próximo aluno: ') + aluno.nome :
        (direcao === 'prev' ? 'Não há aluno anterior' : 'Não há próximo aluno'));
      btn.title = btn.getAttribute('aria-label');
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6"/></svg>' +
        '<span>' + (direcao === 'prev' ? 'Anterior' : 'Próximo') + '</span>';
      if (aluno) btn.addEventListener('click', function () { ctx.onNavegarAluno(aluno.ra); });
      return btn;
    }
    grid.appendChild(botaoNavegacao(anterior, 'prev'));

    var top = document.createElement('div');
    top.className = 'student-head-main';
    if (posicao >= 0) {
      var indice = document.createElement('span');
      indice.className = 'student-position';
      indice.textContent = 'Aluno ' + (posicao + 1) + ' de ' + alunos.length;
      top.appendChild(indice);
    }
    var h1 = document.createElement('h1');
    h1.className = 'page-title';
    h1.textContent = sd.aluno.nome;
    top.appendChild(h1);

    var meta = document.createElement('div');
    meta.className = 'student-meta';
    var partes = [];
    partes.push(sd.aluno.ano + 'º ano');
    partes.push('Turma ' + sd.aluno.turma);
    partes.push('Ano letivo ' + sd.aluno.anoLetivo);
    if (sd.aluno.status) partes.push(sd.aluno.status);
    meta.textContent = partes.join(' · ');
    top.appendChild(meta);

    var facts = document.createElement('div');
    facts.className = 'student-facts';
    var f = [];
    f.push(['Disciplinas', String(sd.numericas.length), 'Disciplinas com nota']);
    if (sd.frequenciaMedia != null) f.push(['Frequência média', pct(sd.frequenciaMedia), 'Frequência média registrada']);
    f.push(['Recuperações', String(sd.recuperacoes.length), 'Eventos de recuperação']);
    if (sd.faltasTotais != null) f.push(['Faltas', String(sd.faltasTotais).replace('.', ','), 'Faltas registradas, soma por disciplina']);
    f.forEach(function (p) {
      var c = document.createElement('span');
      c.className = 'fact';
      c.innerHTML = '<b>' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span>';
      c.setAttribute('aria-label', p[2] + ': ' + p[1]);
      c.title = p[2];
      facts.appendChild(c);
    });
    top.appendChild(facts);
    grid.appendChild(top);
    grid.appendChild(botaoNavegacao(proximo, 'next'));
    sec.appendChild(grid);

    if (sd.aluno.status === 'Transferido') {
      sec.appendChild(C.aviso('Situação registrada no boletim: ' + sd.aluno.status + '. Os períodos disponíveis podem ser parciais.', 'aviso-neutro'));
    }
    return sec;
  }

  /* --------------------------------------------------------------------------
     2) Resumo: cartão principal (gauge + donut) e cartões coloridos por status
     -------------------------------------------------------------------------- */
  function classificacaoDisciplinas(sd) {
    var out = { crescimento: [], estavel: [], queda: [] };
    sd.numericas.forEach(function (m) {
      var v = m.variacaoTotal != null ? m.variacaoTotal : m.deltaRecente;
      if (v == null) return;
      if (Math.abs(v) <= LIM.estavelVariacao) out.estavel.push(m);
      else if (v > 0) out.crescimento.push(m);
      else out.queda.push(m);
    });
    return out;
  }

  function mediaDoGrupo(lista) {
    var vals = lista.filter(function (m) { return m.media != null; }).map(function (m) { return m.media; });
    return A.Stats.round2(A.Stats.mean(vals));
  }

  function resumo(ctx) {
    var sd = ctx.sd;
    var el = document.createElement('section');
    el.className = 'painel-resumo';
    el.id = 'resumo';
    el.setAttribute('data-secao', 'resumo');

    if (sd.mediaGeral == null) {
      var vazio = document.createElement('div');
      vazio.className = 'kpi-hero';
      vazio.innerHTML = '<div class="empty">Sem notas numéricas registradas para este aluno no período.</div>';
      el.appendChild(vazio);
      return el;
    }

    var cls = classificacaoDisciplinas(sd);
    var total = sd.numericas.filter(function (m) { return m.media != null; }).length;
    var ref = REF;

    /* ---------- cartão principal: média geral + distribuição por faixa ---------- */
    var hero = document.createElement('div');
    hero.className = 'kpi-hero';

    var meta = document.createElement('div');
    meta.className = 'kpi-hero-nota';
    var corMedia = ref == null ? Ch.COR.azul : (sd.mediaGeral >= ref ? Ch.COR.verde : Ch.COR.coral);
    var difRef = ref != null ? A.Stats.round2(sd.mediaGeral - ref) : null;
    var chipStatus = difRef == null ? ''
      : '<span class="status-chip ' + (difRef >= 0.5 ? 'sit-acima' : difRef >= 0 ? 'sit-perto' : 'sit-baixo') + '">' +
        (difRef >= 0.5 ? 'Acima da referência' : difRef >= 0 ? 'Na referência' : 'Abaixo da referência') +
        ' · ' + fs(difRef) + '</span>';
    meta.innerHTML = '<span class="kpi-eyebrow">Média geral do aluno</span>' +
      '<div class="kpi-hero-linha"><div class="gauge-wrap"><div class="gauge-host"></div>' +
      '<div class="gauge-centro"><b>' + f1(sd.mediaGeral) + '</b><span>média geral</span></div></div>' +
      '<div class="kpi-hero-info">' + chipStatus +
      '<p>' + (ref != null ? 'Nota de referência da escola: <b>' + f1(ref) + '</b>.' : 'Sem nota de referência configurada.') +
      ' Média simples das ' + total + ' disciplinas com nota.</p>' +
      '<div class="kpi-hero-rodape" id="faixas-legenda"></div></div></div>';
    meta.querySelector('.kpi-eyebrow').appendChild(C.ajuda(
      'Média simples das disciplinas com nota do aluno, comparada à nota de referência da escola (' +
      (ref != null ? f1(ref) : '—') + '). O ponteiro marca a média; o círculo vazio marca a referência.'));
    hero.appendChild(meta);
    var avatar = C.avatar(sd.aluno.nome, Ch.COR.azulSuave, 'grande');
    avatar.classList.add('kpi-avatar');
    meta.appendChild(avatar);


    var faixas = [
      { id: 'abaixo', rotulo: 'Abaixo da referência', cor: Ch.COR.coral, valor: sd.numericas.filter(function (m) { return m.media != null && m.media < ref; }).length },
      { id: 'perto', rotulo: 'Na referência', cor: Ch.COR.ambar, valor: sd.numericas.filter(function (m) { return m.media != null && m.media >= ref && m.media < ref + 0.5; }).length },
      { id: 'acima', rotulo: 'Acima da referência', cor: Ch.COR.verde, valor: sd.numericas.filter(function (m) { return m.media != null && m.media >= ref + 0.5; }).length }
    ];
    if (ref == null) faixas = [{ id: 'x', rotulo: 'Disciplinas com nota', cor: Ch.COR.azul, valor: total }];

    var barrasWrap = document.createElement('div');
    barrasWrap.className = 'kpi-hero-barras';
    barrasWrap.innerHTML = '<span class="kpi-eyebrow">Distribuição das médias por disciplina</span>';
    barrasWrap.querySelector('.kpi-eyebrow').appendChild(C.ajuda(
      'Uma barra mostra a proporção de disciplinas abaixo, na faixa ou acima da nota de referência da escola. A legenda traz a quantidade e o percentual de cada faixa. Toque em um trecho para abrir a tabela.'));
    var barra = document.createElement('div');
    barra.className = 'grade-segmented-bar';
    barra.setAttribute('role', 'group');
    barra.setAttribute('aria-label', 'Distribuição das médias de ' + total + ' disciplinas');
    var legendaBarra = document.createElement('div');
    legendaBarra.className = 'grade-segmented-legend';
    faixas.forEach(function (f) {
      var percentual = total ? Math.round(f.valor / total * 100) : 0;
      if (f.valor) {
        var trecho = document.createElement('button');
        trecho.type = 'button';
        trecho.className = 'grade-segment';
        trecho.style.flexGrow = String(f.valor);
        trecho.style.background = f.cor;
        trecho.setAttribute('aria-label', f.rotulo + ': ' + f.valor + ' de ' + total + ' disciplinas, ' + percentual + '%. Abrir tabela de disciplinas.');
        trecho.addEventListener('click', function () { if (ctx.onFiltrarSituacao) ctx.onFiltrarSituacao(f.id); });
        barra.appendChild(trecho);
      }
      var item = document.createElement('div');
      item.className = 'grade-segment-key';
      item.innerHTML = '<i style="background:' + f.cor + '"></i><span>' + esc(f.rotulo) + '</span><b>' + f.valor + ' de ' + total + ' <small>· ' + percentual + '%</small></b>';
      legendaBarra.appendChild(item);
    });
    barrasWrap.appendChild(barra);
    barrasWrap.appendChild(legendaBarra);
    hero.appendChild(barrasWrap);
    el.appendChild(hero);

    Ch.gauge(meta.querySelector('.gauge-host'), {
      valor: sd.mediaGeral, max: 10, ref: ref, cor: corMedia, altura: h(158, ctx),
      aria: 'Média geral do aluno comparada à referência da escola'
    });

    /* ---------- cartões coloridos: crescimento / estável / queda ---------- */
    var linha = document.createElement('div');
    linha.className = 'kpi-colors';
    [
      { chave: 'crescimento', classe: 'verde', titulo: 'disciplinas em crescimento', icone: 'up',
        ajuda: 'Disciplinas cuja nota variou para cima ao longo do período. O número mostra quantas são; abaixo, a média dessas disciplinas e os nomes.' },
      { chave: 'estavel', classe: 'ambar', titulo: 'disciplinas estáveis', icone: 'flat',
        ajuda: 'Disciplinas cuja nota praticamente não mudou entre os períodos (variação de até ' + String(LIM.estavelVariacao).replace('.', ',') + ').' },
      { chave: 'queda', classe: 'coral', titulo: 'disciplinas em queda', icone: 'down',
        ajuda: 'Disciplinas cuja nota variou para baixo ao longo do período. O número mostra quantas são; abaixo, a média dessas disciplinas e os nomes.' }
    ].forEach(function (cfg) {
      var lista = cls[cfg.chave];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'kpi accent ' + cfg.classe;
      card.setAttribute('data-tip', cfg.ajuda);
      var pct = total ? Math.round(lista.length / total * 100) : 0;
      card.innerHTML = '<span class="kpi-icone">' + C.icone(cfg.icone) + '</span>' +
        '<span class="kpi-help-canto card-help" aria-hidden="true">?</span>' +
        '<span class="kpi-valor">' + lista.length + '</span>' +
        '<span class="kpi-rotulo">' + cfg.titulo + '</span>' +
        '<span class="kpi-sub">' + pct + '% das disciplinas com nota' + (lista.length ? ' · média ' + f1(mediaDoGrupo(lista)) : '') + '</span>' +
        (lista.length ? '<span class="kpi-lista">' + lista.map(function (m) { return m.apelido; }).join(' · ') + '</span>' : '');
      card.setAttribute('aria-label', lista.length + ' ' + cfg.titulo + '. Toque para ver a lista.');
      card.addEventListener('click', function () {
        var alvo = document.getElementById(cfg.chave === 'queda' ? 'variacao' : 'trajetoria');
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      linha.appendChild(card);
    });
    el.appendChild(linha);
    var comparaveis = cls.crescimento.length + cls.estavel.length + cls.queda.length;
    if (comparaveis < total) el.appendChild(C.aviso((total - comparaveis) + ' disciplina(s) ainda sem dois períodos de nota para comparar a evolução.'));

    /* ---------- faixa de estatísticas secundárias ---------- */
    var strip = document.createElement('div');
    strip.className = 'stat-strip';
    function comAjuda(chip, texto) {
      chip.setAttribute('data-tip', texto);
      chip.tabIndex = 0;
      chip.setAttribute('role', 'note');
      return chip;
    }
    var biFoco = ctx.filtros.bimestre ? Number(ctx.filtros.bimestre) : null;
    var mpb = sd.mediaPorBimestre.filter(function (p) { return p.media != null; });
    var alvo = biFoco ? mpb.filter(function (p) { return p.bimestre === biFoco; })[0] : mpb[mpb.length - 1];
    var anterior = alvo ? mpb.filter(function (p) { return p.bimestre < alvo.bimestre; }).slice(-1)[0] : null;
    if (alvo) {
      var delta = anterior ? A.Stats.round2(alvo.media - anterior.media) : null;
      var chip = document.createElement('div');
      chip.className = 'stat-chip';
      chip.innerHTML = '<span>' + (biFoco ? 'Média do ' + esc(rb(alvo.bimestre)) : 'Média do último bimestre') + '</span><b>' + f1(alvo.media) + '</b>';
      if (delta != null) chip.appendChild(C.pillDelta(delta, { limiar: LIM.estavelVariacao }));
      strip.appendChild(comAjuda(chip, 'Média das disciplinas com nota no período em foco, comparada ao período anterior.'));
    }
    var cat = consistenciaGeral(sd);
    if (cat) {
      var chip2 = document.createElement('div');
      chip2.className = 'stat-chip';
      chip2.innerHTML = '<span>Consistência das notas</span><b>' + esc(cat.rotulo) + '</b><em>' + esc(cat.sub) + '</em>';
      chip2.setAttribute('data-tip', 'Oscilação calculada pelo desvio-padrão médio entre bimestres (' + f1(cat.dp) + '). ' + cat.legenda);
      chip2.tabIndex = 0;
      strip.appendChild(chip2);
    }
    if (sd.frequenciaMedia != null) {
      var chip3 = document.createElement('div');
      chip3.className = 'stat-chip';
      chip3.innerHTML = '<span>Frequência média registrada</span><b>' + pct(sd.frequenciaMedia) + '</b>';
      strip.appendChild(comAjuda(chip3, 'Média das frequências registradas nas disciplinas do boletim.'));
    }
    var chip4 = document.createElement('div');
    chip4.className = 'stat-chip';
    chip4.innerHTML = '<span>Eventos de recuperação</span><b>' + sd.recuperacoes.length + '</b>' +
      (sd.recuperacoes.length ? '<em>' + esc(unique(sd.recuperacoes.map(function (r) { return r.rotulo; })).join(' · ')) + '</em>' : '');
    strip.appendChild(comAjuda(chip4, 'Quantidade de recuperações registradas no boletim e as disciplinas envolvidas.'));
    var maior = sd.numericas.slice().filter(function (m) { return m.media != null; }).sort(function (a, b) { return (b.media || 0) - (a.media || 0); });
    if (maior.length) {
      var chip5 = document.createElement('div');
      chip5.className = 'stat-chip';
      chip5.innerHTML = '<span>Maior · menor média</span><b>' + f1(maior[0].media) + ' · ' + f1(maior[maior.length - 1].media) + '</b><em>' +
        esc(maior[0].apelido) + ' · ' + esc(maior[maior.length - 1].apelido) + '</em>';
      strip.appendChild(comAjuda(chip5, 'Disciplina com a maior média do ano e disciplina com a menor média.'));
    }
    el.appendChild(strip);
    return el;
  }

  /* --------------------------------------------------------------------------
     2b) Tabela interativa por disciplina (linhas tintadas por desempenho)
     -------------------------------------------------------------------------- */
  function tabelaDisciplinas(ctx) {
    var sd = ctx.sd, cores = mapaCores(sd);
    var sec = C.secao('disciplinas-tabela', 'Visão por disciplina',
      'Cada linha resume uma disciplina. Toque em uma linha para focar a disciplina em todo o painel; as cores indicam a distância da referência (' + (REF != null ? f1(REF) : '—') + ').',
      { ajuda: 'Colunas: notas por bimestre (cinza = sem nota); média do ano com barra proporcional; variação entre o primeiro e o último período; oscilação (desvio-padrão entre bimestres); situação em relação à referência da escola. Toque em uma linha para focar a disciplina em todo o painel.' });
    var el = sec.el;
    el.classList.add('card-wide');

    if (!sd.numericas.length) { sec.body.appendChild(C.vazio('Sem notas numéricas registradas.')); return el; }

    var wrap = document.createElement('div');
    wrap.className = 'tabela-wrap';
    var table = document.createElement('table');
    table.className = 'tabela-disciplinas';
    table.innerHTML = '<caption class="visually-hidden">Média, variação, oscilação e situação por disciplina</caption>' +
      '<colgroup><col style="width:23%"><col style="width:21%"><col style="width:11%"><col style="width:13%"><col style="width:14%"><col style="width:18%"></colgroup>' +
      '<thead><tr><th scope="col">Disciplina</th><th scope="col">Notas por bimestre</th><th scope="col">Média</th>' +
      '<th scope="col">Variação</th><th scope="col">Oscilação</th><th scope="col">Situação</th></tr></thead>';
    var tbody = document.createElement('tbody');

    var itens = sd.numericas.slice().sort(function (a, b) { return A.ordemMaterias(a.nome, b.nome); });

    itens.forEach(function (m) {
      var tr = document.createElement('tr');
      var abaixo = REF != null && m.media != null && m.media < REF;
      var perto = REF != null && m.media != null && m.media >= REF && m.media < REF + 0.5;
      tr.className = 'linha ' + (abaixo ? 'baixo' : perto ? 'perto' : 'acima');
      if (ctx.filtros.disciplina && A.norm(m.nome) === A.norm(ctx.filtros.disciplina)) tr.classList.add('focada');
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', 'Focar a disciplina ' + m.rotulo);

      /* disciplina */
      var td1 = document.createElement('td');
      td1.className = 'cel-disciplina';
      var identidade = document.createElement('div');
      identidade.className = 'discipline-identity';
      var cor = document.createElement('span');
      cor.className = 'discipline-swatch';
      cor.style.background = cores[m.nome] || '#8090a4';
      cor.setAttribute('aria-hidden', 'true');
      identidade.appendChild(cor);
      var nome = document.createElement('div');
      nome.innerHTML = '<b>' + esc(m.rotulo) + '</b><span>' + esc(m.area) + '</span>';
      identidade.appendChild(nome);
      td1.appendChild(identidade);
      tr.appendChild(td1);

      /* notas por bimestre */
      var td2 = document.createElement('td');
      td2.className = 'cel-bimestres';
      td2.setAttribute('data-label', 'Notas por bimestre');
      var notas = document.createElement('div');
      notas.className = 'bimestre-list';
      sd.bimestres.forEach(function (bi) {
        var s = m.serie.filter(function (x) { return x.bimestre === bi; })[0];
        var v = s ? s.nota : null;
        var p = document.createElement('span');
        p.className = 'pill-nota' + (v == null ? ' vazia' : '');
        p.style.background = Ch.notaColor(v);
        p.textContent = v == null ? '–' : f1(v);
        if (s) {
          p.setAttribute('data-tip', rb(bi) + ' · NB ' + f1(s.nb) + (s.recuperacao != null ? ' · rec ' + f1(s.recuperacao) : '') +
            (s.mb != null ? ' · MB ' + f1(s.mb) : ' · MB não registrada') + (s.fa != null ? ' · faltas ' + f1(s.fa) : ''));
          p.tabIndex = 0;
        }
        notas.appendChild(p);
      });
      td2.appendChild(notas);
      tr.appendChild(td2);

      /* média */
      var td3 = document.createElement('td');
      td3.className = 'cel-media';
      td3.setAttribute('data-label', 'Média');
      var pctBar = Math.max(3, Math.round((m.media || 0) / 10 * 100));
      td3.innerHTML = '<b>' + f1(m.media) + '</b><span class="barra-media"><i style="width:' + pctBar + '%;background:' +
        (abaixo ? Ch.COR.coral : perto ? Ch.COR.ambar : Ch.COR.verde) + '"></i></span>';
      tr.appendChild(td3);

      /* variação */
      var td4 = document.createElement('td');
      td4.setAttribute('data-label', 'Variação');
      if (m.variacaoTotal != null) td4.appendChild(C.pillDelta(m.variacaoTotal, { limiar: LIM.estavelVariacao }));
      else td4.innerHTML = '<span class="hint">—</span>';
      tr.appendChild(td4);

      /* oscilação */
      var td5 = document.createElement('td');
      td5.setAttribute('data-label', 'Oscilação');
      var rotuloOsc = m.dp == null ? 'Sem dados' : A.Insights.rotuloOscilacao(m.oscilacao);
      var oscilacao = document.createElement('span');
      oscilacao.className = 'oscillation-pill ' + (m.oscilacao || 'sem-dados');
      oscilacao.innerHTML = '<b>' + f1(m.dp) + '</b><small>' + esc(rotuloOsc) + '</small>';
      if (m.dp != null) {
        oscilacao.setAttribute('data-tip', 'Desvio-padrão ' + f1(m.dp) + ' · faixa de ' + f1(m.minimo) + ' a ' + f1(m.maximo) + ' — ' + rotuloOsc);
        oscilacao.tabIndex = 0;
      }
      td5.appendChild(oscilacao);
      tr.appendChild(td5);

      /* situação */
      var td6 = document.createElement('td');
      td6.className = 'cel-situacao';
      td6.setAttribute('data-label', 'Situação');
      var sit = abaixo ? 'Abaixo da referência' : perto ? 'Na referência' : 'Acima da referência';
      var cls2 = abaixo ? 'sit-baixo' : perto ? 'sit-perto' : 'sit-acima';
      td6.innerHTML = '<span class="situacao ' + cls2 + '">' + sit + '</span>';
      tr.appendChild(td6);

      function focar() { if (ctx.onFiltrarDisciplina) ctx.onFiltrarDisciplina(m.nome); }
      tr.addEventListener('click', focar);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focar(); } });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    sec.body.appendChild(wrap);

    var rodape = document.createElement('p');
    rodape.className = 'hint';
    rodape.textContent = 'Linha destacada = disciplina em foco (definida também no filtro "Disciplina"). Toque novamente para limpar o foco.';
    sec.body.appendChild(rodape);
    return el;
  }

  function consistenciaGeral(sd) {
    var dps = sd.numericas.filter(function (m) { return m.dp != null; }).map(function (m) { return m.dp; });
    if (!dps.length) return null;
    var dp = A.Stats.round2(A.Stats.mean(dps));
    var rotulo, legenda = 'Quanto menor a oscilação entre bimestres, mais estável é a trajetória.';
    if (dp <= LIM.oscilacaoMuitoEstavelDP) rotulo = 'Muito estável';
    else if (dp <= LIM.oscilacaoEstavelDP) rotulo = 'Estável';
    else if (dp < LIM.altaOscilacaoDP) rotulo = 'Oscilação moderada';
    else rotulo = 'Alta oscilação';
    return { rotulo: rotulo, dp: dp, sub: 'oscilação típica entre bimestres', legenda: legenda };
  }

  /* --------------------------------------------------------------------------
     3) Leitura do aluno
     -------------------------------------------------------------------------- */
  function leitura(ctx) {
    var sec = C.secao('leitura', 'Leitura do aluno',
      'Observações geradas automaticamente a partir dos registros do boletim. O painel descreve padrões nos dados e não faz afirmações sobre comportamento, esforço ou causas.',
      { ajuda: 'Estas observações são calculadas por regras fixas sobre as notas do boletim (médias, variações, oscilação e comparação com a referência). Elas descrevem padrões nos dados; não avaliam o aluno nem substituem a leitura do professor.' });
    var insights = A.Insights.student(ctx.sd);

    var positivos = insights.filter(function (i) { return i.tom === 'positivo'; });
    var atencao = insights.filter(function (i) { return i.tom === 'atencao'; });
    var neutros = insights.filter(function (i) { return i.tom === 'neutro'; });

    if (!insights.length) {
      sec.body.appendChild(C.vazio('Ainda não há notas suficientes para gerar observações.'));
      return sec.el;
    }

    function grupo(titulo, icone, lista, classe, textoAjuda) {
      if (!lista.length) return;
      var g = document.createElement('div');
      g.className = 'insight-group ' + classe;
      g.innerHTML = '<h3 class="group-title">' + C.icone(icone) + '<span>' + esc(titulo) + '</span></h3>';
      g.querySelector('.group-title').appendChild(C.ajuda(textoAjuda));
      var grid = document.createElement('div');
      grid.className = 'insight-grid';
      lista.forEach(function (i) { grid.appendChild(C.insightCard(i)); });
      g.appendChild(grid);
      sec.body.appendChild(g);
    }
    grupo('Pontos fortes observados', 'estrela', positivos, 'pos',
      'Disciplinas com média acima da própria média do aluno, em crescimento ou com notas estáveis.');
    grupo('Pontos de atenção observados', 'alerta', atencao, 'att',
      'Disciplinas com média abaixo da própria média do aluno ou com queda recente. São sinais para observar, não julgamentos.');
    grupo('Padrões observados', 'lista', neutros, 'neu',
      'Padrões gerais do conjunto de notas (oscilação, comparação com a referência da escola e diferenças entre áreas).');

    var disc = document.createElement('p');
    disc.className = 'aviso';
    disc.textContent = 'Observações dos dados (' + insights.length + '). Elas não incluem interpretações sobre o aluno; esse espaço é do professor.';
    sec.body.appendChild(disc);
    return sec.el;
  }

  /* --------------------------------------------------------------------------
     4) Trajetória ao longo do ano
     -------------------------------------------------------------------------- */
  function trajetoria(ctx) {
    var sd = ctx.sd, cores = mapaCores(sd), cd = ctx.classData;
    var bimestres = sd.bimestres;
    var sec = C.secao('trajetoria', 'Trajetória ao longo do ano',
      'Cada linha é uma disciplina. Disciplinas em destaque aparecem coloridas; as demais ficam esmaecidas. Clique nos nomes para destacar, esmaecer ou ocultar.',
      { ajuda: 'Cada linha é uma disciplina ao longo dos bimestres; a linha escura é a média geral. Use "Selecionar todas" para destacar todas, "Destaques" para voltar à seleção automática (maiores e menores médias e maiores variações) e os nomes abaixo do gráfico para alternar entre normal, destaque e oculta.' });
    var el = sec.el;
    el.classList.add('card-wide');

    if (!sd.numericas.length || bimestres.length < 1) {
      sec.body.appendChild(C.vazio('Sem notas numéricas registradas para montar a trajetória.'));
      return el;
    }

    var xLabels = bimestres.map(function (bi) { return rbc(bi); });
    var estado = (ctx.state.traj = ctx.state.traj || {});
    var numericas = ctx.filtros.disciplina
      ? sd.numericas.filter(function (m) { return A.norm(m.nome) === A.norm(ctx.filtros.disciplina); })
      : sd.numericas;

    if (!Object.keys(estado).length) {
      var dest = destaquesPadrao(numericas);
      numericas.forEach(function (m) { estado[m.nome] = dest[m.nome] ? 'destaque' : 'normal'; });
    }
    Object.keys(estado).forEach(function (k) {
      if (!sd.numericas.some(function (m) { return m.nome === k; })) delete estado[k];
    });
    sd.numericas.forEach(function (m) {
      if (!(m.nome in estado)) estado[m.nome] = 'normal';
    });
    if (ctx.filtros.disciplina) {
      sd.numericas.forEach(function (m) {
        estado[m.nome] = A.norm(m.nome) === A.norm(ctx.filtros.disciplina) ? 'destaque' : 'normal';
      });
    }

    var legenda = document.createElement('div');
    legenda.className = 'legend';
    legenda.id = 'traj-legenda';

    /* atalhos: selecionar todas / destaques */
    var acoes = document.createElement('div');
    acoes.className = 'traj-actions';
    var btTodas = document.createElement('button');
    btTodas.type = 'button';
    btTodas.className = 'toggle-chip';
    btTodas.textContent = 'Selecionar todas';
    var btDest = document.createElement('button');
    btDest.type = 'button';
    btDest.className = 'toggle-chip';
    btDest.textContent = 'Destaques';
    function atualizarAcoes() {
      var todas = sd.numericas.length > 0 && sd.numericas.every(function (m) { return estado[m.nome] === 'destaque'; });
      btTodas.setAttribute('aria-pressed', todas ? 'true' : 'false');
    }
    btTodas.addEventListener('click', function () {
      var todas = sd.numericas.length > 0 && sd.numericas.every(function (m) { return estado[m.nome] === 'destaque'; });
      var alvoEstado = todas ? 'normal' : 'destaque';
      sd.numericas.forEach(function (m) { estado[m.nome] = alvoEstado; });
      desenhar();
      atualizarAcoes();
    });
    btDest.addEventListener('click', function () {
      var dest = destaquesPadrao(numericas);
      sd.numericas.forEach(function (m) { estado[m.nome] = dest[m.nome] ? 'destaque' : 'normal'; });
      desenhar();
      atualizarAcoes();
    });
    acoes.appendChild(btTodas);
    acoes.appendChild(btDest);
    sec.body.appendChild(acoes);
    sec.body.appendChild(legenda);
    atualizarAcoes();

    var host = document.createElement('div');
    host.className = 'chart-host';
    sec.body.appendChild(host);

    var dica = document.createElement('p');
    dica.className = 'hint';
    dica.textContent = 'Dica: cada clique alterna entre esmaecida → destacada → oculta. Use as setas do teclado para percorrer os bimestres.';
    sec.body.appendChild(dica);

    function seriesAtuais() {
      var ss = [];
      sd.numericas.forEach(function (m) {
        var est = estado[m.nome] || 'normal';
        if (est === 'oculto') return;
        ss.push({
          id: m.nome, nome: m.rotulo, cor: est === 'destaque' ? cores[m.nome] : '#b9c1cb',
          muted: est !== 'destaque', destaque: est === 'destaque',
          valores: bimestres.map(function (bi) { return notaBi(m, bi); })
        });
      });
      var valsMedia = bimestres.map(function (bi) {
        var p = sd.mediaPorBimestre.filter(function (x) { return x.bimestre === bi; })[0];
        return p ? p.media : null;
      });
      ss.push({ id: '_media', nome: 'Média geral', cor: '#1f2937', muted: false, destaque: true, valores: valsMedia });
      return ss;
    }

    function tooltip(idx) {
      var bi = bimestres[idx];
      var linhas = [];
      var set = (ctx.filtros.disciplina ? numericas : sd.numericas).slice()
        .filter(function (m) { return notaBi(m, bi) != null; })
        .sort(function (a, b) { return notaBi(b, bi) - notaBi(a, bi); });
      linhas.push({ rotulo: '<b>Média geral</b>', valor: '<b>' + f1(sd.mediaPorBimestre.filter(function (p) { return p.bimestre === bi; })[0].media) + '</b>' });
      set.slice(0, 7).forEach(function (m) {
        var s = m.serie.filter(function (x) { return x.bimestre === bi; })[0];
        var det = '';
        if (s.recuperacao != null || (s.mb != null && s.nb != null && s.mb !== s.nb)) {
          det = ' <span class="tt-mini">(NB ' + f1(s.nb) + ' · rec ' + f1(s.recuperacao) + ' · MB ' + f1(s.mb) + ')</span>';
        } else if (s.mb == null && s.nb != null) {
          det = ' <span class="tt-mini">(NB ' + f1(s.nb) + ' · MB não registrada)</span>';
        }
        linhas.push({ rotulo: esc(m.rotulo), valor: f1(s.nota) + det });
      });
      if (set.length > 7) linhas.push({ rotulo: 'e mais ' + (set.length - 7) + ' disciplinas', valor: '' });
      var cb = cd.porBimestre[bi];
      if (cb && cb.n >= LIM.minimoAlunosTurma) linhas.push({ rotulo: 'Mediana da turma', valor: f1(cb.mediana) + ' <span class="tt-mini">(' + cb.n + ' alunos)</span>' });
      return Ch.tipHTML(esc(rb(bi)), null, linhas);
    }

    function desenhar() {
      Ch.legend(legenda, sd.numericas.map(function (m) {
        var est = estado[m.nome] || 'normal';
        return { id: m.nome, nome: m.rotulo, cor: cores[m.nome], ativo: est !== 'oculto', destaque: est === 'destaque' };
      }).concat([{ id: '_media', nome: 'Média geral', cor: '#1f2937', ativo: true, destaque: true }]), function (id) {
        if (id === '_media') return;
        var est = estado[id] || 'normal';
        estado[id] = est === 'normal' ? 'destaque' : est === 'destaque' ? 'oculto' : 'normal';
        desenhar();
      });
      Ch.lineChart(host, {
        altura: h(320, ctx), series: seriesAtuais(), xLabels: xLabels,
        refLine: REF != null ? { valor: REF, rotulo: CFG.rotuloReferencia + ' (' + f1(REF) + ')' } : null,
        tooltip: tooltip, aria: 'Trajetória das notas por disciplina ao longo dos bimestres'
      });
    }
    desenhar();
    return el;
  }

  /* --------------------------------------------------------------------------
     5) Evolução da média geral
     -------------------------------------------------------------------------- */
  function evolucao(ctx) {
    var sd = ctx.sd;
    var mpb = sd.mediaPorBimestre.filter(function (p) { return p.media != null; });
    var sec = C.secao('evolucao', 'Evolução da média geral',
      'Média das disciplinas com nota em cada bimestre. As setas mostram a diferença entre períodos.',
      { ajuda: 'A linha mostra a média das disciplinas com nota em cada bimestre. As pílulas acima comparam bimestres consecutivos; variações de até 0,25 ponto são tratadas como estabilidade para não superinterpretar diferenças pequenas.' });
    var el = sec.el;
    if (mpb.length < 1) { sec.body.appendChild(C.vazio('Sem dados suficientes.')); return el; }

    var pills = document.createElement('div');
    pills.className = 'delta-row';
    for (var i = 1; i < mpb.length; i++) {
      var d = A.Stats.round2(mpb[i].media - mpb[i - 1].media);
      var wrap = document.createElement('div');
      wrap.className = 'delta-item';
      wrap.innerHTML = '<span class="delta-label">' + esc(rbc(mpb[i - 1].bimestre)) + ' → ' + esc(rbc(mpb[i].bimestre)) + '</span>';
      wrap.appendChild(C.pillDelta(d, { limiar: LIM.estavelVariacao, mostrarRotulo: true }));
      pills.appendChild(wrap);
    }
    sec.body.appendChild(pills);

    var host = document.createElement('div');
    host.className = 'chart-host';
    sec.body.appendChild(host);
    var bimestres = mpb.map(function (p) { return p.bimestre; });
    Ch.lineChart(host, {
      altura: h(220, ctx),
      series: [{ id: 'media', nome: 'Média geral', cor: '#2e5aa8', destaque: true, valores: mpb.map(function (p) { return p.media; }) }],
      xLabels: bimestres.map(rbc),
      refLine: REF != null ? { valor: REF, rotulo: CFG.rotuloReferencia } : null,
      tooltip: function (idx) {
        var p = mpb[idx];
        return Ch.tipHTML(esc(rb(p.bimestre)), null, [
          { rotulo: 'Média do aluno', valor: f1(p.media) },
          { rotulo: 'Disciplinas com nota', valor: String(p.n) }
        ]);
      },
      aria: 'Evolução da média geral do aluno por bimestre'
    });
    var obs = document.createElement('p');
    obs.className = 'hint';
    obs.textContent = 'Variações de até ' + String(LIM.estavelVariacao).replace('.', ',') + ' são tratadas como estabilidade, para não superinterpretar diferenças pequenas.';
    sec.body.appendChild(obs);
    return el;
  }

  /* --------------------------------------------------------------------------
     6) Perfil por disciplina
     -------------------------------------------------------------------------- */
  function perfil(ctx) {
    var sd = ctx.sd, cd = ctx.classData;
    var biFoco = ctx.filtros.bimestre ? Number(ctx.filtros.bimestre) : null;
    var sec = C.secao('perfil', 'Perfil por disciplina',
      'Média do aluno por disciplina' + (biFoco ? ' no ' + rb(biFoco) : ' no ano') + '. A marca vertical mostra a mediana da turma — o gráfico compara o aluno com o grupo, não com um ranking.',
      { ajuda: 'Cada barra é a média do aluno na disciplina (no ano ou no bimestre em foco). A marca vertical escura é a mediana da turma, ou seja, o valor típico do grupo: metade dos alunos ficou acima, metade abaixo. Não é um ranking.' });
    var el = sec.el;

    if (!sd.numericas.length) { sec.body.appendChild(C.vazio('Sem notas numéricas registradas.')); return el; }

    var controles = document.createElement('div');
    controles.className = 'controls';
    var rot = document.createElement('label');
    rot.className = 'control';
    rot.innerHTML = '<span>Organizar por</span>';
    var sel = document.createElement('select');
    [['area', 'Área curricular'], ['az', 'Ordem alfabética'], ['maior', 'Maior média'], ['menor', 'Menor média']].forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    sel.value = ctx.state.perfilOrdem || 'area';
    sel.setAttribute('aria-label', 'Ordenar disciplinas');
    sel.addEventListener('change', function () { ctx.state.perfilOrdem = sel.value; ctx.rerender(); });
    rot.appendChild(sel);
    controles.appendChild(rot);
    var lg = document.createElement('span');
    lg.className = 'inline-legend';
    lg.innerHTML = '<i class="sw sw-aluno"></i>Aluno <i class="sw sw-mediana"></i>Mediana da turma';
    controles.appendChild(lg);
    sec.body.appendChild(controles);

    var host = document.createElement('div');
    host.className = 'chart-host';
    sec.body.appendChild(host);

    var indiceCor = {};
    {
      var todasGlobais = A.Store.opcoes({}).materias.map(function (x) { return x.nome; }).sort(A.ordemMaterias);
      todasGlobais.forEach(function (n, i) { indiceCor[n] = i; });
    }
    var itens = sd.numericas.slice();
    var ordem = ctx.state.perfilOrdem || 'area';
    if (ordem === 'az') itens.sort(function (a, b) { return a.rotulo.localeCompare(b.rotulo, 'pt-BR'); });
    else if (ordem === 'maior') itens.sort(function (a, b) { return (b.media || -1) - (a.media || -1); });
    else if (ordem === 'menor') itens.sort(function (a, b) { return (a.media || 11) - (b.media || 11); });
    if (ctx.filtros.disciplina) {
      itens = itens.filter(function (m) { return A.norm(m.nome) === A.norm(ctx.filtros.disciplina); });
      if (!itens.length) itens = sd.numericas.slice();
    }

    Ch.hBars(host, {
      itens: itens.map(function (m) {
        var b = medianaClasse(cd, m.nome, biFoco);
        var valor = m.media;
        if (biFoco) valor = notaBi(m, biFoco);
        return {
          id: m.nome, rotulo: m.rotulo, valor: valor, cor: Ch.paletteCategoria(indiceCor[m.nome] || 0),
          mediana: b ? b.mediana : null
        };
      }),
      max: 10, fmt: f1, refLine: REF != null ? { valor: REF, rotulo: 'referência' } : null,
      aria: 'Média do aluno por disciplina comparada com a mediana da turma',
      tooltip: function (it) {
        var m = sd.numericas.filter(function (x) { return x.nome === it.id; })[0];
        var b = medianaClasse(cd, m.nome, biFoco);
        var linhas = [{ rotulo: biFoco ? 'Média no ' + rbc(biFoco) : 'Média no ano', valor: f1(it.valor) }];
        if (b) {
          linhas.push({ rotulo: 'Mediana da turma', valor: f1(b.mediana) + ' <span class="tt-mini">(' + b.n + ' alunos)</span>' });
          linhas.push({ rotulo: 'Diferença', valor: fs(A.Stats.round2(it.valor - b.mediana)) });
        } else {
          linhas.push({ rotulo: 'Turma', valor: 'sem dados suficientes' });
        }
        if (m) {
          linhas.push({ rotulo: 'Mínimo · máximo', valor: f1(m.minimo) + ' – ' + f1(m.maximo) });
          if (m.tendencia !== 'insuficiente') linhas.push({ rotulo: 'Tendência', valor: A.Insights.tendenciaRotulo(m.tendencia) + ' (' + fs(m.variacaoTotal) + ')' });
        }
        return Ch.tipHTML(esc(it.rotulo), null, linhas);
      }
    });
    var quais = sd.numericas.map(function (m) {
      var b = medianaClasse(cd, m.nome, biFoco);
      return b ? null : m;
    }).filter(Boolean);
    if (quais.length) {
      var av = document.createElement('p');
      av.className = 'hint';
      av.textContent = 'Sem mediana da turma por falta de dados suficientes (mínimo de ' + LIM.minimoAlunosTurma + ' alunos com nota): ' + quais.map(function (m) { return m.rotulo; }).join(', ') + '.';
      sec.body.appendChild(av);
    }
    if (sd.semNota.length) {
      var chips = document.createElement('p');
      chips.className = 'hint';
      chips.textContent = 'Disciplinas sem nota numérica no boletim: ' + sd.semNota.map(function (m) { return m.rotulo; }).join(' · ');
      sec.body.appendChild(chips);
    }
    return el;
  }

  /* --------------------------------------------------------------------------
     7) Contexto da turma (box plots)
     -------------------------------------------------------------------------- */
  function contexto(ctx) {
    var sd = ctx.sd, cd = ctx.classData;
    var biFoco = ctx.filtros.bimestre ? Number(ctx.filtros.bimestre) : null;
    var sec = C.secao('contexto', 'Contexto da turma',
      'O ponto destacado é a nota do aluno; a caixa mostra a distribuição da turma (25%, mediana e 75%; traços indicam mínimo e máximo). Este gráfico mostra onde a nota está dentro da distribuição da turma. Não representa um ranking.',
      { ajuda: 'Cada linha é uma disciplina. A caixa vai do 1º quartil (25%) ao 3º (75%) da turma; o traço grosso dentro dela é a mediana; as hastes mostram o mínimo e o máximo. O ponto azul com o número é a nota do aluno. Caixas longas indicam turma mais heterogênea.' });
    var el = sec.el;

    var materias = sd.numericas;
    if (ctx.filtros.disciplina) {
      var f = materias.filter(function (m) { return A.norm(m.nome) === A.norm(ctx.filtros.disciplina); });
      if (f.length) materias = f;
    }
    if (!materias.length) { sec.body.appendChild(C.vazio('Sem disciplinas com nota.')); return el; }

    var host = document.createElement('div');
    sec.body.appendChild(host);
    var cores = mapaCores(sd);
    Ch.boxRows(host, {
      xDomain: [0, 10],
      grupos: materias.map(function (m) {
        var pm = cd.porMateria[m.nome];
        var box = null, alunoValor = null;
        if (pm) {
          box = biFoco ? pm.boxBi[biFoco] : pm.boxAno;
          alunoValor = biFoco ? notaBi(m, biFoco) : m.media;
        }
        return {
          id: m.nome, rotulo: m.rotulo, cor: cores[m.nome],
          sub: pm && box ? box.n + ' alunos' : 'sem dados',
          box: pm && box && box.n >= LIM.minimoAlunosTurma ? box : null,
          aluno: alunoValor
        };
      }),
      fmt: f1, rotuloValor: 'turma',
      refLine: REF != null ? { valor: REF, rotulo: CFG.rotuloReferencia } : null,
      aria: 'Distribuição das notas da turma por disciplina com destaque para a nota do aluno',
      tooltip: function (g) {
        var linhas = [];
        if (g.box) {
          linhas.push({ rotulo: 'Máximo', valor: f1(g.box.max) });
          linhas.push({ rotulo: '75%', valor: f1(g.box.q3) });
          linhas.push({ rotulo: 'Mediana da turma', valor: f1(g.box.mediana) });
          linhas.push({ rotulo: '25%', valor: f1(g.box.q1) });
          linhas.push({ rotulo: 'Mínimo', valor: f1(g.box.min) });
        } else {
          linhas.push({ rotulo: 'Turma', valor: 'dados insuficientes' });
        }
        if (g.aluno != null) linhas.push({ rotulo: '<b>Aluno</b>', valor: '<b>' + f1(g.aluno) + '</b>' });
        return Ch.tipHTML(esc(g.rotulo), 'Distribuição da turma · ' + (biFoco ? rbc(biFoco) : 'ano'), linhas);
      }
    });
    return el;
  }

  /* --------------------------------------------------------------------------
     8) Mapa de desempenho (heatmap)
     -------------------------------------------------------------------------- */
  function mapa(ctx) {
    var sd = ctx.sd;
    var sec = C.secao('mapa', 'Mapa de desempenho',
      'Notas do aluno por disciplina e bimestre. O número em cada célula é a nota; a cor ajuda a localizar padrões, mas a leitura não depende dela.',
      { ajuda: 'Linhas = disciplinas; colunas = bimestres. O número é a nota do aluno no período e a cor é só uma pista visual. A última coluna traz a média do ano da disciplina e a última linha, a média do aluno em cada bimestre.' });
    var el = sec.el;
    if (!sd.numericas.length || !sd.bimestres.length) { sec.body.appendChild(C.vazio('Sem notas para exibir.')); return el; }

    var cols = sd.bimestres;
    var rows = sd.numericas;
    if (ctx.filtros.disciplina) {
      var f = rows.filter(function (m) { return A.norm(m.nome) === A.norm(ctx.filtros.disciplina); });
      if (f.length) rows = f;
    }

    var rodapeLinha = {}, rodapeColuna = [];
    rows.forEach(function (m) { rodapeLinha[m.nome] = f1(m.media); });
    cols.forEach(function (bi) {
      var p = sd.mediaPorBimestre.filter(function (x) { return x.bimestre === bi; })[0];
      rodapeColuna.push(p ? f1(p.media) : '—');
    });

    var host = document.createElement('div');
    if (ctx.meeting) {
      var painel = document.createElement('div');
      painel.className = 'meeting-map-layout';
      var mapaNotas = document.createElement('div');
      mapaNotas.className = 'meeting-map-notes';
      mapaNotas.appendChild(host);
      painel.appendChild(mapaNotas);
      var graficoPadroes = padroes(ctx);
      graficoPadroes.classList.add('meeting-patterns');
      painel.appendChild(graficoPadroes);
      sec.body.appendChild(painel);
    } else {
      sec.body.appendChild(host);
    }
    Ch.heatmap(host, {
      colunas: cols.map(rbc), linhas: rows.map(function (m) {
        return {
          id: m.nome, rotulo: m.rotulo,
          celulas: cols.map(function (bi) {
            var s = m.serie.filter(function (x) { return x.bimestre === bi; })[0];
            var v = s ? s.nota : null;
            return { valor: v, display: v == null ? '–' : f1(v), _s: s, _bi: bi, _m: m };
          })
        };
      }),
      escala: 'nota', rotuloRodape: 'Média',
      rodapeLinha: rodapeLinha, rodapeColuna: rodapeColuna,
      aria: 'Mapa de notas por disciplina e bimestre',
      legenda: [
        { cor: Ch.notaColor(4), rotulo: '4' }, { cor: Ch.notaColor(5.5), rotulo: '5,5' },
        { cor: Ch.notaColor(7), rotulo: '7' }, { cor: Ch.notaColor(8.5), rotulo: '8,5' },
        { cor: Ch.notaColor(10), rotulo: '10' }
      ],
      tooltip: function (c) {
        if (!c._s || c.valor == null) return Ch.tipHTML(esc(c._m.rotulo), rb(c._bi), [{ rotulo: 'Nota', valor: 'não registrada' }]);
        var s = c._s;
        var linhas = [
          { rotulo: 'Nota do bimestre', valor: f1(s.nota) },
          { rotulo: 'NB (nota bimestral)', valor: f1(s.nb) }
        ];
        if (s.recuperacao != null) linhas.push({ rotulo: 'Recuperação', valor: f1(s.recuperacao) });
        if (s.mb != null) linhas.push({ rotulo: 'MB (média bimestral)', valor: f1(s.mb) });
        else if (s.nb != null) linhas.push({ rotulo: 'MB', valor: 'não registrada no boletim' });
        if (s.fa != null) linhas.push({ rotulo: 'Faltas no bimestre', valor: f1(s.fa) });
        var b = medianaClasse(ctx.classData, c._m.nome, c._bi);
        if (b) linhas.push({ rotulo: 'Mediana da turma', valor: f1(b.mediana) });
        return Ch.tipHTML(esc(c._m.rotulo), rb(c._bi), linhas);
      }
    });
    return el;
  }

  /* --------------------------------------------------------------------------
     9) Variação entre bimestres (delta heatmap)
     -------------------------------------------------------------------------- */
  function variacao(ctx) {
    var sd = ctx.sd;
    var sec = C.secao('variacao', 'Variação entre bimestres',
      'Quanto a nota mudou de um bimestre para o seguinte (diferença em pontos). Verde indica avanço, terracota indica queda; o sinal (+/−) está sempre visível no número.',
      { ajuda: 'Cada célula é a diferença, em pontos, entre dois bimestres consecutivos da mesma disciplina. Sinal + é avanço e − é queda; a intensidade da cor acompanha o tamanho da mudança. A última coluna é a variação média da disciplina no ano.' });
    var el = sec.el;
    var bimestres = sd.bimestres;
    if (bimestres.length < 2 || !sd.numericas.length) { sec.body.appendChild(C.vazio('São necessários pelo menos dois bimestres com notas.')); return el; }

    var pares = [];
    for (var i = 1; i < bimestres.length; i++) pares.push([bimestres[i - 1], bimestres[i]]);
    var rows = sd.numericas;
    if (ctx.filtros.disciplina) {
      var f = rows.filter(function (m) { return A.norm(m.nome) === A.norm(ctx.filtros.disciplina); });
      if (f.length) rows = f;
    }

    var rodapeLinha = {}, rodapeColuna = [];
    rows.forEach(function (m) {
      var vs = m.deltas.map(function (d) { return d.valor; });
      rodapeLinha[m.nome] = vs.length ? fs(A.Stats.round2(A.Stats.mean(vs))) : '—';
    });
    pares.forEach(function (p) {
      var vs = [];
      rows.forEach(function (m) {
        var d = m.deltas.filter(function (x) { return x.de === p[0] && x.para === p[1]; })[0];
        if (d) vs.push(d.valor);
      });
      rodapeColuna.push(vs.length ? fs(A.Stats.round2(A.Stats.mean(vs))) : '—');
    });

    var host = document.createElement('div');
    sec.body.appendChild(host);
    Ch.heatmap(host, {
      colunas: pares.map(function (p) { return rbc(p[0]) + ' → ' + rbc(p[1]); }),
      linhas: rows.map(function (m) {
        return {
          id: m.nome, rotulo: m.rotulo,
          celulas: pares.map(function (p) {
            var d = m.deltas.filter(function (x) { return x.de === p[0] && x.para === p[1]; })[0];
            return { valor: d ? d.valor : null, display: d ? fs(d.valor) : '–', _d: d, _m: m, _p: p };
          })
        };
      }),
      escala: 'delta', rotuloRodape: 'Média',
      rodapeLinha: rodapeLinha, rodapeColuna: rodapeColuna,
      aria: 'Mapa de variação de notas entre bimestres',
      tooltip: function (c) {
        var linhas = [];
        if (c._d) {
          linhas.push({ rotulo: rbc(c._p[0]) + ' · nota', valor: f1(notaBi(c._m, c._p[0])) });
          linhas.push({ rotulo: rbc(c._p[1]) + ' · nota', valor: f1(notaBi(c._m, c._p[1])) });
          linhas.push({ rotulo: 'Variação', valor: fs(c._d.valor) });
        } else {
          linhas.push({ rotulo: 'Comparação', valor: 'não há notas nos dois períodos' });
        }
        return Ch.tipHTML(esc(c._m.rotulo), rbc(c._p[0]) + ' → ' + rbc(c._p[1]), linhas);
      }
    });
    return el;
  }

  /* --------------------------------------------------------------------------
     10) Consistência
     -------------------------------------------------------------------------- */
  function consistencia(ctx) {
    var sd = ctx.sd;
    var sec = C.secao('consistencia', 'Consistência',
      'Faixa de variação das notas em cada disciplina (do menor ao maior valor registrado). Categorias calculadas por desvio-padrão, com limites configuráveis.',
      { ajuda: 'Cada linha é uma disciplina e cada círculo é a nota de um bimestre. A barra clara vai da menor à maior nota registrada. À direita, a classificação da oscilação: muito estável, estável, oscilação moderada ou alta oscilação (calculada pelo desvio-padrão).' });
    var el = sec.el;
    var comDP = sd.numericas.filter(function (m) { return m.dp != null; });
    if (!comDP.length) { sec.body.appendChild(C.vazio('São necessários pelo menos dois bimestres com nota.')); return el; }

    var itens = comDP.slice().sort(function (a, b) { return b.dp - a.dp; });
    var host = document.createElement('div');
    sec.body.appendChild(host);
    Ch.rangeBars(host, {
      itens: itens.map(function (m) {
        return {
          id: m.nome, rotulo: m.rotulo, cor: '#2e5aa8',
          pontos: m.serie.map(function (s) { return { bimestre: s.bimestre, nota: s.nota }; }),
          min: m.minimo, max: m.maximo, extra: A.Insights.rotuloOscilacao(m.oscilacao)
        };
      }),
      refLine: REF != null ? { valor: REF, rotulo: 'referência' } : null,
      aria: 'Faixa de variação das notas por disciplina',
      tooltip: function (it) {
        var m = comDP.filter(function (x) { return x.nome === it.id; })[0];
        return Ch.tipHTML(esc(m.rotulo), A.Insights.rotuloOscilacao(m.oscilacao), [
          { rotulo: 'Desvio-padrão', valor: f1(m.dp) },
          { rotulo: 'Faixa', valor: f1(m.minimo) + ' – ' + f1(m.maximo) },
          { rotulo: 'Média da disciplina', valor: f1(m.media) },
          { rotulo: 'Bimestres com nota', valor: String(m.n) }
        ]);
      }
    });
    var obs = document.createElement('p');
    obs.className = 'hint';
    obs.textContent = 'Categorias: até ' + String(LIM.oscilacaoMuitoEstavelDP).replace('.', ',') + ' (muito estável) · até ' + String(LIM.oscilacaoEstavelDP).replace('.', ',') + ' (estável) · até ' + String(LIM.altaOscilacaoDP).replace('.', ',') + ' (oscilação moderada) · acima disso (alta oscilação). Ordens decrescentes ajudam a localizar onde a oscilação é maior.';
    sec.body.appendChild(obs);
    return el;
  }

  /* --------------------------------------------------------------------------
     11) Recuperação
     -------------------------------------------------------------------------- */
  function recuperacao(ctx) {
    var sd = ctx.sd;
    var sec = C.secao('recuperacao', 'Impacto da recuperação',
      'Nota antes da recuperação (NB), resultado da recuperação (R) e média final registrada (MB). Leitura descritiva: o painel não julga se recuperar é positivo ou negativo.',
      { ajuda: 'NB é a nota antes da recuperação, R é o resultado da recuperação e MB é a média final registrada no boletim. As linhas ligam os três momentos de cada evento; o ganho é MB − NB. A linha tracejada é a referência da escola.' });
    var el = sec.el;
    if (!sd.recuperacoes.length) {
      sec.body.appendChild(C.vazio('Nenhum evento de recuperação registrado no período.'));
      sec.body.appendChild(C.aviso('A ausência de recuperação indica apenas que nenhuma nota de recuperação foi registrada no boletim.'));
      return el;
    }

    var comGanho = sd.recuperacoes.filter(function (r) { return r.ganho != null; });
    var ganhos = comGanho.map(function (r) { return r.ganho; });
    var acimaRefDepois = sd.recuperacoes.filter(function (r) { return REF != null && r.mb != null && r.mb >= REF; });
    var abaixoRefAntes = sd.recuperacoes.filter(function (r) { return REF != null && r.nb != null && r.nb < REF; });

    var cards = document.createElement('div');
    cards.className = 'stats-row';
    [
      { rotulo: 'Eventos de recuperação', valor: String(sd.recuperacoes.length) },
      { rotulo: 'Disciplinas envolvidas', valor: String(unique(sd.recuperacoes.map(function (r) { return r.materia; })).length) },
      { rotulo: 'Ganho médio após recuperação', valor: ganhos.length ? fs(A.Stats.round2(A.Stats.mean(ganhos))) : '—' },
      { rotulo: 'Ficaram na referência ou acima', valor: acimaRefDepois.length + ' de ' + sd.recuperacoes.length }
    ].forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = '<span class="stat-label">' + esc(c.rotulo) + '</span><span class="stat-value">' + esc(c.valor) + '</span>';
      cards.appendChild(d);
    });
    sec.body.appendChild(cards);

    var host = document.createElement('div');
    sec.body.appendChild(host);
    var cores = mapaCores(sd);
    Ch.slope(host, {
      altura: h(300, ctx),
      eventos: sd.recuperacoes.map(function (r) {
        return { id: r.materia, rotulo: r.rotulo + ' (' + rbc(r.bimestre) + ')', nb: r.nb, recuperacao: r.recuperacao, mb: r.mb, ganho: r.ganho, cor: cores[r.materia] };
      }),
      pontos: ['Antes (NB)', 'Recuperação (R)', 'Média final (MB)'],
      refLine: REF != null ? { valor: REF, rotulo: 'referência' } : null,
      fmt: f1, aria: 'Comparação entre nota antes da recuperação, recuperação e média final',
      tooltip: function (ev) {
        var linhas = [
          { rotulo: 'Antes (NB)', valor: f1(ev.nb) },
          { rotulo: 'Recuperação (R)', valor: f1(ev.recuperacao) },
          { rotulo: 'Média final (MB)', valor: f1(ev.mb) }
        ];
        if (ev.ganho != null) linhas.push({ rotulo: 'Ganho (MB − NB)', valor: fs(ev.ganho) });
        if (REF != null) linhas.push({ rotulo: 'Referência', valor: f1(REF) + (ev.mb != null ? (ev.mb >= REF ? ' · média final atingiu' : ' · média final não atingiu') : '') });
        return Ch.tipHTML(esc(ev.rotulo), null, linhas);
      }
    });
    var obs = document.createElement('p');
    obs.className = 'hint';
    obs.textContent = abaixoRefAntes.length + ' de ' + sd.recuperacoes.length + ' eventos ocorreram com nota anterior abaixo da referência (' + f1(REF) + ').';
    sec.body.appendChild(obs);
    return el;
  }

  function unique(a) { var o = {}; a.forEach(function (x) { o[x] = 1; }); return Object.keys(o); }

  /* --------------------------------------------------------------------------
     12) Áreas curriculares
     -------------------------------------------------------------------------- */
  function areas(ctx) {
    var sd = ctx.sd, cd = ctx.classData;
    var biFoco = ctx.filtros.bimestre ? Number(ctx.filtros.bimestre) : null;
    var sec = C.secao('areas', 'Desempenho por área',
      'Média das disciplinas de cada área' + (biFoco ? ' no ' + rb(biFoco) : '') + ', comparada com a mediana da turma na mesma área.',
      { ajuda: 'A média da área é a média das disciplinas que a compõem. A marca vertical em cada barra é a mediana da turma na mesma área. O segundo gráfico mostra como a média de cada área evoluiu bimestre a bimestre.' });
    var el = sec.el;

    var av = A.Insights.areaAverages(sd, biFoco).filter(function (a) { return a.media != null; });
    if (!av.length) { sec.body.appendChild(C.vazio('Sem dados por área.')); return el; }

    var med = A.Store.classAreaMedians(sd, biFoco);
    var hostBars = document.createElement('div');
    sec.body.appendChild(hostBars);
    Ch.hBars(hostBars, {
      itens: av.map(function (a, i) {
        return { id: a.nome, rotulo: a.nome, valor: a.media, cor: Ch.paletteCategoria(i), mediana: med[a.nome] ? med[a.nome].mediana : null };
      }),
      max: 10, fmt: f1, refLine: REF != null ? { valor: REF, rotulo: 'referência' } : null,
      aria: 'Média por área curricular com mediana da turma',
      tooltip: function (it) {
        var a = av.filter(function (x) { return x.nome === it.id; })[0];
        var linhas = [{ rotulo: biFoco ? 'Média no período' : 'Média no ano', valor: f1(a.media) }, { rotulo: 'Disciplinas na área', valor: String(a.disciplinas) }];
        if (med[it.id]) linhas.push({ rotulo: 'Mediana da turma', valor: f1(med[it.id].mediana) + ' <span class="tt-mini">(' + med[it.id].n + ' alunos)</span>' });
        return Ch.tipHTML(esc(it.rotulo), null, linhas);
      }
    });

    var hostLine = document.createElement('div');
    hostLine.className = 'chart-host';
    sec.body.appendChild(hostLine);
    var cores = ['#2e5aa8', '#2f8f5b', '#b7791f', '#7c4dbc', '#c05746'];
    Ch.lineChart(hostLine, {
      altura: h(230, ctx),
      series: av.map(function (a, i) {
        return { id: a.nome, nome: a.nome, cor: cores[i % cores.length], destaque: true, valores: sd.bimestres.map(function (bi) { var p = a.mediasBimestre.filter(function (x) { return x.bimestre === bi; })[0]; return p ? p.media : null; }) };
      }),
      xLabels: sd.bimestres.map(rbc),
      refLine: REF != null ? { valor: REF, rotulo: 'referência' } : null,
      tooltip: function (idx) { var bi = sd.bimestres[idx]; return Ch.tipHTML(esc(rb(bi)), 'Média por área', av.map(function (a) { var p = a.mediasBimestre.filter(function (x) { return x.bimestre === bi; })[0]; return { rotulo: esc(a.nome), valor: p ? f1(p.media) : '—' }; })); },
      aria: 'Evolução da média por área curricular'
    });
    return el;
  }

  /* --------------------------------------------------------------------------
     13) Small multiples
     -------------------------------------------------------------------------- */
  function smallMultiples(ctx) {
    var sd = ctx.sd;
    var sec = C.secao('pequenos', 'Todas as disciplinas em miniaturas',
      'Mesmo eixo (0 a 10) em cada miniatura. Ajuda a ver rapidamente crescimento, queda, estabilidade e oscilação.',
      { ajuda: 'Cada miniatura é uma disciplina na mesma escala de 0 a 10, para comparar os formatos de trajetória. A linha tracejada é a referência da escola; a seta mostra a variação total e o texto abaixo, a oscilação entre bimestres.' });
    var el = sec.el;
    if (!sd.numericas.length) { sec.body.appendChild(C.vazio('Sem notas.')); return el; }

    var grid = document.createElement('div');
    grid.className = 'mini-grid';
    sec.body.appendChild(grid);

    var materias = sd.numericas;
    if (ctx.filtros.disciplina) {
      var f = materias.filter(function (m) { return A.norm(m.nome) === A.norm(ctx.filtros.disciplina); });
      if (f.length) materias = f;
    }

    materias.forEach(function (m) {
      var card = document.createElement('div');
      card.className = 'mini-card';
      var head = document.createElement('div');
      head.className = 'mini-head';
      head.innerHTML = '<span class="mini-title">' + esc(m.rotulo) + '</span><span class="mini-media">' + f1(m.media) + '</span>';
      card.appendChild(head);

      var deltaEl = document.createElement('div');
      deltaEl.className = 'mini-delta';
      if (m.variacaoTotal != null) deltaEl.appendChild(C.pillDelta(m.variacaoTotal, { limiar: LIM.estavelVariacao }));
      else deltaEl.innerHTML = '<span class="hint">período único</span>';
      card.appendChild(deltaEl);

      var host = document.createElement('div');
      host.className = 'mini-chart';
      card.appendChild(host);
      grid.appendChild(card);
      Ch.miniLine(host, {
        valores: m.serie.map(function (s) { return s.nota; }),
        cor: m.tendencia === 'up' ? '#2f8f5b' : m.tendencia === 'down' ? '#c05746' : '#2e5aa8',
        linhaReferencia: REF, dominio: [0, 10]
      });
      var sub = document.createElement('div');
      sub.className = 'mini-sub';
      sub.textContent = A.Insights.rotuloOscilacao(m.oscilacao);
      card.appendChild(sub);
    });
    return el;
  }

  /* --------------------------------------------------------------------------
     14) Explorar padrões (scatter)
     -------------------------------------------------------------------------- */
  function padroes(ctx) {
    var sd = ctx.sd;
    var sec = C.secao('padroes', 'Explorar padrões',
      ctx.meeting ? 'Cada ponto cruza a média da disciplina com sua oscilação entre bimestres.' :
        'Cada ponto é uma disciplina: posição horizontal = média; vertical = oscilação entre bimestres. As quatro regiões são apenas descritivas — nenhuma é automaticamente boa ou ruim.',
      { ajuda: 'Quanto mais à direita o ponto, maior a média da disciplina; quanto mais acima, maior a oscilação entre bimestres. As linhas tracejadas marcam a média geral do aluno e a oscilação média. Os quatro quadrantes são apenas descritivos: nenhum é automaticamente bom ou ruim.' });
    var el = sec.el;
    var pts = sd.numericas.filter(function (m) { return m.media != null && m.dp != null; });
    if (pts.length < 2) { sec.body.appendChild(C.vazio('São necessárias pelo menos duas disciplinas com dois períodos de nota.')); return el; }

    var dps = pts.map(function (m) { return m.dp; });
    var mediaDP = A.Stats.round2(A.Stats.mean(dps));
    var cores = mapaCores(sd);

    var host = document.createElement('div');
    sec.body.appendChild(host);
    Ch.scatter(host, {
      altura: ctx.meeting ? 330 : 340,
      hideLabelsBelow: ctx.meeting ? 420 : 0,
      pontos: pts.map(function (m) {
        return { id: m.nome, rotulo: m.apelido, x: m.media, y: m.dp, cor: cores[m.nome], destaque: ctx.filtros.disciplina && A.norm(m.nome) === A.norm(ctx.filtros.disciplina) };
      }),
      xDiv: sd.mediaGeral, xDivRotulo: 'média geral do aluno (' + f1(sd.mediaGeral) + ')',
      yDiv: mediaDP, yDivRotulo: 'oscilação média (' + f1(mediaDP) + ')',
      xDomain: [Math.max(0, Math.floor(A.Stats.min(pts.map(function (m) { return m.media; })) - 1)), Math.min(10, Math.ceil(A.Stats.max(pts.map(function (m) { return m.media; })) + 1))],
      yDomain: [0, Math.max(0.5, Math.ceil(A.Stats.max(dps) + 0.5))],
      xLabel: 'Média da disciplina', yLabel: 'Oscilação (desvio-padrão)',
      fmtX: f1, fmtY: f1,
      aria: 'Dispersão entre média e oscilação por disciplina',
      tooltip: function (p) {
        var m = pts.filter(function (x) { return x.nome === p.id; })[0];
        return Ch.tipHTML(esc(m.rotulo), A.Insights.rotuloOscilacao(m.oscilacao), [
          { rotulo: 'Média', valor: f1(m.media) },
          { rotulo: 'Desvio-padrão', valor: f1(m.dp) },
          { rotulo: 'Faixa', valor: f1(m.minimo) + ' – ' + f1(m.maximo) },
          { rotulo: 'Períodos com nota', valor: String(m.n) }
        ]);
      }
    });
    var legenda = document.createElement('div');
    legenda.className = 'quadrantes';
    legenda.innerHTML = '<span><b>Acima da média do aluno · mais estável</b></span><span><b>Acima da média do aluno · mais oscilante</b></span>' +
      '<span><b>Abaixo da média do aluno · mais estável</b></span><span><b>Abaixo da média do aluno · mais oscilante</b></span>';
    sec.body.appendChild(legenda);
    if (ctx.meeting) {
      var pontosLegenda = document.createElement('div');
      pontosLegenda.className = 'pattern-point-key';
      pts.forEach(function (m) {
        var item = document.createElement('span');
        item.innerHTML = '<i style="background:' + cores[m.nome] + '"></i>' + esc(m.rotulo);
        pontosLegenda.appendChild(item);
      });
      sec.body.appendChild(pontosLegenda);
    }
    return el;
  }

  /* --------------------------------------------------------------------------
     15) Próximos pontos para acompanhar
     -------------------------------------------------------------------------- */
  function proximos(ctx) {
    var sec = C.secao('proximos', 'Próximos pontos para acompanhar',
      'Pontos de observação derivados dos padrões nos dados. São sugestões para acompanhamento, não intervenções.',
      { ajuda: 'A lista reúne os sinais detectados pelos critérios fixos do painel: quedas recentes, notas abaixo da própria média, oscilações altas e recuperações. Servem para orientar a conversa e o olhar do professor, não são prescrições nem julgamentos.' });
    var itens = A.Insights.monitoring(ctx.sd);
    if (!itens.length) {
      sec.body.appendChild(C.vazio('Nenhum ponto crítico detectado pelos critérios atuais.'));
      return sec.el;
    }
    var ul = document.createElement('ul');
    ul.className = 'monitor-list';
    itens.forEach(function (it) {
      var li = document.createElement('li');
      li.innerHTML = C.icone('alvo') + '<span>' + esc(it.texto) + '</span>';
      ul.appendChild(li);
    });
    sec.body.appendChild(ul);
    var av = document.createElement('p');
    av.className = 'aviso';
    av.textContent = 'Estes pontos apenas orientam o que observar no próximo período com base nos registros atuais.';
    sec.body.appendChild(av);
    return sec.el;
  }

  /* --------------------------------------------------------------------------
     17) Dados detalhados
     -------------------------------------------------------------------------- */
  function detalhados(ctx) {
    var sd = ctx.sd;
    var wrap = document.createElement('details');
    wrap.className = 'card details';
    wrap.id = 'detalhados';
    var sum = document.createElement('summary');
    sum.textContent = 'Ver dados detalhados (tabela do boletim)';
    sum.appendChild(C.ajuda('Tabela com todos os registros do boletim (NB, recuperação, MB, nota, faltas e página de origem) por disciplina e bimestre. Campos vazios aparecem como "—" e nunca foram tratados como zero.'));
    wrap.appendChild(sum);
    var body = document.createElement('div');
    body.className = 'card-body';
    wrap.appendChild(body);

    if (!sd.materias.length) { body.appendChild(C.vazio('Nenhum registro para este aluno.')); return wrap; }

    var table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<caption class="visually-hidden">Notas e faltas por disciplina e bimestre</caption>' +
      '<thead><tr><th scope="col">Disciplina</th><th scope="col">Bimestre</th><th scope="col">NB</th><th scope="col">Recuperação</th><th scope="col">MB</th><th scope="col">Nota</th><th scope="col">Faltas</th><th scope="col">Fonte</th></tr></thead>';
    var tbody = document.createElement('tbody');
    sd.materias.forEach(function (m) {
      m.serie.forEach(function (s) {
        var rec = sd.aluno.recs.filter(function (r) { return r.materia === m.nome && r.bimestre === s.bimestre; })[0];
        var tr = document.createElement('tr');
        [m.rotulo, rb(s.bimestre), f1(s.nb), f1(s.recuperacao), f1(s.mb), f1(s.nota), f1(s.fa), rec ? rec.fonte_pagina : '—'].forEach(function (v, i) {
          var td = document.createElement('td');
          td.textContent = v;
          if (i < 2) td.className = 'strong';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    });
    table.appendChild(tbody);
    body.appendChild(table);
    var fonte = document.createElement('p');
    fonte.className = 'hint';
    fonte.textContent = 'Fonte: boletim escolar (PDF) — registros copiados sem alteração. Campos vazios são exibidos como "—" e nunca foram tratados como zero.';
    body.appendChild(fonte);
    return wrap;
  }

  /* ==========================================================================
     MODO TURMA / COORTE
     ========================================================================== */
  /* recorte dos filtros aplicado ao modo turma */
  function recorte(ctx) {
    var r = {
      materia: ctx.filtros.disciplina || null,
      bimestre: ctx.filtros.bimestre ? Number(ctx.filtros.bimestre) : null
    };
    r.exibicao = r.materia;
    if (r.materia) {
      var info = A.Store.opcoes({}).materias.filter(function (m) { return A.norm(m.nome) === A.norm(r.materia); })[0];
      if (info) r.exibicao = info.rotulo;
    }
    var partes = [];
    if (r.exibicao) partes.push(r.exibicao);
    if (r.bimestre) partes.push(rb(r.bimestre).toLowerCase());
    r.rotulo = partes.join(' · ');
    r.medida = r.exibicao ? 'média de ' + r.exibicao : 'média geral';
    r.periodo = r.bimestre ? ' no ' + rb(r.bimestre) : ' no ano';
    return r;
  }

  function cohortResumo(ctx) {
    var rc = recorte(ctx);
    var coorte = A.Store.cohort(ctx.scope, { materia: rc.materia, bimestre: rc.bimestre });
    var el = document.createElement('section');
    el.className = 'kpi-colors';
    el.id = 'coorte-resumo';

    var cores = [Ch.COR.verde, Ch.COR.ambar, Ch.COR.azul, Ch.COR.coral, '#9b6ede', '#2ab7ca'];
    var todasMedias = [], frs = [], recTotal = 0;
    coorte.forEach(function (c) {
      todasMedias = todasMedias.concat(c.valores);
      c.alunosComNota.forEach(function (sd) { if (sd.frequenciaMedia != null) frs.push(sd.frequenciaMedia); });
      recTotal += c.recuperacoes;
    });
    var ref = REF;
    var mediaGeral = todasMedias.length ? A.Stats.round2(A.Stats.median(todasMedias)) : null;
    var tituloMediana = rc.exibicao ? 'mediana de ' + esc(rc.exibicao) : 'mediana geral do recorte';

    /* cartão branco de síntese */
    var resumo = document.createElement('div');
    resumo.className = 'kpi branco';
    resumo.setAttribute('data-tip', 'Frequência: valor acumulado no boletim, em todas as disciplinas. Notas e recuperações: recorte atual. Mediana da ' + rc.medida + rc.periodo +
      ', frequência média e total de recuperações.' + (rc.rotulo ? ' Recorte aplicado: ' + rc.rotulo + '.' : ''));
    resumo.tabIndex = 0;
    resumo.innerHTML = '<span class="kpi-eyebrow">Recorte</span>' +
      '<span class="kpi-valor escuro">' + f1(mediaGeral) + '</span>' +
      '<span class="kpi-rotulo escuro">' + tituloMediana + ' <span class="card-help" aria-hidden="true">?</span></span>' +
      '<span class="kpi-sub escuro">' + todasMedias.length + ' alunos com nota' + (rc.rotulo ? ' · ' + esc(rc.rotulo) : '') + ' · ' +
      (frs.length ? pct(A.Stats.round2(A.Stats.mean(frs))) + ' de frequência no boletim' : 'sem frequência registrada') +
      ' · ' + recTotal + ' recuperações</span>';
    el.appendChild(resumo);

    coorte.forEach(function (c, i) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'kpi accent';
      card.style.background = cores[i % cores.length];
      card.setAttribute('data-tip', 'Mediana da ' + rc.medida + rc.periodo + ' na turma, frequência média registrada e recuperações.' +
        (rc.rotulo ? ' Recorte: ' + rc.rotulo + '.' : '') + ' Toque para filtrar esta turma.');
      var abaixo = ref != null && c.medianaMedia != null && c.medianaMedia < ref;
      var situacao = c.medianaMedia == null ? 'Sem notas no recorte' : ref == null ? 'Mediana da turma' : abaixo ? 'Abaixo da referência' : 'Na referência ou acima';
      card.innerHTML = '<span class="kpi-turma-badge" aria-hidden="true">' + esc(c.turma) + '</span>' +
        '<span class="kpi-help-canto card-help" aria-hidden="true">?</span>' +
        '<span class="kpi-valor">' + (c.medianaMedia == null ? '—' : f1(c.medianaMedia)) + '</span>' +
        '<span class="kpi-rotulo">' + situacao + '</span>' +
        '<span class="kpi-sub">' + c.nComNota + ' de ' + c.nAlunos + ' alunos com nota' +
        (c.frequenciaMedia != null ? ' · frequência no boletim ' + pct(c.frequenciaMedia) : '') + '</span>' +
        '<span class="kpi-lista">' + c.recuperacoes + ' recuperações' + (c.faixa != null ? ' · faixa ' + f1(c.faixa) : '') + '</span>';
      card.addEventListener('click', function () {
        var sel = document.getElementById('f-turma');
        if (sel) { sel.value = c.turma; sel.dispatchEvent(new Event('change')); }
      });
      card.setAttribute('aria-label', 'Turma ' + c.turma + ', mediana ' + f1(c.medianaMedia) + ', ' + situacao + '. Filtrar esta turma.');
      el.appendChild(card);
    });
    return el;
  }

  function cohortTabela(ctx) {
    var rc = recorte(ctx);
    var coorte = A.Store.cohort(ctx.scope, { materia: rc.materia, bimestre: rc.bimestre });
    var evo = A.Store.cohortEvolution(ctx.scope, { materia: rc.materia, bimestre: rc.bimestre });
    var sec = C.secao('coorte-tabela', 'Visão por turma',
      'Resumo comparativo das turmas' + (rc.rotulo ? ' no recorte ' + rc.rotulo : '') + '. Nenhum aluno é identificado. Toque em uma linha para filtrar a turma.',
      { ajuda: 'Compara as turmas do recorte atual: mediana da ' + rc.medida + rc.periodo + ', frequência, recuperações e a mediana por bimestre (ou do bimestre em foco). Toque em uma linha para filtrar a turma.' });
    var el = sec.el;
    if (!coorte.length) { sec.body.appendChild(C.vazio('Sem dados.')); return el; }

    var wrap = document.createElement('div');
    wrap.className = 'tabela-wrap';
    var table = document.createElement('table');
    table.className = 'tabela-disciplinas';
    table.innerHTML = '<caption class="visually-hidden">Comparação entre turmas</caption>' +
      '<thead><tr><th scope="col">Turma</th><th scope="col">Alunos com nota</th><th scope="col">Mediana ' + esc(rc.exibicao ? 'de ' + rc.exibicao : 'geral') + '</th>' +
      '<th scope="col">Frequência no boletim</th><th scope="col">Recuperações</th><th scope="col">' + (rc.bimestre ? 'Mediana no ' + esc(rbc(rc.bimestre)) : 'Mediana por bimestre') + '</th></tr></thead>';
    var tbody = document.createElement('tbody');

    coorte.forEach(function (c) {
      var tr = document.createElement('tr');
      var abaixo = REF != null && c.medianaMedia != null && c.medianaMedia < REF;
      var perto = REF != null && c.medianaMedia != null && c.medianaMedia >= REF && c.medianaMedia < REF + 0.5;
      tr.className = 'linha ' + (abaixo ? 'baixo' : perto ? 'perto' : 'acima');
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', 'Filtrar a turma ' + c.turma);

      var td1 = document.createElement('td');
      td1.className = 'cel-disciplina';
      td1.appendChild(C.avatar('Turma ' + c.turma, '#dfe7f2', 'media'));
      var nome = document.createElement('div');
      nome.innerHTML = '<b>Turma ' + esc(c.turma) + '</b><span>' + c.nAlunos + ' alunos</span>';
      td1.appendChild(nome);
      tr.appendChild(td1);

      var td2 = document.createElement('td');
      td2.innerHTML = '<b>' + c.nComNota + '</b> <span class="hint">alunos</span>';
      tr.appendChild(td2);

      var td3 = document.createElement('td');
      td3.className = 'cel-media';
      var pctBar = Math.max(3, Math.round((c.medianaMedia || 0) / 10 * 100));
      td3.innerHTML = '<b>' + f1(c.medianaMedia) + '</b><span class="barra-media"><i style="width:' + pctBar + '%;background:' +
        (abaixo ? Ch.COR.coral : perto ? Ch.COR.ambar : Ch.COR.verde) + '"></i></span>';
      tr.appendChild(td3);

      var td4 = document.createElement('td');
      td4.textContent = c.frequenciaMedia != null ? pct(c.frequenciaMedia) : '—';
      tr.appendChild(td4);

      var td5 = document.createElement('td');
      td5.textContent = String(c.recuperacoes);
      tr.appendChild(td5);

      var td6 = document.createElement('td');
      td6.className = 'cel-bimestres';
      var serie = (evo.series.filter(function (s) { return s.turma === c.turma; })[0] || { serie: [] }).serie;
      serie.forEach(function (p) {
        var s = document.createElement('span');
        s.className = 'pill-nota' + (p.media == null ? ' vazia' : '');
        s.style.background = Ch.notaColor(p.media);
        s.textContent = p.media == null ? '–' : f1(p.media);
        s.setAttribute('data-tip', rbc(p.bimestre) + ' · mediana ' + (p.media == null ? 'sem dados' : f1(p.media)) + ' (' + p.n + ' alunos)');
        s.tabIndex = 0;
        td6.appendChild(s);
      });
      tr.appendChild(td6);

      function filtrar() {
        var sel = document.getElementById('f-turma');
        if (sel) { sel.value = c.turma; sel.dispatchEvent(new Event('change')); }
      }
      tr.addEventListener('click', filtrar);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); filtrar(); } });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    sec.body.appendChild(wrap);
    return el;
  }

  function cohortMediana(ctx) {
    var bimestre = ctx.filtros.bimestre ? Number(ctx.filtros.bimestre) : null;
    var data = A.Store.cohortSubjectMedians(ctx.scope, bimestre);
    var sec = C.secao('coorte-mediana', 'Mediana por disciplina e turma',
      'Mediana das médias dos alunos de cada turma' + (bimestre ? ' no ' + rb(bimestre) : ' no ano') + '. Nenhum aluno é identificado.',
      { ajuda: 'Cada célula é a mediana dos alunos daquela turma naquela disciplina: o valor típico do grupo, com metade acima e metade abaixo. A coluna final é a média das medianas das turmas.' });
    var el = sec.el;
    if (!data.rows.length) { sec.body.appendChild(C.vazio('Sem dados.')); return el; }

    var rows = data.rows;
    if (ctx.filtros.disciplina) {
      var f = rows.filter(function (r) { return A.norm(r.materia) === A.norm(ctx.filtros.disciplina); });
      if (f.length) rows = f;
    }
    var rodapeLinha = {};
    rows.forEach(function (r) {
      var vs = r.valores.map(function (v) { return v.mediana; }).filter(function (v) { return v != null; });
      rodapeLinha[r.materia] = vs.length ? f1(A.Stats.round2(A.Stats.mean(vs))) : '—';
    });
    var host = document.createElement('div');
    sec.body.appendChild(host);
    Ch.heatmap(host, {
      colunas: data.turmas, linhas: rows.map(function (r) {
        return {
          id: r.materia, rotulo: r.rotulo,
          celulas: r.valores.map(function (v) { return { valor: v.mediana, display: v.mediana == null ? '–' : f1(v.mediana), _v: v, _r: r }; })
        };
      }),
      escala: 'nota', rotuloRodape: 'Média',
      rodapeLinha: rodapeLinha,
      aria: 'Mediana das notas por disciplina e turma',
      legenda: [{ cor: Ch.notaColor(4), rotulo: '4' }, { cor: Ch.notaColor(7), rotulo: '7' }, { cor: Ch.notaColor(10), rotulo: '10' }],
      tooltip: function (c) {
        return Ch.tipHTML(esc(c._r.rotulo), 'Turma ' + c._v.turma, [
          { rotulo: 'Mediana da turma', valor: c._v.mediana == null ? 'sem dados' : f1(c._v.mediana) },
          { rotulo: 'Alunos com nota', valor: String(c._v.n) }
        ]);
      }
    });
    return el;
  }

  function cohortEvolucao(ctx) {
    var rc = recorte(ctx);
    var data = A.Store.cohortEvolution(ctx.scope, { materia: rc.materia, bimestre: rc.bimestre });
    var sec = C.secao('coorte-evolucao', 'Evolução por turma',
      'Mediana da ' + rc.medida + ' dos alunos de cada turma' + (rc.bimestre ? ' no ' + rb(rc.bimestre) : ', por bimestre') + '.',
      { ajuda: rc.materia
        ? 'Para cada bimestre, mostra a mediana das notas de ' + rc.exibicao + ' na turma. A linha tracejada é a média de referência da escola.'
        : 'Para cada bimestre, mostra a mediana das médias dos alunos de cada turma. A linha tracejada é a média de referência da escola.' });
    var el = sec.el;
    if (!data.turmas.length) { sec.body.appendChild(C.vazio('Sem dados.')); return el; }
    var cores = ['#2e5aa8', '#2f8f5b', '#b7791f', '#7c4dbc', '#c05746', '#0e7490'];
    var host = document.createElement('div');
    host.className = 'chart-host';
    sec.body.appendChild(host);
    Ch.lineChart(host, {
      altura: h(280, ctx),
      series: data.series.map(function (s, i) {
        return { id: s.turma, nome: 'Turma ' + s.turma, cor: cores[i % cores.length], destaque: true, valores: s.serie.map(function (p) { return p.media; }) };
      }),
      xLabels: data.bimestres.map(rbc),
      refLine: REF != null ? { valor: REF, rotulo: CFG.rotuloReferencia } : null,
      tooltip: function (idx) {
        var bi = data.bimestres[idx];
        return Ch.tipHTML(esc(rb(bi)), 'Mediana por turma', data.series.map(function (s) {
          var p = s.serie.filter(function (x) { return x.bimestre === bi; })[0];
          return { rotulo: 'Turma ' + esc(s.turma), valor: p && p.media != null ? f1(p.media) + ' <span class="tt-mini">(' + p.n + ' alunos)</span>' : '—' };
        }));
      },
      aria: 'Evolução da mediana das notas por turma'
    });
    var leg = document.createElement('div');
    leg.className = 'legend static';
    data.series.forEach(function (s, i) {
      var sp = document.createElement('span');
      sp.className = 'legend-chip destaque';
      sp.innerHTML = '<i style="background:' + cores[i % cores.length] + '"></i>Turma ' + esc(s.turma) + ' · ' + s.alunos + ' alunos';
      leg.appendChild(sp);
    });
    sec.body.appendChild(leg);
    return el;
  }

  function cohortDistribuicao(ctx) {
    var rc = recorte(ctx);
    var dist = A.Store.cohortDistribution(ctx.scope, { materia: rc.materia, bimestre: rc.bimestre });
    var sec = C.secao('coorte-distribuicao', 'Distribuição das médias por turma',
      'Distribuição da ' + rc.medida + ' por turma' + rc.periodo + '. A caixa mostra a metade central dos alunos; as pontas mostram os extremos.',
      { ajuda: 'Cada linha é uma turma. A caixa vai do 1º quartil (25%) ao 3º (75%); o traço dentro dela é a mediana; as hastes mostram o mínimo e o máximo.' +
        (rc.exibicao ? ' Valores de ' + rc.exibicao + '.' : ' Valores da média geral do aluno.') +
        ' Turmas com caixas longas são mais heterogêneas.' });
    var el = sec.el;
    if (!dist.length) { sec.body.appendChild(C.vazio('Sem dados.')); return [el]; }
    var cores = ['#2e5aa8', '#2f8f5b', '#b7791f', '#7c4dbc', '#c05746', '#0e7490'];
    var list = document.createElement('div');
    list.className = 'cohort-dist-list';
    list.setAttribute('role', 'list');
    function pos(v) { return Math.max(0, Math.min(100, v * 10)) + '%'; }
    dist.forEach(function (c, i) {
      var row = document.createElement('div');
      row.className = 'cohort-dist-row';
      row.setAttribute('role', 'listitem');
      row.style.setProperty('--cohort-color', cores[i % cores.length]);
      var box = c.box;
      if (!box || !box.n) {
        row.innerHTML = '<div class="cohort-dist-top"><div><strong>Turma ' + esc(c.turma) + '</strong><span>' + c.n + ' alunos com nota</span></div><span class="cohort-dist-empty">Sem dados suficientes</span></div>';
        list.appendChild(row);
        return;
      }
      row.setAttribute('aria-label', 'Turma ' + c.turma + ', ' + c.n + ' alunos com nota. Mínimo ' + f1(box.min) +
        ', primeiro quartil ' + f1(box.q1) + ', mediana ' + f1(box.mediana) + ', terceiro quartil ' + f1(box.q3) + ', máximo ' + f1(box.max) + '.');
      row.innerHTML = '<div class="cohort-dist-top"><div><strong>Turma ' + esc(c.turma) + '</strong><span>' + c.n + ' alunos com nota</span></div>' +
        '<div class="cohort-dist-value"><strong>' + f1(box.mediana) + '</strong><span>mediana</span></div></div>' +
        '<div class="cohort-dist-track" aria-hidden="true">' +
          (REF != null && REF >= 0 && REF <= 10 ? '<i class="cohort-dist-ref" style="left:' + pos(REF) + '"></i>' : '') +
          '<i class="cohort-dist-whisker" style="left:' + pos(box.min) + ';width:' + Math.max(0, (box.max - box.min) * 10) + '%"></i>' +
          '<i class="cohort-dist-box" style="left:' + pos(box.q1) + ';width:' + Math.max(0, (box.q3 - box.q1) * 10) + '%"></i>' +
          '<i class="cohort-dist-median" style="left:' + pos(box.mediana) + '"></i>' +
        '</div>' +
        '<div class="cohort-dist-range"><span>Mín. ' + f1(box.min) + '</span><span>Máx. ' + f1(box.max) + '</span></div>';
      list.appendChild(row);
    });
    sec.body.appendChild(list);
    var axis = document.createElement('div');
    axis.className = 'cohort-dist-axis';
    axis.setAttribute('aria-hidden', 'true');
    axis.innerHTML = '<span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>';
    sec.body.appendChild(axis);
    var legend = document.createElement('p');
    legend.className = 'cohort-dist-legend';
    legend.innerHTML = '<span><i class="cohort-dist-key-box"></i> 50% central</span><span><i class="cohort-dist-key-median"></i> Mediana</span>' +
      (REF != null ? '<span><i class="cohort-dist-key-ref"></i> ' + esc(CFG.rotuloReferencia) + '</span>' : '');
    sec.body.appendChild(legend);

    /* histograma das notas do recorte */
    var sec2 = C.secao('coorte-histograma', 'Distribuição das notas',
      'Todas as médias' + (rc.exibicao ? ' de ' + rc.exibicao : ' por disciplina') + ' dos alunos do recorte' +
      (rc.bimestre ? ' no ' + rb(rc.bimestre) : '') + '. A linha tracejada é a referência da escola.',
      { ajuda: 'Conta quantos valores caem em cada faixa de 0 a 10. A linha tracejada é a média de referência da escola e a linha escura é a mediana do recorte.' });
    var el2 = sec2.el;
    var scopeTurmas = A.Store.opcoes(ctx.scope).turmas;
    var valores = [];
    scopeTurmas.forEach(function (t) { valores = valores.concat(valsDaTurma(ctx, t, rc.bimestre)); });
    if (!valores.length) { sec2.body.appendChild(C.vazio('Sem dados.')); el2.classList.add('hidden'); return [el, el2]; }
    var hostHist = document.createElement('div');
    sec2.body.appendChild(hostHist);
    Ch.histogram(hostHist, {
      valores: valores, bin: 0.5, altura: h(240, ctx), cor: '#9fb4d0',
      refLine: REF != null ? { valor: REF, rotulo: 'referência' } : null,
      mediana: A.Stats.round2(A.Stats.median(valores)), fmt: f1,
      aria: 'Histograma das notas do recorte'
    });
    return [el, el2];
  }

  function valsDaTurma(ctx, turma, bimestre) {
    var out = [];
    A.Store.alunosDoEscopo({ anoLetivo: ctx.scope.anoLetivo, ano: ctx.scope.ano, turma: turma }).forEach(function (a) {
      var sd = A.Store.studentData(a.ra, { anoLetivo: a.anoLetivo, ano: a.ano, turma: a.turma });
      sd.numericas.forEach(function (m) {
        if (ctx.filtros.disciplina && A.norm(m.nome) !== A.norm(ctx.filtros.disciplina)) return;
        if (bimestre) {
          var s = m.serie.filter(function (x) { return x.bimestre === bimestre && x.nota != null; })[0];
          if (s) out.push(s.nota);
        } else if (m.media != null) out.push(m.media);
      });
    });
    return out;
  }

  function cohortGuidance(ctx) {
    var rc = recorte(ctx);
    var data = A.Store.cohortSubjectMedians(ctx.scope, rc.bimestre);
    var rows = data.rows.filter(function (r) { return !rc.materia || A.norm(r.materia) === A.norm(rc.materia); });
    var signals = rows.map(function (r) {
      var available = r.valores.filter(function (v) { return v.mediana != null && v.n >= LIM.minimoAlunosTurma; });
      return { row: r, values: available, below: available.filter(function (v) { return REF != null && v.mediana < REF; }) };
    }).filter(function (r) { return r.values.length; });
    signals.sort(function (a, b) { return b.below.length - a.below.length || A.Stats.mean(a.values.map(function (v) { return v.mediana; })) - A.Stats.mean(b.values.map(function (v) { return v.mediana; })); });
    var sec = C.secao('coorte-leitura', 'Da observação à ação', 'Pistas do recorte atual para a conversa pedagógica.');
    if (!signals.length) { sec.body.appendChild(C.vazio('Sem amostra suficiente para uma leitura coletiva.')); return sec.el; }
    var ul = document.createElement('ul'); ul.className = 'guidance-list';
    signals.slice(0, 3).forEach(function (signal, i) {
      var li = document.createElement('li');
      var below = signal.below.length;
      var evidence = below ? below + ' de ' + signal.values.length + ' turmas com mediana abaixo de ' + f1(REF) + '.' : 'Medianas: ' + signal.values.map(function (v) { return v.turma + ' · ' + f1(v.mediana); }).join(' / ') + '.';
      var action = below ? 'Investigar habilidades comuns nas avaliações e planejar uma retomada com os professores.' : 'Comparar estratégias e atividades das turmas para reconhecer práticas que podem ser compartilhadas.';
      li.innerHTML = '<span class="guidance-number">0' + (i + 1) + '</span><div><h3>' + esc(signal.row.rotulo) + '</h3><p>' + esc(evidence) + '</p><small>' + esc(action) + '</small></div>';
      ul.appendChild(li);
    });
    sec.body.appendChild(ul);
    return sec.el;
  }

  function cohortNotas(ctx) {
    var sec = C.secao('coorte-notas', 'Como ler este modo',
      'Este modo compara turmas, nunca alunos. Os nomes dos estudantes não aparecem em nenhuma distribuição, e não há ranking entre alunos.',
      { ajuda: 'O modo turma compara grupos, nunca alunos: nenhum nome aparece nas distribuições e não existe ranking entre estudantes. As medianas resumem o padrão típico de cada turma e as caixas mostram a dispersão do grupo.' });
    var ul = document.createElement('ul');
    ul.className = 'monitor-list';
    [
      'As medianas mostram o padrão típico de cada turma — metade dos alunos fica acima, metade abaixo.',
      'As caixas mostram a dispersão: caixas longas indicam grupos mais heterogêneos.',
      'Diferenças entre turmas podem refletir composição da turma, momento do período e critérios de lançamento das notas.',
      'Para investigar um aluno, selecione-o no filtro "Aluno" e o painel muda para o modo de reunião.'
    ].forEach(function (t) {
      var li = document.createElement('li');
      li.innerHTML = C.icone('lista') + '<span>' + esc(t) + '</span>';
      ul.appendChild(li);
    });
    sec.body.appendChild(ul);
    return sec.el;
  }

  /* ==========================================================================
     MODO REUNIÃO (ordem narrativa)
     ========================================================================== */
  var PASSOS = [
    { id: 'visao', titulo: 'Visão geral', desc: 'Quem é o aluno e o resumo dos números', secoes: ['cabecalho', 'resumo'] },
    { id: 'trajetoria', titulo: 'Trajetória', desc: 'Como o desempenho evoluiu ao longo do ano', secoes: ['trajetoria', 'evolucao'] },
    { id: 'fortes', titulo: 'Pontos fortes', desc: 'Onde os dados mostram melhor desempenho', secoes: ['fortes'] },
    { id: 'atencao', titulo: 'Pontos de atenção', desc: 'Onde os dados pedem observação', secoes: ['atencao'] },
    { id: 'disciplinas', titulo: 'Disciplinas', desc: 'Visão geral, perfil, consistência e mapa por bimestre', secoes: ['tabela', 'perfil', 'consistencia', 'mapa'] },
    { id: 'turma', titulo: 'Contexto da turma', desc: 'Como a nota se situa na distribuição da turma', secoes: ['contexto'] },
    { id: 'recuperacao', titulo: 'Recuperação', desc: 'O papel das recuperações nos resultados', secoes: ['recuperacao'] },
    { id: 'proximos', titulo: 'Próximos passos', desc: 'O que acompanhar no próximo período', secoes: ['proximos'] }
  ];

  function secoesDoAluno(ctx) {
    return {
      cabecalho: function () { return cabecalhoAluno(ctx); },
      resumo: function () { return resumo(ctx); },
      tabela: function () { return tabelaDisciplinas(ctx); },
      trajetoria: function () { return trajetoria(ctx); },
      evolucao: function () { return evolucao(ctx); },
      fortes: function () { return blocoInsights(ctx, 'positivo', 'Pontos fortes observados nos dados', 'estrela'); },
      atencao: function () { return blocoInsights(ctx, 'atencao', 'Pontos de atenção observados nos dados', 'alerta'); },
      perfil: function () { return perfil(ctx); },
      consistencia: function () { return consistencia(ctx); },
      mapa: function () { return mapa(ctx); },
      contexto: function () { return contexto(ctx); },
      recuperacao: function () { return recuperacao(ctx); },
      proximos: function () { return proximos(ctx); }
    };
  }

  function blocoInsights(ctx, tom, titulo, icone) {
    var sec = C.secao('insights-' + tom, titulo,
      tom === 'positivo'
        ? 'Observações de dados com desempenho acima da própria média do aluno ou em tendência de crescimento.'
        : 'Observações de dados com desempenho abaixo da própria média, queda recente ou oscilação. Não são julgamentos.',
      { ajuda: tom === 'positivo'
        ? 'Cada cartão destaca uma disciplina com média acima da média geral do aluno, em crescimento ou com notas estáveis. O chip traz o tipo de ponto forte e as evidências mostram os números que sustentam a observação.'
        : 'Cada cartão destaca uma disciplina com média abaixo da média geral do aluno, em queda recente ou com oscilação alta. O chip traz o tipo de atenção e as evidências mostram os números. São sinais para observar, não julgamentos sobre o aluno.' });
    var list = A.Insights.student(ctx.sd).filter(function (i) { return i.tom === tom; });
    if (!list.length) {
      sec.body.appendChild(C.vazio(tom === 'positivo' ? 'Nenhum destaque positivo pelos critérios atuais.' : 'Nenhum ponto de atenção pelos critérios atuais.'));
      return sec.el;
    }
    var grid = document.createElement('div');
    grid.className = 'insight-grid';
    list.forEach(function (i) { grid.appendChild(C.insightCard(i)); });
    sec.body.appendChild(grid);
    return sec.el;
  }

  /* agrupa pares de seções em duas colunas (telas largas) */
  function agruparSecoes(container, pares) {
    if (window.innerWidth <= 1180) return;
    (pares || []).forEach(function (par) {
      var a = container.querySelector('#' + par[0]);
      var b = container.querySelector('#' + par[1]);
      if (!a || !b || a.parentNode !== container || b.parentNode !== container) return;
      var dupla = document.createElement('div');
      dupla.className = 'grid-2';
      container.insertBefore(dupla, a);
      dupla.appendChild(a);
      dupla.appendChild(b);
    });
  }

  function renderStudent(container, ctx) {
    var secs = secoesDoAluno(ctx);
    var ordem = ['cabecalho', 'resumo', 'tabela', 'leitura', 'trajetoria', 'evolucao', 'consistencia', 'perfil', 'areas', 'mapa', 'variacao', 'contexto', 'recuperacao', 'proximos', 'pequenos', 'padroes'];
    ordem.forEach(function (nome) {
      if (nome === 'leitura') { container.appendChild(leitura(ctx)); return; }
      if (nome === 'tabela') { container.appendChild(tabelaDisciplinas(ctx)); return; }
      if (nome === 'variacao') { container.appendChild(variacao(ctx)); return; }
      if (nome === 'areas') { container.appendChild(areas(ctx)); return; }
      if (nome === 'pequenos') { container.appendChild(smallMultiples(ctx)); return; }
      if (nome === 'padroes') { container.appendChild(padroes(ctx)); return; }
      if (secs[nome]) container.appendChild(secs[nome]());
    });
    container.appendChild(detalhados(ctx));

    /* duas informações por linha em telas largas */
    agruparSecoes(container, [
      ['evolucao', 'consistencia'],
      ['perfil', 'areas'],
      ['mapa', 'variacao']
    ]);
  }

  return {
    mapaCores: mapaCores, renderStudent: renderStudent, secoesDoAluno: secoesDoAluno, PASSOS: PASSOS,
    agruparSecoes: agruparSecoes,
    cabecalhoAluno: cabecalhoAluno, resumo: resumo, leitura: leitura, trajetoria: trajetoria,
    evolucao: evolucao, perfil: perfil, contexto: contexto, mapa: mapa, variacao: variacao,
    consistencia: consistencia, recuperacao: recuperacao, areas: areas, smallMultiples: smallMultiples,
    padroes: padroes, proximos: proximos, detalhados: detalhados,
    cohortGuidance: cohortGuidance, cohortResumo: cohortResumo, cohortTabela: cohortTabela, cohortMediana: cohortMediana, cohortEvolucao: cohortEvolucao,
    cohortDistribuicao: cohortDistribuicao, cohortNotas: cohortNotas, classData: classData,
    blocoInsights: blocoInsights
  };
})();
