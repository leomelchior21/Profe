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
  await page.screenshot({ path: path.join(out, 'cohort-desktop.png'), fullPage: true });
  const student = await page.locator('#f-aluno option').nth(1).getAttribute('value');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#btn-limpar').click();
    for (const id of cohortSections) check(await page.locator('#' + id).count() === 1, 'cohort section ' + id);
    await fit(page, 'cohort ' + width);
    await page.locator('#f-aluno').selectOption(student);
    for (const id of studentSections) check(await page.locator('#' + id).count() === 1, 'student section ' + id);
    await fit(page, 'student ' + width);
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(out, 'student-restored-' + width + '.png'), fullPage: true });
    await page.locator('#btn-reuniao').click();
    for (let i = 0; i < 8; i++) {
      check(await page.locator('#meeting-body > *').count() > 0, 'meeting step has content');
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
  await page.locator('#btn-lock').click();
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
