import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { custoDoInsumo } from '../lib/cost'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Loja = { id: string; nome?: string; cnpj?: string; razao_social?: string }
type Insumo = { id: string; nome?: string; unidade_medida?: string; participa_cmv?: string }
type Mov = { insumo_id: string; quantidade?: number; custo_unitario?: number; tipo?: string; loja_id?: string | null; criado_em?: string; created_at?: string }
type Saldo = { insumo_id: string; loja_id?: string | null; custo_medio?: number }
type Inv = { id: string; loja_id?: string; status?: string; data_final?: string }
type InvItem = { inventario_id: string; insumo_id: string; qtd_contada?: number; custo_medio?: number }
type Fech = { loja_id?: string; competencia?: string; situacao?: string; estoque_inicial?: number; compras?: number; entradas_transferencia?: number; saidas_transferencia?: number; consumo?: number; perdas?: number; estoque_final?: number; cmv?: number; faturamento?: number }
type ItemRow = { id: string; nome: string; un: string; ei: number; compras: number; entT: number; saiT: number; consumo: number; perdas: number; ef: number; cmv: number }
type Row = { loja: Loja; situacao: 'aberto' | 'fechado'; itens: ItemRow[]; faturamento: number; estoque_inicial: number; compras: number; entradas_transferencia: number; saidas_transferencia: number; consumo: number; perdas: number; estoque_final: number; cmv: number }

