'use strict';
const { chromium, webkit } = require('@playwright/test');
const JSZip = require('jszip');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts');
fs.mkdirSync(out, { recursive: true });
const studentSections = ['aluno', 'resumo', 'disciplinas-tabela', 'leitura', 'trajetoria', 'contexto', 'padroes', 'detalhados'];
const cohortSections = ['coorte-resumo', 'coorte-tabela', 'coorte-evolucao', 'coorte-mediana', 'coorte-distribuicao', 'coorte-atencao', 'coorte-notas'];
const password = process.env.PANEL_PASSWORD;
if (!password) throw new Error('Defina PANEL_PASSWORD para testar o acesso.');
const port = 4174;
const server = spawn(process.execPath, ['tools/serve.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true });
let checks = 0;
let activeBrowser;
function check(value, label) { assert.ok(value, label); checks++; }
async function fit(page, label) {
  const report = await page.evaluate(() => {
    const wide = document.documentElement.scrollWidth > innerWidth + 2;
    const escapes = [...document.querySelectorAll('#view .card, #view .kpi, .filterbar, .workspace-nav, .auth-wall')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width && (r.left < -2 || r.right > innerWidth + 2);
    }).map(el => el.id || el.className);
    return { wide, escapes };
  });
  check(!report.wide && !report.escapes.length, label + ': ' + JSON.stringify(report));
}
async function run() {
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
  const browser = activeBrowser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:' + port);
  check(await page.locator('#auth-wall').isVisible(), 'login visible');
  check(await page.locator('#app').isHidden(), 'app hidden before authentication');
  check(await page.evaluate(() => !window.SCHOOL_DATA), 'no cleartext data before login');
  check((await page.request.get('http://localhost:' + port + '/js/dados.js')).status() === 404, 'no public cleartext dataset');
  check((await page.request.get('http://localhost:' + port + '/data/dados.js')).status() === 404, 'private data inaccessible');
  check((await page.request.get('http://localhost:' + port + '/js/vendor/vercel-analytics.js')).status() === 200, 'installed analytics package is served from the static build');
  await page.screenshot({ path: path.join(out, 'login-desktop.png'), fullPage: true });
  await page.locator('#password').fill('incorrect');
  await page.locator('#login-submit').click();
  await page.locator('#password[aria-invalid="true"]').waitFor();
  check(await page.locator('#app').isHidden(), 'incorrect password rejected');
  await page.locator('#password').fill(password);
  await page.locator('#login-submit').click();
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.locator('#selecionar-ano').waitFor();
  check(await page.locator('#view h1').textContent() === 'Selecione um ano', 'initial view requests a school year');
  check(await page.locator('#coorte-resumo, #aluno, #view svg').count() === 0, 'no results before choosing a school year');
  check(await page.locator('.app-foot').isHidden(), 'analysis navigation hidden without a school year');
  for (const id of ['f-aluno', 'f-turma', 'f-disciplina', 'f-bimestre']) {
    check(await page.locator('#' + id + ' + .dd .dd-btn').isDisabled(), id + ' waits for a school year');
    check(await page.locator('#' + id + ' option').count() === 1, id + ' has no unscoped options');
  }
  await page.locator('#btn-selecionar-ano').click();
  check(await page.locator('#f-ano + .dd .dd-btn').getAttribute('aria-expanded') === 'true', 'prompt opens year selection');
  await page.locator('.dd-menu.aberto [data-valor="7"]').click();
  check(await page.locator('#f-ano option[value="7"]').count() === 1, 'seventh grade is available');
  await page.locator('#f-ano').selectOption('7');
  check(JSON.stringify(await page.locator('#f-turma option').evaluateAll(ops => ops.slice(1).map(o => o.value))) === '["7A","7B","7C"]', 'grade filter shows only seventh-grade classes');
  const seventhSubjects = await page.locator('#f-disciplina option').allTextContents();
  check(seventhSubjects.includes('Ciências') && !seventhSubjects.some(s => ['Física', 'Química', 'Biologia'].includes(s)), 'seventh grade offers science without ninth-grade subjects');
  const seventhComparison = await page.locator('#coorte-mediana').textContent();
  check(seventhComparison.includes('Ciências') && !['Física', 'Química', 'Biologia'].some(s => seventhComparison.includes(s)), 'seventh-grade comparison excludes unrelated subjects');
  check(await page.locator('#coorte-atencao + #coorte-notas').count() === 1, 'attention rankings appear immediately before guidance');
  check(await page.locator('#coorte-atencao .attention-card').count() === 4, 'four attention lists');
  for (const id of ['maiores', 'menores', 'estaveis', 'oscilantes']) {
    check(await page.locator('.attention-' + id + ' .attention-student').count() === 20, id + ' shows top 20');
  }
  await page.locator('#attention-filter-maiores').selectOption('exatas');
  check(await page.locator('#attention-filter-menores').inputValue() === 'geral', 'ranking area selectors are independent');
  await page.locator('#attention-filter-menores').selectOption('humanas');
  const highestScores = await page.locator('.attention-maiores .attention-value > strong').allTextContents();
  check(highestScores.every((value, i) => i === 0 || Number(value.replace(',', '.')) <= Number(highestScores[i - 1].replace(',', '.'))), 'highest grades are sorted descending');
  const lowestScores = await page.locator('.attention-menores .attention-value > strong').allTextContents();
  check(lowestScores.every((value, i) => i === 0 || Number(value.replace(',', '.')) >= Number(lowestScores[i - 1].replace(',', '.'))), 'lowest grades are sorted ascending');
  await page.locator('#attention-filter-oscilantes').selectOption('caiu');
  check(await page.locator('.attention-oscilantes .attention-student').count() > 0 && await page.locator('.attention-oscilantes .attention-delta:not(.down)').count() === 0, 'oscillation direction filter shows only declines');
  const rankedStudent = await page.locator('.attention-maiores .attention-student').first().getAttribute('data-ra');
  await page.locator('.attention-maiores .attention-student').first().click();
  check(await page.locator('#f-aluno').inputValue() === rankedStudent, 'ranking entry opens the selected student');
  await page.locator('#f-aluno').selectOption('');
  check(await page.locator('#attention-filter-maiores').inputValue() === 'exatas', 'ranking preferences survive student navigation');
  await page.locator('#attention-filter-maiores').selectOption('geral');
  await page.locator('#attention-filter-menores').selectOption('geral');
  await page.locator('#attention-filter-oscilantes').selectOption('todas');
  for (const [turma, total] of [['7A', 29], ['7B', 31], ['7C', 30]]) {
    await page.locator('#f-turma').selectOption(turma);
    check(await page.locator('#f-aluno option').count() === total + 1, turma + ' student count');
    await page.locator('#f-aluno').selectOption({ index: 1 });
    check(await page.locator('#aluno h1').count() === 1, turma + ' student renders');
    check((await page.locator('#disciplinas-tabela').textContent()).includes('Ciências'), turma + ' includes science');
  }
  await page.locator('#btn-limpar').click();
  await page.waitForTimeout(200);
  for (const [id, label] of [['f-aluno', 'Alunos'], ['f-turma', 'Turmas'], ['f-disciplina', 'Disciplinas'], ['f-bimestre', 'Bimestres'], ['f-ano', 'Anos']]) {
    check(await page.locator('#' + id + ' + .dd .dd-btn').textContent() === label, label + ' filter has concise placeholder');
    check(await page.locator('#' + id + ' option').first().textContent() === label, label + ' reset option has concise name');
  }
  check(await page.locator('#selecionar-ano').isVisible(), 'clearing filters restores year prompt');
  await page.locator('#f-ano').selectOption('7');
  check(await page.locator('.filterbar #f-ano-letivo').count() === 0 && await page.locator('#f-ano-letivo').isHidden(), 'academic year removed from header');
  check(await page.locator('#view').evaluate(el => getComputedStyle(el).outlineStyle === 'none'), 'main region has no startup focus ring');
  check(await page.locator('#view > .banner').count() === 0, 'cohort banner removed');
  check(await page.locator('.cohort-comparison > #coorte-mediana + #coorte-distribuicao').count() === 1, 'cohort charts share one card');
  check(await page.locator('#coorte-distribuicao .cohort-dist-row').count() > 0, 'distribution rows visible');
  check(await page.locator('#btn-logout').getAttribute('aria-label') === 'Sair do painel', 'logout icon labelled');
  check(await page.locator('.brand-mark').count() === 3 && await page.locator('.brand-mark').first().locator('path').count() === 2, 'new book logo appears in login, panel, and meeting');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.querySelector('.topbar').classList.contains('is-scrolled'));
  check(await page.locator('.topbar').evaluate(el => getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)'), 'header reveals page gradient at top');
  await page.evaluate(() => window.scrollTo(0, 320));
  await page.waitForFunction(() => document.querySelector('.topbar').classList.contains('is-scrolled'));
  check(await page.locator('.topbar').evaluate(el => getComputedStyle(el).backdropFilter !== 'none'), 'header glass appears on scroll');
  await page.screenshot({ path: path.join(out, 'header-glass-desktop.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.querySelector('.topbar').classList.contains('is-scrolled'));
  await page.screenshot({ path: path.join(out, 'cohort-desktop.png'), fullPage: true });
  const student = await page.locator('#f-aluno option').nth(1).getAttribute('value');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#btn-limpar').click();
    if (width <= 390) check(await page.locator('.filterbar').evaluate(el => el.scrollLeft === 0), 'mobile filters return to first field after reset');
    check(await page.locator('#selecionar-ano').isVisible(), 'year prompt visible at ' + width);
    await fit(page, 'year prompt ' + width);
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(out, 'year-selection-' + width + '.png'), fullPage: true });
    await page.locator('#btn-selecionar-ano').click();
    await page.locator('.dd-menu.aberto [data-valor="7"]').click();
    for (const id of cohortSections) check(await page.locator('#' + id).count() === 1, 'cohort section ' + id);
    check(await page.locator('#coorte-resumo .accent .kpi-turma-badge').count() === 3, 'class cards show only selected year');
    check(await page.locator('#coorte-resumo .accent .avatar').count() === 0, 'class cards no longer show letter avatars');
    check(await page.locator('#coorte-resumo .accent').first().evaluate(card => {
      const help = card.querySelector('.kpi-help-canto').getBoundingClientRect();
      const box = card.getBoundingClientRect();
      return help.bottom <= box.bottom && help.top > box.top + box.height / 2;
    }), 'class card help sits in lower right');
    const columns = await page.locator('.cohort-comparison').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    check(columns === (width > 980 ? 2 : 1), 'cohort comparison columns at ' + width);
    await fit(page, 'cohort ' + width);
    if (width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, 'cohort-mobile.png'), fullPage: true });
      await page.evaluate(() => window.scrollTo(0, 320));
      await page.waitForFunction(() => document.querySelector('.topbar').classList.contains('is-scrolled'));
      await page.screenshot({ path: path.join(out, 'header-glass-mobile.png') });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.locator('#f-aluno').selectOption(student);
    for (const id of studentSections) check(await page.locator('#' + id).count() === 1, 'student section ' + id);
    check(await page.locator('#aluno .student-head-main').evaluate(el => {
      const a = el.getBoundingClientRect(), b = el.closest('.student-head').getBoundingClientRect();
      return Math.abs((a.left + a.right - b.left - b.right) / 2) < 2;
    }), 'student identity centered at ' + width);
    const expectedFacts = await page.evaluate(ra => {
      const sd = window.Analytics.Store.studentData(ra, {});
      return 2 + Number(sd.frequenciaMedia != null) + Number(sd.faltasTotais != null);
    }, student);
    check(await page.locator('#aluno .student-facts .fact').count() === expectedFacts, 'student quick facts show only available data');
    check(await page.locator('#aluno .student-switch-prev').isDisabled(), 'first student has no previous button');
    const nextStudent = await page.locator('#f-aluno option').nth(2).getAttribute('value');
    await page.locator('#aluno .student-switch-next').click();
    check(await page.locator('#f-aluno').inputValue() === nextStudent, 'next button updates student filter');
    check(await page.locator('#aluno h1').textContent() === (await page.locator('#f-aluno option:checked').textContent()).split('  ·  ')[0], 'next student identity shown');
    await page.locator('#aluno .student-switch-prev').click();
    check(await page.locator('#f-aluno').inputValue() === student, 'previous button restores student');
    check(await page.locator('#resumo .grade-segmented-bar').count() === 1, 'single segmented distribution bar');
    check(await page.locator('#resumo .grade-segmented-legend .grade-segment-key').count() === 3, 'distribution legend shows three ranges');
    if (width === 1440) {
      const segmentSizing = await page.locator('#resumo .grade-segmented-bar').evaluate(bar => {
        const parts = [...bar.querySelectorAll('.grade-segment')];
        return parts.map(part => ({ actual: part.getBoundingClientRect().width / bar.getBoundingClientRect().width, count: Number(part.style.flexGrow) }));
      });
      const totalParts = segmentSizing.reduce((sum, part) => sum + part.count, 0);
      check(segmentSizing.every(part => Math.abs(part.actual - part.count / totalParts) < .03), 'distribution segments reflect discipline proportions');
    }
    check(await page.locator('#disciplinas-tabela .discipline-swatch').count() > 0 && await page.locator('#disciplinas-tabela .avatar-materia').count() === 0, 'discipline names use legible color markers');
    if (width === 1440) {
      const grades = await page.locator('#disciplinas-tabela').evaluate(section => {
        const header = section.querySelector('thead th:nth-child(2)').getBoundingClientRect();
        const notes = section.querySelector('tbody .bimestre-list').getBoundingClientRect();
        const fontSize = parseFloat(getComputedStyle(section.querySelector('tbody .pill-nota')).fontSize);
        return { offset: Math.abs((header.left + header.right - notes.left - notes.right) / 2), fontSize };
      });
      check(grades.offset < 3 && Math.abs(grades.fontSize - 14.4) < .1, 'period grades align with their heading and use 20% larger type');
      await page.waitForFunction(() => {
        const section = document.querySelector('#trajetoria');
        const controls = section.querySelector('.traj-controls');
        const svg = section.querySelector('.traj-visual svg');
        return svg && Math.abs(svg.getBoundingClientRect().height - controls.getBoundingClientRect().height) < 3;
      });
      const chartHeightDifference = await page.locator('#trajetoria').evaluate(section => Math.abs(
        section.querySelector('.traj-visual svg').getBoundingClientRect().height -
        section.querySelector('.traj-controls').getBoundingClientRect().height
      ));
      check(chartHeightDifference < 3, 'trajectory chart height matches the controls');
    }
    if (width === 1440 || width === 390) {
      const trajectoryLayout = await page.locator('#trajetoria').evaluate(section => {
        const controls = section.querySelector('.traj-controls').getBoundingClientRect();
        const chart = section.querySelector('.traj-visual').getBoundingClientRect();
        return { controls: { left: controls.left, right: controls.right, bottom: controls.bottom }, chart: { left: chart.left, top: chart.top } };
      });
      check(width === 1440 ? trajectoryLayout.controls.right < trajectoryLayout.chart.left : trajectoryLayout.controls.bottom < trajectoryLayout.chart.top, 'trajectory controls sit beside the chart on desktop and above it on mobile');
    }
    await fit(page, 'student ' + width);
    if (width === 390 || width === 1440) {
      await page.locator('#aluno').screenshot({ path: path.join(out, 'student-header-' + width + '.png') });
      await page.locator('#resumo .kpi-hero').screenshot({ path: path.join(out, 'student-distribution-' + width + '.png') });
      await page.locator('#disciplinas-tabela').screenshot({ path: path.join(out, 'student-disciplines-' + width + '.png') });
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(out, 'student-restored-' + width + '.png'), fullPage: true });
    await page.locator('#btn-reuniao').click();
    check(await page.locator('#meeting-close').evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(180, 35, 50)'), 'meeting exit button is red');
    for (let i = 0; i < 8; i++) {
      check(await page.locator('#meeting-body > *').count() > 0, 'meeting step has content');
      if (i === 0) {
        await page.locator('#meeting-body #aluno .student-switch-next').click();
        check(await page.locator('#f-aluno').inputValue() === nextStudent, 'meeting next student keeps filter synchronized');
        check((await page.locator('#meeting-body #aluno h1').textContent()) === (await page.locator('#f-aluno option:checked').textContent()).split('  ·  ')[0], 'meeting updates student identity');
        await page.locator('#meeting-body #aluno .student-switch-prev').click();
        check(await page.locator('#f-aluno').inputValue() === student, 'meeting previous student restores selection');
        check(await page.locator('#meeting-body #resumo .grade-segmented-bar').count() === 1, 'meeting overview uses the same segmented bar');
        if (width === 390 || width === 1440) await page.screenshot({ path: path.join(out, 'meeting-overview-' + width + '.png') });
      }
      if (i === 1 && width === 1440) {
        await page.waitForFunction(() => {
          const section = document.querySelector('#meeting-body #trajetoria');
          const svg = section && section.querySelector('.traj-visual svg');
          return svg && Math.abs(svg.getBoundingClientRect().height - section.querySelector('.traj-controls').getBoundingClientRect().height) < 6;
        });
        check(await page.locator('#meeting-body #trajetoria').evaluate(section => Math.abs(
          section.querySelector('.traj-visual svg').getBoundingClientRect().height -
          section.querySelector('.traj-controls').getBoundingClientRect().height
        ) < 6), 'meeting trajectory chart reaches the bottom of its controls');
      }
      if (i === 4) {
        check(await page.locator('#meeting-body #mapa .meeting-patterns svg[role="img"]').count() === 1, 'meeting map includes patterns scatterplot');
        if (width === 390) check(await page.locator('#meeting-body .meeting-patterns .pattern-point-key span').count() > 0, 'mobile scatter names points in a legend');
        if (width === 390 || width === 1440) {
          await page.locator('#meeting-body #mapa').evaluate(el => el.scrollIntoView({ block: 'start' }));
          await page.screenshot({ path: path.join(out, 'meeting-map-' + width + '.png') });
          if (width === 390) {
            await page.locator('#meeting-body .meeting-patterns').evaluate(el => el.scrollIntoView({ block: 'start' }));
            await page.screenshot({ path: path.join(out, 'meeting-patterns-mobile.png') });
          }
        }
      }
      const overflow = await page.locator('#meeting').evaluate(el => el.scrollWidth > el.clientWidth + 2);
      check(!overflow, 'meeting fits ' + width + ' step ' + i);
      if (i < 7) await page.locator('#meeting-next').click();
    }
    if (width === 1440) {
      await page.locator('#meeting-print').click();
      await page.locator('#print-disciplinas tbody tr').first().waitFor();
      check(await page.locator('#print-disciplinas tbody tr').count() === await page.locator('#view #disciplinas-tabela tbody tr').count(), 'meeting summary contains every discipline');
      await page.keyboard.press('Escape');
      check(await page.locator('#meeting').isVisible(), 'closing meeting summary returns to meeting');
    }
    await page.keyboard.press('Escape');
    check(await page.locator('#meeting').isHidden(), 'meeting exits');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#f-disciplina').selectOption({ index: 1 });
  await page.locator('#f-bimestre').selectOption('2');
  check(await page.locator('#f-bimestre').inputValue() === '2', 'period preserved');
  await page.locator('#btn-resumo').click();
  await page.locator('.print-report').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#print-trajetoria .serie').length === document.querySelectorAll('#print-trajetoria .legend-chip').length);
  check(await page.locator('#printOverlay').getAttribute('aria-hidden') === 'false', 'print dialog accessible');
  const printDisciplineData = await page.evaluate(() => {
    const filters = ['f-ano-letivo', 'f-ano', 'f-turma', 'f-aluno'].map(id => document.getElementById(id).value);
    const sd = window.Analytics.Store.studentData(filters[3], { anoLetivo: filters[0], ano: filters[1], turma: filters[2] });
    const rows = [...document.querySelectorAll('#print-disciplinas tbody tr')];
    const legend = [...document.querySelectorAll('#print-trajetoria .legend-chip')];
    const lines = [...document.querySelectorAll('#print-trajetoria .serie path')];
    const pairs = sd.bimestres.slice(1).map((bi, i) => [sd.bimestres[i], bi]);
    return {
      expected: sd.numericas.length,
      periodCount: sd.bimestres.length,
      rows: rows.map(row => [...row.cells].map(cell => cell.textContent.trim())),
      expectedRows: sd.numericas.slice().sort((a, b) => window.Analytics.ordemMaterias(a.nome, b.nome)).map(m => [
        m.rotulo,
        ...sd.bimestres.map(bi => {
          const period = m.serie.find(s => s.bimestre === bi);
          return period && period.nota != null ? window.Analytics.fmt1(period.nota) : '—';
        }),
        window.Analytics.fmt1(m.media),
        m.variacaoTotal == null ? '—' : window.Analytics.fmtSigned(m.variacaoTotal)
      ]),
      variationRows: [...document.querySelectorAll('#print-variacao tbody tr')].map(row => [...row.cells].map(cell => cell.textContent.trim())),
      expectedVariationRows: sd.numericas.slice().sort((a, b) => window.Analytics.ordemMaterias(a.nome, b.nome)).map(m => {
        const values = pairs.map(pair => m.deltas.find(d => d.de === pair[0] && d.para === pair[1])?.valor ?? null);
        const present = values.filter(value => value != null);
        return [m.rotulo, ...values.map(value => value == null ? '—' : window.Analytics.fmtSigned(value)),
          present.length ? window.Analytics.fmtSigned(window.Analytics.Stats.round2(window.Analytics.Stats.mean(present))) : '—'];
      }),
      legendColors: legend.map(chip => chip.querySelector('i').style.backgroundColor),
      lineColors: lines.map(line => line.getAttribute('stroke')),
      legendNames: legend.map(chip => chip.textContent.trim())
    };
  });
  check(printDisciplineData.rows.length === printDisciplineData.expected && JSON.stringify(printDisciplineData.rows) === JSON.stringify(printDisciplineData.expectedRows), 'print table includes every discipline and period grade despite active filters');
  check(JSON.stringify(printDisciplineData.variationRows) === JSON.stringify(printDisciplineData.expectedVariationRows), 'print variation table includes every discipline and consecutive period');
  check(printDisciplineData.legendNames.length === printDisciplineData.expected && new Set(printDisciplineData.legendColors).size === printDisciplineData.expected && printDisciplineData.lineColors.length === printDisciplineData.expected, 'print legend identifies every plotted discipline with a distinct color: ' + JSON.stringify({ expected: printDisciplineData.expected, names: printDisciplineData.legendNames.length, colors: new Set(printDisciplineData.legendColors).size, lines: printDisciplineData.lineColors.length }));
  await page.emulateMedia({ media: 'print' });
  check(await page.locator('#print-trajetoria').evaluate(section => {
    const legend = section.querySelector('.print-legend').getBoundingClientRect();
    const chart = section.querySelector('.chart-host').getBoundingClientRect();
    const svg = section.querySelector('.chart-host svg');
    return legend.right < chart.left && Math.abs(legend.top - chart.top) < 3 && Number(svg.getAttribute('width')) === 530;
  }), 'printed trajectory places the discipline legend beside the chart');
  await page.pdf({ path: path.join(out, 'resumo.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
  await page.locator('#btn-limpar').click();
  await page.locator('#f-ano').selectOption('9');
  check(await page.locator('#coorte-resumo .accent .kpi-turma-badge').count() === 4, 'ninth grade shows its four classes');
  const ninthLabels = await page.locator('#coorte-mediana tbody th').allTextContents();
  check(ninthLabels.length === 10 && !ninthLabels.includes('Ciências') && ['Física', 'Química', 'Biologia'].every(subject => ninthLabels.includes(subject)), 'ninth-grade median chart with all students excludes science');
  await page.locator('#coorte-mediana').screenshot({ path: path.join(out, 'ninth-grade-subject-medians.png') });
  await page.locator('#coorte-atencao').screenshot({ path: path.join(out, 'ninth-grade-attention.png') });
  check(await page.locator('#f-aluno option').count() === 108, 'updated ninth grade has 107 students');
  for (const [turma, total] of [['9A', 26], ['9B', 30], ['9C', 24], ['9D', 27]]) {
    await page.locator('#f-turma').selectOption(turma);
    check(await page.locator('#f-aluno option').count() === total + 1, turma + ' updated roster');
    if (turma === '9C') {
      check((await page.locator('#btn-resumo').textContent()) === 'Gerar resumos da turma' && !(await page.locator('#btn-resumo').isDisabled()), 'class button offers one PDF per student');
      const downloadPromise = page.waitForEvent('download', { timeout: 180000 });
      await page.evaluate(() => {
        const orig = window.html2canvas;
        window.html2canvas = function (el, opts) {
          if (!window.__batchCharts) {
            window.__batchCharts = [...el.querySelectorAll('.chart-host')].map(host => {
              const svg = host.querySelector('svg');
              return { svg: svg ? Number(svg.getAttribute('width')) : 0, host: host.clientWidth };
            });
          }
          return orig(el, opts);
        };
      });
      await page.locator('#btn-resumo').click();
      check(await page.locator('#exportOverlay').isVisible(), 'export progress dialog appears');
      const download = await downloadPromise;
      check(download.suggestedFilename() === 'Resumos 9C.zip', 'zip keeps the class name: ' + download.suggestedFilename());
      const batchCharts = await page.evaluate(() => window.__batchCharts || []);
      check(batchCharts.length === 2 && batchCharts.every(c => c.svg === 530 || (c.svg >= 440 && Math.abs(c.svg - c.host) <= 2)), 'class PDF charts render at their real width: ' + JSON.stringify(batchCharts));
      const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()));
      const entries = Object.keys(zip.files).filter(name => !zip.files[name].dir);
      check(entries.length === total, 'zip contains one PDF per student');
      check(entries.every(name => name.endsWith('.pdf')), 'zip entries are PDFs');
      const firstPdf = await zip.file(entries[0]).async('nodebuffer');
      check(firstPdf.subarray(0, 5).toString() === '%PDF-', 'zip entries are valid PDFs');
      check(await page.locator('#exportOverlay').isHidden(), 'export dialog closes after download');
    }
  }
  await page.locator('#f-turma').selectOption('');
  const all = await page.locator('#f-aluno option').evaluateAll(ops => ops.slice(1).map(o => o.value));
  const recoveryStudent = await page.evaluate(ras => ras.find(ra => window.Analytics.Store.studentData(ra, { ano: '9' }).recuperacoes.length > 0), all);
  check(!!recoveryStudent, 'student with recorded recovery exists');
  await page.locator('#f-aluno').selectOption(recoveryStudent);
  const recoveryPanels = await page.evaluate(ra => {
    const sd = window.Analytics.Store.studentData(ra, { ano: '9' });
    const periods = [...new Set([...sd.bimestres, ...sd.recuperacoes.map(r => r.bimestre)])].sort((a, b) => a - b);
    const panels = [...document.querySelectorAll('#recuperacao .recovery-period')];
    return {
      expectedPeriods: periods.map(window.Analytics.rotuloBimestre),
      headings: panels.map(panel => panel.querySelector('h3').textContent),
      eventCount: sd.recuperacoes.length,
      plottedEvents: document.querySelectorAll('#recuperacao .slope-row').length,
      listedEvents: document.querySelectorAll('#recuperacao .recovery-event-list li').length,
      emptyPeriods: panels.filter(panel => panel.querySelector('.recovery-period-empty')).length,
      sideBySide: panels.length < 2 || panels[0].getBoundingClientRect().right < panels[1].getBoundingClientRect().left
    };
  }, recoveryStudent);
  check(JSON.stringify(recoveryPanels.headings) === JSON.stringify(recoveryPanels.expectedPeriods) && recoveryPanels.plottedEvents === recoveryPanels.eventCount && recoveryPanels.listedEvents === recoveryPanels.eventCount && recoveryPanels.sideBySide, 'recovery charts and values are grouped by period and sit side by side');
  await page.locator('#recuperacao').screenshot({ path: path.join(out, 'student-recovery-1440.png') });
  await page.locator('#btn-reuniao').click();
  await page.locator('#meeting-progress [aria-label^="Ir para o passo 7:"]').click();
  check(await page.locator('#meeting-body #recuperacao .recovery-period').count() === recoveryPanels.expectedPeriods.length && await page.locator('#meeting').evaluate(el => el.scrollWidth <= el.clientWidth + 2), 'meeting recovery step keeps one panel per period without horizontal overflow');
  await page.keyboard.press('Escape');
  check(await page.locator('#meeting').isHidden(), 'meeting closes after recovery check');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.locator('#view #recuperacao .recovery-period-grid').evaluate(grid => grid.scrollWidth <= grid.clientWidth + 2 && [...grid.children].every((panel, i, panels) => i === 0 || panels[i - 1].getBoundingClientRect().bottom < panel.getBoundingClientRect().top)), 'recovery period charts stack without horizontal overflow on mobile');
  await page.locator('#view #recuperacao').screenshot({ path: path.join(out, 'student-recovery-390.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const ra of [...all.slice(0, 3), all[all.length - 1]]) { await page.locator('#f-aluno').selectOption(ra); check(await page.locator('#aluno h1').count() === 1, 'student renders'); }
  await page.locator('#f-turma').selectOption('9B');
  const classList = await page.locator('#f-aluno option').evaluateAll(ops => ops.slice(1).map(o => o.value));
  await page.locator('#f-aluno').selectOption(classList[0]);
  check((await page.locator('#detalhados').textContent()).includes('Relatorio 9B 1.pdf'), 'updated grade source is shown');
  check((await page.locator('#detalhados').textContent()).includes('Frequência: 9b_3o bi.pdf'), 'previous attendance source is shown separately');
  await page.locator('#aluno .student-switch-next').click();
  check(await page.locator('#f-aluno').inputValue() === classList[1], 'student arrows follow filtered class list');
  await page.locator('#f-aluno').selectOption(classList[classList.length - 1]);
  check(await page.locator('#aluno .student-switch-next').isDisabled(), 'last student has no next button');
  await page.locator('#f-disciplina').selectOption({ label: 'Biologia' });
  await page.locator('#f-ano').selectOption('7');
  check(await page.locator('#f-disciplina').inputValue() === '', 'changing to seventh grade clears an incompatible subject');
  check(await page.locator('#f-disciplina option').filter({ hasText: 'Biologia' }).count() === 0, 'ninth-grade subject removed after changing years');
  await page.locator('#f-ano').selectOption('');
  check(await page.locator('#selecionar-ano').isVisible(), 'removing year selection restores prompt');
  check(await page.locator('#aluno, #coorte-resumo').count() === 0, 'removing year selection clears student and cohort results');
  check(await page.locator('#f-aluno').inputValue() === '' && await page.locator('#f-turma').inputValue() === '', 'removing year selection clears dependent selections');
  check(await page.locator('#btn-reuniao').isDisabled() && await page.locator('#btn-resumo').isDisabled(), 'student actions unavailable without a year');
  await page.locator('#btn-logout').click();
  await page.locator('#auth-wall').waitFor({ state: 'visible' });
  check(await page.evaluate(() => !window.SCHOOL_DATA), 'lock clears memory');
  await page.setViewportSize({ width: 390, height: 844 });
  await fit(page, 'mobile login');
  await page.screenshot({ path: path.join(out, 'login-mobile.png'), fullPage: true });
  check(!errors.length, 'no browser errors: ' + errors.join('; '));
  await browser.close();
  console.log(checks + ' UI checks passed; screenshots and PDF in artifacts/.');
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (activeBrowser) await activeBrowser.close(); server.kill(); });
