import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './fiscal.css'

type Nfe = { id: string; numero?: string; serie?: string; chave_acesso?: string; cnpj_emitente?: string; nome_emitente?: string; data_emissao?: string; data_integracao?: string; valor_total?: number; valor_titulo?: number; data_vencimento?: string; portador?: string; status?: string; loja_id?: string | null }
type Item = { id: string; nfe_id: string; descricao_nfe?: string; codigo_item_fornecedor?: string; quantidade?: number; unidade_nfe?: string; valor_unitario?: number; vinculacao_id?: string | null }
type Insumo = { id: string; nome: string; unidade_medida?: string; unidade_compra?: string; codigo_interno?: string }
type Forn = { id: string; nome: string; cnpj?: string; codigo?: string }
type IFV = { id: string; insumo_id: string; fornecedor_id?: string | null; descricao_fornecedor?: string; codigo_fornecedor?: string; embalagem_descricao?: string; qtd_por_embalagem?: number; preco_unitario?: number }
type Vinc = { id: string; descricao_nfe?: string; codigo_nfe?: string; insumo_id?: string; fator_conversao?: number }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtQ = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const fmtD = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—'
const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const DOT: Record<string, string> = { pendente: '#f59e0b', em_transito: '#f59e0b', aguard_vinculacao: '#dc2626', pronta: '#2563eb', processada: '#16a34a', com_erro: '#dc2626', recusada: '#94a3b8', cancelada: '#94a3b8' }
const G_PEND = ['pendente', 'em_transito'], G_PROC = ['pronta'], G_ERRO = ['aguard_vinculacao', 'com_erro'], G_CANC = ['cancelada', 'recusada']

function calcFator(desc: string): number | null {
  const d = desc.trim(); if (!d) return null
  const mult = d.replace(/,/g, '.').match(/(\d+\.?\d*)\s*[xX×]\s*(\d+\.?\d*)/)
  if (mult) return Math.round(parseFloat(mult[1]) * parseFloat(mult[2]) * 1000) / 1000
  const withU = d.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\s*$/i)
  if (withU) return Math.round(parseFloat(withU[1].replace(',', '.')) / 1000 * 1000) / 1000
  const nums = d.replace(/,/g, '.').match(/\d+\.?\d*/g)
  if (nums && nums.length) return parseFloat(nums[nums.length - 1])
  return 1
}

