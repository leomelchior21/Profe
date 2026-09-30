/* ============================================================================
   APP — estado, filtros, modos (aluno / turma / reunião) e relatório impresso
   ========================================================================== */

(function () {
  'use strict';

  var A = window.Analytics;
  var V = window.Views;
  var C = window.Components;
  var CFG = window.CONFIG;

  var state = {
    filtros: { anoLetivo: '', ano: '', turma: '', aluno: '', disciplina: '', bimestre: '' },
    traj: {},
    perfilOrdem: 'area',
    meeting: false,
    meetingPasso: 0
  };

  /* ---------------------------------------------------------------- helpers */

  function $(id) { return document.getElementById(id); }

  function scopeAtual() {
    return { anoLetivo: state.filtros.anoLetivo, ano: state.filtros.ano, turma: state.filtros.turma };
  }

  function selecionaOpcao(sel, valor, rotulo) {
    var op = document.createElement('option');
    op.value = valor;
    op.textContent = rotulo;
    sel.appendChild(op);
  }

  function preencherSelect(sel, itens, valorAtual, rotuloVazio) {
    sel.innerHTML = '';
    if (rotuloVazio) selecionaOpcao(sel, '', rotuloVazio);
    itens.forEach(function (it) { selecionaOpcao(sel, it.valor, it.rotulo); });
    var existe = Array.prototype.some.call(sel.options, function (o) { return o.value === valorAtual; });
    sel.value = existe ? valorAtual : '';
    return sel.value;
  }

  /* ------------------------------------------------------- dropdowns glass */

  var dropdowns = {};

  function montarDropdowns() {
    Array.prototype.forEach.call(document.querySelectorAll('.filterbar select'), function (sel) {
      sel.classList.add('dd-native');
      var dd = document.createElement('div');
      dd.className = 'dd';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dd-btn';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');
      var rot = sel.parentNode && sel.parentNode.querySelector('label');
      btn.setAttribute('aria-label', rot ? rot.textContent : 'Filtro');
      var menu = document.createElement('div');
      menu.className = 'dd-menu';
      menu.setAttribute('role', 'listbox');
      document.body.appendChild(menu);
      dd.appendChild(btn);
      sel.parentNode.insertBefore(dd, sel.nextSibling);

      var d = dropdowns[sel.id] = { sel: sel, dd: dd, btn: btn, menu: menu };

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var aberto = dd.classList.contains('aberto');
        fecharDropdowns();
        if (!aberto) abrirDropdown(d);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!dd.classList.contains('aberto')) abrirDropdown(d);
          var alvo = menu.querySelector('.dd-item.selecionado') || menu.querySelector('.dd-item');
          if (alvo) alvo.focus();
        } else if (e.key === 'Escape') {
          fecharDropdowns();
        }
      });
      menu.addEventListener('click', function (e) {
        var item = e.target.closest ? e.target.closest('.dd-item') : null;
        if (!item) return;
        selecionarDropdown(d, item.getAttribute('data-valor'));
      });
      menu.addEventListener('keydown', function (e) {
        var itens = Array.prototype.slice.call(menu.querySelectorAll('.dd-item'));
        var i = itens.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' && i < itens.length - 1) { e.preventDefault(); itens[i + 1].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) itens[i - 1].focus(); else btn.focus(); }
        else if (e.key === 'Escape') { fecharDropdowns(); btn.focus(); }
        else if (e.key === 'Tab') { fecharDropdowns(); }
      });
    });

    document.addEventListener('click', fecharDropdowns);
    window.addEventListener('resize', fecharDropdowns);
    window.addEventListener('scroll', fecharDropdowns, { passive: true });
  }

  function abrirDropdown(d) {
    if (d.sel.disabled) return;
    d.menu.classList.add('aberto');
    d.dd.classList.add('aberto');
    d.btn.setAttribute('aria-expanded', 'true');
    d.menu.style.minWidth = Math.max(188, d.btn.offsetWidth) + 'px';
    var r = d.btn.getBoundingClientRect();
    d.menu.style.left = Math.round(r.left) + 'px';
    d.menu.style.top = Math.round(r.bottom + 8) + 'px';
    var w = d.menu.offsetWidth;
    if (r.left + w > window.innerWidth - 12) d.menu.style.left = Math.max(12, window.innerWidth - 12 - w) + 'px';
  }

  function fecharDropdowns() {
    Object.keys(dropdowns).forEach(function (k) {
      var d = dropdowns[k];
      d.menu.classList.remove('aberto');
      d.dd.classList.remove('aberto');
      d.btn.setAttribute('aria-expanded', 'false');
    });
  }

  function selecionarDropdown(d, valor) {
    d.sel.value = valor;
    d.sel.dispatchEvent(new Event('change'));
    fecharDropdowns();
    d.btn.focus();
  }

  function atualizarDropdowns() {
    Object.keys(dropdowns).forEach(function (k) {
      var d = dropdowns[k];
      var atual = d.sel.value;
      d.btn.disabled = d.sel.disabled;
      d.menu.innerHTML = '';
      Array.prototype.forEach.call(d.sel.options, function (op) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dd-item' + (op.value === atual ? ' selecionado' : '');
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', op.value === atual ? 'true' : 'false');
        b.setAttribute('data-valor', op.value);
        b.textContent = op.textContent;
        d.menu.appendChild(b);
      });
      var idx = d.sel.selectedIndex >= 0 ? d.sel.selectedIndex : 0;
      var opSel = d.sel.options[idx];
      d.btn.textContent = atual ? (opSel ? opSel.textContent : '') : (d.sel.dataset.emptyLabel || (opSel ? opSel.textContent : ''));
      d.dd.classList.toggle('ativo', !!atual);
    });
  }

  /* ------------------------------------------------------------- filtros UI */

  function refrescarFiltros() {
    var op = A.Store.opcoes({});
    state.filtros.anoLetivo = preencherSelect($('f-ano-letivo'),
      op.anosLetivos.map(function (y) { return { valor: String(y), rotulo: String(y) }; }),
      state.filtros.anoLetivo, 'Todos');

    var op1 = A.Store.opcoes({ anoLetivo: state.filtros.anoLetivo });
    state.filtros.ano = preencherSelect($('f-ano'),
      op1.anos.map(function (y) { return { valor: String(y), rotulo: y + 'º ano' }; }),
      state.filtros.ano, 'Anos');

    var anoSelecionado = !!state.filtros.ano;
    ['f-turma', 'f-aluno', 'f-disciplina', 'f-bimestre'].forEach(function (id) {
      $(id).disabled = !anoSelecionado;
    });
    var op2 = anoSelecionado ? A.Store.opcoes({ anoLetivo: state.filtros.anoLetivo, ano: state.filtros.ano }) : { turmas: [] };
    state.filtros.turma = preencherSelect($('f-turma'),
      op2.turmas.map(function (t) { return { valor: t, rotulo: 'Turma ' + t }; }),
      state.filtros.turma, 'Turmas');

    var op3 = anoSelecionado ? A.Store.opcoes({ anoLetivo: state.filtros.anoLetivo, ano: state.filtros.ano, turma: state.filtros.turma }) : { alunos: [], materiasNumericas: [], bimestres: [] };
    var alunosItens = op3.alunos.map(function (a) { return { valor: a.ra, rotulo: a.nome + '  ·  ' + a.turma }; });
    var permitidos = {};
    op3.alunos.forEach(function (a) { permitidos[a.ra] = 1; });
    if (state.filtros.aluno && !permitidos[state.filtros.aluno]) state.filtros.aluno = '';
    state.filtros.aluno = preencherSelect($('f-aluno'), alunosItens, state.filtros.aluno, 'Alunos');

    state.filtros.disciplina = preencherSelect($('f-disciplina'),
      op3.materiasNumericas.map(function (m) { return { valor: m.nome, rotulo: m.rotulo }; }),
      state.filtros.disciplina, 'Disciplinas');

    state.filtros.bimestre = preencherSelect($('f-bimestre'),
      op3.bimestres.map(function (b) { return { valor: String(b), rotulo: A.rotuloBimestre(b) }; }),
      state.filtros.bimestre, 'Bimestres');

    $('f-aluno').classList.toggle('destaque-filtro', !!state.filtros.aluno);

    /* linha de escopo */
    var partes = [];
    if (state.filtros.aluno) {
      var al = A.Store.aluno(state.filtros.aluno);
      partes.push('Turma ' + al.turma);
      $('nav-aluno').innerHTML = C.avatar(al.nome, '#3d7bd9', 'media').outerHTML;
    } else {
      partes.push(state.filtros.turma ? 'Turma ' + state.filtros.turma : 'Todas as turmas');
      $('nav-aluno').innerHTML = '';
    }
    if (state.filtros.disciplina) {
      var matSel = op3.materiasNumericas.filter(function (m) { return A.norm(m.nome) === A.norm(state.filtros.disciplina); })[0];
      partes.push(matSel ? matSel.rotulo : state.filtros.disciplina);
    }
    if (state.filtros.bimestre) partes.push(A.rotuloBimestre(Number(state.filtros.bimestre)) + ' em foco');
    $('scope-line').textContent = anoSelecionado ? partes.join('  ·  ') : 'Selecione um ano';

    $('btn-reuniao').disabled = !state.filtros.aluno;
    $('btn-resumo').disabled = !state.filtros.aluno;

    atualizarDropdowns();
  }

  /* ------------------------------------------------------------------- ctx */

  function buildCtx(meeting) {
    var scope = scopeAtual();
    var ra = state.filtros.aluno;
    var sd = ra ? A.Store.studentData(ra, scope) : null;
    var ctx = {
      sd: sd, scope: scope,
      filtros: { disciplina: meeting ? '' : state.filtros.disciplina, bimestre: meeting ? '' : state.filtros.bimestre },
      state: state, meeting: !!meeting,
      rerender: function () { render(); },
      onNavegarAluno: selecionarAluno,
      onFiltrarDisciplina: function (nome) {
        var sel = $('f-disciplina');
        sel.value = (state.filtros.disciplina && A.norm(state.filtros.disciplina) === A.norm(nome)) ? '' : nome;
        sel.dispatchEvent(new Event('change'));
      },
      onFiltrarSituacao: function () {
        var alvo = $('disciplinas-tabela');
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    if (sd) ctx.classData = V.classData(sd);
    return ctx;
  }

  /* ---------------------------------------------------------------- render */

  function render() {
    var view = $('view');
    window.Charts.dispose(view);
    window.Charts.hideTip();
    var scroll = window.scrollY;
    view.innerHTML = '';
    view.setAttribute('aria-busy', 'true');

    document.querySelector('.app-foot').hidden = !state.filtros.ano;
    if (!state.filtros.ano) {
      var inicio = C.el('section', 'card');
      inicio.id = 'selecionar-ano';
      inicio.innerHTML = '<div class="empty"><h1 class="page-title">Selecione um ano</h1>' +
        '<p>Escolha o ano escolar para visualizar as turmas e os resultados.</p>' +
        '<button type="button" class="btn primary" id="btn-selecionar-ano">Selecionar ano</button></div>';
      view.appendChild(inicio);
      $('btn-selecionar-ano').addEventListener('click', function (e) {
        e.stopPropagation();
        var btn = dropdowns['f-ano'].btn;
        btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        btn.focus();
        btn.click();
      });
    } else if (state.filtros.aluno) {
      V.renderStudent(view, buildCtx(false));
    } else {
      renderCohort(view);
    }
    view.removeAttribute('aria-busy');
    window.scrollTo(0, scroll);
    atualizarAbas();
  }

  /* ------------------------------------------------- abas, alertas e rolagem */

  var observerAbas = null;
  function atualizarAbas() {
    var alunoAtivo = !!state.filtros.aluno;
    document.querySelectorAll('.nav-tab').forEach(function (b) {
      var alvo = b.getAttribute('data-alvo');
      b.classList.toggle('desabilitada', !(alvo && $(alvo)));
    });
    var alerta = $('chip-alertas');
    var n = 0;
    if (alunoAtivo) {
      var sd = A.Store.studentData(state.filtros.aluno, scopeAtual());
      if (sd) n = A.Insights.student(sd).filter(function (i) { return i.tom === 'atencao'; }).length;
    }
    alerta.classList.toggle('oculto', !alunoAtivo);
    $('chip-alertas-num').textContent = String(n);
    alerta.setAttribute('aria-label', n + ' pontos de atenção observados');
    if (observerAbas) observerAbas.disconnect();
    if ('IntersectionObserver' in window) {
      observerAbas = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          document.querySelectorAll('.nav-tab').forEach(function (b) {
            b.classList.toggle('ativa', b.getAttribute('data-alvo') === entry.target.id);
          });
        });
      }, { rootMargin: '-140px 0px -65% 0px', threshold: 0 });
      document.querySelectorAll('[data-secao]').forEach(function (section) { observerAbas.observe(section); });
    }
  }

  function selecionarAluno(ra) {
    if (!ra || ra === state.filtros.aluno) return;
    state.filtros.aluno = ra;
    state.traj = {};
    refrescarFiltros();
    render();
    if (state.meeting) renderMeetingPasso();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCohort(view) {
    var ctx = buildCtx(false);
    view.appendChild(V.cohortResumo(ctx));
    view.appendChild(V.cohortTabela(ctx));
    view.appendChild(V.cohortEvolucao(ctx));
    var comparacao = document.createElement('div');
    comparacao.className = 'card cohort-comparison';
    var distribuicao = V.cohortDistribuicao(ctx);
    comparacao.appendChild(V.cohortMediana(ctx));
    comparacao.appendChild(distribuicao[0]);
    view.appendChild(comparacao);
    if (distribuicao[1]) view.appendChild(distribuicao[1]);
    view.appendChild(V.cohortAttention(ctx));
    view.appendChild(V.cohortNotas(ctx));
  }

  /* ----------------------------------------------------------- modo reunião */

  function abrirReuniao() {
    if (!state.filtros.aluno) return;
    state.meeting = true;
    state.meetingPasso = 0;
    document.body.classList.add('meeting-on');
    var ov = $('meeting');
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    renderMeetingPasso();
    $('app').inert = true;
    var close = $('meeting-close');
    if (close) close.focus();
  }

  function fecharReuniao() {
    $('app').inert = false;
    state.meeting = false;
    document.body.classList.remove('meeting-on');
    var ov = $('meeting');
    ov.classList.remove('open');
    ov.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    $('btn-reuniao').focus();
  }

  function renderMeetingPasso() {
    var ctx = buildCtx(true);
    var passo = V.PASSOS[state.meetingPasso];
    var body = $('meeting-body');
    window.Charts.dispose(body);
    body.innerHTML = '';
    var head = $('meeting-step-head');
    head.innerHTML = '<span class="meeting-step-count">Passo ' + (state.meetingPasso + 1) + ' de ' + V.PASSOS.length + '</span>' +
      '<h2>' + C.esc(passo.titulo) + '</h2><p>' + C.esc(passo.desc) + '</p>';

    var secs = V.secoesDoAluno(ctx);
    passo.secoes.forEach(function (nome) {
      var el;
      if (nome === 'perfil') el = V.perfil(ctx);
      else if (nome === 'consistencia') el = V.consistencia(ctx);
      else if (nome === 'mapa') el = V.mapa(ctx);
      else if (nome === 'contexto') el = V.contexto(ctx);
      else if (nome === 'recuperacao') el = V.recuperacao(ctx);
      else if (nome === 'proximos') el = V.proximos(ctx);
      else el = secs[nome]();
      body.appendChild(el);
    });

    /* duas informações por linha em telas largas */
    if (passo.id === 'disciplinas') V.agruparSecoes(body, [['perfil', 'consistencia']]);

    /* barra de progresso */
    var prog = $('meeting-progress');
    prog.innerHTML = '';
    V.PASSOS.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot' + (i === state.meetingPasso ? ' active' : '');
      if (i === state.meetingPasso) b.setAttribute('aria-current', 'step');
      b.setAttribute('aria-label', 'Ir para o passo ' + (i + 1) + ': ' + p.titulo);
      b.addEventListener('click', function () { state.meetingPasso = i; renderMeetingPasso(); });
      prog.appendChild(b);
    });
    $('meeting-prev').disabled = state.meetingPasso === 0;
    $('meeting-next').disabled = state.meetingPasso === V.PASSOS.length - 1;
    $('meeting-step-label').textContent = passo.titulo;
    var al = ctx.sd && ctx.sd.aluno;
    var elMeetingAluno = $('meeting-aluno');
    if (elMeetingAluno) elMeetingAluno.textContent = al ? al.nome + ' · Turma ' + al.turma : '';
    body.scrollTop = 0;
    var panel = $('meeting-body');
    panel.scrollTop = 0;
  }

  function passo(delta) {
    state.meetingPasso = Math.min(V.PASSOS.length - 1, Math.max(0, state.meetingPasso + delta));
    renderMeetingPasso();
  }

  /* --------------------------------------------------------- relatório impresso */

  function abrirRelatorio() {
    if (!state.filtros.aluno) return;
    var ov = $('printOverlay');
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Resumo para impressão');
    $('app').inert = true;
    $('meeting').inert = true;
    document.body.classList.add('printing');
    var report = $('printReport');
    window.Charts.dispose(report);
    report.innerHTML = '';
    var ctx = buildCtx(false);

    /* ações (fixas no topo, fora da impressão) */
    var acoes = document.createElement('div');
    acoes.className = 'print-actions';
    var btPrint = document.createElement('button');
    btPrint.className = 'btn primary';
    btPrint.textContent = 'Imprimir / salvar PDF';
    btPrint.addEventListener('click', function () { window.print(); });
    var btClose = document.createElement('button');
    btClose.className = 'btn';
    btClose.textContent = 'Fechar';
    btClose.addEventListener('click', fecharRelatorio);
    acoes.appendChild(btPrint); acoes.appendChild(btClose);
    report.appendChild(acoes);
    btClose.focus();

    /* monta depois do layout para os gráficos calcularem a largura corretamente */
    setTimeout(function () { montarRelatorio(report, ctx); }, 30);
  }

  function fecharRelatorio() {
    var ov = $('printOverlay');
    ov.classList.remove('open');
    document.body.classList.remove('printing');
    ov.setAttribute('aria-hidden', 'true');
    $('app').inert = state.meeting;
    $('meeting').inert = false;
    (state.meeting ? $('meeting-print') : $('btn-resumo')).focus();
  }

  function montarRelatorio(host, ctx) {
    var sd = ctx.sd;
    var wrap = document.createElement('div');
    wrap.className = 'print-report';
    host.appendChild(wrap);

    var cab = document.createElement('header');
    cab.className = 'print-head';
    cab.innerHTML =
      '<div class="print-school">' + C.esc(CFG.escola) + ' · ' + C.esc(CFG.produto) + '</div>' +
      '<h1>Resumo da reunião</h1>' +
      '<div class="print-id"><b>' + C.esc(sd.aluno.nome) + '</b> · Turma ' + C.esc(sd.aluno.turma) +
      ' · ' + C.esc(String(sd.aluno.ano)) + 'º ano · Ano letivo ' + C.esc(String(sd.aluno.anoLetivo)) + '</div>' +
      '<div class="print-date">Gerado em ' + new Date().toLocaleDateString('pt-BR') + '</div>';
    wrap.appendChild(cab);

    /* números principais */
    var mpb = sd.mediaPorBimestre.filter(function (p) { return p.media != null; });
    var ultimo = mpb[mpb.length - 1];
    var anterior = mpb[mpb.length - 2];
    var stats = document.createElement('div');
    stats.className = 'print-stats';
    function stat(rotulo, valor) {
      var d = document.createElement('div');
      d.innerHTML = '<span>' + C.esc(rotulo) + '</span><b>' + C.esc(valor) + '</b>';
      stats.appendChild(d);
    }
    stat('Média geral', A.fmt1(sd.mediaGeral));
    if (ultimo) stat('Média do último bimestre', A.fmt1(ultimo.media) + ' (' + A.rotuloBimestreCurto(ultimo.bimestre) + ')');
    if (ultimo && anterior) stat('Variação no último período', A.fmtSigned(A.Stats.round2(ultimo.media - anterior.media)));
    if (sd.frequenciaMedia != null && CFG.relatorio.incluirFrequencia) stat('Frequência média registrada', A.fmtPct(sd.frequenciaMedia));
    stat('Eventos de recuperação', String(sd.recuperacoes.length));
    wrap.appendChild(stats);

    /* trajetória */
    if (CFG.relatorio.incluirTrajetoria) {
      var secT = C.secao('print-trajetoria', 'Trajetória ao longo do ano', null);
      var layoutT = document.createElement('div');
      layoutT.className = 'print-traj-layout';
      var legendaT = document.createElement('div');
      legendaT.className = 'legend static print-legend';
      var hostT = document.createElement('div');
      hostT.className = 'chart-host';
      layoutT.appendChild(legendaT);
      layoutT.appendChild(hostT);
      secT.body.appendChild(layoutT);
      var bimestres = sd.bimestres;
      Ch_line(hostT, legendaT, sd, bimestres);
      wrap.appendChild(secT.el);
    }

    /* notas de todas as disciplinas, sem depender do filtro do painel */
    if (sd.numericas.length) {
      var secD = C.secao('print-disciplinas', 'Visão por disciplina', 'Notas finais registradas em cada bimestre; — indica ausência de nota.');
      var tabela = document.createElement('table');
      tabela.className = 'print-disciplines';
      var cabTabela = '<thead><tr><th scope="col">Disciplina</th>';
      sd.bimestres.forEach(function (bi) { cabTabela += '<th scope="col">' + C.esc(A.rotuloBimestreCurto(bi)) + '</th>'; });
      tabela.innerHTML = cabTabela + '<th scope="col">Média</th><th scope="col">Variação</th></tr></thead>';
      var corpo = document.createElement('tbody');
      var coresD = V.mapaCores(sd);
      sd.numericas.slice().sort(function (a, b) { return A.ordemMaterias(a.nome, b.nome); }).forEach(function (m) {
        var tr = document.createElement('tr');
        var disciplina = document.createElement('th');
        disciplina.scope = 'row';
        disciplina.innerHTML = '<span class="print-discipline-name"><i style="background:' + coresD[m.nome] + '"></i>' + C.esc(m.rotulo) + '</span>';
        tr.appendChild(disciplina);
        sd.bimestres.forEach(function (bi) {
          var s = m.serie.filter(function (x) { return x.bimestre === bi; })[0];
          var td = document.createElement('td');
          td.textContent = s && s.nota != null ? A.fmt1(s.nota) : '—';
          tr.appendChild(td);
        });
        var media = document.createElement('td');
        media.className = 'print-discipline-average';
        media.textContent = A.fmt1(m.media);
        tr.appendChild(media);
        var variacao = document.createElement('td');
        variacao.textContent = m.variacaoTotal == null ? '—' : A.fmtSigned(m.variacaoTotal);
        tr.appendChild(variacao);
        corpo.appendChild(tr);
      });
      tabela.appendChild(corpo);
      secD.body.appendChild(tabela);
      wrap.appendChild(secD.el);
    }

    /* diferenças entre bimestres consecutivos para cada disciplina */
    if (sd.bimestres.length > 1 && sd.numericas.length) {
      var pares = [];
      for (var i = 1; i < sd.bimestres.length; i++) pares.push([sd.bimestres[i - 1], sd.bimestres[i]]);
      var secV = C.secao('print-variacao', 'Variação entre bimestres', 'Diferença em pontos entre notas de bimestres consecutivos; — indica comparação sem as duas notas.');
      var tabelaV = document.createElement('table');
      tabelaV.className = 'print-disciplines print-variations';
      var cabV = '<thead><tr><th scope="col">Disciplina</th>';
      pares.forEach(function (p) { cabV += '<th scope="col">' + C.esc(A.rotuloBimestreCurto(p[0]) + ' → ' + A.rotuloBimestreCurto(p[1])) + '</th>'; });
      tabelaV.innerHTML = cabV + '<th scope="col">Média</th></tr></thead>';
      var corpoV = document.createElement('tbody');
      var coresV = V.mapaCores(sd);
      sd.numericas.slice().sort(function (a, b) { return A.ordemMaterias(a.nome, b.nome); }).forEach(function (m) {
        var tr = document.createElement('tr');
        var nome = document.createElement('th');
        nome.scope = 'row';
        nome.innerHTML = '<span class="print-discipline-name"><i style="background:' + coresV[m.nome] + '"></i>' + C.esc(m.rotulo) + '</span>';
        tr.appendChild(nome);
        var valores = [];
        pares.forEach(function (p) {
          var d = m.deltas.filter(function (x) { return x.de === p[0] && x.para === p[1]; })[0];
          var td = document.createElement('td');
          td.className = 'print-delta ' + (d ? d.valor > 0 ? 'positive' : d.valor < 0 ? 'negative' : 'stable' : 'missing');
          td.textContent = d ? A.fmtSigned(d.valor) : '—';
          if (d) valores.push(d.valor);
          tr.appendChild(td);
        });
        var mediaV = document.createElement('td');
        mediaV.className = 'print-discipline-average';
        mediaV.textContent = valores.length ? A.fmtSigned(A.Stats.round2(A.Stats.mean(valores))) : '—';
        tr.appendChild(mediaV);
        corpoV.appendChild(tr);
      });
      tabelaV.appendChild(corpoV);
      secV.body.appendChild(tabelaV);
      wrap.appendChild(secV.el);
    }

    /* perfil */
    if (CFG.relatorio.incluirPerfilDisciplinas) {
      var secP = C.secao('print-perfil', 'Perfil por disciplina', 'Média do ano por disciplina; a marca vertical é a mediana da turma.');
      var hostP = document.createElement('div');
      hostP.className = 'chart-host';
      secP.body.appendChild(hostP);
      var cd = ctx.classData;
      window.Charts.hBars(hostP, {
        itens: sd.numericas.map(function (m) {
          var pm = cd.porMateria[m.nome];
          var b = pm && pm.boxAno && pm.boxAno.n >= CONFIG_MIN_TURMA() ? pm.boxAno : null;
          return { id: m.nome, rotulo: m.rotulo, valor: m.media, cor: '#2e5aa8', mediana: CFG.relatorio.incluirMedianaTurma && b ? b.mediana : null };
        }),
        max: 10, fmt: A.fmt1, refLine: CFG.notaReferencia != null && CFG.relatorio.incluirNotaReferencia ? { valor: CFG.notaReferencia, rotulo: 'referência' } : null
      });
      wrap.appendChild(secP.el);
    }

    /* observações */
    var ins = A.Insights.student(sd);
    function bloco(titulo, filtro) {
      var list = ins.filter(filtro);
      if (!list.length) return;
      var sec = C.secao('print-' + titulo.replace(/\s/g, ''), titulo, null);
      var ul = document.createElement('ul');
      ul.className = 'print-list';
      list.forEach(function (i) {
        var li = document.createElement('li');
        li.innerHTML = C.esc(i.texto) + ' <em>(' + i.evidencias.map(function (e) { return C.esc(e.rotulo) + ': ' + C.esc(e.valor); }).join(' · ') + ')</em>';
        ul.appendChild(li);
      });
      sec.body.appendChild(ul);
      wrap.appendChild(sec.el);
    }
    if (CFG.relatorio.incluirPontosFortes) bloco('Pontos fortes observados nos dados', function (i) { return i.tom === 'positivo'; });
    if (CFG.relatorio.incluirPontosAtencao) bloco('Pontos de atenção observados nos dados', function (i) { return i.tom === 'atencao'; });

    /* próximos pontos */
    var mon = A.Insights.monitoring(sd);
    if (mon.length) {
      var secM = C.secao('print-proximos', 'Próximos pontos para acompanhar', null);
      var ulM = document.createElement('ul');
      ulM.className = 'print-list';
      mon.forEach(function (m) {
        var li = document.createElement('li');
        li.textContent = m.texto;
        ulM.appendChild(li);
      });
      secM.body.appendChild(ulM);
      wrap.appendChild(secM.el);
    }

    var rod = document.createElement('footer');
    rod.className = 'print-foot';
    rod.textContent = CFG.relatorio.rodape;
    wrap.appendChild(rod);
  }

  function CONFIG_MIN_TURMA() { return CFG.limiares.minimoAlunosTurma; }

  function Ch_line(host, legenda, sd, bimestres) {
    var ref = CFG.notaReferencia;
    var Ch = window.Charts;
    var cores = V.mapaCores(sd);

    /* a mesma cor identifica cada disciplina no gráfico e na tabela */
    sd.numericas.forEach(function (m) {
      var sp = document.createElement('span');
      sp.className = 'legend-chip';
      sp.innerHTML = '<i style="background:' + cores[m.nome] + '"></i>' + C.esc(m.rotulo);
      legenda.appendChild(sp);
    });

    Ch.lineChart(host, {
      /* largura útil no A4 depois da legenda lateral */
      fixedWidth: 530,
      altura: function () { return Math.max(260, Math.ceil(legenda.getBoundingClientRect().height)); }, interativo: false,
      series: sd.numericas.map(function (m) {
        return {
          id: m.nome, nome: m.rotulo,
          cor: cores[m.nome],
          destaque: true,
          valores: bimestres.map(function (bi) {
            var s = m.serie.filter(function (x) { return x.bimestre === bi; })[0];
            return s ? s.nota : null;
          })
        };
      }),
      xLabels: bimestres.map(A.rotuloBimestreCurto),
      refLine: ref != null && CFG.relatorio.incluirNotaReferencia ? { valor: ref, rotulo: 'referência ' + A.fmt1(ref) } : null,
      aria: 'Trajetória das notas por disciplina'
    });

  }

  /* -------------------------------------------------------------- eventos */

  function bind() {
    var header = document.querySelector('.topbar');
    function atualizarHeader() { header.classList.toggle('is-scrolled', window.scrollY > 12); }
    window.addEventListener('scroll', atualizarHeader, { passive: true });
    atualizarHeader();
    ['f-ano-letivo', 'f-ano', 'f-turma'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        state.filtros.anoLetivo = $('f-ano-letivo').value;
        state.filtros.ano = $('f-ano').value;
        state.filtros.turma = $('f-turma').value;
        state.traj = {};
        refrescarFiltros();
        render();
      });
    });
    $('f-aluno').addEventListener('change', function () {
      state.filtros.aluno = $('f-aluno').value;
      state.traj = {};
      refrescarFiltros();
      render();
      if (state.filtros.aluno) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('f-disciplina').addEventListener('change', function () {
      state.filtros.disciplina = $('f-disciplina').value;
      refrescarFiltros();
      render();
    });
    $('f-bimestre').addEventListener('change', function () {
      state.filtros.bimestre = $('f-bimestre').value;
      refrescarFiltros();
      render();
    });
    $('btn-limpar').addEventListener('click', function () {
      state.filtros = { anoLetivo: '', ano: '', turma: '', aluno: '', disciplina: '', bimestre: '' };
      state.traj = {};
      refrescarFiltros();
      render();
      document.querySelector('.filterbar').scrollLeft = 0;
    });
    $('btn-reuniao').addEventListener('click', abrirReuniao);
    $('btn-resumo').addEventListener('click', abrirRelatorio);
    $('meeting-close').addEventListener('click', fecharReuniao);
    $('meeting-prev').addEventListener('click', function () { passo(-1); });
    $('meeting-next').addEventListener('click', function () { passo(1); });
    $('meeting-print').addEventListener('click', abrirRelatorio);
    $('printOverlay').addEventListener('click', function (e) { if (e.target === $('printOverlay')) fecharRelatorio(); });

    document.addEventListener('keydown', function (e) {
      if ($('printOverlay').classList.contains('open') && e.key === 'Escape') { fecharRelatorio(); return; }
      if (e.key === 'Tab') {
        var modal = $('printOverlay').classList.contains('open') ? $('printOverlay') : state.meeting ? $('meeting') : null;
        if (modal) {
          var items = Array.from(modal.querySelectorAll('button:not(:disabled), [tabindex="0"]')).filter(function (el) { return el.getClientRects().length; });
          var first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      if (!$('meeting').classList.contains('open') || $('printOverlay').classList.contains('open')) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); passo(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); passo(-1); }
      else if (e.key === 'Escape') fecharReuniao();
    });

    /* abas de navegação */
    document.querySelectorAll('.nav-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        var alvo = $(b.getAttribute('data-alvo'));
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    $('chip-alertas').addEventListener('click', function () {
      var alvo = $('leitura');
      if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* tooltips de qualquer elemento com data-tip (hover e foco) */
    function mostrarTip(e) {
      var alvo = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!alvo) return;
      var r = alvo.getBoundingClientRect();
      window.Charts.showTip('<div class="tooltip-sub">' + C.esc(alvo.getAttribute('data-tip')) + '</div>', r.right - 20, r.top + r.height);
    }
    document.addEventListener('mouseover', mostrarTip);
    document.addEventListener('focusin', mostrarTip);
    document.addEventListener('mouseout', function (e) {
      var alvo = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (alvo) window.Charts.hideTip();
    });
    document.addEventListener('focusout', function () { window.Charts.hideTip(); });
    document.addEventListener('mouseleave', function () { window.Charts.hideTip(); });
  }

  /* ------------------------------------------------------------------ init */

  /* link direto: index.html?aluno=<RA>&turma=9A&disciplina=...&bimestre=2 */
  function aplicarLinkDireto() {
    var p = new URLSearchParams(window.location.search);
    if (p.get('aluno')) state.filtros.aluno = p.get('aluno');
    if (p.get('turma')) state.filtros.turma = p.get('turma');
    if (p.get('ano')) state.filtros.ano = p.get('ano');
    if (p.get('anoLetivo')) state.filtros.anoLetivo = p.get('anoLetivo');
    if (p.get('disciplina')) state.filtros.disciplina = p.get('disciplina');
    if (p.get('bimestre')) state.filtros.bimestre = p.get('bimestre');
  }

  function init() {
    if (!window.SCHOOL_DATA) {
      document.getElementById('view').innerHTML =
        '<section class="card"><div class="empty">Dados protegidos indisponíveis. Recarregue a página.</div></section>';
      return;
    }
    A.Store.init(window.SCHOOL_DATA);
    aplicarLinkDireto();
    montarDropdowns();
    refrescarFiltros();
    bind();
    render();
  }

  document.addEventListener('profe:unlocked', init, { once: true });
})();
