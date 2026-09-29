'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const name of ['config', 'analytics']) vm.runInContext(fs.readFileSync(path.join(root, 'web/js/' + name + '.js'), 'utf8'), sandbox);
const A = sandbox.window.Analytics;
let records = [];
function student(ra, nome, grades, turma = '7A', materia = 'MATEMÁTICA') {
  grades.forEach((mb, i) => records.push({ ra, aluno: nome, turma, ano: turma[0], ano_letivo: 2026,
    materia, bimestre: i + 1, mb, nota: mb, nb: 10, recuperacao: null, fa: null, tf: null, fr: null }));
}
student('1', 'Estável', [6, 6, 6]);
student('2', 'Vai e volta', [6, 10, 6]);
student('3', 'Queda', [8, 6, 4]);
student('4', 'Um período', [9, null, null]);
student('5', 'Zero válido', [0, 0, 0]);
student('6', 'Sem MB', [null, null, null]);
student('7', 'Outro ano', [10, 10, 10], '9A');
student('8', 'Outra turma', [10, 10, 10], '7B');
student('1', 'Estável', [null, null, 10], '7A', 'CIÊNCIAS');
student('1', 'Estável', [2, 2, 2], '7A', 'HISTÓRIA');
student('3', 'Queda', [9, 9, 9], '7A', 'HISTÓRIA');
A.Store.init({ meta: {}, registros: records });
const scope = { ano: '7', turma: '7A' };
function rank(opts) { return A.Store.attentionRanking(scope, opts); }
assert.equal(rank({ tipo: 'maiores', area: 'exatas' }).alunos[0].ra, '4');
assert.equal(rank({ tipo: 'maiores', area: 'humanas' }).alunos[0].ra, '3');
assert.equal(rank({ tipo: 'menores' }).alunos[0].ra, '5');
assert.equal(rank({ tipo: 'menores' }).alunos[0].media, 0);
assert(!rank({ tipo: 'maiores' }).alunos.some(a => ['6', '7', '8'].includes(a.ra)));
assert.equal(rank({ tipo: 'maiores', area: 'exatas', bimestre: 2 }).alunos[0].ra, '2');
assert.equal(rank({ tipo: 'maiores', area: 'linguagens' }).total, 0);
assert.equal(rank({ tipo: 'maiores', area: 'humanas', materia: 'MATEMÁTICA' }).total, 0);
const moving = rank({ tipo: 'oscilantes', materia: 'MATEMÁTICA' }).alunos;
assert.equal(moving[0].ra, '2');
assert.equal(moving[0].variacao, 0);
assert(Math.abs(moving[0].oscilacao - Math.sqrt(32 / 9)) < 1e-10);
assert(!moving.some(a => ['4', '6'].includes(a.ra)));
assert.equal(rank({ tipo: 'oscilantes', materia: 'MATEMÁTICA', direcao: 'caiu' }).alunos[0].ra, '3');
assert.equal(rank({ tipo: 'oscilantes', materia: 'MATEMÁTICA', direcao: 'subiu' }).total, 0);
assert.equal(rank({ tipo: 'estaveis', materia: 'MATEMÁTICA' }).alunos[0].ra, '1');
const stable = rank({ tipo: 'oscilantes' }).alunos.find(a => a.ra === '1');
assert.equal(stable.oscilacao, 0); // Ciências só tem MB no terceiro: não altera a base comparável.
assert.equal(stable.disciplinas, 2);
assert.deepEqual(JSON.stringify(rank({ tipo: 'oscilantes', bimestre: 1 })), JSON.stringify(rank({ tipo: 'oscilantes' })));
records = [];
for (let i = 0; i < 25; i++) student(String(i), 'Aluno fictício ' + String(i).padStart(2, '0'), [i / 3, i / 3]);
A.Store.init({ meta: {}, registros: records });
const limited = rank({ tipo: 'maiores' });
assert.equal(limited.total, 25);
assert.equal(limited.alunos.length, 20);
assert.equal(limited.alunos[0].ra, '24');
assert.equal(limited.alunos[19].ra, '5');
console.log('Ranking tests passed: MB, areas, filters, ties, zero, missing periods, oscillation and top 20.');