export function MonitorNfe() {
  const { tenantId } = useAuth()
  const { lojas, lojaId, setLojaId } = useLoja()
  const qc = useQueryClient()
  const now = new Date()
  const [fForn, setFForn] = useState('')
  const [periodo, setPeriodo] = useState('todos'); const [de, setDe] = useState(''); const [ate, setAte] = useState('')
  const [chkPend, setChkPend] = useState(true), [chkProc, setChkProc] = useState(true), [chkErro, setChkErro] = useState(true), [chkCanc, setChkCanc] = useState(false)
  const [tab, setTab] = useState<'nfe' | 'itens' | 'erros'>('nfe')
  const [sel, setSel] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [vinc, setVinc] = useState<Item | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000) }

  const { data: nfes = [], isLoading } = useQuery({ queryKey: ['mon-nfe', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Nfe>((f, t) => supabase.from('nfe_recebidas').select('*').eq('tenant_id', tenantId).order('data_emissao', { ascending: false }).range(f, t)) })
  const { data: insumos = [] } = useQuery({ queryKey: ['mon-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra,codigo_interno').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: fornecedores = [] } = useQuery({ queryKey: ['mon-forn', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('fornecedores').select('id,nome,cnpj,codigo').eq('tenant_id', tenantId); return (data ?? []) as Forn[] } })
  const { data: ifv = [] } = useQuery({ queryKey: ['mon-ifv', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<IFV>((f, t) => supabase.from('insumo_fornecedores').select('*').eq('tenant_id', tenantId).range(f, t)) })
  const { data: vinculos = [] } = useQuery({ queryKey: ['mon-vinc', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Vinc>((f, t) => supabase.from('vinculos_nfe').select('*').eq('tenant_id', tenantId).range(f, t)) })
  const { data: itens = [] } = useQuery({ queryKey: ['mon-itens', sel], enabled: !!sel, queryFn: async () => { const { data } = await supabase.from('nfe_itens').select('*').eq('nfe_id', sel).order('id'); return (data ?? []) as Item[] } })

  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l.nome])) as Record<string, string>, [lojas])
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const ifvMap = useMemo(() => Object.fromEntries(ifv.map((v) => [v.id, v])) as Record<string, IFV>, [ifv])
  const fornByCnpj = (cnpj?: string) => { const c = (cnpj || '').replace(/\D/g, ''); return fornecedores.find((f) => (f.cnpj || '').replace(/\D/g, '') === c) }
  const fornOpts = useMemo(() => { const m: Record<string, string> = {}; nfes.forEach((n) => { if (n.cnpj_emitente && n.nome_emitente) m[n.cnpj_emitente] = n.nome_emitente }); return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1])) }, [nfes])

  const inGroup = (st: string | undefined, g: string[]) => g.includes(st || '')
  const cnt = useMemo(() => ({
    pend: nfes.filter((n) => inGroup(n.status, G_PEND)).length,
    proc: nfes.filter((n) => inGroup(n.status, G_PROC)).length,
    erro: nfes.filter((n) => inGroup(n.status, G_ERRO)).length,
    canc: nfes.filter((n) => inGroup(n.status, G_CANC)).length,
  }), [nfes])

  const lista = useMemo(() => {
    const allowed = [...(chkPend ? G_PEND : []), ...(chkProc ? G_PROC : []), ...(chkErro ? G_ERRO : []), ...(chkCanc ? G_CANC : [])]
    return nfes.filter((n) => {
      if (!allowed.includes(n.status || '')) return false
      if (lojaId && (n.loja_id || null) !== lojaId) return false
      if (fForn && n.cnpj_emitente !== fForn) return false
      if (periodo !== 'todos') { if (de && (n.data_emissao || '') < de) return false; if (ate && (n.data_emissao || '') > ate + 'T23:59:59') return false }
      return true
    })
  }, [nfes, chkPend, chkProc, chkErro, chkCanc, lojaId, fForn, periodo, de, ate])

  const selNfe = nfes.find((n) => n.id === sel) || null
  const erros = itens.filter((i) => !i.vinculacao_id)
  const nErros = sel ? erros.length : lista.filter((n) => inGroup(n.status, G_ERRO)).length

  const setPreset = (v: string) => { setPeriodo(v); const d = new Date(); if (v === 'mes_atual') { setDe(isoD(new Date(d.getFullYear(), d.getMonth(), 1))); setAte(isoD(d)) } else if (v === 'mes_anterior') { setDe(isoD(new Date(d.getFullYear(), d.getMonth() - 1, 1))); setAte(isoD(new Date(d.getFullYear(), d.getMonth(), 0))) } else { setDe(''); setAte('') } }
  const limpar = () => { setFForn(''); setPreset('todos'); setChkPend(true); setChkProc(true); setChkErro(true); setChkCanc(false) }
  const toggleAll = (on: boolean) => setPicked(on ? new Set(lista.map((n) => n.id)) : new Set())
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const nSel = picked.size

  const abrirItem = (n: Nfe, t: 'itens' | 'erros') => { setSel(n.id); setTab(t) }
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null)

  // grava 1 entrada de NF-e: insere em entradas_estoque + recalcula saldo (média ponderada) + histórico + preço do vínculo
  async function registrarEntradaNfe(insId: string, loja: string, fornId: string | null, fornNome: string | undefined, dados: any) {
    const { error } = await supabase.from('entradas_estoque').insert({ tenant_id: tenantId, insumo_id: insId, loja_id: loja, fornecedor_id: fornId, fornecedor_nome: fornNome || null, ...dados })
    if (error) throw error
    const { data: sd } = await supabase.from('saldo_estoque').select('quantidade,custo_medio').eq('tenant_id', tenantId).eq('insumo_id', insId).eq('loja_id', loja).limit(1)
    const qA = sd?.[0]?.quantidade || 0, cmA = sd?.[0]?.custo_medio || 0, qN = qA + dados.quantidade
    const cmN = (qA > 0 && qN > 0) ? (qA * cmA + dados.quantidade * dados.custo_unitario) / qN : dados.custo_unitario
    await supabase.from('saldo_estoque').upsert({ tenant_id: tenantId, insumo_id: insId, loja_id: loja, quantidade: +qN.toFixed(4), custo_medio: +cmN.toFixed(6), atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,insumo_id,loja_id' })
    try { await supabase.from('historico_custo').insert({ tenant_id: tenantId, insumo_id: insId, loja_id: loja, saldo_anterior: +qA.toFixed(4), custo_medio_anterior: +cmA.toFixed(4), qtd_entrada: +dados.quantidade.toFixed(4), custo_entrada: +dados.custo_unitario.toFixed(4), novo_custo_medio: +cmN.toFixed(4), impacto_pct: cmA > 0 ? +(((cmN - cmA) / cmA) * 100).toFixed(4) : null, origem: 'nfe' }) } catch { /* opcional */ }
    if (fornId) { try { await supabase.from('insumo_fornecedores').update({ preco_unitario: +dados.custo_unitario.toFixed(6) }).eq('insumo_id', insId).eq('fornecedor_id', fornId) } catch { /* opcional */ } }
  }

  // processa 1 NF-e (gravação no estoque) — com trava anti-duplicação
  async function processarUma(n: Nfe): Promise<{ ok: boolean; msg?: string }> {
    if (n.status !== 'pronta') return { ok: false, msg: `NF-e ${n.numero}: não está "Pronta".` }
    const loja = n.loja_id || lojaId
    if (!loja) return { ok: false, msg: `NF-e ${n.numero}: sem loja (selecione uma loja no topo).` }
    const { data: its } = await supabase.from('nfe_itens').select('*').eq('nfe_id', n.id)
    const items = (its ?? []) as Item[]
    if (!items.length) return { ok: false, msg: `NF-e ${n.numero}: sem itens.` }
    // anti-duplicação (chave de acesso, senão número/série)
    let dup
    if (n.chave_acesso) dup = await supabase.from('entradas_estoque').select('id').eq('tenant_id', tenantId).eq('tipo', 'nfe').eq('chave_acesso', n.chave_acesso).limit(1)
    else dup = await supabase.from('entradas_estoque').select('id').eq('tenant_id', tenantId).eq('tipo', 'nfe').eq('nfe_numero', `${n.numero}/${n.serie}`).limit(1)
    if (dup.data && dup.data.length) { await supabase.from('nfe_recebidas').update({ status: 'processada', processada_em: new Date().toISOString() }).eq('id', n.id); return { ok: true, msg: `NF-e ${n.numero}: já estava no estoque (marcada processada).` } }
    const f = fornByCnpj(n.cnpj_emitente); const fornId = f?.id || null, fornNome = f?.nome || n.nome_emitente
    const dataStr = n.data_emissao ? new Date(n.data_emissao).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : new Date().toISOString().split('T')[0]
    let okItens = 0
    for (const it of items) {
      const v = it.vinculacao_id ? ifvMap[it.vinculacao_id] : null
      if (!v) continue
      const fator = v.qtd_por_embalagem || 1
      const qtdEst = +((it.quantidade || 0) * fator).toFixed(6)
      const custoUnit = +((it.valor_unitario || 0) / fator).toFixed(6)
      try {
        await registrarEntradaNfe(v.insumo_id, loja, fornId, fornNome, { quantidade: qtdEst, unidade_compra: it.unidade_nfe || null, fator_conversao: fator, custo_unitario: custoUnit, tipo: 'nfe', nfe_numero: `${n.numero}/${n.serie}`, chave_acesso: n.chave_acesso || null, observacao: `NF-e ${n.numero}/${n.serie}`, criado_em: dataStr + 'T12:00:00.000Z' })
        okItens++
      } catch (e) { console.warn('item falhou', it.descricao_nfe, e) }
    }
    if (okItens < items.length) { await supabase.rpc('estornar_nfe', { p_nfe_id: n.id }).then(() => {}, () => {}); return { ok: false, msg: `NF-e ${n.numero}: falha em ${items.length - okItens} item(ns), revertida.` } }
    await supabase.from('nfe_recebidas').update({ status: 'processada', processada_em: new Date().toISOString() }).eq('id', n.id)
    return { ok: true }
  }

  const invalidarTudo = () => qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /mon-|sald|entrad|inc-|est-|sai-|ent-/i.test(k) } })

  const processarSel = async (ids?: string[]) => {
    const notas = nfes.filter((n) => (ids || [...picked]).includes(n.id))
    if (!notas.length) return
    if (!confirm(`Processar ${notas.length} nota(s)? As entradas serão lançadas no estoque (média de custo recalculada).`)) return
    setBusy(true); setProg({ done: 0, total: notas.length })
    let ok = 0, fail = 0; const msgs: string[] = []
    for (let i = 0; i < notas.length; i++) { const r = await processarUma(notas[i]); if (r.ok) ok++; else { fail++; if (r.msg) msgs.push(r.msg) }; if (r.msg && r.ok) msgs.push(r.msg); setProg({ done: i + 1, total: notas.length }) }
    setPicked(new Set()); await invalidarTudo(); setBusy(false); setProg(null)
    showToast(`${ok} processada(s)${fail ? ` · ${fail} com problema` : ''}.`, fail ? 'err' : 'ok')
    if (msgs.length) console.warn('Monitor:\n' + msgs.join('\n'))
  }

  const excluirSel = async () => {
    if (!nSel) return
    if (!confirm(`Excluir ${nSel} nota(s) do Monitor? (não estorna o que já foi processado)`)) return
    setBusy(true)
    try { for (const id of picked) { await supabase.from('nfe_itens').delete().eq('nfe_id', id); await supabase.from('nfe_recebidas').delete().eq('id', id) } setPicked(new Set()); await invalidarTudo(); showToast(`${nSel} nota(s) excluída(s).`, 'ok') } catch (e: any) { showToast('Erro: ' + e.message, 'err') } finally { setBusy(false) }
  }
  void now

  return (
    <div className="fiscal-screen">
      <div className="mon-top">
        <div><div className="fh-title">Monitor NF-e</div><div className="fh-sub">Notas fiscais recebidas</div></div>
        <div className="mon-top-r">
          <span className="lbl-mini">Loja:</span>
          <select className="field" style={{ minWidth: 160 }} value={lojaId ?? ''} onChange={(e) => setLojaId(e.target.value || null)}><option value="">Todas as lojas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
          <button className="btn-g" onClick={() => qc.invalidateQueries({ queryKey: ['mon-nfe'] })}>↻ Atualizar</button>
          <button className="btn-xml" onClick={() => showToast('Upload de XML chega na Parte 2.', 'ok')}>⤓ Entrada por NF-e XML</button>
        </div>
      </div>

      <div className="f1">
        <div className="ds-field"><label>Fornecedor</label>
          <select className="field" style={{ minWidth: 200 }} value={fForn} onChange={(e) => setFForn(e.target.value)}><option value="">Todos</option>{fornOpts.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        </div>
        <div className="ds-field"><label>Período</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="field" style={{ minWidth: 130 }} value={periodo} onChange={(e) => setPreset(e.target.value)}><option value="todos">Todos</option><option value="mes_atual">Mês Atual</option><option value="mes_anterior">Mês Anterior</option><option value="periodo">Período</option></select>
            <input type="date" className="field" title="De" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('periodo') }} />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>até</span>
            <input type="date" className="field" title="Até" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('periodo') }} />
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}><button className="btn-g" onClick={limpar}>▽ Limpar filtros</button></div>
      </div>

      <div className="sit-row">
        <label className="sit-chip"><input type="checkbox" checked={chkPend} style={{ accentColor: '#f59e0b' }} onChange={(e) => setChkPend(e.target.checked)} /><span className="dot" style={{ background: '#f59e0b' }} />Pendente SEFAZ <span className="cnt" style={{ color: '#f59e0b' }}>({cnt.pend})</span></label>
        <label className="sit-chip"><input type="checkbox" checked={chkProc} style={{ accentColor: '#2563eb' }} onChange={(e) => setChkProc(e.target.checked)} /><span className="dot" style={{ background: '#2563eb' }} />Para processar <span className="cnt" style={{ color: '#2563eb' }}>({cnt.proc})</span></label>
        <label className="sit-chip"><input type="checkbox" checked={chkErro} style={{ accentColor: '#dc2626' }} onChange={(e) => setChkErro(e.target.checked)} /><span className="dot" style={{ background: '#dc2626' }} />Com Erro <span className="cnt" style={{ color: '#dc2626' }}>({cnt.erro})</span></label>
        <label className="sit-chip"><input type="checkbox" checked={chkCanc} style={{ accentColor: '#94a3b8' }} onChange={(e) => setChkCanc(e.target.checked)} /><span className="dot" style={{ background: '#94a3b8' }} />Cancelada <span className="cnt" style={{ color: '#94a3b8' }}>({cnt.canc})</span></label>
        <div className="act-r">
          <button className={'b-del' + (nSel ? ' on' : '')} disabled={!nSel || busy} onClick={excluirSel}>🗑 Excluir (<span>{nSel}</span>)</button>
          <button className={'b-proc' + (nSel ? ' on' : '')} disabled={!nSel || busy} onClick={() => processarSel()}>▷ {busy ? `Processando ${prog?.done ?? 0}/${prog?.total ?? 0}…` : `Processar selecionadas (${nSel})`}</button>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab-btn' + (tab === 'nfe' ? ' active' : '')} onClick={() => setTab('nfe')}>📄 DANFE <span className="tab-cnt">{lista.length}</span></button>
        <button className={'tab-btn' + (tab === 'itens' ? ' active' : '')} onClick={() => setTab('itens')}>≣ ITENS NF <span className="tab-cnt">{sel ? itens.length : 0}</span></button>
        <button className={'tab-btn' + (tab === 'erros' ? ' active' : '')} onClick={() => setTab('erros')}>⊙ ERROS <span className="tab-cnt">{nErros}</span></button>
      </div>

      {tab === 'nfe' && (
        <div className="tbl-wrap" style={{ marginTop: 12 }}><div className="tbl-scroll">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 36, textAlign: 'center' }}><input type="checkbox" className="chk" checked={lista.length > 0 && nSel === lista.length} onChange={(e) => toggleAll(e.target.checked)} /></th>
              <th className="c">Sit.</th><th className="r" style={{ width: 64 }}>Código</th><th>Fornecedor / Razão Social</th><th>Loja</th><th>DANFE</th><th className="c">Série</th><th>D. Emissão</th><th>D. Integração</th><th className="r">V. Total</th><th className="r">V. Título</th><th>D. Vencimento</th><th>Portador</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={13} className="empty">Carregando…</td></tr>
                : lista.length === 0 ? <tr><td colSpan={13} className="empty">Nenhuma NF-e nesta situação.</td></tr>
                : lista.map((n) => {
                  const forn = fornByCnpj(n.cnpj_emitente)
                  const isErro = inGroup(n.status, G_ERRO)
                  return (
                    <tr key={n.id} className={sel === n.id ? 'sel' : ''}>
                      <td className="c"><input type="checkbox" className="chk" checked={picked.has(n.id)} onChange={() => togglePick(n.id)} /></td>
                      <td className="c" title={n.status}><span className="stat-dot" style={{ background: DOT[n.status || ''] || '#94a3b8', cursor: isErro ? 'pointer' : 'default' }} onClick={isErro ? () => abrirItem(n, 'erros') : undefined} /></td>
                      <td className="r mono" style={{ color: '#64748b', fontSize: 12 }}>{forn?.codigo || '—'}</td>
                      <td className="fornec nfe-fornec" onClick={() => abrirItem(n, 'itens')} style={{ fontWeight: 600 }}>{n.nome_emitente || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{lojaMap[n.loja_id || ''] || '—'}</td>
                      <td><span className="nfe-num" onClick={() => abrirItem(n, 'itens')}>{n.numero || '—'}</span></td>
                      <td className="c mono" style={{ color: '#94a3b8' }}>{n.serie || '1'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtD(n.data_emissao)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtD(n.data_integracao)}</td>
                      <td className="r mono" style={{ fontWeight: 600 }}>{brl(n.valor_total)}</td>
                      <td className="r mono" style={{ color: '#64748b' }}>{n.valor_titulo ? brl(n.valor_titulo) : '—'}</td>
                      <td className="mono" style={{ fontSize: 12, color: '#64748b' }}>{n.data_vencimento ? fmtD(n.data_vencimento) : '—'}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{n.portador || '—'}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div></div>
      )}

      {tab === 'itens' && (
        <>
          <div className="det-bar"><span>📄</span><span>{selNfe ? `NF-e ${selNfe.numero}/${selNfe.serie} · ${selNfe.nome_emitente}` : 'Selecione uma NF-e na aba DANFE para ver os itens'}</span>{selNfe?.status === 'pronta' && <button className="btn-pri" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => processarSel([selNfe.id])}>▷ {busy ? `Processando ${prog?.done ?? 0}/${prog?.total ?? 0}…` : 'Processar esta nota'}</button>}</div>
          <div className="tbl-wrap"><div className="tbl-scroll">
            <table className="tbl">
              <thead><tr><th className="c">Seq.</th><th>Item Fornecedor</th><th>Descrição</th><th>Item Interno</th><th>Embalagem</th><th className="c">UM</th><th className="r">Q. na Emb.</th><th className="r">Q. de Embalagens</th><th className="r">V. Unitário</th><th className="r">V. Total</th><th className="r">Q. Estoque</th></tr></thead>
              <tbody>
                {!selNfe ? <tr><td colSpan={11} className="empty">Selecione uma NF-e na aba DANFE.</td></tr>
                  : itens.length === 0 ? <tr><td colSpan={11} className="empty">Sem itens.</td></tr>
                  : itens.map((it, i) => {
                    const v = it.vinculacao_id ? ifvMap[it.vinculacao_id] : null
                    const ins = v ? insMap[v.insumo_id] : null
                    const qEst = v ? (it.quantidade || 0) * (v.qtd_por_embalagem || 0) : null
                    return (
                      <tr key={it.id}>
                        <td className="c" style={{ color: '#94a3b8' }}>{i + 1}</td>
                        <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{it.codigo_item_fornecedor || '—'}</td>
                        <td>{it.descricao_nfe || '—'}</td>
                        <td className="mono">{ins ? (ins.codigo_interno || ins.nome) : <span style={{ color: '#dc2626' }}>—</span>}</td>
                        <td style={{ color: '#64748b' }}>{v?.embalagem_descricao || '—'}</td>
                        <td className="c">{it.unidade_nfe || '—'}</td>
                        <td className="r mono">{v ? fmtQ(v.qtd_por_embalagem) : '—'}</td>
                        <td className="r mono">{fmtQ(it.quantidade)}</td>
                        <td className="r mono">{brl(it.valor_unitario)}</td>
                        <td className="r mono">{brl((it.quantidade || 0) * (it.valor_unitario || 0))}</td>
                        <td className="r mono" style={{ fontWeight: 600 }}>{qEst != null ? `${fmtQ(qEst)} ${ins?.unidade_medida || ''}` : '—'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div></div>
        </>
      )}

      {tab === 'erros' && (
        <>
          <div className="det-bar" style={{ background: '#fff' }}><span>⚠</span><span>{selNfe ? `NF-e ${selNfe.numero}/${selNfe.serie} · ${selNfe.nome_emitente}` : 'Selecione uma NF-e na aba DANFE para ver os erros'}</span></div>
          <div className="tbl-wrap"><div className="tbl-scroll">
            <table className="tbl">
              <thead><tr><th>Produto NF-e</th><th>Cód. Fornecedor</th><th>Unidade</th><th className="r">Quantidade</th><th className="r">V. Unitário</th><th className="c">Ação</th></tr></thead>
              <tbody>
                {!selNfe ? <tr><td colSpan={6} className="empty">Selecione uma NF-e na aba DANFE.</td></tr>
                  : erros.length === 0 ? <tr><td colSpan={6} className="empty" style={{ color: '#16a34a' }}>✓ Todos os itens estão vinculados.</td></tr>
                  : erros.map((it) => (
                    <tr key={it.id}>
                      <td>{it.descricao_nfe || '—'}</td>
                      <td className="mono" style={{ fontSize: 11, color: '#64748b' }}>{it.codigo_item_fornecedor || '—'}</td>
                      <td>{it.unidade_nfe || '—'}</td>
                      <td className="r mono">{fmtQ(it.quantidade)}</td>
                      <td className="r mono">{brl(it.valor_unitario)}</td>
                      <td className="c"><button className="corrigir" onClick={() => setVinc(it)}>Corrigir</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div></div>
        </>
      )}

      {vinc && selNfe && <CorrigirItem item={vinc} nfe={selNfe} insumos={insumos} vinculos={vinculos} forn={fornByCnpj(selNfe.cnpj_emitente)} lojas={lojas} tenantId={tenantId!}
        onClose={() => setVinc(null)} onRefresh={() => qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey[0]; return typeof k === 'string' && /mon-/i.test(k) } })} onToast={showToast} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function CorrigirItem({ item, nfe, insumos, vinculos, forn, lojas, tenantId, onClose, onRefresh, onToast }: { item: Item; nfe: Nfe; insumos: Insumo[]; vinculos: Vinc[]; forn?: Forn; lojas: { id: string; nome: string }[]; tenantId: string; onClose: () => void; onRefresh: () => void; onToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [insId, setInsId] = useState('')
  const [embDesc, setEmbDesc] = useState('')
  const [qtEmb, setQtEmb] = useState('1')
  const [codForn, setCodForn] = useState(item.codigo_item_fornecedor || '')
  const [descr, setDescr] = useState(item.descricao_nfe || '')
  const [embPadrao, setEmbPadrao] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [busca, setBusca] = useState(''); const [pag, setPag] = useState(1); const pageSize = 20
  const [saving, setSaving] = useState(false)

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const insLabel = (i: Insumo) => (i.codigo_interno ? i.codigo_interno + ' — ' : '') + i.nome
  const insOptions = useMemo(() => insumos.map(insLabel), [insumos])
  const insByLabel = useMemo(() => new Map(insumos.map((i) => [insLabel(i), i.id])), [insumos])
  const insSel = insMap[insId]

  const { data: embOpts = [] } = useQuery({ queryKey: ['cor-emb', tenantId], queryFn: async () => { const { data } = await supabase.from('item_classificacoes').select('nome,tipo').eq('tenant_id', tenantId).eq('tipo', 'embalagem').order('nome'); return ((data ?? []) as any[]).map((e) => e.nome as string) } })
  const { data: fornVinc = [], refetch } = useQuery({ queryKey: ['cor-fv', forn?.id], enabled: !!forn?.id, queryFn: async () => { const { data } = await supabase.from('insumo_fornecedores').select('*').eq('tenant_id', tenantId).eq('fornecedor_id', forn!.id).order('id'); return (data ?? []) as IFV[] } })

  const q = Number(item.quantidade) || 0, f = parseFloat(qtEmb) || 0
  const onEmb = (val: string) => { setEmbDesc(val); const c = calcFator(val); if (c != null) setQtEmb(String(c)) }
  const reset = () => { setInsId(''); setEmbDesc(''); setQtEmb('1'); setCodForn(item.codigo_item_fornecedor || ''); setDescr(item.descricao_nfe || ''); setEmbPadrao(false); setEditId(null) }
  const editar = (v: IFV) => { setEditId(v.id); setInsId(v.insumo_id); setEmbDesc(v.embalagem_descricao || ''); setQtEmb(String(v.qtd_por_embalagem || 1)); setCodForn(v.codigo_fornecedor || ''); setDescr(v.descricao_fornecedor || ''); setEmbPadrao(!!(v as any).embalagem_padrao) }

  const salvar = async () => {
    if (!insId) return onToast('Selecione o item interno.', 'err')
    if (f <= 0) return onToast('Informe a Qt. na embalagem.', 'err')
    setSaving(true)
    try {
      const fornId = forn?.id || null
      const preco = f > 0 ? +((item.valor_unitario || 0) / f).toFixed(4) : null
      const body = { insumo_id: insId, embalagem_descricao: embDesc || null, qtd_por_embalagem: f, codigo_fornecedor: codForn || null, descricao_fornecedor: descr.trim() || null, embalagem_padrao: embPadrao, preco_unitario: preco }
      if (editId) {
        const { error } = await supabase.from('insumo_fornecedores').update(body).eq('id', editId); if (error) throw error
        onToast('Vínculo atualizado.', 'ok')
      } else {
        const existing = fornVinc.find((v) => v.insumo_id === insId && (codForn ? v.codigo_fornecedor === codForn : v.embalagem_descricao === embDesc))
        let vincId: string
        if (existing) { const { error } = await supabase.from('insumo_fornecedores').update(body).eq('id', existing.id); if (error) throw error; vincId = existing.id }
        else { const { data, error } = await supabase.from('insumo_fornecedores').insert({ tenant_id: tenantId, fornecedor_id: fornId, ...body }).select('id'); if (error) throw error; vincId = data![0].id }
        const ev = vinculos.find((v) => (item.codigo_item_fornecedor && v.codigo_nfe === item.codigo_item_fornecedor) || norm(v.descricao_nfe) === norm(item.descricao_nfe))
        if (ev) await supabase.from('vinculos_nfe').update({ insumo_id: insId, fator_conversao: f }).eq('id', ev.id)
        else await supabase.from('vinculos_nfe').insert({ tenant_id: tenantId, descricao_nfe: item.descricao_nfe, codigo_nfe: item.codigo_item_fornecedor || null, insumo_id: insId, fator_conversao: f })
        await supabase.from('nfe_itens').update({ vinculacao_id: vincId }).eq('id', item.id)
        const { data: upd } = await supabase.from('nfe_itens').select('vinculacao_id').eq('nfe_id', nfe.id)
        if (upd && upd.length > 0 && upd.every((x: any) => x.vinculacao_id)) await supabase.from('nfe_recebidas').update({ status: 'pronta' }).eq('id', nfe.id)
        onToast('Vínculo incluído e item vinculado!', 'ok')
      }
      await refetch(); onRefresh(); reset()
    } catch (e: any) { onToast('Erro: ' + e.message, 'err') } finally { setSaving(false) }
  }

  const excluir = async (v: IFV) => { if (!confirm('Excluir este vínculo?')) return; const { error } = await supabase.from('insumo_fornecedores').delete().eq('id', v.id); if (error) { onToast('Erro: ' + error.message, 'err'); return } await refetch(); onRefresh(); onToast('Vínculo excluído.', 'ok') }

  const filtrada = useMemo(() => { const b = busca.toLowerCase().trim(); return !b ? fornVinc : fornVinc.filter((v) => { const ins = insMap[v.insumo_id]; return (ins?.nome || '').toLowerCase().includes(b) || (ins?.codigo_interno || '').toLowerCase().includes(b) || (v.codigo_fornecedor || '').toLowerCase().includes(b) || (v.embalagem_descricao || '').toLowerCase().includes(b) }) }, [fornVinc, busca, insMap])
  const totalPags = Math.max(1, Math.ceil(filtrada.length / pageSize)), pagAtual = Math.min(pag, totalPags)
  const page = filtrada.slice((pagAtual - 1) * pageSize, pagAtual * pageSize)

  return (
    <div className="cor-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cor" onClick={(e) => e.stopPropagation()}>
        <div className="cor-hd">
          <div><h2>Corrigir item da NF-e</h2><div className="s">Vincule o item da nota fiscal a um item do seu estoque</div></div>
          <button className="cor-x" onClick={onClose}>✕</button>
        </div>

        <div className="cor-body">
          {/* fornecedor */}
          <div className="cor-card">
            <div className="cor-st">🏢 Dados do fornecedor</div>
            <div className="cor-forn">
              <div><div className="l">Código</div><div className="v">{forn?.codigo || '—'}</div></div>
              <div><div className="l">Nome</div><div className="v">{forn?.nome || nfe.nome_emitente || '—'}</div></div>
              <div><div className="l">CNPJ</div><div className="v" style={{ fontFamily: 'DM Mono, monospace' }}>{nfe.cnpj_emitente || '—'}</div></div>
              <div><div className="l">Telefone</div><div className="v">—</div></div>
            </div>
          </div>

          {/* vincular novo */}
          <div className="cor-card">
            <div className="cor-st">🔗 {editId ? 'Editar vínculo' : 'Vincular novo item'}</div>
            <div className="cor-r1">
              <div className="cor-fg"><label>Código</label><input className="mono" readOnly value={insSel?.codigo_interno || ''} placeholder="—" /></div>
              <div className="cor-fg"><label>Item interno (estoque) *</label><SearchSelect value={insSel ? insLabel(insSel) : ''} options={insOptions} placeholder="Pesquisar por código ou nome..." onChange={(lbl) => setInsId(insByLabel.get(lbl) || '')} /></div>
              <div className="cor-fg"><label>Un. controle *</label><input readOnly value={insSel?.unidade_medida || ''} placeholder="—" /></div>
              <div className="cor-fg"><label>Emb. (fornecedor) *</label><input list="cor-emb-list" value={embDesc} onChange={(e) => onEmb(e.target.value)} placeholder="Selecione ou digite..." /><datalist id="cor-emb-list">{embOpts.map((o) => <option key={o} value={o} />)}</datalist></div>
              <div className="cor-fg"><label>Qt. na emb. *</label><input className="mono" type="number" step="0.001" min="0" value={qtEmb} onChange={(e) => setQtEmb(e.target.value)} /></div>
            </div>
            <div className="cor-r2">
              <div className="cor-fg"><label>Código no fornecedor</label><input className="mono" value={codForn} onChange={(e) => setCodForn(e.target.value)} placeholder="(da NF-e)" /></div>
              <div className="cor-fg"><label>Descrição do item (NF-e)</label><input value={descr} onChange={(e) => setDescr(e.target.value)} /></div>
              <div className="cor-fg"><label>Valor unitário (NF-e)</label><input className="mono" readOnly value={brl(item.valor_unitario)} /></div>
              <label className="cor-chk"><input type="checkbox" checked={embPadrao} onChange={(e) => setEmbPadrao(e.target.checked)} /> Embalagem padrão deste fornecedor</label>
              <div className="cor-fg"><label>&nbsp;</label><div style={{ display: 'flex', gap: 8 }}>{editId && <button className="cor-back" style={{ height: 31 }} onClick={reset}>Cancelar</button>}<button className="cor-add" disabled={saving} onClick={salvar}>{saving ? 'Salvando…' : (editId ? 'Salvar vínculo' : '+ Incluir vínculo')}</button></div></div>
            </div>
            {f > 0 && insSel && <div className="cor-conv">{fmtQ(q)} {item.unidade_nfe || ''} × {fmtQ(f)} = {fmtQ(q * f)} {insSel.unidade_medida || ''} no estoque · Custo/un: {brl((item.valor_unitario || 0) / f)}</div>}
          </div>

          {/* tabela vínculos */}
          <div className="cor-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, flexWrap: 'wrap', gap: 10 }}>
              <div className="cor-st" style={{ margin: 0 }}>📋 Itens já vinculados a este fornecedor</div>
              <div className="cor-search"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><input placeholder="Pesquisar item..." value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} /></div>
            </div>
            <div className="cor-tbl"><div className="cor-tbl-sc">
              <table>
                <thead><tr><th>Item interno</th><th>Descrição do item</th><th>UM</th><th>Emb. (fornec.)</th><th>Cód. fornecedor</th><th className="r">Vl. unitário</th><th className="c">Emb. padrão</th><th>Empresas</th><th className="c">Ações</th></tr></thead>
                <tbody>
                  {!forn ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 18 }}>Fornecedor não cadastrado — vínculos não listados.</td></tr>
                    : page.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 18 }}>Nenhum vínculo encontrado.</td></tr>
                    : page.map((v) => { const ins = insMap[v.insumo_id]; return (
                      <tr key={v.id}>
                        <td className="mono">{ins?.codigo_interno || '—'}</td>
                        <td>{ins?.nome || '—'}</td>
                        <td>{ins?.unidade_medida || '—'}</td>
                        <td>{v.embalagem_descricao || '—'}</td>
                        <td className="mono">{v.codigo_fornecedor || '—'}</td>
                        <td className="r mono">{brl(v.preco_unitario)}</td>
                        <td className="c">{(v as any).embalagem_padrao ? <span className="cor-pad">★</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td><span className="cor-emp" onClick={() => onToast('Regras por loja: em breve.', 'ok')}>🏪 todas</span></td>
                        <td className="c"><button className="cor-ico" title="Editar" onClick={() => editar(v)}>✏️</button><button className="cor-ico del" title="Excluir" onClick={() => excluir(v)}>🗑️</button></td>
                      </tr>
                    ) })}
                </tbody>
              </table>
            </div></div>
            <div className="cor-pag">
              <span>{filtrada.length ? `Mostrando ${(pagAtual - 1) * pageSize + 1} a ${Math.min(pagAtual * pageSize, filtrada.length)} de ${filtrada.length.toLocaleString('pt-BR')} registros` : '0 registros'}</span>
              <div style={{ display: 'flex', gap: 4 }}><button className="pbtn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button><span className="pbtn on" style={{ borderColor: '#f97316' }}>{pagAtual}</span><button className="pbtn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button></div>
            </div>
          </div>

          {/* empresas */}
          <div className="cor-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 9 }}>
              <div><div className="cor-st" style={{ margin: 0 }}>🏢 Empresas vinculadas (regras de disponibilidade)</div><div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Defina em quais lojas este vínculo estará disponível. (Em breve — hoje vale para todas.)</div></div>
              <button className="cor-back" style={{ height: 32 }} onClick={() => onToast('Gerenciar empresas: em breve.', 'ok')}>⚙ Gerenciar empresas</button>
            </div>
            <div className="cor-emprow"><span className="cor-tag count">🏪 {lojas.length} loja(s)</span>{lojas.map((l) => <span key={l.id} className="cor-tag">{l.nome}</span>)}</div>
          </div>
        </div>

        <div className="cor-ft">
          <button className="cor-back" onClick={onClose}>‹ Voltar para a lista</button>
          <button className="cor-save" onClick={onClose}>Salvar correção</button>
        </div>
      </div>
    </div>
  )
}
