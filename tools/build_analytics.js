'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Publish browser modules from installed packages with the static site.
const vendored = [
  ['@vercel/analytics', 'dist/index.mjs', 'vercel-analytics.js'],
  ['jspdf', 'dist/jspdf.umd.min.js', 'jspdf.umd.min.js'],
  ['html2canvas', 'dist/html2canvas.min.js', 'html2canvas.min.js'],
  ['jszip', 'dist/jszip.min.js', 'jszip.min.js']
];
for (const [pkg, entry, name] of vendored) {
  const packageRoot = path.dirname(require.resolve(pkg + '/package.json'));
  const target = path.resolve(__dirname, '../web/js/vendor/' + name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(packageRoot, entry), target);
}
console.log('Browser vendor modules ready: ' + vendored.map(v => v[2]).join(', '));

// Conteúdo novo recebe URLs novas, evitando scripts antigos após uma publicação.
const web = path.resolve(__dirname, '../web');
const indexPath = path.join(web, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const assets = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const hash = crypto.createHash('sha256');
for (const asset of [...new Set(assets)].sort()) hash.update(asset).update(fs.readFileSync(path.join(web, asset)));
const version = hash.digest('hex').slice(0, 12);
fs.writeFileSync(indexPath, html.replace(/((?:src|href)=")((?:js|css)\/[^"?]+)(?:\?[^\"]*)?(\")/g, '$1$2?v=' + version + '$3'));
console.log('Static assets version: ' + version);
