'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Publish the browser module from the installed package with the static site.
const packageRoot = path.dirname(require.resolve('@vercel/analytics/package.json'));
const source = path.join(packageRoot, 'dist', 'index.mjs');
const target = path.resolve(__dirname, '../web/js/vendor/vercel-analytics.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('Vercel Analytics browser module ready.');

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
