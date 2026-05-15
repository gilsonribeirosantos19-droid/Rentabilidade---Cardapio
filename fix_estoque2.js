const fs = require('fs');
let lines = fs.readFileSync('estoque.html', 'utf8').split('\n');

// Encontrar linha com abrirModalMinimo e inserir as colunas antes dela
let rowIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('abrirModalMinimo') && lines[i].includes('td class="r"')) {
    rowIdx = i;
    break;
  }
}

if (rowIdx === -1) {
  console.log('ERRO: linha nao encontrada');
  process.exit(1);
}

// Inserir 2 novas colunas antes da linha do botao Minimo
const indent = '        ';
const newCols = [
  `${indent}<td class="r" style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green)">\${totalEnt>0?'+'+fmtQtd(totalEnt,um):'\\u2014'}</td>`,
  `${indent}<td class="r" style="font-family:'DM Mono',monospace;font-size:12px;color:var(--red)">\${totalSai>0?'-'+fmtQtd(totalSai,um):'\\u2014'}</td>`,
];

lines.splice(rowIdx, 0, ...newCols);

// Encontrar linha com "const um=ins.unidade_medida" dentro do map de estoque
// e adicionar calculo de totalEnt/totalSai depois dela
let umIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("const um=ins.unidade_medida||ins.unidade_compra||'un'")) {
    umIdx = i;
    break;
  }
}

if (umIdx === -1) {
  console.log('ERRO: linha um nao encontrada');
} else {
  lines.splice(umIdx + 1, 0,
    `      const totalEnt=movimentacoes.filter(m=>m.insumo_id===ins.id&&m.tipo==='entrada').reduce((s,m)=>s+parseFloat(m.quantidade),0);`,
    `      const totalSai=movimentacoes.filter(m=>m.insumo_id===ins.id&&m.tipo==='saida').reduce((s,m)=>s+parseFloat(m.quantidade),0);`
  );
  console.log('Calculo adicionado!');
}

fs.writeFileSync('estoque.html', lines.join('\n'), 'utf8');
console.log('DONE');
