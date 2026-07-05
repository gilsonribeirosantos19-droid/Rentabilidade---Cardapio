import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Portal › Estoque — 3 sub-abas: Relatório (posição atual + estoque inicial da
// última contagem), Movimentação (lança entrada/saída) e Histórico. Fiel ao loja.html.

type Insumo = { id: string; nome?: string; categoria?: string; ativo?: boolean; participa_cmv?: string; unidade_medida?: string; unidade_compra?: string; preco_compra?: number; minimo?: number }
type Grupo = { id: string; nome?: string; ativo?: boolean }
type GI = { grupo_id: string; insumo_id: string }
type Saldo = { insumo_id: string; quantidade?: number; custo_medio?: number; minimo?: number | null; maximo?: number | null }
type Forn = { id: string; nome?: string }
type Mov = { id?: string; insumo_id: string; quantidade?: number; observacao?: string; motivo?: string; responsavel?: string; criado_em?: string; created_at?: string; tipo?: string }

const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fQ = (v?: number | null) => (v != null ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '—')
const fmtQtd = (v?: number) => { const n = Number(v) || 0; return n % 1 === 0 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 }) }
const num = (v?: string) => parseFloat((v || '0').replace(',', '.')) || 0
const hojeStr = () => new Date().toLocaleDateString('en-CA')
const primeiroDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
// Dia seguinte a uma data (YYYY-MM-DD) — usado p/ ancorar o relatório logo APÓS a contagem
const proxDia = (d: string) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + 1); return dt.toLocaleDateString('en-CA') }
const un = (i?: Insumo) => i?.unidade_medida || i?.unidade_compra || 'un'
const fmtDataHora = (dt?: string) => (dt ? new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

type SubTab = 'relatorio' | 'movimentacao' | 'historico'

export function PortalEstoque() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()
  const [sub, setSub] = useState<SubTab>('relatorio')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ msg: m, err }); window.setTimeout(() => setToast(null), err ? 6000 : 3000) }

  // ---- dados compartilhados ----
  // select('*') p/ resiliência: colunas opcionais (participa_cmv/minimo/maximo) podem não existir
  // em todos os tenants; pedir coluna inexistente faz o Supabase ERRAR e zerar o resultado.
  const { data: insumos = [] } = useQuery({ queryKey: ['pest-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('*').eq('tenant_id', tenantId); return (data ?? []) as Insumo[] } })
  const { data: grupos = [] } = useQuery({ queryKey: ['pest-grupos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra').select('id,nome,ativo').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Grupo[] } })
  const { data: gci = [] } = useQuery({ queryKey: ['pest-gci', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('grupos_compra_itens').select('grupo_id,insumo_id').eq('tenant_id', tenantId); return (data ?? []) as GI[] } })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['pest-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Forn[] } })
  const { data: saldos = [] } = useQuery({ queryKey: ['pest-saldos', tenantId, lojaId], enabled: !!tenantId && !!lojaId, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId!); return (data ?? []) as Saldo[] } })
  const { data: baseline } = useQuery({
    queryKey: ['pest-baseline', tenantId, lojaId], enabled: !!tenantId && !!lojaId,
    queryFn: async () => {
      const { data: invs } = await supabase.from('inventarios').select('id,data_final,data_inicial,criado_em').eq('tenant_id', tenantId).eq('loja_id', lojaId!).eq('status', 'encerrado').order('criado_em', { ascending: false }).limit(1)
      const inv = (invs ?? [])[0] as { id: string; data_final?: string; data_inicial?: string } | undefined
      if (!inv) return { map: {} as Record<string, number>, data: null as string | null }
      const { data: its } = await supabase.from('inventario_itens').select('insumo_id,qtd_contada').eq('inventario_id', inv.id)
      const map: Record<string, number> = {}
      ;(its ?? []).forEach((it) => { const r = it as { insumo_id: string; qtd_contada?: number | null }; if (r.qtd_contada != null) map[r.insumo_id] = Number(r.qtd_contada) })
      return { map, data: inv.data_final || inv.data_inicial || null }
    },
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const saldoMap = useMemo(() => Object.fromEntries(saldos.map((s) => [s.insumo_id, s])) as Record<string, Saldo>, [saldos])
  const inicialMap = baseline?.map ?? {}
  const gruposItens = useMemo(() => { const m: Record<string, string[]> = {}; gci.forEach((g) => { if (insMap[g.insumo_id]) (m[g.grupo_id] ||= []).push(g.insumo_id) }); return m }, [gci, insMap])
  const grupoNome = (insId: string) => grupos.find((g) => (gruposItens[g.id] || []).includes(insId))?.nome || '—'

  const TABS: [SubTab, string][] = [['relatorio', 'Relatório'], ['movimentacao', 'Movimentação'], ['historico', 'Histórico']]

  return (
    <div>
      <div className="p-ttl">Estoque</div>
      <div className="p-sub">Consulte a posição, lance entradas/saídas e veja o histórico da sua loja.</div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        {TABS.map(([k, l]) => <button key={k} onClick={() => setSub(k)} style={{ border: 0, background: 'none', padding: '8px 14px', fontSize: 13, fontWeight: sub === k ? 700 : 500, color: sub === k ? '#ea6a0a' : '#64748b', borderBottom: sub === k ? '2px solid #f97316' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}>{l}</button>)}
      </div>

      {sub === 'relatorio' && <Relatorio {...{ insumos, saldoMap, inicialMap, grupos, gruposItens, insMap, tenantId, lojaId, baselineData: baseline?.data ?? null }} />}
      {sub === 'movimentacao' && <Movimentacao {...{ insumos, grupos, gruposItens, insMap, fornecedores, tenantId, lojaId, usuario, showToast, onSaved: () => { qc.invalidateQueries({ queryKey: ['pest-saldos'] }); qc.invalidateQueries({ queryKey: ['pest-mov'] }) } }} />}
      {sub === 'historico' && <Historico {...{ insumos, grupos, gruposItens, insMap, grupoNome, tenantId, lojaId }} />}

      {toast && <div className={'p-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}

// ══════════════════════ RELATÓRIO ══════════════════════
function Relatorio({ insumos, saldoMap, inicialMap, grupos, gruposItens, insMap, tenantId, lojaId, baselineData }: any) {
  const anchorDe = () => (baselineData ? proxDia(baselineData) : primeiroDiaMes())
  const [de, setDe] = useState<string>(anchorDe())
  const [ate, setAte] = useState(hojeStr())
  const [grupo, setGrupo] = useState('')
  const [busca, setBusca] = useState('')
  const [soCmv, setSoCmv] = useState(false)
  const [aplicado, setAplicado] = useState<{ de: string; ate: string } | null>({ de: anchorDe(), ate: hojeStr() })
  const [periodo, setPeriodo] = useState('contagem')

  // Enquanto no modo "contagem", ancora o início do período no dia SEGUINTE à última
  // contagem encerrada (o que veio antes/na contagem já está no Estoque Inicial).
  useEffect(() => {
    if (periodo === 'contagem' && baselineData) { const d = proxDia(baselineData); setDe(d); setAplicado((a) => ({ de: d, ate: a?.ate ?? hojeStr() })) }
  }, [baselineData, periodo])

  const onPeriodo = (p: string) => {
    setPeriodo(p)
    const t = hojeStr()
    if (p === 'contagem') { const d = anchorDe(); setDe(d); setAte(t); setAplicado({ de: d, ate: t }) }
    else if (p === 'atual') { const d = primeiroDiaMes(); setDe(d); setAte(t); setAplicado({ de: d, ate: t }) }
    else if (p === 'anterior') { const n = new Date(); const f = new Date(n.getFullYear(), n.getMonth() - 1, 1).toLocaleDateString('en-CA'); const l = new Date(n.getFullYear(), n.getMonth(), 0).toLocaleDateString('en-CA'); setDe(f); setAte(l); setAplicado({ de: f, ate: l }) }
    else { setDe(''); setAte('') } // personalizado
  }

  const { data: movs, isFetching } = useQuery({
    queryKey: ['pest-rel', tenantId, lojaId, aplicado?.de, aplicado?.ate], enabled: !!tenantId && !!lojaId && !!aplicado,
    queryFn: async () => {
      const [e, s] = await Promise.all([
        supabase.from('entradas_estoque').select('insumo_id,quantidade,criado_em,created_at,tipo').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', aplicado!.de + 'T00:00:00').lte('criado_em', aplicado!.ate + 'T23:59:59'),
        supabase.from('saidas_estoque').select('insumo_id,quantidade,criado_em,created_at,tipo').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', aplicado!.de + 'T00:00:00').lte('criado_em', aplicado!.ate + 'T23:59:59'),
      ])
      return { entradas: (e.data ?? []) as Mov[], saidas: (s.data ?? []) as Mov[] }
    },
  })

  const rows = useMemo(() => {
    if (!movs) return []
    const ult: Record<string, string> = {}
    ;[...movs.entradas, ...movs.saidas].forEach((m) => { const dt = m.criado_em || m.created_at; if (dt && (!ult[m.insumo_id] || dt > ult[m.insumo_id])) ult[m.insumo_id] = dt })
    let lista = (insumos as Insumo[]).filter((i) => i.ativo !== false)
    if (grupo) { const ids = gruposItens[grupo] || []; lista = lista.filter((i) => ids.includes(i.id)) }
    if (soCmv) lista = lista.filter((i) => i.participa_cmv !== 'nao')
    const b = busca.toLowerCase().trim()
    if (b) lista = lista.filter((i) => (i.nome || '').toLowerCase().includes(b))
    return lista.map((ins) => {
      const ent = movs.entradas.filter((e) => e.insumo_id === ins.id && e.tipo !== 'ajuste').reduce((a, e) => a + Number(e.quantidade || 0), 0)
      const sai = movs.saidas.filter((x) => x.insumo_id === ins.id && x.tipo !== 'ajuste').reduce((a, x) => a + Number(x.quantidade || 0), 0)
      const s = saldoMap[ins.id]
      const saldo = Number(s?.quantidade) || 0
      const inicial = inicialMap[ins.id]
      if (!ent && !sai && !saldo && inicial == null) return null
      const min = (s?.minimo != null && Number(s.minimo) > 0) ? Number(s.minimo) : (Number(ins.minimo) > 0 ? Number(ins.minimo) : null)
      return { ins, ent, sai, saldo, cm: Number(s?.custo_medio) || 0, min, max: s?.maximo != null ? Number(s.maximo) : null, inicial: inicial == null ? null : Number(inicial), ult: ult[ins.id] }
    }).filter(Boolean).sort((a: any, b: any) => a.ins.nome.localeCompare(b.ins.nome, 'pt-BR')) as any[]
  }, [movs, insumos, grupo, gruposItens, soCmv, busca, saldoMap, inicialMap])

  const aplicar = () => { if (!de || !ate) return; setAplicado({ de, ate }) }

  const exportar = () => {
    if (!rows.length) return
    const head = ['Insumo', 'Un.', 'Estoque Inicial', 'Entradas', 'Saidas', 'Saldo Atual', 'Minimo', 'Maximo', 'Valor Estoque (R$)', 'Ultima Mov.']
    const linhas = rows.map((r: any) => [r.ins.nome, un(r.ins), r.inicial ?? '', r.ent, r.sai, r.saldo, r.min ?? '', r.max ?? '', (r.saldo * r.cm).toFixed(2), r.ult ? fmtDataHora(r.ult) : ''])
    const csv = '﻿' + [head, ...linhas].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `estoque_${hojeStr()}.csv`; a.click()
  }

  return (
    <>
      <div className="pf-bar">
        <div className="pf-fld"><label>Período</label><select className="p-field" value={periodo} onChange={(e) => onPeriodo(e.target.value)}><option value="contagem">Desde a última contagem</option><option value="atual">Mês atual</option><option value="anterior">Mês anterior</option><option value="personalizado">Personalizado</option></select></div>
        <div className="pf-fld"><label>De</label><input type="date" className="p-field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Até</label><input type="date" className="p-field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Grupo</label><select className="p-field" value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">Todos os grupos</option>{grupos.filter((g: Grupo) => (gruposItens[g.id] || []).length).map((g: Grupo) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></div>
        <div className="pf-fld"><label>Buscar item</label><input className="p-field" style={{ minWidth: 200 }} placeholder="Nome do insumo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <label className="pf-chk"><input type="checkbox" checked={soCmv} onChange={(e) => setSoCmv(e.target.checked)} />Só CMV</label>
        <button className="p-btn p-btn-pri" onClick={aplicar}>Atualizar</button>
        <button className="p-btn" onClick={exportar} style={{ marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      <div className="p-card">
        <table className="p-tbl">
          <thead><tr>
            <th>Insumo</th><th>Un.</th><th className="r">Estoque Inicial</th><th className="r">Entradas</th><th className="r">Saídas</th><th className="r">Saldo Atual</th><th className="r">Mín.</th><th className="r">Máx.</th><th className="r">Valor</th><th>Última mov.</th>
          </tr></thead>
          <tbody>
            {isFetching ? <tr><td colSpan={10} className="p-empty">Carregando…</td></tr>
              : !rows.length ? <tr><td colSpan={10} className="p-empty">Nenhum item encontrado.</td></tr>
                : rows.map((r: any) => (
                  <tr key={r.ins.id}>
                    <td>{r.ins.nome}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{un(r.ins)}</td>
                    <td className="r mono" style={{ color: '#0369a1' }}>{fQ(r.inicial ?? 0)}</td>
                    <td className="r mono" style={{ color: r.ent > 0 ? '#16a34a' : '#94a3b8' }}>{fQ(r.ent)}</td>
                    <td className="r mono" style={{ color: r.sai > 0 ? '#dc2626' : '#94a3b8' }}>{fQ(r.sai)}</td>
                    <td className="r mono">{fQ(r.saldo)}</td>
                    <td className="r mono" style={{ color: '#94a3b8' }}>{fQ(r.min ?? 0)}</td>
                    <td className="r mono" style={{ color: '#94a3b8' }}>{fQ(r.max ?? 0)}</td>
                    <td className="r mono">{brl(r.saldo * r.cm)}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{r.ult ? fmtDataHora(r.ult) : '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>{rows.length} {rows.length === 1 ? 'item' : 'itens'}</div>
        )}
      </div>
    </>
  )
}

// ══════════════════════ MOVIMENTAÇÃO ══════════════════════
function Movimentacao({ insumos, grupos, gruposItens, insMap, fornecedores, tenantId, lojaId, usuario, showToast, onSaved }: any) {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [data, setData] = useState(hojeStr())
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [insumoId, setInsumoId] = useState('')
  const [qtd, setQtd] = useState('')
  const [obs, setObs] = useState('')
  // entrada
  const [fornId, setFornId] = useState('')
  const [unidCompra, setUnidCompra] = useState('')
  const [fator, setFator] = useState('1')
  const [custo, setCusto] = useState('')
  const [lote, setLote] = useState('')
  const [validade, setValidade] = useState('')
  // filtros da lista
  const [tipoFil, setTipoFil] = useState('')
  const [grpFil, setGrpFil] = useState('')

  const insSel: Insumo | undefined = insMap[insumoId]
  const unSel = un(insSel)
  const listaInsumos = useMemo(() => { let l = insumos as Insumo[]; if (grupoFiltro) { const ids = gruposItens[grupoFiltro] || []; l = l.filter((i) => ids.includes(i.id)) } return l.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '')) }, [insumos, grupoFiltro, gruposItens])
  const valorTotal = num(qtd) * num(custo)

  const onInsumo = (id: string) => { setInsumoId(id); const i = insMap[id]; setUnidCompra(i?.unidade_compra || ''); if (i?.preco_compra) setCusto(String(i.preco_compra)) }

  const { data: dia, isFetching } = useQuery({
    queryKey: ['pest-mov', tenantId, lojaId, data, tipoFil], enabled: !!tenantId && !!lojaId && !!data,
    queryFn: async () => {
      const qs: PromiseLike<Mov[]>[] = []
      qs.push((!tipoFil || tipoFil === 'entrada') ? supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', data + 'T00:00:00').lte('criado_em', data + 'T23:59:59').order('criado_em', { ascending: false }).then((r) => (r.data ?? []) as Mov[]) : Promise.resolve([]))
      qs.push((!tipoFil || tipoFil === 'saida') ? supabase.from('saidas_estoque').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', data + 'T00:00:00').lte('criado_em', data + 'T23:59:59').order('criado_em', { ascending: false }).then((r) => (r.data ?? []) as Mov[]) : Promise.resolve([]))
      const [ent, sai] = await Promise.all(qs)
      return [...ent.map((e) => ({ ...e, _tipo: 'entrada' })), ...sai.map((s) => ({ ...s, _tipo: 'saida' }))].sort((a, b) => (b.criado_em || b.created_at || '').localeCompare(a.criado_em || a.created_at || ''))
    },
  })
  const diaFiltrado = useMemo(() => { if (!dia) return []; if (!grpFil) return dia; const ids = gruposItens[grpFil] || []; return dia.filter((m: any) => ids.includes(m.insumo_id)) }, [dia, grpFil, gruposItens])

  const registrar = useMutation({
    mutationFn: async () => {
      if (!insumoId) throw new Error('Selecione o insumo.')
      if (num(qtd) <= 0) throw new Error('Informe a quantidade.')
      const criadoEm = data + 'T12:00:00.000Z'
      const { data: sals } = await supabase.from('saldo_estoque').select('quantidade,custo_medio').eq('tenant_id', tenantId).eq('loja_id', lojaId).eq('insumo_id', insumoId)
      const qtdAtual = Number((sals ?? [])[0]?.quantidade) || 0
      const cmAtual = Number((sals ?? [])[0]?.custo_medio) || 0
      let novaQtd = qtdAtual, novoCm = cmAtual
      if (tipo === 'entrada') {
        const f = num(fator) || 1
        const c = num(custo)
        const fornNome = fornId ? (fornecedores as Forn[]).find((x) => x.id === fornId)?.nome || null : null
        const qtdEst = parseFloat((num(qtd) * f).toFixed(4))
        const custoUnit = parseFloat((c / f).toFixed(6))
        const { error } = await supabase.from('entradas_estoque').insert({ tenant_id: tenantId, loja_id: lojaId, insumo_id: insumoId, fornecedor_id: fornId || null, fornecedor_nome: fornNome, quantidade: qtdEst, unidade_compra: unidCompra.trim() || null, fator_conversao: f, custo_unitario: custoUnit, lote: lote.trim() || null, validade: validade || null, tipo: 'manual', observacao: obs.trim() || null, responsavel: usuario?.nome || null, criado_em: criadoEm })
        if (error) throw error
        novaQtd = qtdAtual + qtdEst
        novoCm = novaQtd > 0 ? (qtdAtual * cmAtual + qtdEst * custoUnit) / novaQtd : custoUnit
        const impacto = cmAtual > 0 ? parseFloat(((novoCm - cmAtual) / cmAtual * 100).toFixed(4)) : null
        await supabase.from('historico_custo').insert({ tenant_id: tenantId, insumo_id: insumoId, loja_id: lojaId, saldo_anterior: parseFloat(qtdAtual.toFixed(4)), custo_medio_anterior: parseFloat(cmAtual.toFixed(4)), qtd_entrada: parseFloat(qtdEst.toFixed(4)), custo_entrada: parseFloat(custoUnit.toFixed(4)), novo_custo_medio: parseFloat(novoCm.toFixed(6)), impacto_pct: impacto, origem: 'entrada_loja', documento_ref: null })
      } else {
        const { error } = await supabase.from('saidas_estoque').insert({ tenant_id: tenantId, loja_id: lojaId, insumo_id: insumoId, quantidade: num(qtd), tipo: 'consumo', motivo: obs.trim() || null, responsavel: usuario?.nome || null, criado_em: criadoEm })
        if (error) throw error
        novaQtd = Math.max(0, qtdAtual - num(qtd))
      }
      const { error: eu } = await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, loja_id: lojaId, insumo_id: insumoId, quantidade: parseFloat(novaQtd.toFixed(4)), custo_medio: parseFloat(novoCm.toFixed(6)), atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,insumo_id,loja_id' })
      if (eu) throw eu
    },
    onSuccess: () => { showToast(`${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada!`); setInsumoId(''); setQtd(''); setObs(''); setFornId(''); setUnidCompra(''); setFator('1'); setCusto(''); setLote(''); setValidade(''); onSaved() },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const lbl: React.CSSProperties = { fontSize: 11, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 4 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 1.2fr', gap: 16, alignItems: 'start' }}>
      {/* form */}
      <div className="p-card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Tipo</label>
            <select className="p-field" style={{ width: '100%' }} value={tipo} onChange={(e) => setTipo(e.target.value as 'entrada' | 'saida')}><option value="entrada">Entrada</option><option value="saida">Saída</option></select>
          </div>
          <div><label style={lbl}>Data</label><input type="date" className="p-field" style={{ width: '100%' }} value={data} onChange={(e) => setData(e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Grupo (filtro)</label><select className="p-field" style={{ width: '100%' }} value={grupoFiltro} onChange={(e) => { setGrupoFiltro(e.target.value); setInsumoId('') }}><option value="">Todos</option>{grupos.filter((g: Grupo) => (gruposItens[g.id] || []).length).map((g: Grupo) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></div>
          <div><label style={lbl}>Unidade</label><input className="p-field" style={{ width: '100%', background: '#f1f5f9' }} readOnly value={unSel} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>Insumo *</label>
          <select className="p-field" style={{ width: '100%' }} value={insumoId} onChange={(e) => onInsumo(e.target.value)}><option value="">Selecione…</option>{listaInsumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
        </div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>{tipo === 'entrada' ? 'Quantidade (na embalagem) *' : 'Quantidade *'}</label>
          <input type="number" min="0" step="0.001" className="p-field" style={{ width: '100%', textAlign: 'right', fontFamily: 'DM Mono, monospace' }} value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0,000" />
        </div>

        {tipo === 'entrada' && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Dados da entrada</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={lbl}>Fornecedor</label><select className="p-field" style={{ width: '100%' }} value={fornId} onChange={(e) => setFornId(e.target.value)}><option value="">Sem fornecedor</option>{(fornecedores as Forn[]).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
              <div><label style={lbl}>Unid. de compra</label><input className="p-field" style={{ width: '100%' }} value={unidCompra} onChange={(e) => setUnidCompra(e.target.value)} placeholder="cx, fardo…" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={lbl}>Fator conversão</label><input type="number" min="0" step="0.001" className="p-field" style={{ width: '100%', textAlign: 'right' }} value={fator} onChange={(e) => setFator(e.target.value)} /></div>
              <div><label style={lbl}>Custo unit. (R$/{unSel})</label><input type="number" min="0" step="0.01" className="p-field" style={{ width: '100%', textAlign: 'right' }} value={custo} onChange={(e) => setCusto(e.target.value)} /></div>
              <div><label style={lbl}>Valor total</label><div style={{ fontSize: 14, fontWeight: 700, height: 34, display: 'flex', alignItems: 'center', color: '#f97316' }}>{brl(valorTotal)}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={lbl}>Lote</label><input className="p-field" style={{ width: '100%' }} value={lote} onChange={(e) => setLote(e.target.value)} /></div>
              <div><label style={lbl}>Validade</label><input type="date" className="p-field" style={{ width: '100%' }} value={validade} onChange={(e) => setValidade(e.target.value)} /></div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}><label style={lbl}>Observação</label><input className="p-field" style={{ width: '100%' }} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="p-btn p-btn-pri" disabled={registrar.isPending} onClick={() => registrar.mutate()}>{registrar.isPending ? 'Salvando…' : 'Registrar'}</button>
        </div>
      </div>

      {/* lista do dia */}
      <div className="p-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Movimentações do dia</span>
          <select className="p-field p-btn-sm" style={{ marginLeft: 'auto' }} value={tipoFil} onChange={(e) => setTipoFil(e.target.value)}><option value="">Todos os tipos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select>
          <select className="p-field p-btn-sm" value={grpFil} onChange={(e) => setGrpFil(e.target.value)}><option value="">Todos os grupos</option>{grupos.filter((g: Grupo) => (gruposItens[g.id] || []).length).map((g: Grupo) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
        </div>
        <table className="p-tbl">
          <thead><tr><th>Hora</th><th>Tipo</th><th>Insumo</th><th className="r">Qtd.</th><th>Observação</th><th>Usuário</th></tr></thead>
          <tbody>
            {isFetching ? <tr><td colSpan={6} className="p-empty">Carregando…</td></tr>
              : !diaFiltrado.length ? <tr><td colSpan={6} className="p-empty">Nenhuma movimentação neste dia.</td></tr>
                : diaFiltrado.map((m: any, idx: number) => { const ins = insMap[m.insumo_id]; const isE = m._tipo === 'entrada'; const hora = (m.criado_em || m.created_at) ? new Date(m.criado_em || m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; return (
                  <tr key={m.id || idx}>
                    <td className="mono" style={{ color: '#64748b', fontSize: 12 }}>{hora}</td>
                    <td><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isE ? '#dcfce7' : '#fee2e2', color: isE ? '#16a34a' : '#dc2626' }}>{isE ? 'Entrada' : 'Saída'}</span></td>
                    <td>{ins?.nome || '?'}</td>
                    <td className="r mono" style={{ color: isE ? '#16a34a' : '#dc2626' }}>{isE ? '+' : '-'}{fmtQtd(m.quantidade)} {un(ins)}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{m.observacao || m.motivo || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{m.responsavel || usuario?.nome || '—'}</td>
                  </tr>
                ) })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════ HISTÓRICO ══════════════════════
function Historico({ insumos, grupos, gruposItens, insMap, grupoNome, tenantId, lojaId }: any) {
  const [de, setDe] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(hojeStr())
  const [grupo, setGrupo] = useState('')
  const [tipo, setTipo] = useState('')
  const [resp, setResp] = useState('')
  const [busca, setBusca] = useState('')
  const [periodo, setPeriodo] = useState('atual')
  const [aplicado, setAplicado] = useState<{ de: string; ate: string } | null>({ de: primeiroDiaMes(), ate: hojeStr() })

  const onPeriodo = (p: string) => {
    setPeriodo(p)
    const t = hojeStr()
    if (p === 'atual') { const d = primeiroDiaMes(); setDe(d); setAte(t); setAplicado({ de: d, ate: t }) }
    else if (p === 'anterior') { const n = new Date(); const f = new Date(n.getFullYear(), n.getMonth() - 1, 1).toLocaleDateString('en-CA'); const l = new Date(n.getFullYear(), n.getMonth(), 0).toLocaleDateString('en-CA'); setDe(f); setAte(l); setAplicado({ de: f, ate: l }) }
    else { setDe(''); setAte('') } // personalizado
  }

  const { data: movs, isFetching } = useQuery({
    queryKey: ['pest-hist', tenantId, lojaId, aplicado?.de, aplicado?.ate], enabled: !!tenantId && !!lojaId && !!aplicado,
    queryFn: async () => {
      const [e, s] = await Promise.all([
        supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', aplicado!.de + 'T00:00:00').lte('criado_em', aplicado!.ate + 'T23:59:59').order('criado_em', { ascending: false }),
        supabase.from('saidas_estoque').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', aplicado!.de + 'T00:00:00').lte('criado_em', aplicado!.ate + 'T23:59:59').order('criado_em', { ascending: false }),
      ])
      return [...((e.data ?? []) as Mov[]).map((m) => ({ ...m, _lado: 'entrada' })), ...((s.data ?? []) as Mov[]).map((m) => ({ ...m, _lado: 'saida' }))].sort((a, b) => (b.criado_em || b.created_at || '').localeCompare(a.criado_em || a.created_at || ''))
    },
  })
  const _tipo = (m: any) => (m.tipo === 'ajuste' ? 'ajuste' : m._lado)
  const responsaveis = useMemo(() => [...new Set((movs ?? []).map((m: any) => m.responsavel).filter(Boolean))].sort() as string[], [movs])
  const lista = useMemo(() => {
    let l = (movs ?? []) as any[]
    if (grupo) { const ids = gruposItens[grupo] || []; l = l.filter((m) => ids.includes(m.insumo_id)) }
    if (tipo) l = l.filter((m) => _tipo(m) === tipo)
    if (resp) l = l.filter((m) => (m.responsavel || '') === resp)
    const b = busca.toLowerCase().trim()
    if (b) l = l.filter((m) => (insMap[m.insumo_id]?.nome || '').toLowerCase().includes(b))
    return l
  }, [movs, grupo, tipo, resp, busca, gruposItens, insMap])

  const exportar = () => {
    if (!lista.length) return
    const head = ['Data/Hora', 'Tipo', 'Insumo', 'Grupo', 'Quantidade', 'Unidade', 'Responsavel', 'Observacao']
    const linhas = lista.map((m: any) => { const ins = insMap[m.insumo_id]; const tp = _tipo(m); const sinal = m._lado === 'entrada' ? '' : '-'; return [fmtDataHora(m.criado_em || m.created_at), tp, ins?.nome || '', grupoNome(m.insumo_id), sinal + (m.quantidade || 0), un(ins), m.responsavel || '', (m.observacao || m.motivo || '')] })
    const csv = '﻿' + [head, ...linhas].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `historico_movimentacoes_${hojeStr()}.csv`; a.click()
  }

  return (
    <>
      <div className="pf-bar">
        <div className="pf-fld"><label>Período</label><select className="p-field" value={periodo} onChange={(e) => onPeriodo(e.target.value)}><option value="atual">Mês atual</option><option value="anterior">Mês anterior</option><option value="personalizado">Personalizado</option></select></div>
        <div className="pf-fld"><label>De</label><input type="date" className="p-field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Até</label><input type="date" className="p-field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Grupo</label><select className="p-field" value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">Todos</option>{grupos.map((g: Grupo) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></div>
        <div className="pf-fld"><label>Tipo</label><select className="p-field" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="ajuste">Ajuste</option></select></div>
        <div className="pf-fld"><label>Responsável</label><select className="p-field" value={resp} onChange={(e) => setResp(e.target.value)}><option value="">Todos</option>{responsaveis.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div className="pf-fld"><label>Buscar item</label><input className="p-field" placeholder="Nome do insumo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <button className="p-btn p-btn-pri" onClick={() => setAplicado({ de, ate })}>Atualizar</button>
        <button className="p-btn" onClick={exportar} style={{ marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      <div className="p-card">
        <table className="p-tbl">
          <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Insumo</th><th>Grupo</th><th className="r">Qtd.</th><th>Un.</th><th>Responsável</th><th>Observação</th></tr></thead>
          <tbody>
            {isFetching ? <tr><td colSpan={8} className="p-empty">Carregando…</td></tr>
              : !lista.length ? <tr><td colSpan={8} className="p-empty">Nenhuma movimentação no período/filtros.</td></tr>
                : lista.map((m: any, idx: number) => { const ins = insMap[m.insumo_id]; const tp = _tipo(m); const pos = m._lado === 'entrada'; return (
                  <tr key={m.id || idx}>
                    <td className="mono" style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDataHora(m.criado_em || m.created_at)}</td>
                    <td><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: tp === 'entrada' ? '#dcfce7' : tp === 'saida' ? '#fee2e2' : '#dbeafe', color: tp === 'entrada' ? '#16a34a' : tp === 'saida' ? '#dc2626' : '#2563eb' }}>{tp === 'entrada' ? 'Entrada' : tp === 'saida' ? 'Saída' : 'Ajuste'}</span></td>
                    <td>{ins?.nome || '?'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{grupoNome(m.insumo_id)}</td>
                    <td className="r mono" style={{ color: pos ? '#16a34a' : '#dc2626' }}>{pos ? '+' : '-'}{fmtQtd(m.quantidade)}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{un(ins)}</td>
                    <td style={{ fontSize: 12, color: '#475569' }}>{m.responsavel || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{m.observacao || m.motivo || '—'}</td>
                  </tr>
                ) })}
          </tbody>
        </table>
      </div>
    </>
  )
}
