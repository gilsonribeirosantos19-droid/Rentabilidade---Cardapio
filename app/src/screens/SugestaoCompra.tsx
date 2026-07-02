import { useMemo, useState } from 'react'
import type { ChartConfiguration } from 'chart.js'
import { useLoja } from '../lib/loja'
import { ChartBox } from '../components/ChartBox'
import './sugestao.css'

// Sugestão de Compra (Compras) — responde "o que precisamos comprar?".
// A escolha do fornecedor acontece só na Tela 2 (Pedido de Compra).
// TELA MOCK: dados de exemplo. Depende de estoque mínimo / pedido em aberto /
// mercadoria em trânsito / consumo — dados que ainda serão ligados ao real.

type Item = { cod: string; desc: string; grp: string; un: string; est: string; cons: string; cobA: string; cobD: string; rup: string; min: string; ab: string; tr: string; sug: number; custo: number; custoTxt: string }

const MOCK: Item[] = [
  { cod: 'MP0001', desc: 'Salmão Filé', grp: 'Peixes', un: 'kg', est: '58,00', cons: '12,00', cobA: '4,8', cobD: '7', rup: '7,3', min: '15,00', ab: '20,00', tr: '10,00', sug: 24, custo: 42.90, custoTxt: 'R$ 42,90 /kg' },
  { cod: 'MP0002', desc: 'Atum', grp: 'Peixes', un: 'kg', est: '22,00', cons: '8,00', cobA: '2,8', cobD: '7', rup: '2,8', min: '20,00', ab: '—', tr: '—', sug: 42, custo: 38.90, custoTxt: 'R$ 38,90 /kg' },
  { cod: 'MP0003', desc: 'Arroz Japonês', grp: 'Secos', un: 'kg', est: '80,00', cons: '10,00', cobA: '8,0', cobD: '7', rup: '12,0', min: '50,00', ab: '—', tr: '40,00', sug: 0, custo: 7.20, custoTxt: 'R$ 7,20 /kg' },
  { cod: 'MP0004', desc: 'Nori', grp: 'Secos', un: 'un', est: '120,00', cons: '25,00', cobA: '4,8', cobD: '7', rup: '4,8', min: '50,00', ab: '—', tr: '—', sug: 55, custo: 3.20, custoTxt: 'R$ 3,20 /un' },
  { cod: 'MP0005', desc: 'Shoyu', grp: 'Mercearia', un: 'L', est: '18,00', cons: '7,50', cobA: '2,4', cobD: '7', rup: '2,4', min: '20,00', ab: '—', tr: '—', sug: 56, custo: 9.80, custoTxt: 'R$ 9,80 /L' },
  { cod: 'MP0006', desc: 'Cream Cheese', grp: 'Laticínios', un: 'kg', est: '40,00', cons: '7,00', cobA: '5,7', cobD: '7', rup: '7,1', min: '30,00', ab: '10,00', tr: '—', sug: 9, custo: 14.50, custoTxt: 'R$ 14,50 /kg' },
  { cod: 'MP0007', desc: 'Camarão 9/12', grp: 'Peixes', un: 'kg', est: '12,00', cons: '3,60', cobA: '3,3', cobD: '7', rup: '3,3', min: '25,00', ab: '—', tr: '—', sug: 38, custo: 58.50, custoTxt: 'R$ 58,50 /kg' },
  { cod: 'MP0008', desc: 'Gergelim Mix', grp: 'Secos', un: 'kg', est: '30,00', cons: '2,00', cobA: '15,0', cobD: '7', rup: '15,0', min: '10,00', ab: '—', tr: '—', sug: 0, custo: 22.00, custoTxt: 'R$ 22,00 /kg' },
]

const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseNum = (v: string) => parseFloat((v || '0').replace(/\./g, '').replace(',', '.')) || 0

const baseChart = (): ChartConfiguration['options'] => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { grid: { color: '#eef2f7' }, ticks: { font: { size: 9 } } } },
})

