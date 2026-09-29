'use strict';
const { chromium, webkit } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts');
fs.mkdirSync(out, { recursive: true });
const studentSections = ['aluno', 'resumo', 'disciplinas-tabela', 'leitura', 'trajetoria', 'contexto', 'padroes', 'detalhados'];
const cohortSections = ['coorte-resumo', 'coorte-tabela', 'coorte-evolucao', 'coorte-mediana', 'coorte-distribuicao', 'coorte-notas'];
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
  await page.screenshot({ path: path.join(out, 'login-desktop.png'), fullPage: true });
  await page.locator('#password').fill('incorrect');
  await page.locator('#login-submit').click();
  await page.locator('#password[aria-invalid="true"]').waitFor();
  check(await page.locator('#app').isHidden(), 'incorrect password rejected');
  await page.locator('#password').fill(password);
  await page.locator('#login-submit').click();
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.locator('#coorte-resumo').waitFor();
  await page.waitForTimeout(200);
  check(await page.locator('#f-bimestre + .dd .dd-btn').textContent() === 'Bimestres', 'bimester filter names its contents');
  check(await page.locator('#f-ano + .dd .dd-btn').textContent() === 'Anos', 'school year filter names its contents');
  check(await page.locator('.filterbar #f-ano-letivo').count() === 0 && await page.locator('#f-ano-letivo').isHidden(), 'academic year removed from header');
  check(await page.locator('#view').evaluate(el => getComputedStyle(el).outlineStyle === 'none'), 'main region has no startup focus ring');
  check(await page.locator('#view > .banner').count() === 0, 'cohort banner removed');
  check(await page.locator('.cohort-comparison > #coorte-mediana + #coorte-distribuicao').count() === 1, 'cohort charts share one card');
  check(await page.locator('#coorte-distribuicao .cohort-dist-row').count() > 0, 'distribution rows visible');
  check(await page.locator('#btn-logout').getAttribute('aria-label') === 'Sair do painel', 'logout icon labelled');
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
    for (const id of cohortSections) check(await page.locator('#' + id).count() === 1, 'cohort section ' + id);
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
    await fit(page, 'student ' + width);
    if (width === 390 || width === 1440) {
      await page.locator('#resumo .kpi-hero').screenshot({ path: path.join(out, 'student-distribution-' + width + '.png') });
      await page.locator('#disciplinas-tabela').screenshot({ path: path.join(out, 'student-disciplines-' + width + '.png') });
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(out, 'student-restored-' + width + '.png'), fullPage: true });
    await page.locator('#btn-reuniao').click();
    check(await page.locator('#meeting-close').evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(180, 35, 50)'), 'meeting exit button is red');
    for (let i = 0; i < 8; i++) {
      check(await page.locator('#meeting-body > *').count() > 0, 'meeting step has content');
      if (i === 0) {
        check(await page.locator('#meeting-body #resumo .grade-segmented-bar').count() === 1, 'meeting overview uses the same segmented bar');
        if (width === 390 || width === 1440) await page.screenshot({ path: path.join(out, 'meeting-overview-' + width + '.png') });
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
    await page.keyboard.press('Escape');
    check(await page.locator('#meeting').isHidden(), 'meeting exits');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#f-disciplina').selectOption({ index: 1 });
  await page.locator('#f-bimestre').selectOption('2');
  check(await page.locator('#f-bimestre').inputValue() === '2', 'period preserved');
  await page.locator('#btn-resumo').click();
  await page.locator('.print-report').waitFor();
  check(await page.locator('#printOverlay').getAttribute('aria-hidden') === 'false', 'print dialog accessible');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(out, 'resumo.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
  await page.locator('#btn-limpar').click();
  const all = await page.locator('#f-aluno option').evaluateAll(ops => ops.slice(1).map(o => o.value));
  for (const ra of [...all.slice(0, 3), all[all.length - 1]]) { await page.locator('#f-aluno').selectOption(ra); check(await page.locator('#aluno h1').count() === 1, 'student renders'); }
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
