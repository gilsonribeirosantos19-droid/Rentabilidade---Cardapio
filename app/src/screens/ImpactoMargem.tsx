import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { custoDoInsumo, type CostCtx } from '../lib/cost'
import { downloadCsv } from '../lib/csv'
import { precosPeriodo, criarExplosao, custoConsumo, custoUnitario, precoParaManter, type FichaX, type InsumoUn, type Consumo, type PrecoPer } from '../lib/impactoMargem'
import './impacto.css'

// Gestão › Impacto na Margem — quanto a variação do preço de COMPRA dos insumos tirou (ou devolveu)
// da margem, com o volume que foi VENDIDO no mês. Só leitura (não mexe em custo médio/CMV).
//  • preço do insumo no mês = média ponderada das compras da REDE (NF-e + manual; sem transferência/ajuste)
//  • custo do produto = ficha explodida até o insumo cru (processados e combos descem)
//  • vendas = vendas_produto_dia com o portão (só dia 'processado'), loja = seletor global

type Insumo = InsumoUn & { nome: string; categoria?: string | null; preco_compra?: number }
type Ficha = { id: string; produto_id?: string | null; rendimento_porcoes?: number | null; insumo_vinculado_id?: string | null; rendimento_receita_g?: number | null; itens_ficha?: { insumo_id?: string | null; produto_id?: string | null; quantidade_g?: number | null }[] }
type Venda = { loja_id: string; data: string; produto_id: string; produto_nome?: string; grupo?: string; qtd?: number; faturado?: number }
type Ent = { insumo_id: string; quantidade?: number; custo_unitario?: number; criado_em?: string; tipo?: string | null }
type ProdRow = { cod: string; nome: string; grupo: string; qtd: number; fat: number; preco: number; consumo: Consumo | null; cA: number; cB: number; cmvA: number; cmvB: number; perda: number; sug: number }

const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
const pc = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const qtdFmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const titleCase = (s: string) => (s || '').toLowerCase().replace(/(^|[\s\-/(])(\S)/g, (_m, p, c) => p + (c as string).toUpperCase())
const dot = (c: number) => c <= 30 ? 'g' : c <= 38 ? 'y' : 'r'
const unLabel = (i?: Insumo) => { const u = (i?.unidade_medida || i?.unidade_compra || 'kg').toLowerCase(); return u === 'un' || u === 'pct' || u === 'cx' ? u : (u === 'litro' || u === 'ml' || u === 'l') ? 'L' : 'kg' }
const discreto = (i?: Insumo) => ['un', 'pct', 'cx'].includes((i?.unidade_medida || i?.unidade_compra || 'g').toLowerCase())

// meses: 'YYYY-MM' → [primeiro dia, último dia]
const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const mesRange = (k: string): [string, string] => { const [y, m] = k.split('-').map(Number); return [`${k}-01`, new Date(y, m, 0).toLocaleDateString('en-CA')] }
const mesNome = (k: string) => { const [y, m] = k.split('-').map(Number); const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1) }
const MESES = (() => { const h = new Date(); return Array.from({ length: 13 }, (_, i) => mesKey(new Date(h.getFullYear(), h.getMonth() - i, 1))) })()

function VarPill({ v }: { v: number }) {
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'dn' : 'eq'
  return <span className={'imp-pill ' + cls}>{v > 0.05 ? '▲' : v < -0.05 ? '▼' : ''} {pc(Math.abs(v))}</span>
}
function Fonte({ p }: { p: PrecoPer }) {
  if (p.fonte === 'compra') return null
  const t = p.fonte === 'ultima' ? 'sem compra no mês — usa o último preço pago' : p.fonte === 'cadastro' ? 'nunca comprado — usa o custo do cadastro' : 'sem preço'
  return <span className="imp-src" title={t}>{p.fonte === 'ultima' ? 'últ.' : p.fonte === 'cadastro' ? 'cad.' : '—'}</span>
}
const Cmv = ({ v }: { v: number }) => <span className="imp-cmv"><i className={'imp-dot ' + dot(v)} />{pc(v)}</span>

