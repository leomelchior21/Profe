/* ============================================================================
   COMPONENTS — blocos de interface reutilizáveis
   ========================================================================== */

window.Components = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(tag, className, html) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ícones mínimos (inline, sem dependências) */
  var ICONES = {
    up: 'M12 5l6 7h-4v7h-4v-7H6z',
    down: 'M12 19l-6-7h4V5h4v7h4z',
    flat: 'M5 11h14v2H5z',
    dot: 'M12 8a4 4 0 100 8 4 4 0 000-8z',
    alerta: 'M12 3l9 16H3zM12 9v5m0 2.5v.5',
    estrela: 'M12 3l2.6 5.8 6.4.6-4.8 4.2 1.4 6.2L12 16.6 6.4 19.8l1.4-6.2L3 9.4l6.4-.6z',
    lista: 'M4 6h16M4 12h16M4 18h10',
    regua: 'M3 9h18v6H3zM7 9v3M11 9v4M15 9v3M19 9v4',
    relogio: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3 2',
    livro: 'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2zM8 7h7M8 11h7',
    pessoas: 'M9 11a3 3 0 100-6 3 3 0 000 6zm-6 9a6 6 0 0112 0M16 8a3 3 0 110 6M18 20a6 6 0 00-3-5.2',
    alvo: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 5a4 4 0 100 8 4 4 0 000-8z'
  };

  function icone(nome, cor) {
    var d = ICONES[nome] || ICONES.dot;
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="' + (cor ? 'color:' + cor : '') + '">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* botão/ícone "?" que explica o que um bloco mostra (tooltip) */
  function ajuda(texto, rotulo) {
    var b = el('button', 'card-help');
    b.type = 'button';
    b.textContent = '?';
    b.setAttribute('data-tip', texto || '');
    b.setAttribute('aria-label', rotulo || 'O que este bloco mostra');
    return b;
  }

  /* seção com título e descrição */
  function secao(id, titulo, descricao, opts) {
    opts = opts || {};
    var sec = el('section', 'card' + (opts.classe ? ' ' + opts.classe : ''));
    sec.id = id;
    sec.setAttribute('data-secao', id);
    var head = el('div', 'card-head');
    var esq = el('div', 'card-head-left');
    var h = el('h2', 'card-title', esc(titulo));
    esq.appendChild(h);
    if (opts.ajuda !== false) esq.appendChild(ajuda(opts.ajuda || descricao || titulo));
    head.appendChild(esq);
    if (opts.tag) head.appendChild(el('span', 'tag ' + (opts.tagClasse || ''), esc(opts.tag)));
    sec.appendChild(head);
    if (descricao) {
      var d = el('p', 'card-desc');
      d.textContent = descricao;
      sec.appendChild(d);
    }
    var body = el('div', 'card-body');
    sec.appendChild(body);
    return { el: sec, body: body, head: head };
  }

  function cardMetrica(p) {
    var c = el('div', 'metric');
    var top = el('div', 'metric-top', '<span class="metric-label">' + esc(p.rotulo) + '</span>' +
      (p.info ? '<button type="button" class="info-dot" aria-label="' + esc(p.info) + '" data-tip="' + esc(p.info) + '">i</button>' : ''));
    c.appendChild(top);
    var val = el('div', 'metric-value');
    if (p.icone) val.innerHTML = icone(p.icone, p.iconeCor) + '<span>' + esc(p.valor) + '</span>';
    else val.textContent = p.valor;
    c.appendChild(val);
    if (p.sub) c.appendChild(el('div', 'metric-sub', esc(p.sub)));
    if (p.delta != null) {
      var cls = p.delta > 0 ? 'pos' : p.delta < 0 ? 'neg' : 'neu';
      var ic = p.delta > 0 ? 'up' : p.delta < 0 ? 'down' : 'flat';
      c.appendChild(el('div', 'metric-delta ' + cls, icone(ic) + '<span>' + esc(p.deltaTexto) + '</span>'));
    }
    return c;
  }

  function chip(texto, opts) {
    opts = opts || {};
    return el('span', 'chip' + (opts.classe ? ' ' + opts.classe : ''), esc(texto));
  }

  function vazio(texto) {
    return el('div', 'empty', esc(texto));
  }

  function aviso(texto, classe) {
    return el('p', 'aviso' + (classe ? ' ' + classe : ''), esc(texto));
  }

  /* cartão de insight (observação de dados) */
  function insightCard(ins) {
    var tom = ins.tom || 'neutro';
    var ic = tom === 'positivo' ? 'estrela' : tom === 'atencao' ? 'alerta' : 'lista';
    var c = el('div', 'insight ' + tom);
    c.appendChild(el('span', 'insight-chip',
      icone(ic) + '<span>' + esc(ins.titulo) + '</span>'));
    var t = el('p', 'insight-title');
    t.textContent = ins.texto;
    c.appendChild(t);
    if (ins.evidencias && ins.evidencias.length) {
      var evs = el('div', 'insight-ev');
      ins.evidencias.forEach(function (e) {
        evs.appendChild(el('span', null, esc(e.rotulo) + ' <b>' + esc(e.valor) + '</b>'));
      });
      c.appendChild(evs);
    }
    return c;
  }

  function pillDelta(valor, opts) {
    opts = opts || {};
    var lim = opts.limiar != null ? opts.limiar : 0.25;
    var ic = valor > lim ? 'up' : valor < -lim ? 'down' : 'flat';
    var cls = valor > lim ? 'pos' : valor < -lim ? 'neg' : 'neu';
    var rot = valor > lim ? 'crescimento' : valor < -lim ? 'queda' : 'estabilidade';
    return el('span', 'delta-pill ' + cls,
      icone(ic) + '<b>' + esc((valor > 0 ? '+' : valor < 0 ? '−' : '') + Math.abs(valor).toFixed(1).replace('.', ',')) + '</b>' + (opts.mostrarRotulo ? '<em>' + rot + '</em>' : ''));
  }

  /* avatar de iniciais (sem fotos de alunos) */
  function iniciais(nome) {
    var partes = String(nome || '').trim().split(/\s+/).filter(function (p) { return p.length > 2; });
    if (!partes.length) partes = String(nome || '?').split(/\s+/);
    var a = (partes[0] || '?').charAt(0);
    var b = partes.length > 1 ? partes[partes.length - 1].charAt(0) : '';
    return (a + b).toUpperCase();
  }

  function avatar(nome, cor, classe) {
    var s = el('span', 'avatar' + (classe ? ' ' + classe : ''));
    s.style.background = cor || '#e9f1fc';
    s.textContent = iniciais(nome);
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /* selo circular (badge) usado na tabela de disciplinas */
  function selo(valor, cor, texto, info) {
    var s = el('span', 'selo');
    s.style.background = cor;
    s.textContent = valor;
    if (info) s.setAttribute('data-tip', info);
    if (texto) s.setAttribute('aria-label', texto);
    return s;
  }

  return {
    esc: esc, el: el, icone: icone, secao: secao, cardMetrica: cardMetrica, ajuda: ajuda,
    chip: chip, vazio: vazio, aviso: aviso, insightCard: insightCard, pillDelta: pillDelta,
    avatar: avatar, iniciais: iniciais, selo: selo
  };
})();
