import { useMemo, useState } from 'react'
import type { ChartConfiguration } from 'chart.js'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { ChartBox } from '../components/ChartBox'
import './sugestao.css'

// Sugestão de Compra (Compras) — responde "o que precisamos comprar?".
// DADOS REAIS: estoque/mínimo/custo (saldo_estoque), consumo (saidas_estoque),
// pedido aberto/em trânsito (pedidos_compra + itens_pedido). Sugestão calculada.
// A Tela 2 (Pedido) e os gráficos de histórico do drawer ainda são mock.

type Insumo = { id: string; nome?: string; categoria?: string; codigo_interno?: number; preco_compra?: number; unidade_medida?: string; unidade_compra?: string }
type Saldo = { insumo_id: string; quantidade?: number; custo_medio?: number; minimo?: number | null; loja_id?: string }
type Saida = { insumo_id: string; quantidade?: number; loja_id?: string }
type Pedido = { id: string; status?: string; loja_id?: string }
type ItemPed = { pedido_id: string; insumo_id: string; quantidade?: number }
type Row = { insumoId: string; cod: string; desc: string; grp: string; un: string; est: number; min: number; cons: number; ab: number; tr: number; custo: number; sug: number }

const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const q2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseNum = (v: string) => parseFloat((v || '0').replace(/\./g, '').replace(',', '.')) || 0
const fmtCod = (c?: number) => (c != null ? String(c).padStart(6, '0') : '—')
const un = (i?: Insumo) => i?.unidade_medida || i?.unidade_compra || 'un'
const norm = (s?: string) => (s || '').toLowerCase().trim()
const RECEBIDO = ['recebido', 'recebida', 'concluido', 'concluida', 'finalizado', 'finalizada', 'cancelado', 'cancelada']
const TRANSITO = ['em_transito', 'em transito', 'transito', 'enviado', 'enviada', 'trânsito']

const baseChart = (): ChartConfiguration['options'] => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { grid: { color: '#eef2f7' }, ticks: { font: { size: 9 } } } },
})

