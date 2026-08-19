import { useEffect, useMemo, useState } from 'react'
import { useToastErr } from '../lib/toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import { SearchSelect } from '../components/SearchSelect'
import { brl, num } from '../lib/format'

// Portal › Estoque — 3 sub-abas: Relatório (posição atual + estoque inicial da
// última contagem), Movimentação (lança entrada/saída) e Histórico. Fiel ao loja.html.

type Insumo = { id: string; nome?: string; categoria?: string; ativo?: boolean; participa_cmv?: string; unidade_medida?: string; unidade_compra?: string; preco_compra?: number; minimo?: number }
type Grupo = { id: string; nome?: string; ativo?: boolean }
type GI = { grupo_id: string; insumo_id: string }
type Saldo = { insumo_id: string; quantidade?: number; custo_medio?: number; minimo?: number | null; maximo?: number | null }
type Forn = { id: string; nome?: string }
type Mov = { id?: string; insumo_id: string; quantidade?: number; observacao?: string; motivo?: string; responsavel?: string; criado_em?: string; created_at?: string; tipo?: string; chave_acesso?: string | null; nfe_numero?: string | null }

const fQ = (v?: number | null) => (v != null ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—')
const fmtQtd = (v?: number) => { const n = Number(v) || 0; return n % 1 === 0 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 }) }
const hojeStr = () => new Date().toLocaleDateString('en-CA')
const primeiroDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
// Dia seguinte a uma data (YYYY-MM-DD) — usado p/ ancorar o relatório logo APÓS a contagem
const proxDia = (d: string) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + 1); return dt.toLocaleDateString('en-CA') }
const un = (i?: Insumo) => i?.unidade_medida || i?.unidade_compra || 'un'
const fmtDataHora = (dt?: string) => (dt ? new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

type SubTab = 'relatorio' | 'movimentacao' | 'saida_lote' | 'historico'

export function PortalEstoque() {
  const { tenantId, usuario } = useAuth()
  const lojaId = usuario?.loja_id ?? null
  const qc = useQueryClient()
  const [sub, setSub] = useState<SubTab>('relatorio')
  const { toast, setToast, showToast } = useToastErr(3000, 6000)

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

  const TABS: [SubTab, string][] = [['relatorio', 'Relatório'], ['movimentacao', 'Movimentação'], ['saida_lote', 'Saída em Lote'], ['historico', 'Histórico']]

  return (
    <div>
      <div className="p-ttl">Estoque</div>
      <div className="p-sub">Consulte a posição, lance entradas/saídas e veja o histórico da sua loja.</div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        {TABS.map(([k, l]) => <button key={k} onClick={() => setSub(k)} style={{ border: 0, background: 'none', padding: '8px 14px', fontSize: 13, fontWeight: sub === k ? 700 : 500, color: sub === k ? '#ea6a0a' : '#64748b', borderBottom: sub === k ? '2px solid #f97316' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}>{l}</button>)}
      </div>

      {sub === 'relatorio' && <Relatorio {...{ insumos, saldoMap, inicialMap, grupos, gruposItens, insMap, tenantId, lojaId, baselineData: baseline?.data ?? null }} />}
      {sub === 'movimentacao' && <Movimentacao {...{ insumos, grupos, gruposItens, insMap, fornecedores, tenantId, lojaId, usuario, showToast, onSaved: () => { qc.invalidateQueries({ queryKey: ['pest-saldos'] }); qc.invalidateQueries({ queryKey: ['pest-mov'] }) } }} />}
      {sub === 'saida_lote' && <SaidaLote {...{ insumos, saldoMap, tenantId, lojaId, usuario, showToast, onSaved: () => { qc.invalidateQueries({ queryKey: ['pest-saldos'] }); qc.invalidateQueries({ queryKey: ['pest-mov'] }) } }} />}
      {sub === 'historico' && <Historico {...{ insumos, grupos, gruposItens, insMap, grupoNome, tenantId, lojaId, showToast }} />}

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
  const [soSaldo, setSoSaldo] = useState(false)
  const [aplicado, setAplicado] = useState<{ de: string; ate: string } | null>({ de: anchorDe(), ate: hojeStr() })
  const [periodo, setPeriodo] = useState('contagem')
  // filtro "Grupo" = categoria do insumo (o Portal tinha só 1 grupo de compra, então o filtro não servia)
  const categorias = useMemo(() => [...new Set((insumos as Insumo[]).map((i) => i.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [insumos])

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
      // select('*') p/ resiliência: pedir coluna inexistente (ex: created_at) faz o Supabase ERRAR e zerar o resultado
      const [e, s] = await Promise.all([
        supabase.from('entradas_estoque').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', aplicado!.de + 'T00:00:00').lte('criado_em', aplicado!.ate + 'T23:59:59'),
        supabase.from('saidas_estoque').select('*').eq('tenant_id', tenantId).eq('loja_id', lojaId).gte('criado_em', aplicado!.de + 'T00:00:00').lte('criado_em', aplicado!.ate + 'T23:59:59'),
      ])
      return { entradas: (e.data ?? []) as Mov[], saidas: (s.data ?? []) as Mov[] }
    },
  })

  const rows = useMemo(() => {
    if (!movs) return []
    // dias do período (p/ o consumo médio diário do "Dias de estoque")
    const d1 = new Date((aplicado?.de || hojeStr()) + 'T00:00:00'), d2 = new Date((aplicado?.ate || hojeStr()) + 'T00:00:00')
    const diasPeriodo = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
    const ult: Record<string, string> = {}
    ;[...movs.entradas, ...movs.saidas].forEach((m) => { const dt = m.criado_em || m.created_at; if (dt && (!ult[m.insumo_id] || dt > ult[m.insumo_id])) ult[m.insumo_id] = dt })
    let lista = (insumos as Insumo[]).filter((i) => i.ativo !== false)
    if (grupo) lista = lista.filter((i) => (i.categoria || '') === grupo)
    if (soCmv) lista = lista.filter((i) => i.participa_cmv !== 'nao')
    const b = busca.toLowerCase().trim()
    if (b) lista = lista.filter((i) => (i.nome || '').toLowerCase().includes(b))
    return lista.map((ins) => {
      const ent = movs.entradas.filter((e) => e.insumo_id === ins.id && e.tipo !== 'ajuste').reduce((a, e) => a + Number(e.quantidade || 0), 0)
      const sai = movs.saidas.filter((x) => x.insumo_id === ins.id && x.tipo !== 'ajuste').reduce((a, x) => a + Number(x.quantidade || 0), 0)
      const s = saldoMap[ins.id]
      const saldo = Number(s?.quantidade) || 0
      const inicial = inicialMap[ins.id]
      if (soSaldo && saldo <= 0) return null
      if (!ent && !sai && !saldo && inicial == null) return null
      const min = (s?.minimo != null && Number(s.minimo) > 0) ? Number(s.minimo) : (Number(ins.minimo) > 0 ? Number(ins.minimo) : null)
      // dias de estoque = quanto o saldo dura no ritmo de consumo do período (— se sem giro ou saldo <= 0)
      const dias = saldo > 0 && sai > 0 ? saldo * diasPeriodo / sai : null
      return { ins, ent, sai, saldo, cm: Number(s?.custo_medio) || 0, min, max: s?.maximo != null ? Number(s.maximo) : null, inicial: inicial == null ? null : Number(inicial), ult: ult[ins.id], dias }
    }).filter(Boolean).sort((a: any, b: any) => a.ins.nome.localeCompare(b.ins.nome, 'pt-BR')) as any[]
  }, [movs, insumos, grupo, gruposItens, soCmv, soSaldo, busca, saldoMap, inicialMap, aplicado])

  const aplicar = () => { if (!de || !ate) return; setAplicado({ de, ate }) }

  const exportar = () => {
    if (!rows.length) return
    const head = ['Insumo', 'Un.', 'Estoque Inicial', 'Entradas', 'Saidas', 'Saldo Atual', 'Minimo', 'Maximo', 'Valor Estoque (R$)', 'Dias Estoque', 'Ultima Mov.']
    const linhas = rows.map((r: any) => [r.ins.nome, un(r.ins), r.inicial ?? '', r.ent, r.sai, r.saldo, r.min ?? '', r.max ?? '', +(r.saldo * r.cm).toFixed(2), r.dias == null ? '' : +r.dias.toFixed(1), r.ult ? fmtDataHora(r.ult) : ''])
    downloadCsv(`estoque_${hojeStr()}.csv`, [head, ...linhas])
  }

  return (
    <>
      <div className="pf-bar">
        <div className="pf-fld"><label>Período</label><select className="p-field" value={periodo} onChange={(e) => onPeriodo(e.target.value)}><option value="contagem">Desde a última contagem</option><option value="atual">Mês atual</option><option value="anterior">Mês anterior</option><option value="personalizado">Personalizado</option></select></div>
        <div className="pf-fld"><label>De</label><input type="date" className="p-field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Até</label><input type="date" className="p-field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Grupo</label><div style={{ minWidth: 180 }}><SearchSelect value={grupo} onChange={setGrupo} options={categorias} placeholder="Todos os grupos" /></div></div>
        <div className="pf-fld"><label>Buscar item</label><input className="p-field" style={{ minWidth: 200 }} placeholder="Nome do insumo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <button className="p-btn p-btn-pri" onClick={aplicar}>Atualizar</button>
        <button className="p-btn" onClick={exportar} style={{ marginLeft: 'auto' }}>Exportar CSV</button>
        <div style={{ flexBasis: '100%', display: 'flex', gap: 16, alignItems: 'center' }}>
          <label className="pf-chk"><input type="checkbox" checked={soSaldo} onChange={(e) => setSoSaldo(e.target.checked)} />Somente com saldo</label>
          <label className="pf-chk"><input type="checkbox" checked={soCmv} onChange={(e) => setSoCmv(e.target.checked)} />Só CMV</label>
        </div>
      </div>

      <div className="p-card">
        <table className="p-tbl p-tbl-grade">
          <thead><tr>
            <th>Insumo</th><th>Un.</th><th className="r">Estoque Inicial</th><th className="r">Entradas</th><th className="r">Saídas</th><th className="r">Saldo Atual</th><th className="r">Valor</th><th className="r" title="Quantos dias o saldo atual dura no ritmo de consumo (saídas) do período selecionado. — = sem consumo no período ou saldo zerado/negativo.">Dias estoque</th><th>Última mov.</th>
          </tr></thead>
          <tbody>
            {isFetching ? <tr><td colSpan={9} className="p-empty">Carregando…</td></tr>
              : !rows.length ? <tr><td colSpan={9} className="p-empty">Nenhum item encontrado.</td></tr>
                : rows.map((r: any) => (
                  <tr key={r.ins.id}>
                    <td>{r.ins.nome}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{un(r.ins)}</td>
                    <td className="r mono" style={{ color: '#0369a1' }}>{fQ(r.inicial ?? 0)}</td>
                    <td className="r mono" style={{ color: r.ent > 0 ? '#16a34a' : '#94a3b8' }}>{fQ(r.ent)}</td>
                    <td className="r mono" style={{ color: r.sai > 0 ? '#dc2626' : '#94a3b8' }}>{fQ(r.sai)}</td>
                    <td className="r mono" style={r.saldo < 0 ? { color: '#dc2626', fontWeight: 700 } : undefined}>{fQ(r.saldo)}</td>
                    <td className="r mono">{brl(r.saldo * r.cm)}</td>
                    <td className="r mono" style={{ fontWeight: r.dias != null && r.dias < 7 ? 700 : 400, color: r.dias == null ? '#94a3b8' : r.dias < 3 ? '#dc2626' : r.dias < 7 ? '#d97706' : '#334155' }}>{r.dias == null ? '—' : r.dias.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{r.ult ? fmtDataHora(r.ult) : '—'}</td>
                  </tr>
                ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} className="r" style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700, color: '#475569' }}>Total — {rows.length} {rows.length === 1 ? 'item' : 'itens'}</td>
                <td className="r mono" style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>{brl(rows.reduce((a: number, r: any) => a + r.saldo * r.cm, 0))}</td>
                <td style={{ borderTop: '2px solid #e2e8f0' }} />
                <td style={{ borderTop: '2px solid #e2e8f0' }} />
              </tr>
            </tfoot>
          )}
        </table>
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
  // categorias REAIS dos insumos (o grupo de COMPRA do Portal só tinha 1 = HORTIFRUTI; a categoria
  // é o que classifica de verdade). O filtro passa a usar categoria e o insumo vira campo de BUSCA.
  const categorias = useMemo(() => [...new Set((insumos as Insumo[]).map((i) => i.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [insumos])
  const listaInsumos = useMemo(() => { let l = insumos as Insumo[]; if (grupoFiltro) l = l.filter((i) => (i.categoria || '') === grupoFiltro); return l.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '')) }, [insumos, grupoFiltro])
  const valorTotal = num(qtd) * num(custo)

  // pré-preenche o custo com o PREÇO DA EMBALAGEM = preco_compra(por unid. estoque) × fator.
  // (o submit faz custoUnit = custo/fator; se pré-preencher com preco_compra puro, o custo médio despenca)
  const onInsumo = (id: string) => { setInsumoId(id); const i = insMap[id]; setUnidCompra(i?.unidade_compra || ''); setCusto(i?.preco_compra ? String(+((Number(i.preco_compra) || 0) * (num(fator) || 1)).toFixed(4)) : '') }
  const onFator = (f: string) => { setFator(f); if (insSel?.preco_compra) setCusto(String(+((Number(insSel.preco_compra) || 0) * (num(f) || 1)).toFixed(4))) }

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
      if (tipo === 'entrada') {
        const f = num(fator) || 1
        const c = num(custo)
        const fornNome = fornId ? (fornecedores as Forn[]).find((x) => x.id === fornId)?.nome || null : null
        const qtdEst = parseFloat((num(qtd) * f).toFixed(4))
        const custoUnit = parseFloat((c / f).toFixed(6))
        const { error } = await supabase.from('entradas_estoque').insert({ tenant_id: tenantId, loja_id: lojaId, insumo_id: insumoId, fornecedor_id: fornId || null, fornecedor_nome: fornNome, quantidade: qtdEst, unidade_compra: unidCompra.trim() || null, fator_conversao: f, custo_unitario: custoUnit, lote: lote.trim() || null, validade: validade || null, tipo: 'manual', observacao: obs.trim() || null, responsavel: usuario?.nome || null, criado_em: criadoEm })
        if (error) throw error
        const novaQtd = qtdAtual + qtdEst
        const pesoAnt = Math.max(0, qtdAtual)   // saldo negativo não pesa no custo médio (senão distorce)
        const novoCm = (pesoAnt + qtdEst) > 0 ? (pesoAnt * cmAtual + qtdEst * custoUnit) / (pesoAnt + qtdEst) : custoUnit
        const impacto = cmAtual > 0 ? parseFloat(((novoCm - cmAtual) / cmAtual * 100).toFixed(4)) : null
        await supabase.from('historico_custo').insert({ tenant_id: tenantId, insumo_id: insumoId, loja_id: lojaId, saldo_anterior: parseFloat(qtdAtual.toFixed(4)), custo_medio_anterior: parseFloat(cmAtual.toFixed(4)), qtd_entrada: parseFloat(qtdEst.toFixed(4)), custo_entrada: parseFloat(custoUnit.toFixed(4)), novo_custo_medio: parseFloat(novoCm.toFixed(6)), impacto_pct: impacto, origem: 'entrada_loja', documento_ref: null })
        const { error: eu } = await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, loja_id: lojaId, insumo_id: insumoId, quantidade: parseFloat(novaQtd.toFixed(4)), custo_medio: parseFloat(novoCm.toFixed(6)), atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,insumo_id,loja_id' })
        if (eu) throw eu
      } else {
        // ATÔMICO (M2/M3): saída (consumo) + débito do saldo com clamp em 0, numa transação com trava no banco.
        const { error } = await supabase.rpc('registrar_saida_estoque', { p_saida: {
          tenant_id: tenantId, loja_id: lojaId, insumo_id: insumoId, quantidade: num(qtd),
          tipo: 'consumo', motivo: obs.trim() || null, responsavel: usuario?.nome || null,
          criado_em: criadoEm, clamp_zero: true,
        } })
        if (error) throw error
      }
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
          <div><label style={lbl}>Grupo (filtro)</label><select className="p-field" style={{ width: '100%' }} value={grupoFiltro} onChange={(e) => { setGrupoFiltro(e.target.value); setInsumoId('') }}><option value="">Todos</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Unidade</label><input className="p-field" style={{ width: '100%', background: '#f1f5f9' }} readOnly value={unSel} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>Insumo *</label>
          <SearchSelect value={insSel?.nome || ''} placeholder="Buscar insumo…" options={[...new Set(listaInsumos.map((i) => i.nome || '').filter(Boolean))]} onChange={(nome) => { const found = listaInsumos.find((i) => (i.nome || '') === nome); onInsumo(found?.id || '') }} />
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
              <div><label style={lbl}>Fator conversão</label><input type="number" min="0" step="0.001" className="p-field" style={{ width: '100%', textAlign: 'right' }} value={fator} onChange={(e) => onFator(e.target.value)} /></div>
              <div><label style={lbl}>Custo da compra (R${unidCompra ? '/' + unidCompra : ''})</label><input type="number" min="0" step="0.01" className="p-field" style={{ width: '100%', textAlign: 'right' }} value={custo} onChange={(e) => setCusto(e.target.value)} /></div>
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

// ══════════════════════ SAÍDA EM LOTE ══════════════════════
// Baixa de vários insumos numa tela só (CEGA: não mostra saldo — igual à contagem do inventário).
// Você digita a saída dos itens que saíram e um clique grava tudo: saidas_estoque + abate o saldo.
function SaidaLote({ insumos, saldoMap, tenantId, lojaId, usuario, showToast, onSaved }: any) {
  const [data, setData] = useState(hojeStr())
  const [motivo, setMotivo] = useState('Consumo')
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [soSaldo, setSoSaldo] = useState(true)
  const [saida, setSaida] = useState<Record<string, string>>({})

  const categorias = useMemo(() => [...new Set((insumos as Insumo[]).map((i) => i.categoria).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [insumos])
  const lista = useMemo(() => {
    let l = (insumos as Insumo[]).filter((i) => i.ativo !== false)
    if (grupoFiltro) l = l.filter((i) => (i.categoria || '') === grupoFiltro)
    const b = busca.toLowerCase().trim()
    if (b) l = l.filter((i) => (i.nome || '').toLowerCase().includes(b))
    if (soSaldo) l = l.filter((i) => (Number(saldoMap[i.id]?.quantidade) || 0) > 0 || num(saida[i.id]) > 0)
    return l.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  }, [insumos, grupoFiltro, busca, soSaldo, saldoMap, saida])

  const comSaida = useMemo(() => (insumos as Insumo[]).filter((i) => num(saida[i.id]) > 0), [insumos, saida])
  const valTotal = comSaida.reduce((a, i) => a + num(saida[i.id]) * (Number(saldoMap[i.id]?.custo_medio) || 0), 0)

  const registrar = useMutation({
    mutationFn: async () => {
      const itens = comSaida.map((i) => ({ id: i.id, qtd: num(saida[i.id]) })).filter((x) => x.qtd > 0)
      if (!itens.length) throw new Error('Digite a saída de ao menos um item.')
      const criadoEm = data + 'T12:00:00.000Z'
      for (const it of itens) {
        // ATÔMICO (M2/M3): saída + débito do saldo (clamp em 0) numa transação com trava no banco.
        const { error } = await supabase.rpc('registrar_saida_estoque', { p_saida: {
          tenant_id: tenantId, loja_id: lojaId, insumo_id: it.id, quantidade: it.qtd,
          tipo: 'consumo', motivo, responsavel: usuario?.nome || null, criado_em: criadoEm, clamp_zero: true,
        } })
        if (error) throw error
      }
      return itens.length
    },
    onSuccess: (n) => { showToast(`${n} saída${n > 1 ? 's' : ''} registrada${n > 1 ? 's' : ''}!`); setSaida({}); onSaved() },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const setQ = (id: string, v: string) => setSaida((p) => ({ ...p, [id]: v }))

  return (
    <>
      <div className="pf-bar">
        <div className="pf-fld"><label>Data</label><input type="date" className="p-field" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div className="pf-fld"><label>Motivo</label><select className="p-field" value={motivo} onChange={(e) => setMotivo(e.target.value)}><option>Consumo</option><option>Perda / Quebra</option><option>Uso interno</option><option>Transferência</option></select></div>
        <div className="pf-fld"><label>Grupo</label><select className="p-field" value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)}><option value="">Todos</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="pf-fld" style={{ flex: 1, minWidth: 180 }}><label>Buscar item</label><input className="p-field" style={{ width: '100%' }} placeholder="Nome do insumo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <label className="pf-chk"><input type="checkbox" checked={soSaldo} onChange={(e) => setSoSaldo(e.target.checked)} />Só com saldo</label>
        <button className="p-btn p-btn-pri" style={{ marginLeft: 'auto' }} disabled={registrar.isPending || comSaida.length === 0} onClick={() => registrar.mutate()}>{registrar.isPending ? 'Registrando…' : `✓ Registrar saídas (${comSaida.length})`}</button>
      </div>

      <div className="p-card">
        <table className="p-tbl">
          <thead><tr><th style={{ width: 300 }}>Insumo</th><th style={{ width: 190 }}>Grupo</th><th style={{ width: 70 }}>Un.</th><th className="r" style={{ width: 130 }}>Saída</th><th aria-hidden="true"></th></tr></thead>
          <tbody>
            {!lista.length ? <tr><td colSpan={5} className="p-empty">Nenhum item no filtro.</td></tr>
              : lista.map((i: Insumo) => (
                <tr key={i.id} style={num(saida[i.id]) > 0 ? { background: '#fff7ed' } : undefined}>
                  <td style={{ fontWeight: 600 }}>{i.nome}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{i.categoria || '—'}</td>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{un(i)}</td>
                  <td className="r"><input inputMode="decimal" className="p-field" style={{ width: 110, height: 30, textAlign: 'right', fontFamily: 'DM Mono, monospace' }} placeholder="0,000" value={saida[i.id] ?? ''} onChange={(e) => setQ(i.id, e.target.value)} /></td>
                  <td aria-hidden="true"></td>
                </tr>
              ))}
          </tbody>
        </table>
        {comSaida.length > 0 && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', fontSize: 12.5, color: '#64748b', display: 'flex', gap: 18 }}>
            <span><b style={{ color: '#1e293b' }}>{comSaida.length}</b> {comSaida.length === 1 ? 'item' : 'itens'} com saída</span>
            <span>Total baixado: <b style={{ color: '#ea6a0a' }}>{brl(valTotal)}</b></span>
          </div>
        )}
      </div>
    </>
  )
}

// ══════════════════════ HISTÓRICO ══════════════════════
function Historico({ insumos, grupos, gruposItens, insMap, grupoNome, tenantId, lojaId, showToast }: any) {
  const qc = useQueryClient()
  const [de, setDe] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(hojeStr())
  const [grupo, setGrupo] = useState('')
  const [tipo, setTipo] = useState('saida')   // abre filtrando por Saída (é onde se edita/corrige)
  const [resp, setResp] = useState('')
  const [busca, setBusca] = useState('')
  const [periodo, setPeriodo] = useState('atual')
  const [aplicado, setAplicado] = useState<{ de: string; ate: string } | null>({ de: primeiroDiaMes(), ate: hojeStr() })
  const [nfeChave, setNfeChave] = useState<string | null>(null)   // NF-e aberta pelo clique no número (Observação)
  const [corr, setCorr] = useState<any | null>(null); const [corrQtd, setCorrQtd] = useState('')   // correção de saída
  // Corrigir SAÍDA: devolve a qtd errada e aplica a certa (delta no saldo; custo médio não muda em saída).
  const corrigirMut = useMutation({
    mutationFn: async () => {
      if (!corr) return
      const oldQty = Number(corr.quantidade) || 0
      const newQty = num(corrQtd)
      if (newQty < 0) throw new Error('Quantidade inválida.')
      const { data: sals } = await supabase.from('saldo_estoque').select('quantidade,custo_medio').eq('tenant_id', tenantId).eq('loja_id', lojaId).eq('insumo_id', corr.insumo_id)
      const qtdAtual = Number((sals ?? [])[0]?.quantidade) || 0
      const cmAtual = Number((sals ?? [])[0]?.custo_medio) || 0
      const saldoNovo = Math.max(0, qtdAtual + oldQty - newQty)
      if (newQty <= 0) { const { error } = await supabase.from('saidas_estoque').delete().eq('id', corr.id); if (error) throw error }
      else { const { error } = await supabase.from('saidas_estoque').update({ quantidade: newQty }).eq('id', corr.id); if (error) throw error }
      const { error: eu } = await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, loja_id: lojaId, insumo_id: corr.insumo_id, quantidade: parseFloat(saldoNovo.toFixed(4)), custo_medio: parseFloat(cmAtual.toFixed(6)), atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,insumo_id,loja_id' }); if (eu) throw eu
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pest-hist'] }); qc.invalidateQueries({ queryKey: ['pest-saldos'] }); setCorr(null); setCorrQtd(''); showToast('Lançamento corrigido!') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

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
    const linhas = lista.map((m: any) => { const ins = insMap[m.insumo_id]; const tp = _tipo(m); const qtd = (m._lado === 'entrada' ? 1 : -1) * (Number(m.quantidade) || 0); return [fmtDataHora(m.criado_em || m.created_at), tp, ins?.nome || '', grupoNome(m.insumo_id), qtd, un(ins), m.responsavel || '', (m.observacao || m.motivo || '')] })
    downloadCsv(`historico_movimentacoes_${hojeStr()}.csv`, [head, ...linhas])
  }

  return (
    <>
      <div className="pf-bar">
        <div className="pf-fld"><label>Período</label><select className="p-field" value={periodo} onChange={(e) => onPeriodo(e.target.value)}><option value="atual">Mês atual</option><option value="anterior">Mês anterior</option><option value="personalizado">Personalizado</option></select></div>
        <div className="pf-fld"><label>De</label><input type="date" className="p-field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Até</label><input type="date" className="p-field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('personalizado') }} /></div>
        <div className="pf-fld"><label>Grupo</label><select className="p-field" value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">Todos</option>{grupos.map((g: Grupo) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></div>
        <div className="pf-fld"><label>Tipo</label><select className="p-field" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="ajuste">Ajuste</option></select></div>
        <div className="pf-fld" style={{ flex: 1, minWidth: 160 }}><label>Buscar item</label><input className="p-field" style={{ width: '100%' }} placeholder="Nome do insumo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <button className="p-btn p-btn-pri" onClick={() => setAplicado({ de, ate })}>Atualizar</button>
        <button className="p-btn" onClick={exportar} style={{ marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      <div className="p-card">
        <table className="p-tbl p-tbl-grade">
          <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Insumo</th><th>Grupo</th><th className="r">Qtd.</th><th>Un.</th><th>Responsável</th><th>Observação</th><th className="c">Editar</th></tr></thead>
          <tbody>
            {isFetching ? <tr><td colSpan={9} className="p-empty">Carregando…</td></tr>
              : !lista.length ? <tr><td colSpan={9} className="p-empty">Nenhuma movimentação no período/filtros.</td></tr>
                : lista.map((m: any, idx: number) => { const ins = insMap[m.insumo_id]; const tp = _tipo(m); const pos = m._lado === 'entrada'; return (
                  <tr key={m.id || idx}>
                    <td className="mono" style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDataHora(m.criado_em || m.created_at)}</td>
                    <td><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: tp === 'entrada' ? '#dcfce7' : tp === 'saida' ? '#fee2e2' : '#dbeafe', color: tp === 'entrada' ? '#16a34a' : tp === 'saida' ? '#dc2626' : '#2563eb' }}>{tp === 'entrada' ? 'Entrada' : tp === 'saida' ? 'Saída' : 'Ajuste'}</span></td>
                    <td>{ins?.nome || '?'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{grupoNome(m.insumo_id)}</td>
                    <td className="r mono" style={{ color: pos ? '#16a34a' : '#dc2626' }}>{pos ? '+' : '-'}{fmtQtd(m.quantidade)}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{un(ins)}</td>
                    <td style={{ fontSize: 12, color: '#475569' }}>{m.responsavel || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{m.chave_acesso
                      ? <button onClick={() => setNfeChave(m.chave_acesso!)} title="Ver a nota fiscal" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}>{m.observacao || m.motivo || 'Ver NF-e'}</button>
                      : (m.observacao || m.motivo || '—')}</td>
                    <td className="c">{m._lado === 'saida' && m.tipo === 'consumo'
                      ? <button onClick={() => { setCorr(m); setCorrQtd(String(Number(m.quantidade) || '')) }} title="Editar esta saída" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 9px', fontSize: 11.5, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>Editar</button>
                      : null}</td>
                  </tr>
                ) })}
          </tbody>
        </table>
      </div>
      {nfeChave && <NfeModal chave={nfeChave} tenantId={tenantId} onClose={() => setNfeChave(null)} />}
      {corr && (
        <div onClick={() => setCorr(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(440px,100%)', boxShadow: '0 20px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid #eef1f6' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Editar saída</div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>{insMap[corr.insumo_id]?.nome || '—'} · saída atual de <b>{fmtQtd(corr.quantidade)} {un(insMap[corr.insumo_id])}</b></div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 5 }}>Quantidade correta <span style={{ color: '#94a3b8', fontWeight: 400 }}>(0 = apagar o lançamento)</span></label>
              <input type="number" min="0" step="0.001" className="p-field" style={{ width: '100%', textAlign: 'right', fontFamily: 'DM Mono, monospace' }} value={corrQtd} onChange={(e) => setCorrQtd(e.target.value)} autoFocus />
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8 }}>O saldo é ajustado pela diferença (devolve a errada, aplica a certa). Custo médio não muda em saída.</div>
            </div>
            <div style={{ padding: '12px 18px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="p-btn" onClick={() => setCorr(null)}>Cancelar</button>
              <button className="p-btn p-btn-pri" disabled={corrigirMut.isPending} onClick={() => corrigirMut.mutate()}>{corrigirMut.isPending ? 'Salvando…' : 'Salvar correção'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ══════════════════════ MODAL "ESPELHO DA NF-e" ══════════════════════
// Abre pelo clique no número da nota (Histórico). Busca a nota pela CHAVE de acesso
// (44 dígitos, guardada na entrada) + os itens. Mostra fornecedor, número e a lista de itens.
function fmtDataNfe(d?: string) { if (!d) return '—'; const s = String(d).slice(0, 10); const [y, m, dd] = s.split('-'); return (y && m && dd) ? `${dd}/${m}/${y}` : s }
function NfeModal({ chave, tenantId, onClose }: { chave: string; tenantId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-nfe', chave, tenantId], enabled: !!chave && !!tenantId,
    queryFn: async () => {
      const { data: nfe } = await supabase.from('nfe_recebidas').select('*').eq('tenant_id', tenantId).eq('chave_acesso', chave).limit(1).maybeSingle()
      if (!nfe) return { nfe: null as Record<string, unknown> | null, itens: [] as Record<string, unknown>[] }
      const { data: itens } = await supabase.from('nfe_itens').select('*').eq('nfe_id', (nfe as { id: string }).id).order('id')
      return { nfe: nfe as Record<string, unknown>, itens: (itens ?? []) as Record<string, unknown>[] }
    },
  })
  const nfe = data?.nfe as Record<string, any> | null | undefined
  const itens = (data?.itens ?? []) as Record<string, any>[]
  const totalItens = itens.reduce((a, it) => a + (Number(it.valor_total) || 0), 0)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(820px, 100%)', boxShadow: '0 20px 60px rgba(15,23,42,.35)', overflow: 'hidden' }}>
        <div style={{ background: '#14315f', color: '#fff', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Nota Fiscal Eletrônica</div>
          <button onClick={onClose} style={{ background: 'none', border: 0, color: '#cbd5e1', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Carregando nota…</div>
          : !nfe ? <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Não foi possível abrir esta nota (não encontrada ou sem permissão).</div>
          : <>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #eef1f6' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{nfe.nome_emitente || '—'}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>CNPJ {nfe.cnpj_emitente || '—'}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', marginTop: 10, fontSize: 12.5, color: '#334155' }}>
                <span><b>NF-e</b> {nfe.numero}/{nfe.serie}</span>
                <span><b>Emissão</b> {fmtDataNfe(nfe.data_emissao)}</span>
                <span><b>Valor total</b> <span style={{ color: '#0f766e', fontWeight: 700 }}>{brl(Number(nfe.valor_total) || 0)}</span></span>
              </div>
            </div>
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              <table className="p-tbl">
                <thead><tr><th style={{ width: 30 }}>#</th><th>Descrição</th><th className="r">Qtd</th><th>Un.</th><th className="r">V. Unit</th><th className="r">V. Total</th></tr></thead>
                <tbody>
                  {!itens.length ? <tr><td colSpan={6} className="p-empty">Nota sem itens detalhados.</td></tr>
                    : itens.map((it, i) => (
                      <tr key={String(it.id ?? i)}>
                        <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                        <td>{it.descricao_nfe || '—'}{it.codigo_item_fornecedor ? <span style={{ color: '#94a3b8', fontSize: 11 }}> · cód {it.codigo_item_fornecedor}</span> : null}</td>
                        <td className="r mono">{fmtQtd(it.quantidade)}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{String(it.unidade_nfe || '').toLowerCase()}</td>
                        <td className="r mono">{brl(Number(it.valor_unitario) || 0)}</td>
                        <td className="r mono">{brl(Number(it.valor_total) || 0)}</td>
                      </tr>
                    ))}
                </tbody>
                {itens.length > 0 && <tfoot><tr><td colSpan={5} className="r" style={{ fontWeight: 700, padding: '8px 10px', borderTop: '2px solid #e2e8f0' }}>Total dos itens</td><td className="r mono" style={{ fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>{brl(totalItens)}</td></tr></tfoot>}
              </table>
            </div>
          </>}
      </div>
    </div>
  )
}
