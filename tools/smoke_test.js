/* Smoke test do motor analítico (roda no Node, sem navegador).
   Uso: node tools/smoke_test.js  */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const sandbox = { window: {}, console, localStorage: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['config.js', 'analytics.js'].forEach((f) => {
  const code = fs.readFileSync(path.join(root, 'web', 'js', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
});

const privateData = path.join(root, 'data', 'dados.js');
if (fs.existsSync(privateData)) {
  vm.runInContext(fs.readFileSync(privateData, 'utf8'), sandbox, { filename: 'dados.js' });
} else {
  if (!process.env.PANEL_PASSWORD) throw new Error('Defina PANEL_PASSWORD para testar o pacote criptografado.');
  vm.runInContext(fs.readFileSync(path.join(root, 'web', 'js', 'dados.enc.js'), 'utf8'), sandbox);
  const payload = sandbox.window.PROTECTED_DATA;
  const encrypted = Buffer.from(payload.data, 'base64');
  const key = crypto.pbkdf2Sync(process.env.PANEL_PASSWORD, Buffer.from(payload.salt, 'base64'), payload.iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(encrypted.subarray(-16));
  sandbox.window.SCHOOL_DATA = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8'));
}

const A = sandbox.window.Analytics;
A.Store.init(sandbox.window.SCHOOL_DATA);

let falhas = 0;
function check(nome, cond, extra) {
  if (cond) console.log('  ok   ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra ? '  -> ' + extra : '')); }
}

const op = A.Store.opcoes({});
console.log('Opções:', op.turmas.join(', '), '| alunos:', op.alunos.length, '| bimestres:', op.bimestres.join(','), '| disciplinas numéricas:', op.materiasNumericas.length);

check('197 alunos indexados', A.Store.alunosDoEscopo({}).length === 197, String(A.Store.alunosDoEscopo({}).length));
check('107 alunos dos nonos atualizados', A.Store.alunosDoEscopo({ ano: '9' }).length === 107);
check('turmas dos sétimos disponíveis', JSON.stringify(A.Store.opcoes({ ano: '7' }).turmas) === '["7A","7B","7C"]');
for (const [turma, total] of [['7A', 29], ['7B', 31], ['7C', 30], ['9A', 26], ['9B', 30], ['9C', 24], ['9D', 27]]) {
  check(turma + ': ' + total + ' alunos', A.Store.alunosDoEscopo({ turma }).length === total);
}
const seventhRecords = sandbox.window.SCHOOL_DATA.registros.filter(r => r.ano === '7');
check('sétimos usam somente MB nas comparações', seventhRecords.length > 0 && seventhRecords.every(r => r.nota === r.mb));
check('parciais sem MB permanecem sem nota', seventhRecords.some(r => r.avaliacoes_origem.NP && r.mb == null && r.nota == null));
check('sétimos não inventam frequência', seventhRecords.every(r => r.fa == null && r.fr == null));
check('todas as comparações usam MB', sandbox.window.SCHOOL_DATA.registros.every(r => r.nota === r.mb));
const ninthRecords = sandbox.window.SCHOOL_DATA.registros.filter(r => r.ano === '9');
check('notas dos nonos vêm dos relatórios novos', ninthRecords.every(r => r.fonte_pagina.startsWith('Relatorio 9')));
check('frequência preservada com origem própria', ninthRecords.filter(r => r.fa != null || r.fr != null).every(r => r.fonte_frequencia));
check('Produção de Texto sem MB no terceiro não usa nota antiga', ninthRecords.filter(r => r.materia === 'PRODUÇÃO DE TEXTO' && r.bimestre === 3).every(r => r.mb == null && r.nota == null));

/* aluno típico */
const ra = A.Store.opcoes({ ano: '9' }).alunos[0].ra;
const sd = A.Store.studentData(ra, {});
check('studentData tem disciplinas numéricas', sd && sd.numericas.length >= 8, String(sd && sd.numericas.length));
check('média geral dentro de 0-10', sd.mediaGeral > 0 && sd.mediaGeral <= 10, String(sd.mediaGeral));
check('bimestres com nota = [1,2,3]', JSON.stringify(sd.bimestres) === '[1,2,3]', JSON.stringify(sd.bimestres));
check('média por bimestre calculada', sd.mediaPorBimestre.length === 3 && sd.mediaPorBimestre.every((p) => p.media != null));
check('insights gerados', A.Insights.student(sd).length > 3, String(A.Insights.student(sd).length));
check('leitura condensada (<= 15 cards)', A.Insights.student(sd).length <= 15, String(A.Insights.student(sd).length));
check('sem disciplina repetida no mesmo tom', (function () {
  const vistos = new Set();
  return A.Insights.student(sd).every((i) => {
    if (!i.disciplina) return true;
    const k = i.disciplina + '|' + i.tom;
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
})());
check('monitoramento gerado', A.Insights.monitoring(sd).length > 0);
check('monitoramento <= 6 e sem disciplina repetida', (function () {
  const lista = A.Insights.monitoring(sd);
  const nomeadas = lista.map((m) => (m.texto.match(/em ([^,.]+)/) || [])[1]).filter(Boolean);
  return lista.length <= 6 && new Set(nomeadas).size === nomeadas.length;
})());
check('distribuição da coorte com box e n', (function () {
  const d = A.Store.cohortDistribution({});
  return d.length === 7 && d.every((c) => c.box && c.box.n > 0 && c.box.q1 <= c.box.mediana && c.box.q3 >= c.box.mediana);
})());

const semNota = sd.materias.filter((m) => m.semNota);
check('disciplinas sem nota detectadas', semNota.length > 0, semNota.map((m) => m.nome).join('|'));
check('MB ausente no 3º bi permanece sem nota', sd.numericas.every((m) => {
  const s = m.serie.find((x) => x.bimestre === 3);
  return !s || s.mb != null || s.nota == null;
}));

/* recuperação */
const comRec = Object.keys(A.Store.opcoes({}).alunos).length &&
  A.Store.alunosDoEscopo({}).map((a) => A.Store.studentData(a.ra, {})).filter((s) => s.recuperacoes.length);
check('alunos com recuperação encontrados', comRec.length > 50, String(comRec.length));
const rec0 = comRec[0].recuperacoes[0];
check('evento de recuperação consistente', rec0.nb != null && rec0.recuperacao != null && rec0.mb != null && rec0.ganho != null, JSON.stringify(rec0));

/* contexto de turma */
const ctx = A.Store.classContext(sd, sd.numericas[0].nome);
check('contexto da turma com 25+ alunos', ctx.n >= 24, String(ctx.n));
check('quartis ordenados', ctx.box.q1 <= ctx.box.mediana && ctx.box.mediana <= ctx.box.q3, JSON.stringify(ctx.box));
check('aluno presente na distribuição', ctx.aluno != null);

/* coorte */
const coorte = A.Store.cohort({});
check('7 turmas', coorte.length === 7, coorte.map((c) => c.turma).join(','));
check('medianas plausíveis', coorte.every((c) => c.medianaMedia == null || (c.medianaMedia >= 0 && c.medianaMedia <= 10)));
const med = A.Store.cohortSubjectMedians({}, null);
check('mediana disciplina x turma', med.rows.length >= 8 && med.turmas.length === 7, med.rows.length + 'x' + med.turmas.length);
const evo = A.Store.cohortEvolution({});
check('evolução da coorte', evo.series.length === 7 && evo.series.every(s => s.serie.length === 3));

/* aluno transferido sem notas */
const transferido = A.Store.alunosDoEscopo({}).find((a) => a.status === 'Transferido');
if (transferido) {
  const sdt = A.Store.studentData(transferido.ra, {});
  check('aluno transferido tratado sem erro', sdt != null, transferido.nome);
  console.log('       transferido: disciplinas com nota:', sdt.numericas.length, '| insights:', A.Insights.student(sdt).length);
}

/* filtro por turma */
const sd9b = A.Store.studentData(A.Store.alunosDoEscopo({ turma: '9B' })[0].ra, { turma: '9B' });
check('escopo por turma funciona', sd9b && sd9b.numericas.length > 0);
check('filtro de turma restringe os alunos disponíveis', op.turmas.every((turma) => {
  const options = A.Store.opcoes({ turma });
  return options.alunos.length === A.Store.alunosDoEscopo({ turma }).length &&
    options.alunos.every((a) => a.turma === turma) &&
    options.turmas.length === 1 && options.turmas[0] === turma;
}));
check('recuperações da coorte respeitam disciplina e bimestre', (function () {
  const materia = op.materiasNumericas.find(m => A.norm(m.nome) === A.norm('Matemática')).nome;
  const actual = A.Store.cohort({}, { materia, bimestre: 2 }).reduce((n, c) => n + c.recuperacoes, 0);
  const expected = sandbox.window.SCHOOL_DATA.registros.filter(r => A.norm(r.materia) === A.norm(materia) && r.bimestre === 2 && r.recuperacao != null).length;
  return actual === expected && expected > 0;
}()));

/* nenhuma inferência comportamental */
const textos = A.Insights.student(sd).map((i) => i.texto).join(' ').toLowerCase();
const proibidos = ['desmotivad', 'preguiç', 'não estuda', 'desinteress', 'concentraç', 'esforço', 'culpa'];
check('insights sem inferência psicológica', proibidos.every((p) => !textos.includes(p)));

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