export function SugestaoCompra() {
  const { lojas } = useLoja()
  const [view, setView] = useState<'sugestao' | 'pedido'>('sugestao')
  const [ideal, setIdeal] = useState<number[]>(MOCK.map((r) => r.sug))
  const [sel, setSel] = useState<boolean[]>(MOCK.map(() => false))
  const [drawer, setDrawer] = useState<number | null>(null)
  const [fornSel, setFornSel] = useState('Salmão Filé'); void fornSel

  const setIdealAt = (i: number, v: string) => setIdeal((p) => p.map((x, j) => (j === i ? parseNum(v) : x)))
  const toggle = (i: number) => setSel((p) => p.map((x, j) => (j === i ? !x : x)))
  const toggleAll = (on: boolean) => setSel(MOCK.map(() => on))

  const foot = useMemo(() => {
    let n = 0, qtd = 0, val = 0
    sel.forEach((s, i) => { if (s) { n++; qtd += ideal[i]; val += ideal[i] * MOCK[i].custo } })
    return { n, qtd, val }
  }, [sel, ideal])

  // gráficos do drawer (monocromático) — configs estáveis
  const chMes = useMemo<ChartConfiguration>(() => ({ type: 'bar', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [{ data: [280, 300, 340, 360, 330, 395], backgroundColor: '#334155', borderRadius: 3, barPercentage: 0.6 }] }, options: baseChart() }), [])
  const chPreco = useMemo<ChartConfiguration>(() => ({ type: 'line', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [{ data: [40.5, 41.2, 41.8, 43.0, 44.1, 42.9], borderColor: '#334155', backgroundColor: 'rgba(51,65,85,.06)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }] }, options: baseChart() }), [])
  const chEstoque = useMemo<ChartConfiguration>(() => ({ type: 'line', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [{ data: [120, 95, 140, 70, 110, 58], borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,.08)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }] }, options: baseChart() }), [])

  if (view === 'pedido') return <TelaPedido onBack={() => setView('sugestao')} />

  const dr = drawer != null ? MOCK[drawer] : null

  return (
    <div className="sug-screen">
      <div className="sug-toolbar">
        <div className="fld"><label>Loja</label><select><option>Todas as lojas ({lojas.length || 8})</option>{lojas.map((l) => <option key={l.id}>{l.nome}</option>)}</select></div>
        <div className="fld"><label>Período de análise</label><select><option>Últimos 30 dias</option><option>Últimos 60 dias</option><option>Últimos 90 dias</option></select></div>
        <div className="fld"><label>Cobertura desejada</label><select><option>7 dias</option><option>15 dias</option><option>30 dias</option></select></div>
        <div className="fld"><label>Grupo de solicitação</label><select><option>Todos</option><option>Peixes e Frutos do Mar</option><option>Secos</option></select></div>
        <div className="fld"><label>Categoria</label><select><option>Todas</option><option>Peixes</option><option>Secos</option></select></div>
        <div className="fld"><label>Buscar item</label><input placeholder="Código ou descrição..." /></div>
        <div className="grow" />
        <button className="btn btn-solid">Recalcular sugestão</button>
        <button className="btn">Mais filtros</button>
        <button className="btn">Exportar</button>
      </div>

      <div className="sug-tabs">
        <button className="on">Por itens</button>
        <button>Por grupos</button>
        <button>Análise de consumo</button>
        <div className="right">
          <span className="mock-tag">⚑ Dados de exemplo — usa o consumo real quando o estoque estiver ligado</span>
          <span className="mini">Layout</span>
        </div>
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              <th className="c"><input type="checkbox" className="chk" onChange={(e) => toggleAll(e.target.checked)} checked={sel.every(Boolean) && sel.length > 0} /></th>
              <th>Código</th>
              <th>Descrição</th>
              <th>Grupo</th>
              <th className="r">Estoque Atual</th>
              <th className="r">Consumo Médio</th>
              <th className="r">Cob. Atual<span className="q">?</span></th>
              <th className="r">Cob. Desejada</th>
              <th className="r">Dias p/ Ruptura<span className="q">?</span></th>
              <th className="r">Estoque Mínimo</th>
              <th className="r">Pedido Aberto<span className="q">?</span></th>
              <th className="r">Em Trânsito<span className="q">?</span></th>
              <th className="r">Sugestão Sistema<span className="q">?</span></th>
              <th className="r">Compra Ideal<span className="q">?</span></th>
              <th className="r">Último Custo</th>
              <th className="r">Valor Total</th>
              <th className="c">Ações</th>
            </tr>
          </thead>
          <tbody>
            {MOCK.map((r, i) => {
              const alterado = Math.abs(ideal[i] - r.sug) > 0.001
              return (
                <tr key={r.cod}>
                  <td className="c"><input type="checkbox" className="chk" checked={sel[i]} onChange={() => toggle(i)} /></td>
                  <td className="mono muted">{r.cod}</td>
                  <td>{r.desc}</td>
                  <td className="muted">{r.grp}</td>
                  <td className="r mono">{r.est} {r.un}</td>
                  <td className="r mono">{r.cons} {r.un}/d</td>
                  <td className="r mono">{r.cobA} d</td>
                  <td className="r mono muted">{r.cobD} d</td>
                  <td className="r mono">{r.rup} d</td>
                  <td className="r mono">{r.min} {r.un}</td>
                  <td className={'r mono' + (r.ab === '—' ? ' muted' : '')}>{r.ab === '—' ? '—' : r.ab + ' ' + r.un}</td>
                  <td className={'r mono' + (r.tr === '—' ? ' muted' : '')}>{r.tr === '—' ? '—' : r.tr + ' ' + r.un}</td>
                  <td className="r mono"><span className="sug-link" onClick={() => setDrawer(i)}>{q2(r.sug)} {r.un}</span></td>
                  <td className="r">
                    <input className="ci" value={q2(ideal[i])} onChange={(e) => setIdealAt(i, e.target.value)} />
                    {alterado && <span className="mark" title={`Alterado por você · Sugestão do sistema: ${q2(r.sug)} → Compra ideal: ${q2(ideal[i])}`}>✎</span>}
                  </td>
                  <td className="r mono muted">{r.custoTxt}</td>
                  <td className="r mono">{brl(ideal[i] * r.custo)}</td>
                  <td className="c"><button className="mini" style={{ height: 24 }} onClick={() => setDrawer(i)}>Analisar</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="footbar">
        <span className="info">Itens selecionados: <b>{foot.n}</b></span>
        <span className="info">Qtd total da compra: <b>{q2(foot.qtd)}</b></span>
        <span className="info">Valor total da compra: <b>{brl(foot.val)}</b></span>
        <div className="grow" />
        <button className="btn" onClick={() => toggleAll(false)}>Limpar seleção</button>
        <button className="btn btn-solid" onClick={() => setView('pedido')}>Gerar Pedido de Compra →</button>
      </div>

      {dr && (
        <>
          <div className="backdrop" onClick={() => setDrawer(null)} />
          <div className="sug-drawer">
            <div className="dr-head">
              <div><h2>{dr.desc}</h2><div className="sub">{dr.cod} · {dr.grp}</div></div>
              <button className="dr-close" onClick={() => setDrawer(null)}>✕</button>
            </div>
            <div className="dr-body">
              <div className="dr-sec">
                <h3>Informações gerais</h3>
                <div className="kv">
                  <div><div className="k">Último fornecedor</div><div className="v">Dunorte Distribuidora</div></div>
                  <div><div className="k">Última compra</div><div className="v">05/06/2026</div></div>
                  <div><div className="k">Último preço</div><div className="v">{dr.custoTxt}</div></div>
                  <div><div className="k">Preço médio (90d)</div><div className="v">R$ 43,40 /kg</div></div>
                  <div><div className="k">Menor preço</div><div className="v">R$ 41,80</div></div>
                  <div><div className="k">Maior preço</div><div className="v">R$ 45,50</div></div>
                </div>
              </div>

              <div className="dr-sec">
                <h3>Como o AIKO calculou a sugestão</h3>
                <div className="calc">
                  <div className="row"><span>Consumo médio diário</span><span>{dr.cons} {dr.un}/dia</span></div>
                  <div className="row"><span>Cobertura desejada</span><span>{dr.cobD} dias</span></div>
                  <div className="row"><span>Necessidade (consumo × cobertura)</span><span>84,0 {dr.un}</span></div>
                  <div className="row"><span>Estoque mínimo</span><span>{dr.min} {dr.un}</span></div>
                  <div className="row"><span>(−) Estoque atual</span><span>{dr.est} {dr.un}</span></div>
                  <div className="row"><span>(−) Pedido em aberto</span><span>{dr.ab === '—' ? '0,00' : dr.ab} {dr.un}</span></div>
                  <div className="row"><span>(−) Mercadoria em trânsito</span><span>{dr.tr === '—' ? '0,00' : dr.tr} {dr.un}</span></div>
                  <div className="row total"><span>Sugestão final</span><span>{q2(dr.sug)} {dr.un}</span></div>
                </div>
              </div>

              <div className="dr-sec">
                <h3>Alertas inteligentes</h3>
                <div className="alert"><span className="ic" />Consumo acima da média (+18% nos últimos 15 dias)</div>
                <div className="alert"><span className="ic" />Estoque insuficiente para a cobertura desejada</div>
                <div className="alert"><span className="ic" />Último custo aumentou 22% vs. média</div>
                <div className="alert"><span className="ic o" />Fornecedor com 95% de pontualidade</div>
              </div>

              <div className="dr-sec">
                <h3>Histórico</h3>
                <div className="chartbox"><div className="ct">Consumo por mês ({dr.un})</div><div style={{ height: 130 }}><ChartBox config={chMes} style={{ maxHeight: 130 }} /></div></div>
                <div className="chartbox"><div className="ct">Evolução do custo (R$/{dr.un})</div><div style={{ height: 130 }}><ChartBox config={chPreco} style={{ maxHeight: 130 }} /></div></div>
                <div className="chartbox"><div className="ct">Evolução do estoque ({dr.un})</div><div style={{ height: 130 }}><ChartBox config={chEstoque} style={{ maxHeight: 130 }} /></div></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ===================== TELA 2 — PEDIDO DE COMPRA =====================
function TelaPedido({ onBack }: { onBack: () => void }) {
  const [selItem, setSelItem] = useState('Salmão Filé')
  const itens = [
    { nm: 'Salmão Filé', tot: '800,00 kg', preco: 'R$ 42,90', val: 'R$ 34.320,00' },
    { nm: 'Atum', tot: '150,00 kg', preco: 'R$ 38,90', val: 'R$ 5.835,00' },
    { nm: 'Nori', tot: '180,00 un', preco: 'R$ 3,20', val: 'R$ 576,00' },
    { nm: 'Shoyu', tot: '100,00 L', preco: 'R$ 9,80', val: 'R$ 980,00' },
    { nm: 'Camarão 9/12', tot: '50,00 kg', preco: 'R$ 58,50', val: 'R$ 2.925,00' },
  ]
  const lojasDist = [
    ['Ponta Negra', '100,00', '8,00', '4,0 d'], ['Djalma Batista', '100,00', '12,00', '5,0 d'],
    ['Cidade Nova', '100,00', '10,00', '4,5 d'], ['Paraíba', '100,00', '7,00', '3,5 d'],
    ['Centro', '100,00', '9,00', '4,0 d'], ['Laranjeiras', '100,00', '6,00', '3,0 d'],
    ['Distrito', '100,00', '6,00', '3,0 d'], ['Delivery', '100,00', '0,00', '0,0 d'],
  ]
  const gerarPDFs = () => alert('Protótipo: gera 1 PDF por fornecedor, com a distribuição por loja dentro.')

  return (
    <div className="sug-screen">
      <div className="sug-toolbar">
        <button className="btn" onClick={onBack}>← Voltar</button>
        <div className="fld"><label>Data</label><input type="date" defaultValue="2026-06-07" /></div>
        <div className="fld"><label>Grupo de solicitação</label><select><option>Peixes e Frutos do Mar</option></select></div>
        <div className="fld"><label>Lojas</label><select><option>8 selecionadas</option></select></div>
        <div className="fld"><label>Valor total</label><input value="R$ 84.350,00" readOnly /></div>
        <div className="grow" />
        <button className="btn btn-solid" onClick={gerarPDFs}>Gerar PDFs por fornecedor</button>
      </div>

      <div className="p2cols">
        <div className="panel">
          <div className="panel-h"><span className="t">Itens do pedido <span className="muted" style={{ fontWeight: 400 }}>(agrupados por fornecedor)</span></span>
            <select className="fsel" style={{ maxWidth: 'none' }}><option>Todos os fornecedores</option></select></div>
          <div className="forn-grp">
            <div className="forn-hd"><span className="muted">▾</span><span className="nm">Dunorte Distribuidora</span><span className="badge-pref">Preferencial</span><span className="cnt">5 itens</span><span className="tot">R$ 48.320,00</span></div>
            <table className="subtbl">
              <thead><tr><th>Item</th><th className="r">Total Geral</th><th>Fornecedor Sugerido</th><th className="r">Preço Unit.</th><th className="r">Valor Total</th></tr></thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.nm} className={selItem === it.nm ? 'selrow' : ''} style={{ cursor: 'pointer' }} onClick={() => setSelItem(it.nm)}>
                    <td>{it.nm}</td><td className="r mono">{it.tot}</td>
                    <td><select className="fsel" onClick={(e) => e.stopPropagation()}><option>Dunorte Distribuidora</option><option>Mar & Cia Pescados</option><option>Amazon Fish</option></select></td>
                    <td className="r mono">{it.preco}</td><td className="r mono">{it.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="forn-grp"><div className="forn-hd"><span className="muted">▸</span><span className="nm">Mar & Cia Pescados</span><span className="cnt">3 itens</span><span className="tot">R$ 24.180,00</span></div></div>
          <div className="forn-grp"><div className="forn-hd"><span className="muted">▸</span><span className="nm">Amazon Fish</span><span className="cnt">2 itens</span><span className="tot">R$ 11.850,00</span></div></div>
        </div>

        <div className="panel">
          <div className="panel-h"><span className="t">{selItem} <span className="mono muted" style={{ fontWeight: 400 }}>MP0001 · Peixes</span></span><button className="mini">Ver análise do item</button></div>
          <div className="dtl-top">
            <div className="c2"><div className="k">Total Geral</div><div className="v">800,00 kg</div></div>
            <div className="c2"><div className="k">Total por loja (média)</div><div className="v">100,00 kg</div></div>
            <div className="c2"><div className="k">Fornecedor selecionado</div><div className="v">Dunorte Distribuidora</div></div>
            <div className="c2"><div className="k">Preço unitário</div><div className="v">R$ 42,90 <span className="muted" style={{ fontSize: 11 }}>/kg</span></div></div>
            <div className="c2"><div className="k">Valor total</div><div className="v">R$ 34.320,00</div></div>
          </div>
          <div className="split">
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Distribuição por loja <span className="muted" style={{ fontWeight: 400 }}>(serão gerados PDFs individuais)</span></div>
              <table className="subtbl" style={{ border: '1px solid #e5e9f0', borderRadius: 8 }}>
                <thead><tr><th>Loja</th><th className="r">Sugestão</th><th className="r">Estoque</th><th className="r">Cob. Atual</th></tr></thead>
                <tbody>{lojasDist.map((l) => <tr key={l[0]}><td>{l[0]}</td><td className="r mono">{l[1]}</td><td className="r mono">{l[2]}</td><td className="r mono">{l[3]}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="r-side">
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Resumo da escolha</div>
              <div className="resumo">
                <div className="row"><span className="k">Última compra</span><span>05/06/2026</span></div>
                <div className="row"><span className="k">Prazo médio</span><span>2 dias</span></div>
                <div className="row"><span className="k">Pontualidade</span><span>95%</span></div>
                <div className="row"><span className="k">Último preço</span><span>R$ 42,90</span></div>
                <div className="row"><span className="k">Menor preço (30d)</span><span>R$ 41,80</span></div>
                <div className="row"><span className="k">Maior preço (30d)</span><span>R$ 45,50</span></div>
              </div>
              <button className="link-btn">Histórico de compras</button>
            </div>
          </div>
        </div>
      </div>

      <div className="footbar">
        <span className="info">Total geral do pedido: <b>R$ 84.350,00</b></span>
        <div className="grow" />
        <button className="btn">Limpar pedido</button>
        <button className="btn">Salvar rascunho</button>
        <button className="btn btn-solid" onClick={gerarPDFs}>Gerar PDFs por fornecedor</button>
      </div>
    </div>
  )
}
