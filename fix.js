const fs = require('fs');
let c = fs.readFileSync('fichas_tecnicas.html', 'utf8');

const old = "ingredientes=(f.itens||[]).map(it=>{const ins=todosInsumos.find(i=>i.id===it.insumo_id);const um=ins?(ins.unidade_medida||ins.unidade_compra||String.fromCharCode(39)+String.fromCharCode(103)+String.fromCharCode(39)):String.fromCharCode(39)+String.fromCharCode(103)+String.fromCharCode(39);const qtd=(um===String.fromCharCode(39)+String.fromCharCode(107)+String.fromCharCode(103)+String.fromCharCode(39)||um===String.fromCharCode(39)+String.fromCharCode(108)+String.fromCharCode(105)+String.fromCharCode(116)+String.fromCharCode(114)+String.fromCharCode(111)+String.fromCharCode(39))?it.quantidade_g/1000:it.quantidade_g;return {insumo_id:it.insumo_id,quantidade_g:qtd};});";

const novo = "ingredientes=(f.itens||[]).map(it=>{const ins=todosInsumos.find(i=>i.id===it.insumo_id);const um=ins?(ins.unidade_medida||ins.unidade_compra||'g'):'g';const qtd=(um==='kg'||um==='litro')?it.quantidade_g/1000:it.quantidade_g;return {insumo_id:it.insumo_id,quantidade_g:qtd};});";

if (c.includes(old)) {
  c = c.replace(old, novo);
  fs.writeFileSync('fichas_tecnicas.html', c, 'utf8');
  console.log('CORRIGIDO!');
} else {
  console.log('NAO ENCONTROU — verificar arquivo');
}