const brl = (v?: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataOf = (m: Mov) => (m.criado_em || m.created_at || '').slice(0, 10)
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ACAO_OPTS = ['Fechar', 'Abrir (reabrir)']
const ACAO_LBL: Record<string, string> = { fechar: 'Fechar', abrir: 'Abrir (reabrir)' }
const ACAO_VAL: Record<string, 'fechar' | 'abrir'> = { 'Fechar': 'fechar', 'Abrir (reabrir)': 'abrir' }

function monthBounds(comp: string) {
  const [y, m] = comp.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const de = `${y}-${String(m).padStart(2, '0')}-01`
  const ate = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  const prevEnd = new Date(y, m - 1, 0)
  const prevEndStr = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, '0')}-${String(prevEnd.getDate()).padStart(2, '0')}`
  return { de, ate, prevEndStr }
}

export function Fechamento() {
  const { tenantId, usuario } = useAuth()
  const qc = useQueryClient()
  const now = new Date()
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno] = useState(String(now.getFullYear()))
  const [lojaFiltro, setLojaFiltro] = useState('')
  const [acao, setAcao] = useState<'fechar' | 'abrir'>('fechar')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detLoja, setDetLoja] = useState<string | null>(null)
  const [detBusca, setDetBusca] = useState('')
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }
  const comp = `${ano}-${mes}`

  // base (não depende do mês)
  const { data: base } = useQuery({
    queryKey: ['fech-base', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const [lojas, insumos, entradas, saidas, saldos, inventarios, fechamentos] = await Promise.all([
        fetchAll<Loja>((f, t) => supabase.from('lojas').select('*').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)),
        fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,participa_cmv').eq('tenant_id', tenantId).order('nome').range(f, t)),
        fetchAll<Mov>((f, t) => supabase.from('entradas_estoque').select('insumo_id,quantidade,custo_unitario,tipo,loja_id,criado_em').eq('tenant_id', tenantId).order('criado_em').range(f, t)),
        fetchAll<Mov>((f, t) => supabase.from('saidas_estoque').select('insumo_id,quantidade,tipo,loja_id,criado_em').eq('tenant_id', tenantId).order('criado_em').range(f, t)),
        fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,custo_medio').eq('tenant_id', tenantId).order('insumo_id').range(f, t)),
        fetchAll<Inv>((f, t) => supabase.from('inventarios').select('id,loja_id,status,data_final').eq('tenant_id', tenantId).order('data_final', { ascending: false }).range(f, t)),
        fetchAll<Fech>((f, t) => supabase.from('fechamento_custo').select('*').eq('tenant_id', tenantId).order('competencia').range(f, t)).catch(() => [] as Fech[]),
      ])
      return { lojas, insumos, entradas, saidas, saldos, inventarios, fechamentos }
    },
  })

  // inventários encerrados escolhidos por loja p/ o mês (inicial = fim do mês anterior; final = mês escolhido)
  const invMap = useMemo(() => {
    if (!base) return {}
    const { de, ate, prevEndStr } = monthBounds(comp)
    const enc = base.inventarios.filter((i) => i.status === 'encerrado' || i.status === 'fechado')
    const pick = (lojaId: string, maxDate: string, minDate?: string) => enc
      .filter((i) => i.loja_id === lojaId && i.data_final && i.data_final <= maxDate && (!minDate || i.data_final >= minDate))
      .sort((a, b) => (b.data_final || '').localeCompare(a.data_final || ''))[0] || null
    const map: Record<string, { ini: Inv | null; fin: Inv | null }> = {}
    base.lojas.forEach((l) => { map[l.id] = { fin: pick(l.id, ate, de) || pick(l.id, ate), ini: pick(l.id, prevEndStr) } })
    return map
  }, [base, comp])

  const needIds = useMemo(() => {
    const s = new Set<string>()
    Object.values(invMap).forEach((v) => { if (v.ini) s.add(v.ini.id); if (v.fin) s.add(v.fin.id) })
    return [...s]
  }, [invMap])

  const { data: itensByInv = {} } = useQuery({
    queryKey: ['fech-itens', tenantId, needIds.join(',')], enabled: !!tenantId && needIds.length > 0,
    queryFn: async () => {
      const items = await fetchAll<InvItem>((f, t) => supabase.from('inventario_itens').select('inventario_id,insumo_id,qtd_contada,custo_medio').in('inventario_id', needIds).order('inventario_id').range(f, t))
      const map: Record<string, InvItem[]> = {}
      items.forEach((it) => { (map[it.inventario_id] = map[it.inventario_id] || []).push(it) })
      return map
    },
  })

  const rowsData = useMemo<Row[]>(() => {
    if (!base) return []
    const { de, ate } = monthBounds(comp)
    const cmvSet = new Set(base.insumos.filter((i) => i.participa_cmv !== 'nao').map((i) => i.id))
    const insMap: Record<string, Insumo> = {}; base.insumos.forEach((i) => { insMap[i.id] = i })
    const entMes = base.entradas.filter((e) => { const d = dataOf(e); return d >= de && d <= ate })
    const saiMes = base.saidas.filter((s) => { const d = dataOf(s); return d >= de && d <= ate })

    const compoLoja = (l: Loja) => {
      const { ini, fin } = invMap[l.id] || { ini: null, fin: null }
      // custo médio de fim de mês POR LOJA (entradas/saídas + saldo daquela loja)
      const ctxL = { entradas: base.entradas.filter((e) => e.loja_id === l.id), saidas: base.saidas.filter((s) => s.loja_id === l.id), insumos: base.insumos, saldos: base.saldos, dataLimite: ate }
      const cmCache: Record<string, number> = {}
      const cmFimL = (id: string) => { if (cmCache[id] == null) { try { cmCache[id] = custoDoInsumo(id, l.id, ctxL) } catch { cmCache[id] = 0 } } return cmCache[id] }
      const byIns: Record<string, ItemRow> = {}
      const ens = (id: string) => byIns[id] || (byIns[id] = { id, nome: insMap[id]?.nome || '—', un: insMap[id]?.unidade_medida || '', ei: 0, compras: 0, entT: 0, saiT: 0, consumo: 0, perdas: 0, ef: 0, cmv: 0 })
      const addInv = (inv: Inv | null, campo: 'ei' | 'ef') => { (inv && itensByInv[inv.id] || []).forEach((it) => { if (cmvSet.has(it.insumo_id)) ens(it.insumo_id)[campo] += (it.qtd_contada || 0) * (it.custo_medio || 0) }) }
      addInv(ini, 'ei'); addInv(fin, 'ef')
      entMes.filter((e) => e.loja_id === l.id && cmvSet.has(e.insumo_id)).forEach((e) => { const o = ens(e.insumo_id), v = (e.quantidade || 0) * (e.custo_unitario || 0); if (e.tipo === 'transferencia') o.entT += v; else o.compras += v })
      saiMes.filter((s) => s.loja_id === l.id && cmvSet.has(s.insumo_id)).forEach((s) => { const o = ens(s.insumo_id), v = (s.quantidade || 0) * cmFimL(s.insumo_id); if (s.tipo === 'consumo') o.consumo += v; else if (s.tipo === 'transferencia') o.saiT += v; else if (['perda', 'vencimento', 'descarte'].includes(s.tipo || '')) o.perdas += v })
      // CMV por inventário = EI + Compras + Ent.Transf − Saí.Transf − Estoque Final.
      // (As perdas já entram naturalmente — o Estoque Final físico da contagem já as reflete;
      // somá-las de novo seria contar em dobro. E as saídas de transferência PRECISAM ser
      // subtraídas: o que foi mandado p/ outra loja não é CMV desta.)
      const itens = Object.values(byIns).map((o) => ({ ...o, cmv: o.ei + o.compras + o.entT - o.saiT - o.ef }))
        .filter((o) => o.ei || o.compras || o.entT || o.consumo || o.perdas || o.saiT || o.ef)
        .sort((a, b) => b.cmv - a.cmv)
      const ag = itens.reduce((a, o) => { (['ei', 'compras', 'entT', 'consumo', 'perdas', 'saiT', 'ef'] as const).forEach((k) => { a[k] += o[k] }); return a }, { ei: 0, compras: 0, entT: 0, consumo: 0, perdas: 0, saiT: 0, ef: 0 })
      return { itens, estoque_inicial: ag.ei, compras: ag.compras, entradas_transferencia: ag.entT, saidas_transferencia: ag.saiT, consumo: ag.consumo, perdas: ag.perdas, estoque_final: ag.ef, cmv: ag.ei + ag.compras + ag.entT - ag.saiT - ag.ef }
    }

    return base.lojas.map((l) => {
      const c = compoLoja(l)
      const fech = base.fechamentos.find((f) => f.loja_id === l.id && f.competencia === comp && f.situacao === 'fechado')
      if (fech) return { loja: l, situacao: 'fechado', itens: c.itens, faturamento: +(fech.faturamento || 0), estoque_inicial: +(fech.estoque_inicial || 0), compras: +(fech.compras || 0), entradas_transferencia: +(fech.entradas_transferencia || 0), saidas_transferencia: +(fech.saidas_transferencia || 0), consumo: +(fech.consumo || 0), perdas: +(fech.perdas || 0), estoque_final: +(fech.estoque_final || 0), cmv: +(fech.cmv || 0) }
      return { loja: l, situacao: 'aberto', faturamento: 0, ...c }
    })
  }, [base, invMap, itensByInv, comp])

  const rows = useMemo(() => rowsData.filter((r) => !lojaFiltro || r.loja.id === lojaFiltro), [rowsData, lojaFiltro])
  const buscaRows = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? rows.filter((r) => (r.loja.nome || '').toLowerCase().includes(q) || (r.loja.cnpj || '').includes(q)) : rows
  }, [rows, busca])

  const total = useMemo(() => buscaRows.reduce((a, r) => { (['estoque_inicial', 'compras', 'entradas_transferencia', 'saidas_transferencia', 'consumo', 'perdas', 'estoque_final', 'cmv'] as const).forEach((k) => { a[k] = (a[k] || 0) + r[k] }); return a }, {} as Record<string, number>), [buscaRows])

  const anos = useMemo(() => { const y = now.getFullYear(); return Array.from({ length: 5 }, (_, i) => y + 1 - i) }, [now])
  const toggleRow = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = (on: boolean) => setSel(on ? new Set(buscaRows.map((r) => r.loja.id)) : new Set())

  const aplicarMut = useMutation({
    mutationFn: async () => {
      if (!sel.size) throw new Error('Selecione ao menos uma loja.')
      const alvo = [...sel].map((id) => rowsData.find((r) => r.loja.id === id)).filter(Boolean) as Row[]
      if (acao === 'fechar') {
        const fechar = alvo.filter((r) => r.situacao === 'aberto')
        if (!fechar.length) throw new Error('Selecione lojas ABERTAS para fechar.')
        // Regra SEQUENCIAL (Everest): só fecha o mês se o anterior já estiver fechado
        // (a menos que seja o 1º fechamento da loja). Fecha em ordem: Jan → Fev → Mar…
        const [ay, am] = comp.split('-').map(Number)
        const pd = new Date(ay, am - 2, 1)
        const prevComp = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`
        const fechadas = base?.fechamentos.filter((f) => f.situacao === 'fechado') || []
        const bloqueadas = fechar.filter((r) => {
          const prevOk = fechadas.some((f) => f.loja_id === r.loja.id && f.competencia === prevComp)
          if (prevOk) return false
          return fechadas.some((f) => f.loja_id === r.loja.id && (f.competencia || '') < comp) // tem mês fechado antes → é pulo
        })
        if (bloqueadas.length) throw new Error(`Fechamento é sequencial: feche antes o mês ${prevComp}. Pendente(s): ${bloqueadas.map((r) => r.loja.nome).join(', ')}`)
        const payload = fechar.map((r) => ({ tenant_id: tenantId, loja_id: r.loja.id, competencia: comp, situacao: 'fechado', estoque_inicial: r.estoque_inicial, compras: r.compras, entradas_transferencia: r.entradas_transferencia, saidas_transferencia: r.saidas_transferencia, consumo: r.consumo, perdas: r.perdas, estoque_final: r.estoque_final, cmv: r.cmv, faturamento: r.faturamento || 0, fechado_por: usuario?.id || null }))
        const { error } = await supabase.from('fechamento_custo').upsert(payload, { onConflict: 'tenant_id,loja_id,competencia' })
        if (error) throw error
        return `${fechar.length} loja(s) fechada(s).`
      } else {
        const abrir = alvo.filter((r) => r.situacao === 'fechado')
        if (!abrir.length) throw new Error('Selecione lojas FECHADAS para reabrir.')
        // Regra SEQUENCIAL AO CONTRÁRIO (Everest): só reabre o mês mais recente fechado da loja.
        // Se existe um mês FECHADO DEPOIS deste, ele foi calculado em cima do fechamento deste →
        // é preciso reabrir o(s) mês(es) mais novo(s) primeiro (senão o mais novo fica "pendurado"
        // num mês que mudou). Reabre na ordem inversa: Jul → Jun → Mai.
        const fechadas = base?.fechamentos.filter((f) => f.situacao === 'fechado') || []
        const bloqueadas = abrir.map((r) => {
          const proxFechado = fechadas
            .filter((f) => f.loja_id === r.loja.id && (f.competencia || '') > comp)
            .sort((a, b) => (a.competencia || '').localeCompare(b.competencia || ''))[0]
          return proxFechado ? { nome: r.loja.nome, prox: proxFechado.competencia } : null
        }).filter(Boolean) as { nome?: string; prox?: string }[]
        if (bloqueadas.length) throw new Error(`Reabertura é sequencial (do mês mais recente para o mais antigo): reabra antes o mês ${bloqueadas[0].prox}. Pendente(s): ${bloqueadas.map((b) => b.nome).join(', ')}`)
        const { error } = await supabase.from('fechamento_custo').delete().eq('tenant_id', tenantId).eq('competencia', comp).in('loja_id', abrir.map((r) => r.loja.id))
        if (error) throw error
        return `${abrir.length} loja(s) reaberta(s).`
      }
    },
    onSuccess: (msg) => { qc.invalidateQueries({ queryKey: ['fech-base'] }); setSel(new Set()); showToast(msg, 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const aplicar = () => {
    const alvo = [...sel].map((id) => rowsData.find((r) => r.loja.id === id)).filter(Boolean) as Row[]
    const n = acao === 'fechar' ? alvo.filter((r) => r.situacao === 'aberto').length : alvo.filter((r) => r.situacao === 'fechado').length
    if (!n) { showToast(acao === 'fechar' ? 'Selecione lojas ABERTAS para fechar.' : 'Selecione lojas FECHADAS para reabrir.', 'err'); return }
    const verbo = acao === 'fechar' ? 'Fechar' : 'Reabrir'
    if (window.confirm(`${verbo} ${n} loja(s) no mês ${comp}?\n\n${acao === 'fechar' ? 'Os valores serão congelados e a loja ficará FECHADA.' : 'Os valores deixam de ficar congelados e voltam a ser recalculados.'}`)) aplicarMut.mutate()
  }

  const exportCSV = () => {
    if (!buscaRows.length) { showToast('Nada para exportar', 'err'); return }
    const head = ['Loja', 'CNPJ', 'Situacao', 'Estoque Inicial', 'Compras', 'Ent. Transf.', 'Sai. Transf.', 'Consumo', 'Perdas', 'Estoque Final', 'CMV', 'Faturamento']
    const lines = buscaRows.map((r) => [r.loja.nome || '', r.loja.cnpj || '', r.situacao, r.estoque_inicial, r.compras, r.entradas_transferencia, r.saidas_transferencia, r.consumo, r.perdas, r.estoque_final, r.cmv, r.faturamento || 0].map((v) => typeof v === 'number' ? String(v).replace('.', ',') : `"${v}"`).join(';'))
    const csv = [head.join(';'), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fechamento_custo_${comp}.csv`; a.click()
  }

  const det = detLoja ? rowsData.find((r) => r.loja.id === detLoja) : null
  const detItens = useMemo(() => {
    if (!det) return []
    const q = detBusca.trim().toLowerCase()
    return (det.itens || []).filter((o) => !q || (o.nome || '').toLowerCase().includes(q))
  }, [det, detBusca])
  const detTotal = useMemo(() => detItens.reduce((a, o) => { (['ei', 'compras', 'entT', 'saiT', 'consumo', 'perdas', 'ef', 'cmv'] as const).forEach((k) => { a[k] = (a[k] || 0) + o[k] }); return a }, {} as Record<string, number>), [detItens])

  const allChecked = buscaRows.length > 0 && buscaRows.every((r) => sel.has(r.loja.id))

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Mês</label>
          <select className="field" value={mes} onChange={(e) => setMes(e.target.value)} style={{ minWidth: 130 }}>
            {MESES.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </div>
        <div className="ds-field"><label>Ano</label>
          <select className="field" value={ano} onChange={(e) => setAno(e.target.value)} style={{ minWidth: 90 }}>
            {anos.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
        </div>
        <div className="ds-field" style={{ minWidth: 180 }}><label>Loja</label>
          <SearchSelect value={(base?.lojas || []).find((l) => l.id === lojaFiltro)?.nome || ''} options={(base?.lojas || []).map((l) => l.nome || '')} placeholder="Todas as lojas" onChange={(nm) => setLojaFiltro((base?.lojas || []).find((l) => l.nome === nm)?.id || '')} />
        </div>
        <div className="ds-field" style={{ minWidth: 140 }}><label>Ação</label>
          <SearchSelect value={ACAO_LBL[acao] || 'Fechar'} options={ACAO_OPTS} placeholder="Fechar" onChange={(l) => setAcao(ACAO_VAL[l] || 'fechar')} />
        </div>
        <div className="ds-actions">
          <button className="btn-pri" disabled={aplicarMut.isPending || !sel.size} onClick={aplicar}>{acao === 'fechar' ? 'Fechar' : 'Reabrir'} ({sel.size})</button>
          <button className="btn-ghost" onClick={exportCSV}>↓ Exportar</button>
        </div>
      </div>

      <div className="cm-toprow">
        <input className="cm-grid-search" style={{ marginBottom: 0 }} placeholder="Digite um texto para pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="cm-selall"><input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />Selecionar Todos</label>
      </div>

      <div className="cm-grid-wrap" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <table className="cm-grid fc">
          <thead>
            <tr className="cm-grp">
              <th rowSpan={2} className="c-sel" style={{ borderLeft: 'none' }}>Sel</th>
              <th rowSpan={2} className="c-det">Det</th>
              <th colSpan={3}>Informações da Loja</th>
              <th colSpan={9} className="grp-div">Valores de Fechamento</th>
            </tr>
            <tr className="cm-sub">
              <th className="col-fant">Fantasia</th><th className="col-cnpj">CNPJ</th><th style={{ textAlign: 'center' }}>Situação</th>
              <th className="c-num grp-div">V. Estoque Inicial</th>
              <th className="c-num">(+) Compras</th>
              <th className="c-num">(+) Ent. Transf.</th>
              <th className="c-num">(−) Saí. Transf.</th>
              <th className="c-num">(−) Consumo</th>
              <th className="c-num">(−) Perdas</th>
              <th className="c-num">(=) Estoque Final</th>
              <th className="c-num">CMV (R$)</th>
              <th className="c-num">CMV (%)</th>
            </tr>
          </thead>
          <tbody>
            {!buscaRows.length
              ? <tr><td colSpan={14} className="cm-grid-empty">Nenhuma loja.</td></tr>
              : buscaRows.map((r) => {
                const fechado = r.situacao === 'fechado'
                const pct = r.faturamento > 0 ? (r.cmv / r.faturamento * 100) : null
                return (
                  <tr key={r.loja.id} className={sel.has(r.loja.id) ? 'sel' : ''}>
                    <td className="c-sel"><input type="checkbox" checked={sel.has(r.loja.id)} onChange={() => toggleRow(r.loja.id)} /></td>
                    <td className="c-det"><button className="cm-det" title="Ver item a item" onClick={() => { setDetLoja(r.loja.id); setDetBusca('') }}>🔍</button></td>
                    <td className="col-fant">{r.loja.nome}</td>
                    <td className="col-cnpj">{r.loja.cnpj || '—'}</td>
                    <td style={{ textAlign: 'center' }}><span className={'fc-sit ' + (fechado ? 'fe' : 'ab')}>{fechado ? 'FECHADO' : 'ABERTO'}</span></td>
                    <td className="c-num grp-div">{brl(r.estoque_inicial)}</td>
                    <td className="c-num">{brl(r.compras)}</td>
                    <td className="c-num">{brl(r.entradas_transferencia)}</td>
                    <td className="c-num">{brl(r.saidas_transferencia)}</td>
                    <td className="c-num">{brl(r.consumo)}</td>
                    <td className="c-num">{brl(r.perdas)}</td>
                    <td className="c-num">{brl(r.estoque_final)}</td>
                    <td className="c-num c-cmv">{brl(r.cmv)}</td>
                    <td className="c-num">{pct === null ? <span className="c-neg">—</span> : pct.toFixed(1) + '%'}</td>
                  </tr>
                )
              })}
          </tbody>
          {buscaRows.length > 0 && <tfoot>
            <tr>
              <td /><td /><td className="col-fant">TOTAL ({buscaRows.length} loja{buscaRows.length > 1 ? 's' : ''})</td><td /><td />
              <td className="c-num grp-div">{brl(total.estoque_inicial)}</td>
              <td className="c-num">{brl(total.compras)}</td>
              <td className="c-num">{brl(total.entradas_transferencia)}</td>
              <td className="c-num">{brl(total.saidas_transferencia)}</td>
              <td className="c-num">{brl(total.consumo)}</td>
              <td className="c-num">{brl(total.perdas)}</td>
              <td className="c-num">{brl(total.estoque_final)}</td>
              <td className="c-num c-cmv">{brl(total.cmv)}</td>
              <td />
            </tr>
          </tfoot>}
        </table>
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.6 }}>
        <b>CMV</b> = Estoque Inicial + Compras + Entradas Transf. − Saídas Transf. − Estoque Final (CMV por inventário; as perdas já entram no Estoque Final da contagem). Estoque Inicial/Final vêm das <b>contagens de inventário encerradas</b>. Ao <b>Fechar</b>, os valores do mês ficam congelados e a loja vira <b>FECHADO</b>.
      </div>

      {det && (
        <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setDetLoja(null) }}>
          <div className="modal" style={{ width: 'min(1140px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>Fechamento do Custo por Item — {det.loja.nome}</h2>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{comp} · {(det.itens || []).length} itens (somente os que participam do CMV)</div>
              </div>
              <button className="btn-sec" onClick={() => setDetLoja(null)}>✕ Fechar</button>
            </div>
            <input className="cm-grid-search" placeholder="Pesquisar item..." value={detBusca} onChange={(e) => setDetBusca(e.target.value)} style={{ maxWidth: 320 }} />
            <div className="cm-grid-wrap" style={{ maxHeight: '64vh', flex: 1 }}>
              <table className="cm-grid">
                <thead>
                  <tr>
                    <th>Item</th><th style={{ textAlign: 'center' }}>Un.</th>
                    <th className="c-num" style={{ textAlign: 'right' }}>Est. Inicial</th><th className="c-num" style={{ textAlign: 'right' }}>(+) Compras</th><th className="c-num" style={{ textAlign: 'right' }}>(+) Ent. Transf.</th>
                    <th className="c-num" style={{ textAlign: 'right' }}>(−) Saí. Transf.</th><th className="c-num" style={{ textAlign: 'right' }}>(−) Consumo</th><th className="c-num" style={{ textAlign: 'right' }}>(−) Perdas</th>
                    <th className="c-num" style={{ textAlign: 'right' }}>(=) Est. Final</th><th className="c-num" style={{ textAlign: 'right' }}>CMV</th>
                  </tr>
                </thead>
                <tbody>
                  {detItens.length
                    ? detItens.map((o) => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 500 }}>{o.nome}</td><td className="c-neg" style={{ textAlign: 'center' }}>{o.un}</td>
                        <td className="c-num">{brl(o.ei)}</td><td className="c-num">{brl(o.compras)}</td><td className="c-num">{brl(o.entT)}</td>
                        <td className="c-num c-neg">{brl(o.saiT)}</td><td className="c-num c-neg">{brl(o.consumo)}</td><td className="c-num c-neg">{brl(o.perdas)}</td>
                        <td className="c-num" style={{ fontWeight: 600 }}>{brl(o.ef)}</td><td className="c-num c-cmv">{brl(o.cmv)}</td>
                      </tr>
                    ))
                    : <tr><td colSpan={10} className="cm-grid-empty">Nenhum item.</td></tr>}
                </tbody>
                {detItens.length > 0 && <tfoot>
                  <tr>
                    <td>TOTAL ({detItens.length})</td><td />
                    <td className="c-num">{brl(detTotal.ei)}</td><td className="c-num">{brl(detTotal.compras)}</td><td className="c-num">{brl(detTotal.entT)}</td>
                    <td className="c-num">{brl(detTotal.saiT)}</td><td className="c-num">{brl(detTotal.consumo)}</td><td className="c-num">{brl(detTotal.perdas)}</td>
                    <td className="c-num">{brl(detTotal.ef)}</td><td className="c-num c-cmv">{brl(detTotal.cmv)}</td>
                  </tr>
                </tfoot>}
              </table>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
