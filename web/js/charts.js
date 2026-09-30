/* ============================================================================
   CHARTS — biblioteca de gráficos SVG própria (sem dependências externas)
   ----------------------------------------------------------------------------
   Tudo é renderizado no navegador; nenhum dado ou biblioteca vem da internet.
   Cada gráfico recebe um elemento container e um objeto de opções, e se
   re-renderiza automaticamente quando a largura muda (ResizeObserver).
   ========================================================================== */

window.Charts = (function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* --------------------------------------------------------------- utilidades */

  function el(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function txt(x, y, str, attrs) {
    var t = el('text', Object.assign({ x: x, y: y }, attrs || {}));
    t.textContent = str;
    return t;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function niceTicks(min, max, alvo) {
    var span = max - min;
    if (span <= 0) return [min];
    var passo = [0.5, 1, 2, 2.5, 5, 10, 20].filter(function (p) { return span / p <= (alvo || 6); })[0] || span;
    var t = [], v = Math.ceil(min / passo) * passo;
    for (; v <= max + 1e-9; v += passo) t.push(Math.round(v * 100) / 100);
    return t;
  }

  /* cores categóricas (série de disciplinas) — mesma família visual dos cards */
  var PALETA = ['#3d7bd9', '#63b32e', '#f2a93b', '#9b6ede', '#f2694b', '#2ab7ca', '#a16207', '#d84f8e', '#4d6b8a', '#6b7280', '#0f766e'];

  /* cores semânticas do produto */
  var COR = {
    verde: '#63b32e',
    verdeEscuro: '#3f7a1d',
    verdeSuave: '#eaf6df',
    ambar: '#f2a93b',
    ambarEscuro: '#9a6914',
    ambarSuave: '#fdf2df',
    coral: '#f2694b',
    coralEscuro: '#b04a32',
    coralSuave: '#fdeae5',
    azul: '#3d7bd9',
    azulSuave: '#e9f1fc',
    tinta: '#171a1d',
    cinza: '#6f7780'
  };

  function paletteCategoria(i) { return PALETA[i % PALETA.length]; }

  /* escala de cor para nota (0-10), ancorada na referência da escola:
     abaixo da referência = coral; acima = verde; perto = âmbar suave */
  function notaColor(v) {
    if (v == null) return 'transparent';
    var ref = (window.CONFIG && window.CONFIG.notaReferencia != null) ? window.CONFIG.notaReferencia : 6;
    var d = (v - ref) / 10;               // distância normalizada da referência
    if (d >= -0.045 && d <= 0.045) return '#fdf2df';
    var forca = Math.min(1, Math.abs(d) / 0.45);
    if (d > 0) return 'hsl(95,' + (42 + forca * 18).toFixed(0) + '%,' + (86 - forca * 18).toFixed(0) + '%)';
    return 'hsl(14,' + (55 + forca * 25).toFixed(0) + '%,' + (91 - forca * 16).toFixed(0) + '%)';
  }

  function notaTextColor(v) {
    return v == null ? '#8a93a0' : '#252b33';
  }

  /* escala divergente para variações (-2..+2) */
  function deltaColor(v) {
    if (v == null) return 'transparent';
    var t = Math.max(-2, Math.min(2, v)) / 2;
    if (Math.abs(t) < 0.03) return 'hsl(210,12%,92%)';
    var hue = t > 0 ? 95 : 14;
    var lig = 88 - Math.abs(t) * 16;
    return 'hsl(' + hue + ',52%,' + lig.toFixed(0) + '%)';
  }

  /* ------------------------------------------------------------------ tooltip */

  var tipEl = null;
  function tipNode() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tooltip';
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  function showTip(html, x, y) {
    var t = tipNode();
    t.innerHTML = html;
    t.classList.add('visible');
    var r = t.getBoundingClientRect();
    var px = x + 14, py = y + 14;
    if (px + r.width > window.innerWidth - 12) px = x - r.width - 14;
    if (py + r.height > window.innerHeight - 12) py = y - r.height - 14;
    t.style.left = Math.max(8, px) + 'px';
    t.style.top = Math.max(8, py) + 'px';
  }

  function hideTip() { if (tipEl) tipEl.classList.remove('visible'); }

  function tipHTML(titulo, subtitulo, linhas) {
    var h = '<div class="tooltip-title">' + titulo + '</div>';
    if (subtitulo) h += '<div class="tooltip-sub">' + subtitulo + '</div>';
    if (linhas && linhas.length) {
      h += '<div class="tooltip-rows">';
      linhas.forEach(function (l) {
        h += '<div class="tooltip-row"><span>' + l.rotulo + '</span><b>' + l.valor + '</b></div>';
      });
      h += '</div>';
    }
    return h;
  }

  /* -------------------------------------------------------- montagem reativa */

  var observer = ('ResizeObserver' in window) ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) {
      var host = e.target;
      if (!host.__chartRender) return;
      var w = host.clientWidth;
      if (Math.abs(w - (host.__chartW || 0)) < 5) return;
      if (host.__chartFrame) cancelAnimationFrame(host.__chartFrame);
      host.__chartFrame = requestAnimationFrame(function () {
        host.__chartFrame = null;
        if (!host.isConnected || !host.__chartRender) return;
        host.__chartW = host.clientWidth;
        host.__chartRender(host.__chartW);
      });
    });
  }) : null;

  function dispose(container) {
    container.querySelectorAll('*').forEach(function (host) {
      if (host.__chartRender) {
        if (observer) observer.unobserve(host);
        if (host.__chartFrame) cancelAnimationFrame(host.__chartFrame);
        delete host.__chartRender;
      }
    });
  }

  function mount(host, render) {
    host.__chartRender = render;
    host.__chartW = host.clientWidth;
    render(host.clientWidth);
    if (observer) observer.observe(host);
  }

  /* ------------------------------------------------------------ linha (multi) */

  /**
   * opts: {
   *   altura, series:[{id,nome,cor,valores:[num|null],destaque,muted}],
   *   xLabels:[str], refLine:{valor,rotulo}, yDomain:[a,b], fmtY(fn),
   *   tooltip:(idx)=>html, interativo (default true), yTitulo
   * }
   */
  function lineChart(host, opts) {
    mount(host, function (width) { renderLine(host, opts, width); });
  }

  function renderLine(host, opts, width) {
    clear(host);
    var H = typeof opts.altura === 'function' ? opts.altura() : (opts.altura || 300);
    var ml = 42, mr = 18, mt = 30, mb = 30;
    var W = Math.max(280, width);
    var iw = W - ml - mr, ih = H - mt - mb;
    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || '')]));

    var dom = opts.yDomain || [0, 10];
    function Y(v) { return mt + ih - (v - dom[0]) / (dom[1] - dom[0]) * ih; }
    var n = opts.xLabels.length;
    function X(i) { return ml + (n === 1 ? iw / 2 : (i + 0.5) * iw / n); }

    /* grade */
    niceTicks(dom[0], dom[1], 5).forEach(function (tv) {
      svg.appendChild(el('line', { x1: ml, y1: Y(tv), x2: ml + iw, y2: Y(tv), class: 'g-grid' }));
      svg.appendChild(txt(ml - 8, Y(tv) + 4, (opts.fmtY || function (v) { return String(v); })(tv), { class: 'g-tick', 'text-anchor': 'end' }));
    });

    /* eixo x */
    opts.xLabels.forEach(function (lab, i) {
      svg.appendChild(txt(X(i), H - 10, lab, { class: 'g-tick', 'text-anchor': 'middle' }));
    });

    /* linha de referência */
    if (opts.refLine && opts.refLine.valor != null) {
      svg.appendChild(el('line', { x1: ml, y1: Y(opts.refLine.valor), x2: ml + iw, y2: Y(opts.refLine.valor), class: 'g-ref' }));
      svg.appendChild(txt(ml + iw - 2, 12, 'Referência: ' + String(opts.refLine.valor).replace('.', ','), { class: 'g-ref-label', 'text-anchor': 'end' }));
    }

    /* séries */
    var grupos = el('g');
    opts.series.forEach(function (s, si) {
      var cor = s.muted ? '#c3cad3' : (s.cor || paletteCategoria(si));
      var g = el('g', { class: 'serie' + (s.muted ? ' muted' : '') + (s.destaque ? ' destaque' : '') });
      var d = '', pen = false;
      s.valores.forEach(function (v, i) {
        if (v == null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ';
        pen = true;
      });
      if (d) g.appendChild(el('path', { d: d, fill: 'none', stroke: cor, 'stroke-width': s.destaque ? 2.6 : 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      s.valores.forEach(function (v, i) {
        if (v == null) return;
        g.appendChild(el('circle', { cx: X(i), cy: Y(v), r: s.destaque ? 4 : 3, fill: '#fff', stroke: cor, 'stroke-width': 2 }));
      });
      grupos.appendChild(g);
    });
    svg.appendChild(grupos);

    /* interação */
    if (opts.interativo !== false) {
      var guide = el('line', { x1: 0, y1: mt, x2: 0, y2: mt + ih, class: 'g-guide', opacity: 0 });
      svg.appendChild(guide);
      var focus = el('g', { opacity: 0 });
      svg.appendChild(focus);
      var overlay = el('rect', { x: ml, y: mt, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' });
      svg.appendChild(overlay);

      function move(evt) {
        var rect = svg.getBoundingClientRect();
        var mx = (evt.clientX - rect.left) * W / rect.width;
        var idx = Math.min(n - 1, Math.max(0, Math.floor((mx - ml) / (iw / n))));
        guide.setAttribute('x1', X(idx)); guide.setAttribute('x2', X(idx)); guide.setAttribute('opacity', 1);
        clear(focus);
        opts.series.forEach(function (s, si) {
          if (s.muted) return;
          var v = s.valores[idx];
          if (v == null) return;
          focus.appendChild(el('circle', { cx: X(idx), cy: Y(v), r: 5, fill: s.cor || paletteCategoria(si), stroke: '#fff', 'stroke-width': 2 }));
        });
        focus.setAttribute('opacity', 1);
        if (opts.tooltip) showTip(opts.tooltip(idx), evt.clientX, evt.clientY);
      }
      overlay.addEventListener('pointermove', move);
      overlay.addEventListener('click', move);
      overlay.addEventListener('mouseleave', function () { guide.setAttribute('opacity', 0); focus.setAttribute('opacity', 0); hideTip(); });
      host.__lineMove = move;

      /* teclado */
      host.setAttribute('tabindex', '0');
      var ki = -1;
      host.onkeydown = function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        ki = Math.min(n - 1, Math.max(0, ki + (e.key === 'ArrowRight' ? 1 : -1)));
        var vb = svg.getBoundingClientRect();
        guide.setAttribute('x1', X(ki)); guide.setAttribute('x2', X(ki)); guide.setAttribute('opacity', 1);
        if (opts.tooltip) showTip(opts.tooltip(ki), vb.left + X(ki), vb.top + mt + 20);
      };
      host.onblur = hideTip;
    }
    host.appendChild(svg);
  }

  /* ------------------------------------------------------------ mini linha */

  function miniLine(host, opts) {
    mount(host, function (width) {
      clear(host);
      var H = opts.altura || 42, W = Math.max(60, width);
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      var vals = opts.valores;
      var com = vals.filter(function (v) { return v != null; });
      if (!com.length) { host.appendChild(svg); return; }
      var mn = Math.min.apply(null, com), mx = Math.max.apply(null, com);
      var lo = opts.dominio ? opts.dominio[0] : Math.max(0, Math.floor(mn - (mx === mn ? 1 : 0)) - 0.5);
      var hi = opts.dominio ? opts.dominio[1] : Math.min(10, Math.ceil(mx + (mx === mn ? 1 : 0)) + 0.5);
      if (hi - lo < 1) { hi = Math.min(10, lo + 1); }
      var pad = 6;
      function Y(v) { return H - pad - (v - lo) / (hi - lo) * (H - pad * 2); }
      function X(i) { return vals.length === 1 ? W / 2 : pad + i * (W - pad * 2) / (vals.length - 1); }
      var d = '', pen = false;
      vals.forEach(function (v, i) {
        if (v == null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ';
        pen = true;
      });
      if (d) svg.appendChild(el('path', { d: d, fill: 'none', stroke: opts.cor || '#2e5aa8', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      vals.forEach(function (v, i) {
        if (v == null) return;
        var ult = i === vals.length - 1;
        svg.appendChild(el('circle', { cx: X(i), cy: Y(v), r: ult ? 3.4 : 2.4, fill: ult ? (opts.cor || '#2e5aa8') : '#fff', stroke: opts.cor || '#2e5aa8', 'stroke-width': 1.8 }));
      });
      if (opts.linhaReferencia != null) {
        svg.appendChild(el('line', { x1: 0, y1: Y(opts.linhaReferencia), x2: W, y2: Y(opts.linhaReferencia), class: 'g-ref-mini' }));
      }
      host.appendChild(svg);
    });
  }

  /* ------------------------------------------------------- barras horizontais */

  /**
   * opts: {
   *   itens:[{id,rotulo,valor,cor,mediana,medianaN,sub,classe}],
   *   max, fmt, refLine:{valor,rotulo}, onRowClick(id), rotuloMediana
   * }
   */
  function hBars(host, opts) {
    mount(host, function (width) {
      clear(host);
      var itens = opts.itens;
      var compact = width < 440;
      var rowH = compact ? 66 : (opts.rowH || 38);
      var labelW = compact ? 0 : Math.max(opts.labelW || 128, Math.min(190, Math.max.apply(null, itens.map(function (it) { return it.rotulo.length * 6.5 + 12; }))));
      var valW = compact ? 8 : 62;
      var H = itens.length * rowH + 26;
      var W = Math.max(240, width);
      var iw = W - labelW - valW - 8;
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || '')]));
      var dom0 = 0, dom1 = opts.max || 10;
      function X(v) { return labelW + (v - dom0) / (dom1 - dom0) * iw; }

      /* referência */
      if (opts.refLine && opts.refLine.valor != null) {
        svg.appendChild(el('line', { x1: X(opts.refLine.valor), y1: 4, x2: X(opts.refLine.valor), y2: H - 22, class: 'g-ref' }));
        svg.appendChild(txt(X(opts.refLine.valor), H - 6, opts.refLine.rotulo, { class: 'g-ref-label', 'text-anchor': 'middle' }));
      }

      itens.forEach(function (it, i) {
        var y = i * rowH + 6;
        var cy = compact ? y + 34 : y + rowH / 2 - 4;
        var g = el('g', { class: 'hb-row' + (it.classe ? ' ' + it.classe : '') });
        g.appendChild(txt(compact ? 0 : labelW - 10, compact ? y + 8 : cy + 4, it.rotulo, { class: 'g-label', 'text-anchor': compact ? 'start' : 'end' }));
        /* trilho */
        g.appendChild(el('rect', { x: labelW, y: cy - 8, width: iw, height: 16, rx: 3, class: 'g-track' }));
        var v = it.valor;
        if (v != null) {
          g.appendChild(el('rect', { x: labelW, y: cy - 8, width: Math.max(2, X(v) - labelW), height: 16, rx: 3, fill: it.cor || '#2e5aa8', opacity: it.opacidade || 0.85 }));
        } else {
          g.appendChild(txt(labelW + 6, cy + 4, 'sem nota numérica', { class: 'g-tick' }));
        }
        /* marcador da mediana da turma */
        if (it.mediana != null && opts.rotuloMediana !== false) {
          g.appendChild(el('rect', { x: X(it.mediana) - 1.4, y: cy - 12, width: 2.8, height: 24, rx: 1.4, fill: '#5b6470', class: 'g-mediana' }));
        }
        /* valor */
        g.appendChild(txt(W - 8, compact ? y + 8 : cy + 4, opts.fmt ? opts.fmt(v) : (v == null ? '—' : String(v)), { class: 'g-value', 'text-anchor': 'end' }));
        if (it.sub) g.appendChild(txt(W - 8, compact ? y + 58 : cy + 15, it.sub, { class: 'g-sub', 'text-anchor': 'end' }));
        g.appendChild(el('rect', { x: 0, y: y - 6, width: W, height: rowH, fill: 'transparent', class: 'g-hit' }));
        if (opts.tooltip) {
          g.addEventListener('mousemove', function (e) { showTip(opts.tooltip(it), e.clientX, e.clientY); });
          g.addEventListener('mouseleave', hideTip);
        }
        if (opts.onRowClick) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', function () { opts.onRowClick(it); });
          g.setAttribute('role', 'button');
          g.setAttribute('tabindex', '0');
          g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onRowClick(it); } });
        }
        svg.appendChild(g);
      });
      host.appendChild(svg);
    });
  }

  /* ------------------------------------------------------------- box plots */

  /**
   * grupos: [{id,rotulo,box:{min,q1,mediana,q3,max},aluno,n,sub}]
   * Renderiza uma grade de pequenos box plots verticais (SVG por célula).
   */
  function boxGrid(host, opts) {    clear(host);
    var grid = document.createElement('div');
    grid.className = 'box-grid';
    host.appendChild(grid);
    var dom = opts.yDomain || [0, 10];

    opts.grupos.forEach(function (g) {
      var cell = document.createElement('figure');
      cell.className = 'box-cell';
      var tit = document.createElement('figcaption');
      tit.innerHTML = '<span class="box-title">' + g.rotulo + '</span>' + (g.sub ? '<span class="box-sub">' + g.sub + '</span>' : '');
      cell.appendChild(tit);
      var chartHost = document.createElement('div');
      chartHost.className = 'box-host';
      cell.appendChild(chartHost);
      grid.appendChild(cell);

      function draw(width) {
        clear(chartHost);
        var H = 128, ml = 22, mr = 10, mt = 8, mb = 18;
        var W = Math.max(120, width);
        var iw = W - ml - mr, ih = H - mt - mb;
        var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
        svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || '')]));
        function Y(v) { return mt + ih - (v - dom[0]) / (dom[1] - dom[0]) * ih; }

        [0, 5, 10].forEach(function (tv) {
          if (tv < dom[0] || tv > dom[1]) return;
          svg.appendChild(el('line', { x1: ml, y1: Y(tv), x2: W - mr, y2: Y(tv), class: 'g-grid' }));
          svg.appendChild(txt(ml - 5, Y(tv) + 3.5, String(tv), { class: 'g-tick', 'text-anchor': 'end' }));
        });

        var cx = ml + iw / 2;
        var box = g.box;
        if (box && box.n) {
          var bw = Math.min(46, iw * 0.5);
          svg.appendChild(el('line', { x1: cx, y1: Y(box.min), x2: cx, y2: Y(box.max), class: 'g-whisker' }));
          svg.appendChild(el('line', { x1: cx - bw / 3, y1: Y(box.min), x2: cx + bw / 3, y2: Y(box.min), class: 'g-whisker' }));
          svg.appendChild(el('line', { x1: cx - bw / 3, y1: Y(box.max), x2: cx + bw / 3, y2: Y(box.max), class: 'g-whisker' }));
          svg.appendChild(el('rect', { x: cx - bw / 2, y: Y(box.q3), width: bw, height: Math.max(2, Y(box.q1) - Y(box.q3)), rx: 2, class: 'g-box' }));
          svg.appendChild(el('line', { x1: cx - bw / 2, y1: Y(box.mediana), x2: cx + bw / 2, y2: Y(box.mediana), class: 'g-median' }));
        } else {
          svg.appendChild(txt(cx, mt + ih / 2, 'sem dados', { class: 'g-tick', 'text-anchor': 'middle' }));
        }

        /* ponto do aluno */
        if (g.aluno != null) {
          svg.appendChild(el('circle', { cx: cx, cy: Y(g.aluno), r: 6, fill: '#2e5aa8', stroke: '#fff', 'stroke-width': 2.5, class: 'g-aluno-dot' }));
          svg.appendChild(txt(cx, Math.max(12, Y(g.aluno) - 10), (opts.fmt ? opts.fmt(g.aluno) : g.aluno), { class: 'g-aluno-label', 'text-anchor': 'middle' }));
        }
        chartHost.appendChild(svg);
      }
      mount(chartHost, draw);

      if (opts.tooltip) {
        cell.addEventListener('mousemove', function (e) { showTip(opts.tooltip(g), e.clientX, e.clientY); });
        cell.addEventListener('mouseleave', hideTip);
      }
    });
  }

  /* ------------------------------------------------ box plots horizontais */

  /**
   * Uma linha por grupo, caixa horizontal (leitura de distribuição).
   * opts: {
   *   grupos:[{id,rotulo,sub,box:{min,q1,mediana,q3,max,n},aluno,cor}],
   *   xDomain, fmt, refLine:{valor,rotulo}, tooltip(g), aria, rowH, labelW
   * }
   */
  function boxRows(host, opts) {
    mount(host, function (width) {
      clear(host);
      var grupos = opts.grupos || [];
      var rowH = opts.rowH || 58;
      var labelW = opts.labelW || 124;
      var valW = 78;
      var H = grupos.length * rowH + 42;
      var W = Math.max(340, width);
      var iw = W - labelW - valW;
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || '')]));
      var dom = opts.xDomain || [0, 10];
      var fmt = opts.fmt || function (v) { return String(v); };
      function X(v) { return labelW + (v - dom[0]) / (dom[1] - dom[0]) * iw; }

      niceTicks(dom[0], dom[1], 5).forEach(function (tv) {
        svg.appendChild(el('line', { x1: X(tv), y1: 6, x2: X(tv), y2: H - 30, class: 'g-grid' }));
        svg.appendChild(txt(X(tv), H - 11, String(tv), { class: 'g-tick', 'text-anchor': 'middle' }));
      });
      if (opts.refLine && opts.refLine.valor != null) {
        svg.appendChild(el('line', { x1: X(opts.refLine.valor), y1: 6, x2: X(opts.refLine.valor), y2: H - 30, class: 'g-ref' }));
        svg.appendChild(txt(Math.min(W - 70, X(opts.refLine.valor) + 5), 13, opts.refLine.rotulo, { class: 'g-ref-label' }));
      }

      grupos.forEach(function (g, i) {
        var cy = i * rowH + rowH / 2 - 3;
        var gr = el('g');
        gr.appendChild(txt(labelW - 12, cy + (g.sub ? -3 : 4), g.rotulo, { class: 'g-label', 'text-anchor': 'end' }));
        if (g.sub) gr.appendChild(txt(labelW - 12, cy + 13, g.sub, { class: 'g-sub', 'text-anchor': 'end' }));
        var box = g.box;
        if (box && box.n) {
          var cor = g.cor || '#2e5aa8';
          var top = cy - 13, alt = 26;
          gr.appendChild(el('line', { x1: X(box.min), y1: cy, x2: X(box.max), y2: cy, class: 'g-whisker' }));
          gr.appendChild(el('line', { x1: X(box.min), y1: top + 6, x2: X(box.min), y2: top + alt - 6, class: 'g-whisker' }));
          gr.appendChild(el('line', { x1: X(box.max), y1: top + 6, x2: X(box.max), y2: top + alt - 6, class: 'g-whisker' }));
          gr.appendChild(el('rect', { x: X(box.q1), y: top, width: Math.max(2, X(box.q3) - X(box.q1)), height: alt, rx: 6, fill: cor, opacity: .2 }));
          gr.appendChild(el('rect', { x: X(box.q1), y: top, width: Math.max(2, X(box.q3) - X(box.q1)), height: alt, rx: 6, fill: 'none', stroke: cor, 'stroke-width': 1.6 }));
          gr.appendChild(el('line', { x1: X(box.mediana), y1: top - 3, x2: X(box.mediana), y2: top + alt + 3, stroke: cor, 'stroke-width': 3, 'stroke-linecap': 'round' }));
          gr.appendChild(txt(W - 10, cy + 1, fmt(box.mediana), { class: 'g-value', 'text-anchor': 'end' }));
          gr.appendChild(txt(W - 10, cy + 14, opts.rotuloValor || 'mediana', { class: 'g-sub', 'text-anchor': 'end' }));
          if (g.aluno != null) {
            gr.appendChild(el('circle', { cx: X(g.aluno), cy: cy, r: 5.5, fill: '#2e5aa8', stroke: '#fff', 'stroke-width': 2 }));
            gr.appendChild(txt(X(g.aluno), cy + 25, fmt(g.aluno), { class: 'g-aluno-label', 'text-anchor': 'middle' }));
          }
        } else {
          gr.appendChild(txt(labelW + 8, cy + 4, 'sem dados', { class: 'g-tick' }));
        }
        gr.appendChild(el('rect', { x: 0, y: i * rowH, width: W, height: rowH, fill: 'transparent' }));
        if (opts.tooltip) {
          gr.addEventListener('mousemove', function (e) { showTip(opts.tooltip(g), e.clientX, e.clientY); });
          gr.addEventListener('mouseleave', hideTip);
        }
        svg.appendChild(gr);
      });
      host.appendChild(svg);
    });
  }

  /* ---------------------------------------------------------------- heatmap */

  /**
   * opts: {
   *   colunas:[str], linhas:[{id,rotulo,celulas:[{valor,display,nota,html}]}],
   *   escala:'nota'|'delta', fmt(fn), tooltip(celula,linha,colIdx)=>html,
   *   rodapeLinha:[str], rodapeColuna:[str], legenda:[{cor,rotulo}]
   * }
   */
  function heatmap(host, opts) {
    clear(host);
    var wrap = document.createElement('div');
    wrap.className = 'heat-wrap';
    var t = document.createElement('table');
    t.className = 'heat';
    var cap = document.createElement('caption');
    cap.className = 'visually-hidden';
    cap.textContent = opts.aria || 'Mapa de desempenho';
    t.appendChild(cap);

    var thead = document.createElement('thead');
    var trh = document.createElement('tr');
    trh.appendChild(document.createElement('th')).textContent = '';
    opts.colunas.forEach(function (c) { var th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
    if (opts.rodapeLinha) { var th0 = document.createElement('th'); th0.textContent = opts.rotuloRodape || ''; th0.className = 'foot-label'; trh.appendChild(th0); }
    thead.appendChild(trh);
    t.appendChild(thead);

    var tbody = document.createElement('tbody');
    opts.linhas.forEach(function (l) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.scope = 'row'; th.textContent = l.rotulo;
      tr.appendChild(th);
      (l.celulas || []).forEach(function (c, ci) {
        var td = document.createElement('td');
        var v = c.valor;
        var bg = opts.escala === 'delta' ? deltaColor(v) : notaColor(v);
        td.style.backgroundColor = bg;
        td.style.color = notaTextColor(v);
        td.innerHTML = c.display;
        if (opts.tooltip) {
          td.addEventListener('mousemove', function (e) { showTip(opts.tooltip(c, l, ci), e.clientX, e.clientY); });
          td.addEventListener('mouseleave', hideTip);
        }
        td.setAttribute('tabindex', '0');
        td.addEventListener('focus', function () {
          var r = td.getBoundingClientRect();
          showTip(opts.tooltip ? opts.tooltip(c, l, ci) : (c.titulo || ''), r.left + r.width, r.top + r.height);
        });
        td.addEventListener('blur', hideTip);
        if (c.classe) td.className = c.classe;
        tr.appendChild(td);
      });
      if (opts.rodapeLinha) {
        var tf = document.createElement('td');
        tf.className = 'foot';
        tf.textContent = opts.rodapeLinha[l.id] != null ? opts.rodapeLinha[l.id] : '—';
        tr.appendChild(tf);
      }
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);

    if (opts.rodapeColuna) {
      var tfoot = document.createElement('tfoot');
      var trf = document.createElement('tr');
      var thc = document.createElement('th'); thc.textContent = 'Média do bimestre'; trf.appendChild(thc);
      opts.rodapeColuna.forEach(function (c) { var td = document.createElement('td'); td.className = 'foot'; td.textContent = c; trf.appendChild(td); });
      if (opts.rodapeLinha) trf.appendChild(document.createElement('td'));
      tfoot.appendChild(trf);
      t.appendChild(tfoot);
    }
    wrap.appendChild(t);
    host.appendChild(wrap);

    if (opts.legenda) {
      var lg = document.createElement('div');
      lg.className = 'heat-legend';
      opts.legenda.forEach(function (item) {
        var s = document.createElement('span');
        s.innerHTML = '<i style="background:' + item.cor + '"></i>' + item.rotulo;
        lg.appendChild(s);
      });
      host.appendChild(lg);
    }
  }

  /* ------------------------------------------------------- slope (recuperação) */

  /**
   * opts: { altura, eventos:[{id,rotulo,nb,recuperacao,mb,ganho,cor}],
   *         pontos:['Antes da recuperação','Recuperação','Média final'],
   *         refLine:{valor,rotulo}, tooltip(ev)=>html }
   */
  function slope(host, opts) {
    mount(host, function (width) {
      clear(host);
      var eventos = opts.eventos;
      if (!eventos.length) return;
      var H = opts.altura || 320, ml = opts.compact ? 34 : 150, mr = opts.compact ? 18 : 90, mt = 30, mb = 34;
      var W = Math.max(340, width);
      var iw = W - ml - mr, ih = H - mt - mb;
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || 'Impacto da recuperação')]));
      var dom = [0, 10];
      function Y(v) { return mt + ih - v / 10 * ih; }
      function X(k) { return ml + k * iw / 2; }

      [0, 5, 10].forEach(function (tv) {
        svg.appendChild(el('line', { x1: ml, y1: Y(tv), x2: W - mr, y2: Y(tv), class: 'g-grid' }));
        svg.appendChild(txt(ml - 8, Y(tv) + 4, String(tv), { class: 'g-tick', 'text-anchor': 'end' }));
      });
      (opts.pontos || ['Antes', 'Recuperação', 'Final']).forEach(function (p, i) {
        svg.appendChild(txt(X(i), H - 12, p, { class: 'g-label', 'text-anchor': 'middle' }));
      });
      if (opts.refLine && opts.refLine.valor != null) {
        svg.appendChild(el('line', { x1: ml, y1: Y(opts.refLine.valor), x2: W - mr, y2: Y(opts.refLine.valor), class: 'g-ref' }));
        svg.appendChild(txt(ml - 2, Y(opts.refLine.valor) - 6, opts.refLine.rotulo, { class: 'g-ref-label' }));
      }

      /* deslocamento vertical para rótulos não colidirem */
      var usados = [];
      function livre(y) {
        var yy = y;
        usados.sort(function (a, b) { return a - b; });
        for (var k = 0; k < usados.length; k++) { if (Math.abs(usados[k] - yy) < 14) yy = usados[k] + 14; }
        usados.push(yy);
        return yy;
      }

      eventos.forEach(function (ev, i) {
        var g = el('g', { class: 'slope-row' });
        if (opts.compact) {
          g.setAttribute('role', 'img');
          g.setAttribute('aria-label', ev.rotulo + ': NB ' + (opts.fmt ? opts.fmt(ev.nb) : ev.nb) + ', recuperação ' + (opts.fmt ? opts.fmt(ev.recuperacao) : ev.recuperacao) + ', MB ' + (opts.fmt ? opts.fmt(ev.mb) : ev.mb));
        }
        var cor = ev.cor || paletteCategoria(i);
        var pts = [
          { x: X(0), y: Y(ev.nb), v: ev.nb },
          { x: X(1), y: Y(ev.recuperacao), v: ev.recuperacao },
          { x: X(2), y: Y(ev.mb), v: ev.mb }
        ];
        var d = '';
        pts.forEach(function (p, k) { if (p.v != null) d += (k === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' '; });
        if (d) g.appendChild(el('path', { d: d, fill: 'none', stroke: cor, 'stroke-width': 2, opacity: 0.85, 'stroke-linecap': 'round' }));
        pts.forEach(function (p) {
          if (p.v == null) return;
          g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 5, fill: '#fff', stroke: cor, 'stroke-width': 2.4 }));
        });
        if (!opts.compact) {
          /* rótulos (com deslocamento para não sobrepor quando as notas coincidem) */
          var yEsq = livre(Y(ev.nb));
          var yDir = livre(Y(ev.mb));
          g.appendChild(txt(ml - 12, yEsq + 4, ev.rotulo, { class: 'g-label', 'text-anchor': 'end' }));
          var rotuloDir = ev.mb == null ? '—' : (opts.fmt ? opts.fmt(ev.mb) : ev.mb);
          if (ev.ganho != null) rotuloDir += '  (' + (ev.ganho > 0 ? '+' : ev.ganho < 0 ? '−' : '') + Math.abs(ev.ganho).toFixed(1).replace('.', ',') + ')';
          var tDir = txt(X(2) + 12, yDir + 4, rotuloDir, { class: 'g-value', 'text-anchor': 'start', fill: ev.ganho > 0 ? '#2f8f5b' : (ev.ganho < 0 ? '#c05746' : '#5b6470') });
          g.appendChild(tDir);
          /* leve guia ligando o rótulo deslocado ao ponto */
          if (ev.mb != null && Math.abs(yDir - Y(ev.mb)) > 3) {
            g.appendChild(el('line', { x1: X(2) + 4, y1: Y(ev.mb), x2: X(2) + 9, y2: yDir, stroke: cor, 'stroke-width': 1, opacity: .6 }));
          }
        }
        var hit = el('rect', { x: 0, y: Y(Math.max(ev.nb || 0, ev.recuperacao || 0, ev.mb || 0)) - 10, width: W, height: 22, fill: 'transparent' });
        if (opts.tooltip) {
          g.addEventListener('mousemove', function (e) { showTip(opts.tooltip(ev), e.clientX, e.clientY); });
          g.addEventListener('mouseleave', hideTip);
          g.style.cursor = 'default';
        }
        g.appendChild(hit);
        svg.appendChild(g);
      });
      host.appendChild(svg);
    });
  }

  /* ------------------------------------------------------------------ scatter */

  function scatter(host, opts) {
    mount(host, function (width) {
      clear(host);
      var H = opts.altura || 340, ml = 46, mr = 20, mt = 18, mb = 42;
      var W = Math.max(320, width);
      var iw = W - ml - mr, ih = H - mt - mb;
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || 'Explorar padrões')]));
      var xd = opts.xDomain || [0, 10], yd = opts.yDomain || [0, 2];
      function X(v) { return ml + (v - xd[0]) / (xd[1] - xd[0]) * iw; }
      function Y(v) { return mt + ih - (v - yd[0]) / (yd[1] - yd[0]) * ih; }

      niceTicks(xd[0], xd[1], 5).forEach(function (tv) {
        svg.appendChild(el('line', { x1: X(tv), y1: mt, x2: X(tv), y2: mt + ih, class: 'g-grid' }));
        svg.appendChild(txt(X(tv), H - 24, (opts.fmtX || String)(tv), { class: 'g-tick', 'text-anchor': 'middle' }));
      });
      niceTicks(yd[0], yd[1], 4).forEach(function (tv) {
        svg.appendChild(el('line', { x1: ml, y1: Y(tv), x2: ml + iw, y2: Y(tv), class: 'g-grid' }));
        svg.appendChild(txt(ml - 8, Y(tv) + 4, (opts.fmtY || String)(tv), { class: 'g-tick', 'text-anchor': 'end' }));
      });
      svg.appendChild(txt(ml + iw / 2, H - 6, opts.xLabel || '', { class: 'g-axis-title', 'text-anchor': 'middle' }));
      svg.appendChild(txt(14, mt + ih / 2, opts.yLabel || '', { class: 'g-axis-title', 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (mt + ih / 2) + ')' }));

      if (opts.xDiv != null) {
        svg.appendChild(el('line', { x1: X(opts.xDiv), y1: mt, x2: X(opts.xDiv), y2: mt + ih, class: 'g-divider' }));
        svg.appendChild(txt(X(opts.xDiv), mt - 4, opts.xDivRotulo || '', { class: 'g-divider-label', 'text-anchor': 'middle' }));
      }
      if (opts.yDiv != null) {
        svg.appendChild(el('line', { x1: ml, y1: Y(opts.yDiv), x2: ml + iw, y2: Y(opts.yDiv), class: 'g-divider' }));
        svg.appendChild(txt(ml + iw - 2, Y(opts.yDiv) - 5, opts.yDivRotulo || '', { class: 'g-divider-label', 'text-anchor': 'end' }));
      }

      var occupied = [];
      var showLabels = !opts.hideLabelsBelow || width >= opts.hideLabelsBelow;
      opts.pontos.forEach(function (p) {
        var g = el('g', { class: 'scatter-point', tabindex: '0', role: 'img', 'aria-label': p.rotulo + ': média ' + p.x + ', oscilação ' + p.y });
        g.appendChild(el('circle', { cx: X(p.x), cy: Y(p.y), r: p.destaque ? 8 : 6, fill: p.cor || '#2e5aa8', opacity: 0.85, stroke: '#fff', 'stroke-width': 1.5 }));
        if (showLabels) {
          var lw = p.rotulo.length * 6 + 8, lx = Math.max(ml + lw / 2, Math.min(W - lw / 2 - 6, X(p.x)));
          var ly = Y(p.y) - 14;
          for (var attempt = 0; attempt < 20; attempt++) {
            ly = Y(p.y) - 14 - attempt * 16;
            if (ly < mt + 14) ly = Y(p.y) + 22 + attempt * 16;
            var collision = occupied.some(function (b) { return Math.abs(b.x - lx) < (b.w + lw) / 2 && Math.abs(b.y - ly) < 15; });
            if (!collision && ly < H - mb) break;
          }
          occupied.push({ x: lx, y: ly, w: lw });
          if (Math.abs(ly - Y(p.y)) > 18) g.appendChild(el('line', { x1: X(p.x), y1: Y(p.y), x2: lx, y2: ly + 3, stroke: '#b8abc7', 'stroke-width': 1 }));
          g.appendChild(txt(lx, ly, p.rotulo, { class: 'g-point-label', 'text-anchor': 'middle', style: 'paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round' }));
        }
        if (opts.tooltip) {
          g.addEventListener('pointermove', function (e) { showTip(opts.tooltip(p), e.clientX, e.clientY); });
          g.addEventListener('focus', function () { var r = g.getBoundingClientRect(); showTip(opts.tooltip(p), r.left, r.top); });
          g.addEventListener('blur', hideTip);
          g.addEventListener('mouseleave', hideTip);
        }
        svg.appendChild(g);
      });
      host.appendChild(svg);
    });
  }

  /* --------------------------------------------------------------- histograma */

  function histogram(host, opts) {
    mount(host, function (width) {
      clear(host);
      var H = opts.altura || 220, ml = 34, mr = 14, mt = 26, mb = 34;
      var W = Math.max(260, width);
      var iw = W - ml - mr, ih = H - mt - mb;
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || 'Distribuição de notas')]));
      var dom = [0, 10], bin = opts.bin || 0.5;
      var bins = [];
      for (var b = dom[0]; b < dom[1] - 1e-9; b += bin) bins.push({ de: b, ate: b + bin, n: 0 });
      (opts.valores || []).forEach(function (v) {
        if (v == null) return;
        var i = Math.min(bins.length - 1, Math.floor((v - dom[0]) / bin));
        bins[i].n++;
      });
      var maxN = Math.max(1, Math.max.apply(null, bins.map(function (x) { return x.n; })));
      function X(v) { return ml + v / 10 * iw; }
      function Y(n) { return mt + ih - n / maxN * ih; }
      bins.forEach(function (bn) {
        svg.appendChild(el('rect', {
          x: X(bn.de) + 1, y: Y(bn.n), width: Math.max(1, X(bn.ate) - X(bn.de) - 2), height: mt + ih - Y(bn.n),
          rx: 2, fill: opts.cor || '#9fb4d0', opacity: 0.9
        }));
        if (bn.n) svg.appendChild(txt((X(bn.de) + X(bn.ate)) / 2, Y(bn.n) - 5, String(bn.n), { class: 'g-tick', 'text-anchor': 'middle' }));
      });
      niceTicks(0, 10, 5).forEach(function (tv) {
        svg.appendChild(txt(X(tv), H - 10, String(tv), { class: 'g-tick', 'text-anchor': 'middle' }));
      });
      if (opts.refLine && opts.refLine.valor != null) {
        svg.appendChild(el('line', { x1: X(opts.refLine.valor), y1: mt, x2: X(opts.refLine.valor), y2: mt + ih, class: 'g-ref' }));
        svg.appendChild(txt(X(opts.refLine.valor) + 5, 14, opts.refLine.rotulo, { class: 'g-ref-label' }));
      }
      if (opts.mediana != null) {
        svg.appendChild(el('line', { x1: X(opts.mediana), y1: mt, x2: X(opts.mediana), y2: mt + ih, class: 'g-median-line' }));
        svg.appendChild(txt(X(opts.mediana), mt + ih + 18, 'mediana ' + (opts.fmt ? opts.fmt(opts.mediana) : opts.mediana), { class: 'g-ref-label', 'text-anchor': 'middle' }));
      }
      if (opts.aluno != null) {
        svg.appendChild(el('polygon', {
          points: (X(opts.aluno) - 6) + ',' + (mt + ih + 2) + ' ' + (X(opts.aluno) + 6) + ',' + (mt + ih + 2) + ' ' + X(opts.aluno) + ',' + (mt + ih - 8),
          fill: '#2e5aa8'
        }));
      }
      host.appendChild(svg);
    });
  }

  /* ------------------------------------------- barras de faixa (consistência) */

  /**
   * opts: { itens:[{id,rotulo,cor,pontos:[{bimestre,nota}],min,max,media,extra}],
   *         rowH, labelW, tooltip(item) }
   */
  function rangeBars(host, opts) {
    mount(host, function (width) {
      clear(host);
      var itens = opts.itens;
      var compact = width < 550;
      var rowH = compact ? 66 : (opts.rowH || 38);
      var labelW = compact ? 0 : (opts.labelW || 144);
      var H = itens.length * rowH + 52;
      var W = Math.max(240, width);
      var iw = W - labelW - (compact ? 12 : 155);
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || '')]));
      function X(v) { return labelW + v / 10 * iw; }

      [0, 5, 10].forEach(function (tv) {
        svg.appendChild(el('line', { x1: X(tv), y1: 4, x2: X(tv), y2: H - 20, class: 'g-grid' }));
        svg.appendChild(txt(X(tv), H - 6, tv.toFixed(0), { class: 'g-tick', 'text-anchor': 'middle' }));
      });
      if (opts.refLine && opts.refLine.valor != null) {
        svg.appendChild(el('line', { x1: X(opts.refLine.valor), y1: 4, x2: X(opts.refLine.valor), y2: H - 20, class: 'g-ref' }));
        svg.appendChild(txt(X(opts.refLine.valor), 12, opts.refLine.rotulo, { class: 'g-ref-label', 'text-anchor': 'middle' }));
      }

      itens.forEach(function (it, i) {
        var y = i * rowH + 24;
        var cy = y + (compact ? 30 : rowH / 2 - 2);
        var g = el('g');
        g.appendChild(txt(compact ? 0 : labelW - 10, compact ? y + 8 : cy + 4, it.rotulo, { class: 'g-label', 'text-anchor': compact ? 'start' : 'end' }));
        if (it.min != null && it.max != null) {
          g.appendChild(el('rect', { x: X(it.min), y: cy - 5, width: Math.max(3, X(it.max) - X(it.min)), height: 10, rx: 5, fill: it.cor || '#9fb4d0', opacity: 0.35 }));
        }
        (it.pontos || []).forEach(function (p) {
          if (p.nota == null) return;
          g.appendChild(el('circle', { cx: X(p.nota), cy: cy, r: 4.4, fill: '#fff', stroke: it.cor || '#2e5aa8', 'stroke-width': 2.2 }));
        });
        if (it.extra) g.appendChild(txt(W - 4, compact ? y + 56 : cy + 4, it.extra, { class: 'g-sub', 'text-anchor': 'end' }));
        g.appendChild(el('rect', { x: 0, y: y - 6, width: W, height: rowH, fill: 'transparent' }));
        if (opts.tooltip) {
          g.addEventListener('mousemove', function (e) { showTip(opts.tooltip(it), e.clientX, e.clientY); });
          g.addEventListener('mouseleave', hideTip);
        }
        svg.appendChild(g);
      });
      host.appendChild(svg);
    });
  }

  /* -------------------------------------------------------------------- donut */

  function polar(cx, cy, r, ang) {
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  }

  function ringPath(cx, cy, rFora, rDentro, a0, a1) {
    var grande = (a1 - a0) > Math.PI ? 1 : 0;
    var p0 = polar(cx, cy, rFora, a0), p1 = polar(cx, cy, rFora, a1);
    var p2 = polar(cx, cy, rDentro, a1), p3 = polar(cx, cy, rDentro, a0);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      ' A' + rFora + ' ' + rFora + ' 0 ' + grande + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
      ' L' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) +
      ' A' + rDentro + ' ' + rDentro + ' 0 ' + grande + ' 0 ' + p3[0].toFixed(2) + ' ' + p3[1].toFixed(2) + ' Z';
  }

  /**
   * opts: { segmentos:[{id,rotulo,valor,cor,sub}], centro:{valor,rotulo},
   *         altura, espessura, tooltip(seg), aria }
   */
  function donut(host, opts) {
    var ativo = -1;
    function render(width) {
      clear(host);
      var segs = (opts.segmentos || []).filter(function (s) { return s.valor > 0; });
      var H = opts.altura || 172;
      var W = Math.max(150, width);
      var cx = W / 2, cy = H / 2;
      var rFora = Math.min(W, H) / 2 - 6;
      var rDentro = Math.max(24, rFora - (opts.espessura || 26));
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || 'Distribuição')]));
      var total = segs.reduce(function (s, x) { return s + x.valor; }, 0);
      var a = -Math.PI / 2;

      /* trilho */
      svg.appendChild(el('circle', { cx: cx, cy: cy, r: (rFora + rDentro) / 2, fill: 'none', stroke: '#eef1f4', 'stroke-width': rFora - rDentro }));

      segs.forEach(function (s, i) {
        var frac = s.valor / total;
        var a1 = a + frac * Math.PI * 2;
        var destaque = ativo === i;
        var recuo = destaque ? 3 : 0;
        var g = el('g', { style: 'cursor:pointer' });
        if (segs.length === 1) {
          g.appendChild(el('circle', { cx: cx, cy: cy, r: (rFora + rDentro) / 2, fill: 'none', stroke: s.cor, 'stroke-width': rFora - rDentro - recuo * 2, opacity: ativo >= 0 && !destaque ? 0.45 : 1 }));
        } else {
          var d = ringPath(cx, cy, rFora - recuo, rDentro + recuo, a, a1);
          g.appendChild(el('path', { d: d, fill: s.cor, opacity: ativo >= 0 && !destaque ? 0.45 : 1 }));
        }
        g.addEventListener('mouseenter', function () { ativo = i; render(width); if (opts.tooltip) { var r = host.getBoundingClientRect(); showTip(opts.tooltip(s), r.right - 40, r.top + 8); } });
        g.addEventListener('mouseleave', function () { ativo = -1; hideTip(); render(width); });
        if (opts.onClick) g.addEventListener('click', function () { opts.onClick(s); });
        svg.appendChild(g);
        a = a1;
      });

      var cSeg = ativo >= 0 ? segs[ativo] : null;
      var centro = opts.centro || {};
      svg.appendChild(txt(cx, cy - 2, cSeg ? String(cSeg.valor) : String(centro.valor != null ? centro.valor : total), { 'text-anchor': 'middle', class: 'donut-valor' }));
      svg.appendChild(txt(cx, cy + 16, cSeg ? cSeg.rotulo : (centro.rotulo || 'no total'), { 'text-anchor': 'middle', class: 'donut-rotulo' }));
      host.appendChild(svg);
    }
    mount(host, render);
  }

  /* -------------------------------------------------------------------- gauge */

  /**
   * opts: { valor, max, ref, rotulo, altura, cor, aria }
   */
  function gauge(host, opts) {
    mount(host, function (width) {
      clear(host);
      var H = opts.altura || 150;
      var W = Math.max(130, width);
      var cx = W / 2, cy = H * 0.82;
      var r = Math.min(W / 2 - 8, H * 0.66);
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {}, [document.createTextNode(opts.aria || 'Indicador')]));
      var max = opts.max || 10;
      function ponto(frac) { var ang = Math.PI + Math.PI * Math.max(0, Math.min(1, frac)); return polar(cx, cy, r, ang); }
      function arco(de, ate, cor, largura) {
        var p0 = ponto(de), p1 = ponto(ate);
        svg.appendChild(el('path', {
          d: 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1),
          fill: 'none', stroke: cor, 'stroke-width': largura, 'stroke-linecap': 'round'
        }));
      }
      arco(0, 1, '#d9cee7', 14);
      var frac = (opts.valor || 0) / max;
      if (frac > 0.005) arco(0, frac, opts.cor || COR.verde, 14);
      if (opts.ref != null) {
        var fr = opts.ref / max;
        var pr = ponto(fr);
        svg.appendChild(el('circle', { cx: pr[0], cy: pr[1], r: 4.5, fill: '#fff', stroke: '#46536a', 'stroke-width': 2.2 }));
      }
      host.appendChild(svg);
    });
  }

  /* ------------------------------------------------------------------ legenda */

  function legend(host, itens, onToggle) {
    clear(host);
    itens.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'legend-chip' + (it.ativo ? '' : ' off') + (it.destaque ? ' destaque' : '');
      b.setAttribute('aria-pressed', it.ativo ? 'true' : 'false');
      b.innerHTML = '<i style="background:' + (it.ativo ? it.cor : '#c3cad3') + '"></i>' + it.nome;
      b.addEventListener('click', function () { onToggle(it.id); });
      host.appendChild(b);
    });
  }

  return { dispose: dispose,
    mount: mount, clear: clear,
    lineChart: lineChart, miniLine: miniLine, hBars: hBars, boxGrid: boxGrid, boxRows: boxRows,
    heatmap: heatmap, slope: slope, scatter: scatter, histogram: histogram, legend: legend,
    rangeBars: rangeBars, donut: donut, gauge: gauge,
    showTip: showTip, hideTip: hideTip, tipHTML: tipHTML,
    paletteCategoria: paletteCategoria, notaColor: notaColor, deltaColor: deltaColor,
    PALETA: PALETA, COR: COR
  };
})();
