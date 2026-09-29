'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Publish the browser module from the installed package with the static site.
const packageRoot = path.dirname(require.resolve('@vercel/analytics/package.json'));
const source = path.join(packageRoot, 'dist', 'index.mjs');
const target = path.resolve(__dirname, '../web/js/vendor/vercel-analytics.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('Vercel Analytics browser module ready.');