export function ImpactoMargem() {
  const { tenantId } = useAuth()
  const { lojaId, lojas } = useLoja()
  const [mesB, setMesB] = useState(MESES[0])
  const [mesA, setMesA] = useState(MESES[1])
  const [aba, setAba] = useState<'real' | 'sim'>('real')
  const [busca, setBusca] = useState('')
  const [ord, setOrd] = useState<{ k: keyof ProdRow; desc: boolean }>({ k: 'perda', desc: true })
  const [aberto, setAberto] = useState<string | null>(null)
  const [sim, setSim] = useState<Record<string, number>>({})
  const [buscaSim, setBuscaSim] = useState('')

  const [iniB, fimB] = mesRange(mesB)
  const [iniA, fimA] = mesRange(mesA)
  const fimMax = fimA > fimB ? fimA : fimB
  // histórico de compras até 12 meses antes do período mais antigo (p/ o "último preço pago")
  const desde = useMemo(() => { const base = iniA < iniB ? iniA : iniB; const d = new Date(base + 'T12:00:00'); d.setFullYear(d.getFullYear() - 1); return d.toLocaleDateString('en-CA') }, [iniA, iniB])

  const en = !!tenantId
  const { data: insumos = [], isLoading: l1 } = useQuery({ queryKey: ['imp-ins', tenantId], enabled: en, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria,unidade_medida,unidade_compra,rendimento_pct,preco_compra').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['imp-sld', tenantId], enabled: en, queryFn: () => fetchAll<{ insumo_id: string; custo_medio?: number; loja_id?: string }>((f, t) => supabase.from('saldo_estoque').select('insumo_id,custo_medio,loja_id').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: fichas = [], isLoading: l2 } = useQuery({ queryKey: ['imp-fichas', tenantId], enabled: en, queryFn: () => fetchAll<Ficha>((f, t) => supabase.from('fichas_tecnicas').select('id,produto_id,rendimento_porcoes,insumo_vinculado_id,rendimento_receita_g,itens_ficha(insumo_id,produto_id,quantidade_g)').eq('tenant_id', tenantId).neq('status', 'arquivada').order('id').range(f, t)) })
  const { data: produtos = [] } = useQuery({ queryKey: ['imp-prod', tenantId], enabled: en, queryFn: () => fetchAll<{ id: string; codigo_pdv?: string }>((f, t) => supabase.from('produtos').select('id,codigo_pdv').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: entradas = [], isLoading: l3 } = useQuery({
    queryKey: ['imp-ent', tenantId, desde, fimMax], enabled: en,
    queryFn: () => fetchAll<Ent>((f, t) => supabase.from('entradas_estoque').select('insumo_id,quantidade,custo_unitario,criado_em,tipo').eq('tenant_id', tenantId).gte('criado_em', desde + 'T00:00:00').lte('criado_em', fimMax + 'T23:59:59').order('id').range(f, t)),
  })
  // vendas do mês "agora" com o PORTÃO (só dia processado) — igual Engenharia/Faturamento
  const { data: vendas = [], isLoading: l4 } = useQuery({
    queryKey: ['imp-vendas', tenantId, iniB, fimB], enabled: en,
    queryFn: async () => {
      const [v, gate] = await Promise.all([
        fetchAll<Venda>((f, t) => supabase.from('vendas_produto_dia').select('*').eq('tenant_id', tenantId).gte('data', iniB).lte('data', fimB).order('loja_id').order('data').order('produto_id').range(f, t)),
        fetchAll<{ loja_id: string; data: string; status: string }>((f, t) => supabase.from('recebimento_vendas').select('loja_id,data,status').eq('tenant_id', tenantId).gte('data', iniB).lte('data', fimB).order('loja_id').order('data').range(f, t)),
      ])
      const ok = new Set(gate.filter((g) => g.status === 'processado').map((g) => `${g.loja_id}|${g.data}`))
      return v.filter((r) => ok.has(`${r.loja_id}|${r.data}`))
    },
  })
  const loading = l1 || l2 || l3 || l4

  const insMap = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos])
  const fallback = useMemo(() => { const ctx = { saldos, insumos: insumos as CostCtx['insumos'] }; return (id: string) => custoDoInsumo(id, null, ctx) }, [saldos, insumos])
  const precoA = useMemo(() => precosPeriodo(entradas, iniA, fimA, fallback), [entradas, iniA, fimA, fallback])
  const precoB = useMemo(() => precosPeriodo(entradas, iniB, fimB, fallback), [entradas, iniB, fimB, fallback])
  const explosao = useMemo(() => criarExplosao(fichas.map((f): FichaX => ({ ...f, itens: f.itens_ficha || [] }))), [fichas])
  const prodByCod = useMemo(() => { const m = new Map<string, string>(); produtos.forEach((p) => { const c = (p.codigo_pdv || '').trim(); if (c) m.set(c, p.id) }); return m }, [produtos])

  // produtos vendidos (agrupados por código do PDV; loja = seletor global)
  const base = useMemo(() => {
    const agg = new Map<string, { cod: string; nome: string; grupo: string; qtd: number; fat: number }>()
    for (const v of vendas) {
      if (lojaId && v.loja_id !== lojaId) continue
      const cod = String(v.produto_id ?? '').trim(); if (!cod) continue
      const a = agg.get(cod) || { cod, nome: v.produto_nome || cod, grupo: v.grupo || '', qtd: 0, fat: 0 }
      a.qtd += +(v.qtd || 0); a.fat += +(v.faturado || 0); agg.set(cod, a)
    }
    let fatTotal = 0, fatFicha = 0
    const rows: { cod: string; nome: string; grupo: string; qtd: number; fat: number; consumo: Consumo | null }[] = []
    agg.forEach((a) => {
      fatTotal += a.fat
      const pid = prodByCod.get(a.cod); const f = pid ? explosao.fichaDoProduto(pid) : undefined
      const consumo = f ? explosao.porPorcao(f.id) : null
      const ok = !!consumo && consumo.size > 0
      if (ok) fatFicha += a.fat
      if (a.qtd > 0) rows.push({ ...a, consumo: ok ? consumo : null })
    })
    return { rows, fatTotal, fatFicha }
  }, [vendas, lojaId, prodByCod, explosao])

  const custoCom = (c: Consumo, pr: (id: string) => number) => custoConsumo(c, insMap, pr)
  const pA = (id: string) => precoA(id).preco
  const pB = (id: string) => precoB(id).preco

  // ── impacto REAL (antes × agora) ──
  const real = useMemo(() => {
    const prods: ProdRow[] = []
    const vil = new Map<string, { v: number; n: number }>()
    for (const r of base.rows) {
      if (!r.consumo) continue
      const cA = custoCom(r.consumo, pA), cB = custoCom(r.consumo, pB)
      const preco = r.qtd ? r.fat / r.qtd : 0
      prods.push({ ...r, preco, cA, cB, cmvA: preco > 0 ? cA / preco * 100 : 0, cmvB: preco > 0 ? cB / preco * 100 : 0, perda: (cB - cA) * r.qtd, sug: precoParaManter(cA, cB, preco) })
      r.consumo.forEach((q, id) => {
        const ins = insMap.get(id)
        const d = q * (custoUnitario(ins, pB(id)) - custoUnitario(ins, pA(id))) * r.qtd
        const o = vil.get(id) || { v: 0, n: 0 }; o.v += d; o.n++; vil.set(id, o)
      })
    }
    const fat = prods.reduce((s, p) => s + p.fat, 0)
    const cuA = prods.reduce((s, p) => s + p.cA * p.qtd, 0), cuB = prods.reduce((s, p) => s + p.cB * p.qtd, 0)
    const viloes = [...vil.entries()].map(([id, o]) => ({ id, ins: insMap.get(id), a: precoA(id), b: precoB(id), ...o })).filter((x) => Math.abs(x.v) >= 0.5).sort((x, y) => y.v - x.v)
    return { prods, viloes, fat, cuA, cuB, mA: fat > 0 ? (fat - cuA) / fat * 100 : 0, mB: fat > 0 ? (fat - cuB) / fat * 100 : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, precoA, precoB, insMap])

  const prodsView = useMemo(() => {
    const q = norm(busca.trim())
    const l = real.prods.filter((p) => !q || norm(p.nome + ' ' + p.grupo + ' ' + p.cod).includes(q))
    const k = ord.k
    return l.sort((x, y) => { const a = x[k] as number | string, b = y[k] as number | string; const r = typeof a === 'string' ? String(a).localeCompare(String(b)) : (a as number) - (b as number); return ord.desc ? -r : r })
  }, [real.prods, busca, ord])

  // ── simulador (parte dos preços do mês "agora") ──
  const pS = (id: string) => pB(id) * (1 + (sim[id] || 0) / 100)
  const simulado = useMemo(() => {
    const prods = real.prods.map((p) => { const cS = custoCom(p.consumo as Consumo, pS); return { ...p, cS, cmvS: p.preco > 0 ? cS / p.preco * 100 : 0, perdaS: (cS - p.cB) * p.qtd, sugS: precoParaManter(p.cB, cS, p.preco) } })
    const cuS = prods.reduce((s, p) => s + p.cS * p.qtd, 0)
    return { prods: prods.filter((p) => Math.abs(p.perdaS) >= 0.5).sort((a, b) => b.perdaS - a.perdaS), cuS, mS: real.fat > 0 ? (real.fat - cuS) / real.fat * 100 : 0, viram: prods.filter((p) => p.preco > 0 && p.cmvS > 38 && p.cmvB <= 38) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, sim, precoB])
  // insumos usados nas vendas, por peso no custo do mês
  const usados = useMemo(() => {
    const peso = new Map<string, number>()
    for (const p of real.prods) p.consumo?.forEach((q, id) => peso.set(id, (peso.get(id) || 0) + q * custoUnitario(insMap.get(id), pB(id)) * p.qtd))
    return [...peso.entries()].map(([id, v]) => ({ id, ins: insMap.get(id), v })).filter((x) => x.ins && x.v > 0).sort((a, b) => b.v - a.v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real.prods, insMap, precoB])
  const catsTop = useMemo(() => { const m = new Map<string, number>(); usados.forEach((u) => { const c = u.ins?.categoria || ''; if (c) m.set(c, (m.get(c) || 0) + u.v) }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c) }, [usados])
  const aplicar = (fn: (i: Insumo) => boolean, v: number) => setSim((s) => { const n = { ...s }; usados.forEach((u) => { if (u.ins && fn(u.ins)) n[u.id] = v }); return n })
  const usadosView = useMemo(() => { const q = norm(buscaSim.trim()); return usados.filter((u) => !q || norm(u.ins?.nome || '').includes(q) || norm(u.ins?.categoria || '').includes(q)) }, [usados, buscaSim])

  const cobertura = base.fatTotal > 0 ? base.fatFicha / base.fatTotal * 100 : 0
  const topVil = real.viloes[0]
  const viraram = real.prods.filter((p) => p.preco > 0 && p.cmvB > 38 && p.cmvA <= 38)
  const lojaNome = lojaId ? (lojas.find((l) => l.id === lojaId)?.nome || 'loja') : 'todas as lojas'
  const th = (k: keyof ProdRow, label: string, cls = '') => <th className={cls} onClick={() => setOrd((o) => ({ k, desc: o.k === k ? !o.desc : true }))}>{label}{ord.k === k ? (ord.desc ? ' ▾' : ' ▴') : ''}</th>

  const exportar = () => downloadCsv(`impacto_margem_${mesA}_x_${mesB}.csv`, [
    ['Produto', 'Grupo', 'Código PDV', 'Vendidos', 'Preço médio', `Custo ${mesA}`, `Custo ${mesB}`, `CMV ${mesA} %`, `CMV ${mesB} %`, 'Perda R$', 'Preço p/ manter'],
    ...prodsView.map((p) => [titleCase(p.nome), titleCase(p.grupo), p.cod, +p.qtd.toFixed(2), +p.preco.toFixed(2), +p.cA.toFixed(4), +p.cB.toFixed(4), +p.cmvA.toFixed(2), +p.cmvB.toFixed(2), +p.perda.toFixed(2), +p.sug.toFixed(2)]),
  ])

  return (
    <div className="imp-screen">
      <div className="imp-filters">
        <div className="imp-fg"><label htmlFor="imp-mesb">Mês analisado</label>
          <select id="imp-mesb" className="imp-field" value={mesB} onChange={(e) => setMesB(e.target.value)}>{MESES.map((m) => <option key={m} value={m}>{mesNome(m)}</option>)}</select></div>
        <div className="imp-fg"><label htmlFor="imp-mesa">Comparar com</label>
          <select id="imp-mesa" className="imp-field" value={mesA} onChange={(e) => setMesA(e.target.value)}>{MESES.map((m) => <option key={m} value={m}>{mesNome(m)}</option>)}</select></div>
        <div className="imp-fg"><label>Loja</label><div className="imp-ro">{titleCase(lojaNome)} <span>(seletor do topo)</span></div></div>
        <div className="imp-cov" title="Só entram produtos vendidos que têm ficha técnica ligada pelo código do PDV">
          <span>Cobertura: <b>{pc(cobertura)}</b> do faturamento tem ficha</span>
          <span className="imp-covbar"><i style={{ width: Math.min(100, cobertura) + '%' }} /></span>
        </div>
        <button className="imp-btn" onClick={exportar} disabled={!prodsView.length}>↓ Exportar</button>
      </div>

      {loading ? <div className="imp-empty">Carregando compras, fichas e vendas…</div>
        : !base.rows.length ? <div className="imp-empty">Sem vendas processadas em {mesNome(mesB)}{lojaId ? ' nesta loja' : ''}. Escolha outro mês ou confira o Recebimento de Vendas.</div>
        : <>
          <div className="imp-kpis">
            <div className={'imp-kpi' + (real.mB < real.mA ? ' bad' : '')}><span className="lab">Margem bruta (produtos com ficha)</span><span className="num">{pc(real.mA)} → {pc(real.mB)}</span>
              <span className="foot"><span className={real.mB < real.mA ? 'down' : 'upg'}>{real.mB < real.mA ? '▼' : '▲'} {Math.abs(real.mA - real.mB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos</span> com os preços de {mesNome(mesB).split(' ')[0].toLowerCase()}</span></div>
            <div className={'imp-kpi' + (real.cuB > real.cuA ? ' bad' : ' ok')}><span className="lab">{real.cuB >= real.cuA ? 'Margem perdida' : 'Margem ganha'}</span><span className="num">{brl0(Math.abs(real.cuB - real.cuA))}</span><span className="foot">sobre {brl0(real.fat)} vendidos em {mesNome(mesB).split(' ')[0].toLowerCase()}</span></div>
            <div className="imp-kpi warn"><span className="lab">Maior vilão</span><span className="num sm">{topVil ? titleCase(topVil.ins?.nome || '—') : '—'}</span>
              <span className="foot">{topVil && topVil.a.preco > 0 ? <><VarPill v={(topVil.b.preco / topVil.a.preco - 1) * 100} /> · {brl0(topVil.v)} do total</> : 'nenhum insumo subiu'}</span></div>
            <div className={'imp-kpi' + (viraram.length ? ' bad' : '')}><span className="lab">Viraram vermelho</span><span className="num">{viraram.length} produto{viraram.length === 1 ? '' : 's'}</span><span className="foot">CMV passou de 38%{viraram[0] ? ' · ex.: ' + titleCase(viraram[0].nome) : ''}</span></div>
          </div>

          <div className="imp-tabs" role="tablist">
            <button role="tab" className={aba === 'real' ? 'on' : ''} onClick={() => setAba('real')}>Impacto real</button>
            <button role="tab" className={aba === 'sim' ? 'on' : ''} onClick={() => setAba('sim')}>Simulador “e se…?”</button>
          </div>

          {aba === 'real' ? (
            <div className="imp-grid">
              <div className="imp-card">
                <h2>Vilões da margem <span className="hint">insumos que mais pesaram em R$</span></h2>
                <div className="imp-scroll">
                  <table className="imp-tbl">
                    <thead><tr><th>Insumo</th><th className="r">{mesNome(mesA).split(' ')[0]}</th><th className="r">{mesNome(mesB).split(' ')[0]}</th><th className="r">Var.</th><th className="r">Impacto</th><th /></tr></thead>
                    <tbody>
                      {real.viloes.length === 0 ? <tr><td colSpan={6} className="imp-empty">Nenhum insumo mudou de preço entre os dois meses.</td></tr>
                        : real.viloes.map((v) => {
                          const max = Math.abs(real.viloes[0].v) || 1
                          return <tr key={v.id}>
                            <td>{titleCase(v.ins?.nome || '—')} <span className="muted">· {v.n} prod.</span></td>
                            <td className="r">{brl(v.a.preco)}<Fonte p={v.a} /></td>
                            <td className="r">{brl(v.b.preco)}<Fonte p={v.b} /> <span className="muted">/{unLabel(v.ins)}</span></td>
                            <td className="r">{v.a.preco > 0 ? <VarPill v={(v.b.preco / v.a.preco - 1) * 100} /> : '—'}</td>
                            <td className={'r strong ' + (v.v > 0 ? 'neg' : 'pos')}>{v.v > 0 ? '−' : '+'} {brl0(Math.abs(v.v))}</td>
                            <td><div className="imp-bar"><i className={v.v < 0 ? 'pos' : ''} style={{ width: Math.min(100, Math.abs(v.v) / max * 100) + '%' }} /></div></td>
                          </tr>
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="imp-note">Preço = <b>média ponderada das compras</b> do mês na rede (NF-e e entradas manuais; transferências e ajustes não contam). <b>últ.</b> = sem compra no mês, usa o último preço pago. O custo já desconta a perda na limpeza (rendimento do insumo).</div>
              </div>

              <div className="imp-card">
                <h2>Produtos afetados <input className="imp-search" placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} /></h2>
                <div className="imp-scroll tall">
                  <table className="imp-tbl">
                    <thead><tr>{th('nome', 'Produto')}{th('preco', 'Preço médio', 'r')}{th('cB', 'Custo antes → agora', 'r')}{th('cmvB', 'CMV antes → agora')}{th('qtd', 'Vendidos', 'r')}{th('perda', 'Perda R$', 'r')}{th('sug', 'Preço p/ manter', 'r')}</tr></thead>
                    <tbody>
                      {prodsView.length === 0 ? <tr><td colSpan={7} className="imp-empty">Nenhum produto com ficha no filtro.</td></tr>
                        : prodsView.slice(0, 400).map((p) => (
                          <Fragment key={p.cod}>
                            <tr className="clk" onClick={() => setAberto((a) => a === p.cod ? null : p.cod)}>
                              <td>{aberto === p.cod ? '▾' : '▸'} {titleCase(p.nome)} <span className="muted">· {titleCase(p.grupo)}</span></td>
                              <td className="r">{p.preco > 0 ? brl(p.preco) : <span className="muted">R$ 0 (rodízio)</span>}</td>
                              <td className="r">{brl(p.cA)} → <b>{brl(p.cB)}</b></td>
                              <td>{p.preco > 0 ? <><Cmv v={p.cmvA} /> → <b><Cmv v={p.cmvB} /></b></> : <span className="muted">—</span>}</td>
                              <td className="r">{qtdFmt(p.qtd)}</td>
                              <td className={'r strong ' + (p.perda > 0 ? 'neg' : 'pos')}>{Math.abs(p.perda) < 0.5 ? <span className="muted">—</span> : <>{p.perda > 0 ? '−' : '+'} {brl0(Math.abs(p.perda))}</>}</td>
                              <td className="r">{p.sug > 0 && p.cB > p.cA ? brl(p.sug) : <span className="muted">—</span>}</td>
                            </tr>
                            {aberto === p.cod && p.consumo && (
                              <tr className="imp-detail"><td colSpan={7}>
                                <table className="imp-mini">
                                  <thead><tr><th>Insumo (já descido até o cru)</th><th className="r">Qtd/porção</th><th className="r">Custo antes</th><th className="r">Custo agora</th><th className="r">Diferença</th></tr></thead>
                                  <tbody>
                                    {[...p.consumo.entries()].map(([id, q]) => { const ins = insMap.get(id); return { id, ins, q, a: q * custoUnitario(ins, pA(id)), b: q * custoUnitario(ins, pB(id)) } })
                                      .sort((x, y) => (y.b - y.a) - (x.b - x.a)).map((l) => (
                                        <tr key={l.id}><td>{titleCase(l.ins?.nome || '(insumo removido)')}</td><td className="r">{discreto(l.ins) ? qtdFmt(l.q) + ' un' : qtdFmt(l.q) + ' g'}</td><td className="r">{brl(l.a)}</td><td className="r">{brl(l.b)}</td>
                                          <td className={'r ' + (l.b > l.a ? 'neg' : l.b < l.a ? 'pos' : 'muted')}>{l.b >= l.a ? '+' : '−'} {brl(Math.abs(l.b - l.a))}</td></tr>
                                      ))}
                                  </tbody>
                                </table>
                              </td></tr>
                            )}
                          </Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="imp-note">Mesmo volume vendido em {mesNome(mesB).split(' ')[0].toLowerCase()}, custeado com os preços dos dois meses. Semáforo do CMV: <Cmv v={25} /> até 30% · <Cmv v={35} /> até 38% · <Cmv v={40} /> acima. “Preço p/ manter” = preço que devolve o CMV de antes.{prodsView.length > 400 ? ` Mostrando 400 de ${prodsView.length} (use a busca ou o Exportar).` : ''}</div>
              </div>
            </div>
          ) : (
            <div className="imp-grid">
              <div className="imp-card">
                <h2>Cenário <span className="hint">parte dos preços de {mesNome(mesB).split(' ')[0].toLowerCase()}</span></h2>
                <div className="imp-chips">
                  {catsTop.map((c) => <button key={c} className="imp-chip" onClick={() => aplicar((i) => i.categoria === c, 10)}>{titleCase(c)} +10%</button>)}
                  {usados[0] && <button className="imp-chip" onClick={() => aplicar((i) => i.id === usados[0].id, 15)}>{titleCase(usados[0].ins?.nome || '')} +15%</button>}
                  <button className="imp-chip" onClick={() => aplicar(() => true, 5)}>Tudo +5%</button>
                  <button className="imp-chip reset" onClick={() => setSim({})}>Zerar cenário</button>
                  <input className="imp-search" placeholder="Buscar insumo…" value={buscaSim} onChange={(e) => setBuscaSim(e.target.value)} />
                </div>
                <div className="imp-scroll tall">
                  <table className="imp-tbl">
                    <thead><tr><th>Insumo</th><th className="r">Hoje</th><th className="r">Variação %</th><th className="r">Simulado</th></tr></thead>
                    <tbody>
                      {usadosView.slice(0, 300).map((u) => { const v = sim[u.id] || 0; return (
                        <tr key={u.id} className={v ? 'chg' : ''}>
                          <td>{titleCase(u.ins?.nome || '')} <span className="muted">· {titleCase(u.ins?.categoria || '')}</span></td>
                          <td className="r">{brl(pB(u.id))} <span className="muted">/{unLabel(u.ins)}</span></td>
                          <td className="r"><input className="imp-pct" type="number" step="1" id={'imp-sim-' + u.id} aria-label={'Variação % ' + (u.ins?.nome || '')} value={v || ''} placeholder="0"
                            onChange={(e) => { const n = parseFloat(e.target.value) || 0; setSim((s) => { const x = { ...s }; if (n) x[u.id] = n; else delete x[u.id]; return x }) }} /></td>
                          <td className="r">{brl(pS(u.id))}</td>
                        </tr>) })}
                    </tbody>
                  </table>
                </div>
                <div className="imp-note">Ordenado pelo peso do insumo no custo do que foi vendido.</div>
              </div>

              <div className="imp-col">
                <div className="imp-kpis three">
                  <div className={'imp-kpi' + (simulado.mS < real.mB ? ' bad' : '')}><span className="lab">Margem hoje → simulada</span><span className="num">{pc(real.mB)} → {pc(simulado.mS)}</span>
                    <span className="foot">{Object.keys(sim).length ? <span className={simulado.mS < real.mB ? 'down' : 'upg'}>{simulado.mS < real.mB ? '▼' : '▲'} {Math.abs(real.mB - simulado.mS).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos</span> : 'monte um cenário ao lado'}</span></div>
                  <div className={'imp-kpi' + (simulado.cuS > real.cuB ? ' bad' : '')}><span className="lab">Impacto no mês</span><span className="num">{simulado.cuS >= real.cuB ? '−' : '+'} {brl0(Math.abs(simulado.cuS - real.cuB))}</span><span className="foot">com o volume de {mesNome(mesB).split(' ')[0].toLowerCase()}</span></div>
                  <div className={'imp-kpi' + (simulado.viram.length ? ' bad' : '')}><span className="lab">Passariam a vermelho</span><span className="num">{simulado.viram.length}</span><span className="foot">{simulado.viram.length ? simulado.viram.slice(0, 2).map((p) => titleCase(p.nome)).join(', ') + (simulado.viram.length > 2 ? '…' : '') : 'nenhum produto cruza 38%'}</span></div>
                </div>
                <div className="imp-card">
                  <h2>Produtos no cenário <span className="hint">o que mais perde primeiro</span></h2>
                  <div className="imp-scroll tall">
                    <table className="imp-tbl">
                      <thead><tr><th>Produto</th><th className="r">Preço médio</th><th>CMV hoje → simulado</th><th className="r">Perda/mês</th><th className="r">Preço p/ manter</th></tr></thead>
                      <tbody>
                        {!Object.keys(sim).length ? <tr><td colSpan={5} className="imp-empty">Escolha um atalho ou digite a variação de um insumo.</td></tr>
                          : simulado.prods.length === 0 ? <tr><td colSpan={5} className="imp-empty">Nenhum produto vendido usa os insumos alterados.</td></tr>
                          : simulado.prods.slice(0, 300).map((p) => (
                            <tr key={p.cod}>
                              <td>{titleCase(p.nome)} {p.preco > 0 && p.cmvS > 38 && p.cmvB <= 38 && <span className="imp-flag">● vira vermelho</span>}</td>
                              <td className="r">{p.preco > 0 ? brl(p.preco) : <span className="muted">R$ 0</span>}</td>
                              <td>{p.preco > 0 ? <><Cmv v={p.cmvB} /> → <b><Cmv v={p.cmvS} /></b></> : <span className="muted">—</span>}</td>
                              <td className={'r strong ' + (p.perdaS > 0 ? 'neg' : 'pos')}>{p.perdaS > 0 ? '−' : '+'} {brl0(Math.abs(p.perdaS))}</td>
                              <td className="r">{p.sugS > 0 && p.cS > p.cB ? brl(p.sugS) : <span className="muted">—</span>}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>}
    </div>
  )
}