export function SugestaoCompra() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const [view, setView] = useState<'sugestao' | 'pedido'>('sugestao')
  const [lojaFil, setLojaFil] = useState('')
  const [periodoDias, setPeriodoDias] = useState(30)
  const [coberturaDias, setCoberturaDias] = useState(7)
  const [cat, setCat] = useState('')
  const [busca, setBusca] = useState('')
  const [ideal, setIdeal] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [drawer, setDrawer] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600) }

  const desdeISO = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - periodoDias); return d.toISOString() }, [periodoDias])

  const { data: insumos = [] } = useQuery({ queryKey: ['sug-ins', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,categoria,codigo_interno,preco_compra,unidade_medida,unidade_compra').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Insumo[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['sug-saldos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId); return (data ?? []) as Saldo[] } })
  const { data: saidas = [] } = useQuery({ queryKey: ['sug-saidas', tenantId, desdeISO], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('saidas_estoque').select('insumo_id,quantidade,loja_id').eq('tenant_id', tenantId).gte('criado_em', desdeISO); return (data ?? []) as Saida[] } })
  // pedidos + seus itens: itens_pedido não tem tenant_id — busca pelos IDs dos pedidos do tenant
  const { data: ped = { pedidos: [] as Pedido[], itens: [] as ItemPed[] } } = useQuery({
    queryKey: ['sug-ped', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data: pd } = await supabase.from('pedidos_compra').select('id,status,loja_id').eq('tenant_id', tenantId)
      const ps = (pd ?? []) as Pedido[]
      if (!ps.length) return { pedidos: ps, itens: [] as ItemPed[] }
      const { data: it } = await supabase.from('itens_pedido').select('pedido_id,insumo_id,quantidade').in('pedido_id', ps.map((p) => p.id))
      return { pedidos: ps, itens: (it ?? []) as ItemPed[] }
    },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])

  // agregações por insumo (respeitando o filtro de loja)
  const est = useMemo(() => { const m: Record<string, number> = {}; saldos.forEach((s) => { if (lojaFil && s.loja_id !== lojaFil) return; m[s.insumo_id] = (m[s.insumo_id] || 0) + (Number(s.quantidade) || 0) }); return m }, [saldos, lojaFil])
  const min = useMemo(() => { const m: Record<string, number> = {}; saldos.forEach((s) => { if (lojaFil && s.loja_id !== lojaFil) return; m[s.insumo_id] = (m[s.insumo_id] || 0) + (Number(s.minimo) || 0) }); return m }, [saldos, lojaFil])
  const cmMap = useMemo(() => { const m: Record<string, number> = {}; saldos.forEach((s) => { const c = Number(s.custo_medio) || 0; if (c > (m[s.insumo_id] || 0)) m[s.insumo_id] = c }); return m }, [saldos])
  const consMap = useMemo(() => { const m: Record<string, number> = {}; saidas.forEach((s) => { if (lojaFil && s.loja_id !== lojaFil) return; m[s.insumo_id] = (m[s.insumo_id] || 0) + (Number(s.quantidade) || 0) }); const out: Record<string, number> = {}; for (const k in m) out[k] = m[k] / periodoDias; return out }, [saidas, lojaFil, periodoDias])
  const pedMap = useMemo(() => {
    const pById = Object.fromEntries(ped.pedidos.map((p) => [p.id, p])) as Record<string, Pedido>
    const ab: Record<string, number> = {}, tr: Record<string, number> = {}
    ped.itens.forEach((it) => { const p = pById[it.pedido_id]; if (!p) return; const st = norm(p.status); if (RECEBIDO.includes(st)) return; if (lojaFil && p.loja_id !== lojaFil) return; const q = Number(it.quantidade) || 0; if (TRANSITO.includes(st)) tr[it.insumo_id] = (tr[it.insumo_id] || 0) + q; else ab[it.insumo_id] = (ab[it.insumo_id] || 0) + q })
    return { ab, tr }
  }, [ped, lojaFil])

  const rows = useMemo<Row[]>(() => {
    const b = norm(busca)
    return insumos.map((i) => {
      const cons = consMap[i.id] || 0, e = est[i.id] || 0, mn = min[i.id] || 0, ab = pedMap.ab[i.id] || 0, tr = pedMap.tr[i.id] || 0
      const alvo = Math.max(cons * coberturaDias, mn)
      const sug = Math.max(0, alvo - e - ab - tr)
      const custo = cmMap[i.id] > 0 ? cmMap[i.id] : (i.preco_compra || 0)
      return { insumoId: i.id, cod: fmtCod(i.codigo_interno), desc: i.nome || '—', grp: i.categoria || '—', un: un(i), est: e, min: mn, cons, ab, tr, custo, sug }
    })
      .filter((r) => (r.sug > 0 || r.est > 0 || r.min > 0 || r.cons > 0))
      .filter((r) => (!cat || r.grp === cat))
      .filter((r) => (!b || r.desc.toLowerCase().includes(b) || r.cod.includes(b)))
      .sort((a, z) => z.sug - a.sug || a.desc.localeCompare(z.desc, 'pt-BR'))
  }, [insumos, consMap, est, min, pedMap, cmMap, coberturaDias, cat, busca])

  const cats = useMemo(() => [...new Set(insumos.map((i) => i.categoria).filter(Boolean))].sort() as string[], [insumos])
  const idealNum = (r: Row) => (ideal[r.insumoId] != null ? parseNum(ideal[r.insumoId]) : r.sug)
  const setIdealAt = (id: string, v: string) => setIdeal((p) => ({ ...p, [id]: v }))
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (on: boolean) => setSel(on ? new Set(rows.map((r) => r.insumoId)) : new Set())
  const recalcular = () => { setIdeal({}); showToast('Sugestões recalculadas com base no consumo e estoque atuais.') }

  const foot = useMemo(() => { let n = 0, qtd = 0, val = 0; rows.forEach((r) => { if (sel.has(r.insumoId)) { const q = idealNum(r); n++; qtd += q; val += q * r.custo } }); return { n, qtd, val } }, [rows, sel, ideal])

  const chMes = useMemo<ChartConfiguration>(() => ({ type: 'bar', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [{ data: [280, 300, 340, 360, 330, 395], backgroundColor: '#334155', borderRadius: 3, barPercentage: 0.6 }] }, options: baseChart() }), [])
  const chPreco = useMemo<ChartConfiguration>(() => ({ type: 'line', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [{ data: [40.5, 41.2, 41.8, 43.0, 44.1, 42.9], borderColor: '#334155', backgroundColor: 'rgba(51,65,85,.06)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }] }, options: baseChart() }), [])
  const chEstoque = useMemo<ChartConfiguration>(() => ({ type: 'line', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], datasets: [{ data: [120, 95, 140, 70, 110, 58], borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,.08)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }] }, options: baseChart() }), [])

  if (view === 'pedido') return <TelaPedido onBack={() => setView('sugestao')} />

  const dr = drawer != null ? rows.find((r) => r.insumoId === drawer) : null
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.insumoId))

  return (
    <div className="sug-screen">
      <div className="sug-toolbar">
        <div className="fld"><label>Loja</label><select value={lojaFil} onChange={(e) => setLojaFil(e.target.value)}><option value="">Todas as lojas ({lojas.length || '—'})</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
        <div className="fld"><label>Período de análise</label><select value={periodoDias} onChange={(e) => setPeriodoDias(Number(e.target.value))}><option value={30}>Últimos 30 dias</option><option value={60}>Últimos 60 dias</option><option value={90}>Últimos 90 dias</option></select></div>
        <div className="fld"><label>Cobertura desejada</label><select value={coberturaDias} onChange={(e) => setCoberturaDias(Number(e.target.value))}><option value={7}>7 dias</option><option value={15}>15 dias</option><option value={30}>30 dias</option></select></div>
        <div className="fld"><label>Categoria</label><select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="fld"><label>Buscar item</label><input placeholder="Código ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="grow" />
        <button className="btn btn-solid" onClick={recalcular}>Recalcular sugestão</button>
        <button className="btn">Exportar</button>
      </div>

      <div className="sug-tabs">
        <button className="on">Por itens</button>
        <div className="right">
          <span className="mock-tag">{rows.length} itens · consumo dos últimos {periodoDias}d · cobertura {coberturaDias}d</span>
        </div>
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              <th className="c"><input type="checkbox" className="chk" onChange={(e) => toggleAll(e.target.checked)} checked={allSel} /></th>
              <th>Código</th><th>Descrição</th><th>Grupo</th>
              <th className="r">Estoque Atual</th><th className="r">Consumo Médio</th>
              <th className="r">Estoque Mínimo</th><th className="r">Pedido Aberto<span className="q">?</span></th>
              <th className="r">Em Trânsito<span className="q">?</span></th><th className="r">Sugestão Sistema<span className="q">?</span></th>
              <th className="r">Compra Ideal<span className="q">?</span></th><th className="r">Último Custo</th><th className="r">Valor Total</th><th className="c">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={14} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Nenhum item com estoque/consumo/mínimo.</td></tr>
              : rows.map((r) => {
                const ci = idealNum(r), alterado = Math.abs(ci - r.sug) > 0.001
                return (
                  <tr key={r.insumoId}>
                    <td className="c"><input type="checkbox" className="chk" checked={sel.has(r.insumoId)} onChange={() => toggle(r.insumoId)} /></td>
                    <td className="mono muted">{r.cod}</td>
                    <td>{r.desc}</td>
                    <td className="muted">{r.grp}</td>
                    <td className="r mono">{q2(r.est)} {r.un}</td>
                    <td className="r mono">{q2(r.cons)} {r.un}/d</td>
                    <td className="r mono">{q2(r.min)} {r.un}</td>
                    <td className={'r mono' + (r.ab === 0 ? ' muted' : '')}>{r.ab === 0 ? '—' : q2(r.ab) + ' ' + r.un}</td>
                    <td className={'r mono' + (r.tr === 0 ? ' muted' : '')}>{r.tr === 0 ? '—' : q2(r.tr) + ' ' + r.un}</td>
                    <td className="r mono"><span className="sug-link" onClick={() => setDrawer(r.insumoId)}>{q2(r.sug)} {r.un}</span></td>
                    <td className="r">
                      <input className="ci" value={ideal[r.insumoId] ?? q2(r.sug)} onChange={(e) => setIdealAt(r.insumoId, e.target.value)} />
                      {alterado && <span className="mark" title={`Sugestão do sistema: ${q2(r.sug)} → Compra ideal: ${q2(ci)}`}>✎</span>}
                    </td>
                    <td className="r mono muted">{brl(r.custo)} /{r.un}</td>
                    <td className="r mono">{brl(ci * r.custo)}</td>
                    <td className="c"><button className="mini" style={{ height: 24 }} onClick={() => setDrawer(r.insumoId)}>Analisar</button></td>
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
                <h3>Como o AIKO calculou a sugestão</h3>
                <div className="calc">
                  <div className="row"><span>Consumo médio diário</span><span>{q2(dr.cons)} {dr.un}/dia</span></div>
                  <div className="row"><span>Cobertura desejada</span><span>{coberturaDias} dias</span></div>
                  <div className="row"><span>Necessidade (consumo × cobertura)</span><span>{q2(dr.cons * coberturaDias)} {dr.un}</span></div>
                  <div className="row"><span>Alvo (máx. entre necessidade e mínimo {q2(dr.min)})</span><span>{q2(Math.max(dr.cons * coberturaDias, dr.min))} {dr.un}</span></div>
                  <div className="row"><span>(−) Estoque atual</span><span>{q2(dr.est)} {dr.un}</span></div>
                  <div className="row"><span>(−) Pedido em aberto</span><span>{q2(dr.ab)} {dr.un}</span></div>
                  <div className="row"><span>(−) Mercadoria em trânsito</span><span>{q2(dr.tr)} {dr.un}</span></div>
                  <div className="row total"><span>Sugestão final</span><span>{q2(dr.sug)} {dr.un}</span></div>
                </div>
              </div>

              <div className="dr-sec">
                <h3>Histórico <span className="mock-tag" style={{ marginLeft: 6 }}>exemplo</span></h3>
                <div className="chartbox"><div className="ct">Consumo por mês ({dr.un})</div><div style={{ height: 130 }}><ChartBox config={chMes} style={{ maxHeight: 130 }} /></div></div>
                <div className="chartbox"><div className="ct">Evolução do custo (R$/{dr.un})</div><div style={{ height: 130 }}><ChartBox config={chPreco} style={{ maxHeight: 130 }} /></div></div>
                <div className="chartbox"><div className="ct">Evolução do estoque ({dr.un})</div><div style={{ height: 130 }}><ChartBox config={chEstoque} style={{ maxHeight: 130 }} /></div></div>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && <div className="sug-toast">{toast}</div>}
    </div>
  )
}

// ===================== TELA 2 — PEDIDO DE COMPRA (ainda mock) =====================
const LOJAS_PDF = [
  { nome: 'Ponta Negra', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0001-39', ende: 'R. São Luíz, 105 - Adrianópolis, Manaus-AM, 69057-250' },
  { nome: 'Djalma Batista', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0002-10', ende: 'Av. Djalma Batista, 2200 - Chapada, Manaus-AM, 69050-010' },
  { nome: 'Cidade Nova', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0003-00', ende: 'Av. Noel Nutels, 1300 - Cidade Nova, Manaus-AM, 69095-000' },
  { nome: 'Paraíba', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0004-82', ende: 'R. Paraíba, 45 - Adrianópolis, Manaus-AM, 69057-021' },
  { nome: 'Centro', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0005-63', ende: 'Av. Eduardo Ribeiro, 520 - Centro, Manaus-AM, 69010-001' },
  { nome: 'Laranjeiras', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0006-44', ende: 'R. das Laranjeiras, 88 - Flores, Manaus-AM, 69058-030' },
  { nome: 'Distrito', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0007-25', ende: 'Av. Torquato Tapajós, 7000 - Distrito, Manaus-AM, 69083-000' },
  { nome: 'Delivery', razao: 'MORI IZAKAYA RESTAURANTE LTDA', cnpj: '61.753.029/0008-06', ende: 'R. Central do CD, 10 - Distrito, Manaus-AM, 69083-100' },
]
const ITENS_LOJA = [
  { nome: 'Salmão Filé', qty: '100,00', un: 'KG' },
  { nome: 'Atum', qty: '19,00', un: 'KG' },
  { nome: 'Nori', qty: '22,00', un: 'UN' },
  { nome: 'Shoyu', qty: '12,00', un: 'L' },
  { nome: 'Camarão 9/12', qty: '6,00', un: 'KG' },
]

function gerarPDFsPorFornecedor(forn: string) {
  const data = '07/06/2026'
  const paginas = LOJAS_PDF.map((loja) => {
    const linhas: (typeof ITENS_LOJA[number] | null)[] = [...ITENS_LOJA]
    while (linhas.length < 8) linhas.push(null)
    const corpo = linhas.map((it) => it
      ? `<tr><td colspan="2" class="cel-item">${it.nome.toUpperCase()}</td><td class="cel-qty">${it.qty} ${it.un}</td></tr>`
      : `<tr><td colspan="2" class="cel-item">&nbsp;</td><td class="cel-qty">&nbsp;</td></tr>`).join('')
    return `<div class="pagina"><table class="doc">
      <tr><td class="cel-loja">${loja.nome.toUpperCase()}</td><td class="cel-data-label">DATA:</td><td class="cel-data">${data}</td></tr>
      <tr><td colspan="3" class="cel-info">RAZÃO SOCIAL: ${loja.razao} CNPJ: ${loja.cnpj}</td></tr>
      <tr><td colspan="3" class="cel-info">ENDEREÇO: ${loja.ende}</td></tr>
      <tr><td colspan="2" class="cel-th">ITENS</td><td class="cel-th" style="text-align:center">QUANTIDADE</td></tr>
      ${corpo}
      <tr><td class="cel-footer">HORÁRIO DE RECEBIMENTO</td><td class="cel-footer">MANHÃ</td><td class="cel-footer">-</td></tr>
      <tr><td class="cel-footer">&nbsp;</td><td class="cel-footer">TARDE</td><td class="cel-footer">-</td></tr>
    </table></div>`
  }).join('')
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido — ${forn}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;color:#000}
      body{background:#fff}
      .pagina{page-break-after:always;padding:20px;max-width:700px;margin:0 auto}
      .pagina:last-child{page-break-after:avoid}
      .doc{width:100%;border-collapse:collapse;font-size:13px}
      .doc td{border:1px solid #000;padding:6px 8px;vertical-align:middle}
      .cel-loja{font-weight:700;font-size:14px;width:55%}
      .cel-data-label{font-weight:700;width:15%;text-align:center}
      .cel-data{font-weight:700;font-size:14px;width:30%;text-align:right}
      .cel-info{font-size:12px;line-height:1.5;height:36px}
      .cel-th{font-weight:700;font-size:13px;text-align:center;padding:8px}
      .cel-item{height:28px;font-size:12px}
      .cel-qty{text-align:center;font-weight:700;font-size:12px}
      .cel-footer{font-weight:700;font-size:12px;text-align:center;padding:6px}
      @media print{body{margin:0}.pagina{padding:10px;max-width:100%}}
    </style></head><body>${paginas}
    <script>window.onload=function(){window.print()}</script></body></html>`
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(html); w.document.close()
}

function TelaPedido({ onBack }: { onBack: () => void }) {
  const itens = [
    { nm: 'Salmão Filé', cod: 'MP0001', grp: 'Peixes', tot: '800,00 kg', preco: 'R$ 42,90', val: 'R$ 34.320,00' },
    { nm: 'Atum', cod: 'MP0002', grp: 'Peixes', tot: '150,00 kg', preco: 'R$ 38,90', val: 'R$ 5.835,00' },
    { nm: 'Nori', cod: 'MP0004', grp: 'Secos', tot: '180,00 un', preco: 'R$ 3,20', val: 'R$ 576,00' },
    { nm: 'Shoyu', cod: 'MP0005', grp: 'Mercearia', tot: '100,00 L', preco: 'R$ 9,80', val: 'R$ 980,00' },
    { nm: 'Camarão 9/12', cod: 'MP0007', grp: 'Peixes', tot: '50,00 kg', preco: 'R$ 58,50', val: 'R$ 2.925,00' },
  ]
  const [selItem, setSelItem] = useState('Salmão Filé')
  const cur = itens.find((x) => x.nm === selItem) || itens[0]
  const lojasDist = [
    ['Ponta Negra', '100,00', '8,00', '4,0 d'], ['Djalma Batista', '100,00', '12,00', '5,0 d'],
    ['Cidade Nova', '100,00', '10,00', '4,5 d'], ['Paraíba', '100,00', '7,00', '3,5 d'],
    ['Centro', '100,00', '9,00', '4,0 d'], ['Laranjeiras', '100,00', '6,00', '3,0 d'],
    ['Distrito', '100,00', '6,00', '3,0 d'], ['Delivery', '100,00', '0,00', '0,0 d'],
  ]
  const gerarPDFs = () => gerarPDFsPorFornecedor('Dunorte Distribuidora')

  return (
    <div className="sug-screen">
      <div className="sug-toolbar">
        <button className="btn" onClick={onBack}>← Voltar</button>
        <div className="fld"><label>Data</label><input type="date" defaultValue="2026-06-07" /></div>
        <div className="fld"><label>Grupo de solicitação</label><select><option>Peixes e Frutos do Mar</option></select></div>
        <div className="fld"><label>Lojas</label><select><option>8 selecionadas</option></select></div>
        <div className="fld"><label>Valor total</label><input value="R$ 84.350,00" readOnly /></div>
        <div className="grow" />
        <span className="mock-tag">Tela de exemplo — ligação com dados reais no próximo passo</span>
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
          <div className="panel-h"><span className="t">{cur.nm} <span className="mono muted" style={{ fontWeight: 400 }}>{cur.cod} · {cur.grp}</span></span><button className="mini">Ver análise do item</button></div>
          <div className="dtl-top">
            <div className="c2"><div className="k">Total Geral</div><div className="v">{cur.tot}</div></div>
            <div className="c2"><div className="k">Total por loja (média)</div><div className="v">100,00 kg</div></div>
            <div className="c2"><div className="k">Fornecedor selecionado</div><div className="v">Dunorte Distribuidora</div></div>
            <div className="c2"><div className="k">Preço unitário</div><div className="v">{cur.preco}</div></div>
            <div className="c2"><div className="k">Valor total</div><div className="v">{cur.val}</div></div>
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
        <button className="btn btn-solid" onClick={gerarPDFs}>Gerar PDFs por fornecedor</button>
      </div>
    </div>
  )
}
