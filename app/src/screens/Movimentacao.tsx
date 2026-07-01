import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { custoDoInsumo, type Mov } from '../lib/cost'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Insumo = { id: string; nome: string; categoria?: string; tipo_item?: string; familia?: string; subgrupo?: string; unidade_medida?: string; unidade_compra?: string; participa_cmv?: string; preco_compra?: number }
type Saida = Mov & { tipo?: string }
type InvItem = { insumo_id: string; qtd_contada?: number; custo_medio?: number }

const brl = (v?: number | null) => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const uniq = (a: (string | undefined)[]) => [...new Set(a.filter(Boolean).map((v) => ('' + v).trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt'))
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MOV_COLS: { id: string; label: string; fixed?: boolean; def?: boolean; align: 'l' | 'r' | 'c' }[] = [
  { id: 'descricao', label: 'Descrição', fixed: true, align: 'l' },
  { id: 'un', label: 'Un.', def: true, align: 'l' },
  { id: 'grupo', label: 'Grupo', def: true, align: 'l' },
  { id: 'q-anterior', label: 'Q.Anterior', def: false, align: 'r' },
  { id: 'v-anterior', label: 'V.Anterior', def: false, align: 'r' },
  { id: 'q-entradas', label: 'Q.Entradas', def: true, align: 'r' },
  { id: 'v-entradas', label: 'V.Entradas', def: false, align: 'r' },
  { id: 'q-consumo', label: 'Q.Consumo', def: true, align: 'r' },
  { id: 'v-consumo', label: 'V.Consumo', def: false, align: 'r' },
  { id: 'q-perdas', label: 'Q.Perdas', def: true, align: 'r' },
  { id: 'v-perdas', label: 'V.Perdas', def: false, align: 'r' },
  { id: 'q-final', label: 'Q.Final', def: true, align: 'r' },
  { id: 'v-final', label: 'V.Final', def: false, align: 'r' },
  { id: 'c-medio', label: 'C.Médio', def: true, align: 'r' },
  { id: 'calcula-cmv', label: 'Calcula CMV', def: true, align: 'c' },
]
const COLS_KEY = 'aiko_mov_cols'
function loadCols(): Record<string, boolean> {
  try { const s = localStorage.getItem(COLS_KEY); if (s) { const o = JSON.parse(s); MOV_COLS.forEach((c) => { if (c.fixed) o[c.id] = true }); return o } } catch { /* ignore */ }
  const d: Record<string, boolean> = {}; MOV_COLS.forEach((c) => { d[c.id] = c.fixed || !!c.def }); return d
}

type Row = { nome: string; un: string; cat: string; qAnt: number; vAnt: number; qEnt: number; vEnt: number; qCon: number; vCon: number; qPerd: number; vPerd: number; qFin: number; vFin: number; cm: number; cmv?: string }

export function Movimentacao() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()
  const d30 = new Date(); d30.setDate(d30.getDate() - 30)
  const [de, setDe] = useState(iso(d30))
  const [ate, setAte] = useState(iso(new Date()))
  const [catF, setCatF] = useState('')
  const [busca, setBusca] = useState('')
  const [comSaldo, setComSaldo] = useState(true)
  const [soCmv, setSoCmv] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)
  const [tipo, setTipo] = useState(''); const [familia, setFamilia] = useState(''); const [subgrupo, setSubgrupo] = useState('')
  const [fornecedor, setFornecedor] = useState(''); const [unidade, setUnidade] = useState(''); const [cmvMode, setCmvMode] = useState<'todos' | 'sim' | 'nao'>('todos')
  const [cols, setCols] = useState(loadCols)
  const [colsOpen, setColsOpen] = useState(false)
  const [colsPos, setColsPos] = useState({ top: 0, left: 0 })
  const colsIcoRef = useRef<SVGSVGElement>(null)
  const colsDdRef = useRef<HTMLDivElement>(null)

  const { data: insumos = [] } = useQuery({ queryKey: ['mov-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('*').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: entradas = [] } = useQuery({ queryKey: ['mov-entradas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Mov>((f, t) => supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em').range(f, t)) })
  const { data: saidas = [] } = useQuery({ queryKey: ['mov-saidas', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Saida>((f, t) => supabase.from('saidas_estoque').select('*').eq('tenant_id', tenantId).order('criado_em').range(f, t)) })
  const { data: saldos = [] } = useQuery({ queryKey: ['mov-saldos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<any>((f, t) => supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: vinculos = [] } = useQuery({ queryKey: ['mov-vinc', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<any>((f, t) => supabase.from('insumo_fornecedores').select('*').eq('tenant_id', tenantId).order('insumo_id').range(f, t)) })
  const { data: forns = [] } = useQuery({ queryKey: ['mov-forns', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as { id: string; nome: string }[] } })
  // inventário anterior + perdas de gerentes (dependem do período)
  const { data: invPerdas } = useQuery({
    queryKey: ['mov-invperdas', tenantId, de, ate], enabled: !!tenantId && !!de && !!ate,
    queryFn: async () => {
      let invIni: InvItem[] = []
      const inv = await supabase.from('inventarios').select('id').eq('tenant_id', tenantId).lt('criado_em', de).eq('status', 'encerrado').order('criado_em', { ascending: false }).limit(1)
      if (inv.data?.length) { const it = await supabase.from('inventario_itens').select('*').eq('inventario_id', inv.data[0].id); invIni = (it.data ?? []) as InvItem[] }
      const perdasMap: Record<string, number> = {}
      const perdas = await supabase.from('perdas').select('id').eq('tenant_id', tenantId).gte('data_perda', de).lte('data_perda', ate)
      if (perdas.data?.length) {
        const ids = perdas.data.map((p: any) => p.id)
        const its = await supabase.from('perdas_itens').select('insumo_id,quantidade').in('perda_id', ids)
        ;(its.data ?? []).forEach((it: any) => { perdasMap[it.insumo_id] = (perdasMap[it.insumo_id] || 0) + (Number(it.quantidade) || 0) })
      }
      return { invIni, perdasMap }
    },
  })

  const fornMap = useMemo(() => { const m: Record<string, Set<string>> = {}; vinculos.forEach((v) => { (m[v.insumo_id] = m[v.insumo_id] || new Set()).add(v.fornecedor_id) }); return m }, [vinculos])
  const cats = useMemo(() => uniq(insumos.map((i) => i.categoria)), [insumos])
  const tipos = useMemo(() => uniq(insumos.map((i) => i.tipo_item)), [insumos])
  const familias = useMemo(() => uniq(insumos.map((i) => i.familia)), [insumos])
  const subgrupos = useMemo(() => uniq(insumos.map((i) => i.subgrupo)), [insumos])
  const unidades = useMemo(() => uniq(insumos.map((i) => i.unidade_medida || i.unidade_compra)), [insumos])

  // filtra pela loja selecionada no topo (vazio = todas)
  const entradasL = useMemo(() => lojaId ? entradas.filter((e: any) => (e.loja_id || null) === lojaId) : entradas, [entradas, lojaId])
  const saidasL = useMemo(() => lojaId ? saidas.filter((s: any) => (s.loja_id || null) === lojaId) : saidas, [saidas, lojaId])

  // pré-agrupa entradas/saidas por insumo (acelera o custo médio)
  const entByIns = useMemo(() => { const m: Record<string, Mov[]> = {}; entradasL.forEach((e) => { (m[e.insumo_id] = m[e.insumo_id] || []).push(e) }); return m }, [entradasL])
  const saiByIns = useMemo(() => { const m: Record<string, Saida[]> = {}; saidasL.forEach((s) => { (m[s.insumo_id] = m[s.insumo_id] || []).push(s) }); return m }, [saidasL])

  // CÁLCULO PESADO — recomputa quando filtros "duros" mudam (não na busca)
  const rowsAll = useMemo<Row[]>(() => {
    if (!de || !ate || !insumos.length) return []
    const ateLim = ate + 'T23:59:59'
    const entsPer = entradasL.filter((e) => (e.criado_em || '') >= de && (e.criado_em || '') <= ateLim)
    const saisPer = saidasL.filter((s) => (s.criado_em || '') >= de && (s.criado_em || '') <= ateLim)
    const entsPerByIns: Record<string, Mov[]> = {}; entsPer.forEach((e) => { (entsPerByIns[e.insumo_id] = entsPerByIns[e.insumo_id] || []).push(e) })
    const saisPerByIns: Record<string, Saida[]> = {}; saisPer.forEach((s) => { (saisPerByIns[s.insumo_id] = saisPerByIns[s.insumo_id] || []).push(s) })
    const invIni = invPerdas?.invIni || []
    const perdasMap = invPerdas?.perdasMap || {}

    let insFilt = insumos
    if (catF) insFilt = insFilt.filter((i) => (i.categoria || '') === catF)
    if (cmvMode === 'sim') insFilt = insFilt.filter((i) => i.participa_cmv !== 'nao')
    else if (cmvMode === 'nao') insFilt = insFilt.filter((i) => i.participa_cmv === 'nao')
    if (tipo) insFilt = insFilt.filter((i) => (i.tipo_item || '') === tipo)
    if (familia) insFilt = insFilt.filter((i) => (i.familia || '') === familia)
    if (subgrupo) insFilt = insFilt.filter((i) => (i.subgrupo || '') === subgrupo)
    if (unidade) insFilt = insFilt.filter((i) => (i.unidade_medida || i.unidade_compra || '') === unidade)
    if (fornecedor) insFilt = insFilt.filter((i) => fornMap[i.id] && fornMap[i.id].has(fornecedor))

    const baseCtx = { saldos, vinculos, insumos }
    let rows = insFilt.map((ins): Row => {
      const cmFim = custoDoInsumo(ins.id, null, { ...baseCtx, entradas: entByIns[ins.id] || [], saidas: saiByIns[ins.id] || [], dataLimite: ate })
      const cmIni = custoDoInsumo(ins.id, null, { ...baseCtx, entradas: entByIns[ins.id] || [], saidas: saiByIns[ins.id] || [], dataLimite: de })
      const antIt = invIni.find((i) => i.insumo_id === ins.id)
      const qAnt = antIt?.qtd_contada || 0
      const vAnt = qAnt * (antIt?.custo_medio || cmIni)
      const entsI = entsPerByIns[ins.id] || []
      const qEnt = entsI.reduce((a, e) => a + (e.quantidade || 0), 0)
      const vEnt = entsI.reduce((a, e) => a + ((e.quantidade || 0) * (e.custo_unitario || 0)), 0)
      const saisI = saisPerByIns[ins.id] || []
      const qCon = saisI.filter((x) => x.tipo === 'consumo').reduce((a, c) => a + (c.quantidade || 0), 0)
      const vCon = qCon * cmFim
      const qPerdSaida = saisI.filter((x) => ['perda', 'vencimento', 'descarte'].includes(x.tipo || '')).reduce((a, p) => a + (p.quantidade || 0), 0)
      const qPerd = qPerdSaida + (perdasMap[ins.id] || 0)
      const vPerd = qPerd * cmFim
      const qOutras = saisI.filter((x) => !['consumo', 'perda', 'vencimento', 'descarte'].includes(x.tipo || '')).reduce((a, o) => a + (o.quantidade || 0), 0)
      const qFin = qAnt + qEnt - qCon - qPerd - qOutras
      const vFin = qFin * cmFim
      return { nome: ins.nome, un: ins.unidade_medida || ins.unidade_compra || '—', cat: ins.categoria || '—', qAnt, vAnt, qEnt, vEnt, qCon, vCon, qPerd, vPerd, qFin, vFin, cm: cmFim, cmv: ins.participa_cmv }
    })
    if (comSaldo) rows = rows.filter((r) => r.qFin > 0 || r.qAnt > 0 || r.qEnt > 0 || r.qCon > 0 || r.qPerd > 0)
    return rows
  }, [de, ate, insumos, entradasL, saidasL, saldos, vinculos, invPerdas, catF, cmvMode, tipo, familia, subgrupo, unidade, fornecedor, comSaldo, entByIns, saiByIns, fornMap])

  const rows = useMemo(() => { const b = norm(busca.trim()); return b ? rowsAll.filter((r) => norm(r.nome).includes(b)) : rowsAll }, [rowsAll, busca])
  const tot = useMemo(() => {
    const t = rows.reduce((a, r) => { a.qAnt += r.qAnt; a.vAnt += r.vAnt; a.qEnt += r.qEnt; a.vEnt += r.vEnt; a.qCon += r.qCon; a.vCon += r.vCon; a.qPerd += r.qPerd; a.vPerd += r.vPerd; a.qFin += r.qFin; a.vFin += r.vFin; return a }, { qAnt: 0, vAnt: 0, qEnt: 0, vEnt: 0, qCon: 0, vCon: 0, qPerd: 0, vPerd: 0, qFin: 0, vFin: 0 })
    return { ...t, cmGeral: t.qFin > 0 ? t.vFin / t.qFin : 0 }
  }, [rows])

  const mfAtivo = !!(tipo || familia || subgrupo || unidade || fornecedor)
  const visible = (id: string) => !!cols[id]
  const visCols = MOV_COLS.filter((c) => visible(c.id))

  const setPreset = (v: string) => {
    const now = new Date()
    if (v === 'mes_atual') { setDe(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setAte(iso(now)) }
    else if (v === 'mes_anterior') { setDe(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))); setAte(iso(new Date(now.getFullYear(), now.getMonth(), 0))) }
  }
  const limpar = () => { setCatF(''); setBusca(''); setTipo(''); setFamilia(''); setSubgrupo(''); setFornecedor(''); setUnidade(''); setCmvMode('todos'); setComSaldo(true); setSoCmv(false) }

  const openCols = () => {
    const r = colsIcoRef.current?.getBoundingClientRect()
    if (r) {
      const estH = 330 // altura estimada do dropdown compacto
      const below = window.innerHeight - r.bottom
      const top = below < estH ? Math.max(8, window.innerHeight - estH - 8) : r.bottom + 4
      setColsPos({ top, left: r.left })
    }
    setColsOpen((o) => !o)
  }
  useEffect(() => {
    if (!colsOpen) return
    // fecha só ao clicar FORA (clique dentro é barrado pelo onMouseDown do dropdown).
    // NÃO fecha ao rolar — o usuário rola DENTRO da lista p/ ver/marcar as colunas escondidas.
    const close = (e: MouseEvent) => { if (colsDdRef.current && colsDdRef.current.contains(e.target as Node)) return; setColsOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [colsOpen])
  const toggleCol = (id: string) => setCols((c) => ({ ...c, [id]: !c[id] }))
  const salvarCols = () => { try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch { /* ignore */ } setColsOpen(false) }

  const exportCSV = () => {
    if (!rows.length) return
    const header = 'Descrição;Unidade;Grupo;Q.Anterior;V.Anterior;Q.Entradas;V.Entradas;Q.Consumo;V.Consumo;Q.Perdas;V.Perdas;Q.Final;V.Final;C.Médio\n'
    const body = rows.map((r) => `${r.nome};${r.un};${r.cat};${r.qAnt.toFixed(3)};${r.vAnt.toFixed(2)};${r.qEnt.toFixed(3)};${r.vEnt.toFixed(2)};${r.qCon.toFixed(3)};${r.vCon.toFixed(2)};${r.qPerd.toFixed(3)};${r.vPerd.toFixed(2)};${r.qFin.toFixed(3)};${r.vFin.toFixed(2)};${r.cm.toFixed(4)}`).join('\n')
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `movimentacao_${de}_${ate}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const cell = (id: string, r: Row) => {
    switch (id) {
      case 'descricao': return <td key={id} style={{ fontWeight: 500 }}>{r.nome}</td>
      case 'un': return <td key={id} style={{ color: '#64748b' }}>{r.un}</td>
      case 'grupo': return <td key={id} style={{ color: '#64748b' }}>{r.cat}</td>
      case 'q-anterior': return <td key={id} className="r mono">{qtd(r.qAnt)}</td>
      case 'v-anterior': return <td key={id} className="r mono">{brl(r.vAnt)}</td>
      case 'q-entradas': return <td key={id} className="r mono">{qtd(r.qEnt)}</td>
      case 'v-entradas': return <td key={id} className="r mono">{brl(r.vEnt)}</td>
      case 'q-consumo': return <td key={id} className="r mono">{qtd(r.qCon)}</td>
      case 'v-consumo': return <td key={id} className="r mono">{brl(r.vCon)}</td>
      case 'q-perdas': return <td key={id} className="r mono">{qtd(r.qPerd)}</td>
      case 'v-perdas': return <td key={id} className="r mono">{brl(r.vPerd)}</td>
      case 'q-final': return <td key={id} className={'r mono' + (r.qFin < 0 ? ' neg' : '')}>{qtd(r.qFin)}</td>
      case 'v-final': return <td key={id} className={'r mono' + (r.vFin < 0 ? ' neg' : '')}>{brl(r.vFin)}</td>
      case 'c-medio': return <td key={id} className="r mono">{brl(r.cm)}</td>
      case 'calcula-cmv': return <td key={id} className="c">{r.cmv !== 'nao' ? <span className="cmv-box">✓</span> : <span className="cmv-box" />}</td>
      default: return null
    }
  }
  const footCell = (id: string) => {
    const t = tot
    const m: Record<string, any> = { 'q-anterior': qtd(t.qAnt), 'v-anterior': brl(t.vAnt), 'q-entradas': qtd(t.qEnt), 'v-entradas': brl(t.vEnt), 'q-consumo': qtd(t.qCon), 'v-consumo': brl(t.vCon), 'q-perdas': qtd(t.qPerd), 'v-perdas': brl(t.vPerd), 'q-final': qtd(t.qFin), 'v-final': brl(t.vFin), 'c-medio': brl(t.cmGeral) }
    if (id === 'descricao') return <td key={id} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>Totais do período</td>
    if (id in m) return <td key={id} className={'r mono' + ((id === 'q-final' && t.qFin < 0) || (id === 'v-final' && t.vFin < 0) ? ' neg' : '')}>{m[id]}</td>
    return <td key={id} />
  }

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Período</label>
          <select className="field" style={{ minWidth: 130 }} defaultValue="periodo" onChange={(e) => setPreset(e.target.value)}>
            <option value="periodo">Personalizado</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option>
          </select>
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" style={{ width: 150 }} value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="ds-field"><label>Até</label><input type="date" className="field" style={{ width: 150 }} value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="ds-field"><label>Grupo</label>
          <select className="field" style={{ width: 200 }} value={catF} onChange={(e) => setCatF(e.target.value)}><option value="">Todos os grupos</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div className="ds-field ds-grow"><label>Buscar insumo</label><input className="field" style={{ width: '100%', minWidth: 200 }} placeholder="Digite o nome do insumo..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="ds-actions">
          <button className="btn-ghost" onClick={() => setAdvOpen((o) => !o)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Mais filtros {mfAtivo && <span className="mf-dot" />}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', marginBottom: 12 }}>
        <label className="mov-chk"><input type="checkbox" checked={comSaldo} onChange={(e) => setComSaldo(e.target.checked)} /> Somente com saldo</label>
        <label className="mov-chk"><input type="checkbox" checked={soCmv} onChange={(e) => { setSoCmv(e.target.checked); setCmvMode(e.target.checked ? 'sim' : 'todos') }} /> Somente CMV</label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={limpar}>Limpar</button>
          <button className="btn-ghost" onClick={exportCSV}>↓ Exportar CSV</button>
        </div>
      </div>

      <div className={'se-adv' + (advOpen ? ' open' : '')}>
        <div className="se-adv-grid">
          <div><label className="mf-lbl">Tipo do item</label><SearchSelect value={tipo} onChange={setTipo} options={tipos} placeholder="Todos" /></div>
          <div><label className="mf-lbl">Família</label><SearchSelect value={familia} onChange={setFamilia} options={familias} placeholder="Todas" /></div>
          <div><label className="mf-lbl">Grupo</label><SearchSelect value={catF} onChange={setCatF} options={cats} placeholder="Todos os grupos" /></div>
          <div><label className="mf-lbl">Subgrupo</label><SearchSelect value={subgrupo} onChange={setSubgrupo} options={subgrupos} placeholder="Todos" /></div>
          <div><label className="mf-lbl">Fornecedor</label><SearchSelect value={forns.find((f) => f.id === fornecedor)?.nome || ''} onChange={(nm) => setFornecedor(forns.find((f) => f.nome === nm)?.id || '')} options={forns.map((f) => f.nome)} placeholder="Todos" /></div>
          <div><label className="mf-lbl">Unidade</label><SearchSelect value={unidade} onChange={setUnidade} options={unidades} placeholder="Todas" /></div>
        </div>
        <div className="se-adv-foot">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span className="mf-lbl" style={{ margin: 0 }}>Calcula CMV:</span>
            {(['todos', 'sim', 'nao'] as const).map((v) => <label key={v} className="mov-radio"><input type="radio" name="mov-cmv" checked={cmvMode === v} onChange={() => { setCmvMode(v); setSoCmv(v === 'sim') }} /> {v === 'todos' ? 'Todos' : v === 'sim' ? 'Sim' : 'Não'}</label>)}
          </div>
          <label className="mov-chk" style={{ margin: 0 }}><input type="checkbox" checked={comSaldo} onChange={(e) => setComSaldo(e.target.checked)} /> Apenas com saldo</label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={() => { setTipo(''); setFamilia(''); setSubgrupo(''); setFornecedor(''); setUnidade(''); setCmvMode('todos') }}>Limpar filtros</button>
            <button className="btn-primary" onClick={() => setAdvOpen(false)}>Aplicar filtros</button>
          </div>
        </div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            {visCols.map((c) => (
              <th key={c.id} className={c.align === 'r' ? 'r' : c.align === 'c' ? 'c' : ''}>
                {c.id === 'descricao' && <svg ref={colsIcoRef} className="cols-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} onClick={(e) => { e.stopPropagation(); openCols() }}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>}
                {c.label}
              </th>
            ))}
          </tr></thead>
          {rows.length > 0 && <tfoot><tr style={{ background: '#f8fafc' }}>{visCols.map((c) => footCell(c.id))}</tr></tfoot>}
          <tbody>
            {!de || !ate ? <tr><td colSpan={visCols.length} className="empty"><b>Selecione o período</b></td></tr>
              : rows.length === 0 ? <tr><td colSpan={visCols.length} className="empty">Nenhum movimento no período.</td></tr>
              : rows.map((r, i) => <tr key={i}>{visCols.map((c) => cell(c.id, r))}</tr>)}
          </tbody>
        </table>
      </div></div>
      <div className="pag-info">{rows.length} registro(s)</div>

      {colsOpen && (
        <div ref={colsDdRef} className="cols-dd" style={{ top: colsPos.top, left: colsPos.left }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="tit">Colunas visíveis</div>
          {MOV_COLS.filter((c) => !c.fixed).map((c) => <label key={c.id}><input type="checkbox" checked={visible(c.id)} onChange={() => toggleCol(c.id)} /> {c.label}</label>)}
          <button className="save" onClick={salvarCols}>Salvar preferência</button>
        </div>
      )}
    </div>
  )
}
