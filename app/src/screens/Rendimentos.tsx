import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { custoDoInsumo } from '../lib/cost'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Insumo = { id: string; nome?: string; unidade_medida?: string; unidade_compra?: string; preco_compra?: number; rendimento_pct?: number; ativo?: boolean }
type Teste = { id: string; insumo_id: string; peso_bruto?: number; peso_liquido?: number; rendimento_pct?: number; observacao?: string | null; criado_em?: string }
type Saldo = { insumo_id: string; loja_id?: string | null; custo_medio?: number }
type Vinc = { insumo_id: string; preco_unitario?: number }

const fmtKg = (v?: number | null) => (v == null || v === undefined) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg'
const fmtBRL = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const localDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-CA') : ''
const brDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function periodoRange(tipo: string): { de: string; ate: string } | null {
  const d = new Date()
  if (tipo === 'mes_atual') return { de: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, ate: d.toLocaleDateString('en-CA') }
  if (tipo === 'mes_anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); return { de: `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`, ate: l.toLocaleDateString('en-CA') } }
  return null
}

type Form = { insumo_id: string; peso_bruto: string; peso_liquido: string; observacao: string }
const novoForm = (): Form => ({ insumo_id: '', peso_bruto: '', peso_liquido: '', observacao: '' })

export function Rendimentos() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [fInsumo, setFInsumo] = useState('')
  const ini = periodoRange('mes_atual')!
  const [de, setDe] = useState(ini.de)
  const [ate, setAte] = useState(ini.ate)
  const [pag, setPag] = useState(1)
  const [porPag, setPorPag] = useState(10)
  const [modal, setModal] = useState<{ id: string | null; form: Form } | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3200) }

  const { data, isLoading } = useQuery({
    queryKey: ['rend', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const [insumos, testes, saldos, vinc] = await Promise.all([
        fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida,unidade_compra,preco_compra,rendimento_pct,ativo').eq('tenant_id', tenantId).order('nome').range(f, t)),
        fetchAll<Teste>((f, t) => supabase.from('testes_rendimento').select('id,insumo_id,peso_bruto,peso_liquido,rendimento_pct,observacao,criado_em').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).range(f, t)),
        fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,custo_medio').eq('tenant_id', tenantId).range(f, t)),
        fetchAll<Vinc>((f, t) => supabase.from('insumo_fornecedores').select('insumo_id,preco_unitario').eq('tenant_id', tenantId).range(f, t)),
      ])
      return { insumos, testes, saldos, vinc }
    },
  })

  const insumos = data?.insumos ?? []
  const testes = data?.testes ?? []
  const insMap = useMemo(() => { const m: Record<string, Insumo> = {}; insumos.forEach((i) => { m[i.id] = i }); return m }, [insumos])
  // custo por kg — custo médio do saldo, fallback preço de compra (mesma fonte do HTML)
  const custoKg = (id: string) => custoDoInsumo(id, null, { saldos: data?.saldos, insumos, vinculos: data?.vinc })

  // selects: só insumos ATIVOS (a lista inclui inativos só p/ resolver nome de testes antigos)
  const ativos = useMemo(() => insumos.filter((i) => i.ativo !== false), [insumos])
  const nomes = useMemo(() => ativos.map((i) => `${i.nome} (${i.unidade_medida || i.unidade_compra || 'kg'})`), [ativos])
  const nomeToId = useMemo(() => { const m: Record<string, string> = {}; ativos.forEach((i) => { m[`${i.nome} (${i.unidade_medida || i.unidade_compra || 'kg'})`] = i.id }); return m }, [ativos])
  const idToNome = useMemo(() => { const m: Record<string, string> = {}; ativos.forEach((i) => { m[i.id] = `${i.nome} (${i.unidade_medida || i.unidade_compra || 'kg'})` }); return m }, [ativos])

  const filtrado = useMemo(() => testes.filter((t) => {
    if (fInsumo && t.insumo_id !== fInsumo) return false
    const d = localDate(t.criado_em)
    if (de && d < de) return false
    if (ate && d > ate) return false
    return true
  }), [testes, fInsumo, de, ate])

  const totalPags = Math.max(1, Math.ceil(filtrado.length / porPag))
  const pagAtual = Math.min(pag, totalPags)
  const slice = filtrado.slice((pagAtual - 1) * porPag, (pagAtual - 1) * porPag + porPag)

  const setPeriodo = (tipo: string) => { const r = periodoRange(tipo); if (r) { setDe(r.de); setAte(r.ate); setPag(1) } else { setDe(''); setAte(''); setPag(1) } }

  const saveMut = useMutation({
    mutationFn: async ({ id, form }: { id: string | null; form: Form }) => {
      const insumoId = form.insumo_id
      const bruto = parseFloat(form.peso_bruto) || 0
      const liquido = parseFloat(form.peso_liquido) || 0
      if (!insumoId) throw new Error('Selecione um insumo.')
      if (bruto <= 0) throw new Error('Informe o peso bruto.')
      if (liquido <= 0) throw new Error('Informe o peso líquido.')
      if (liquido > bruto) throw new Error('Peso líquido não pode ser maior que o peso bruto.')
      const rendimento = parseFloat(((liquido / bruto) * 100).toFixed(4))
      const obs = form.observacao.trim() || null
      if (id) {
        const { error } = await supabase.from('testes_rendimento').update({ insumo_id: insumoId, peso_bruto: bruto, peso_liquido: liquido, rendimento_pct: rendimento, observacao: obs }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('testes_rendimento').insert({ tenant_id: tenantId, insumo_id: insumoId, peso_bruto: bruto, peso_liquido: liquido, rendimento_pct: rendimento, observacao: obs })
        if (error) throw error
      }
      // atualiza o rendimento_pct do insumo = média dos testes daquele insumo (inclui o recém-salvo)
      const outros = testes.filter((t) => t.insumo_id === insumoId && t.id !== id)
      const soma = outros.reduce((s, t) => s + (t.rendimento_pct || 0), 0) + rendimento
      const media = parseFloat((soma / (outros.length + 1)).toFixed(2))
      await supabase.from('insumos').update({ rendimento_pct: media }).eq('id', insumoId)
      return insumoId
    },
    onSuccess: (insumoId) => { qc.invalidateQueries({ queryKey: ['rend'] }); qc.invalidateQueries({ queryKey: ['insumos'] }); setModal(null); showToast(`Teste salvo · ${insMap[insumoId]?.nome || 'insumo'} atualizado`, 'ok') },
    onError: (e: Error) => showToast('Erro: ' + e.message, 'err'),
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('testes_rendimento').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rend'] }); showToast('Registro excluído.', 'ok') },
    onError: (e: Error) => showToast('Erro: ' + e.message, 'err'),
  })

  const excluir = (id: string) => { if (window.confirm('Excluir este registro de teste?')) delMut.mutate(id) }

  const exportarCSV = () => {
    if (!filtrado.length) { showToast('Nenhum registro para exportar.', 'err'); return }
    const header = ['Insumo', 'Data', 'Peso Bruto (kg)', 'Peso Líquido (kg)', 'Rendimento (%)', 'Perda (kg)', 'Perda (%)', 'Custo Real/kg', 'Custo Total Perda']
    const rows = filtrado.map((t) => {
      const nome = insMap[t.insumo_id]?.nome || '—'
      const rend = t.rendimento_pct || 0, bruto = t.peso_bruto || 0, liquido = t.peso_liquido || 0
      const perdaKg = bruto - liquido, perdaPct = bruto > 0 ? perdaKg / bruto * 100 : 0
      const cmKg = custoKg(t.insumo_id)
      const custoReal = cmKg > 0 && rend > 0 ? cmKg / (rend / 100) : null
      const custoPerda = cmKg > 0 ? perdaKg * cmKg : null
      return [`"${nome}"`, brDate(t.criado_em), bruto.toFixed(3), liquido.toFixed(3), rend.toFixed(1), perdaKg.toFixed(3), perdaPct.toFixed(1), custoReal != null ? custoReal.toFixed(2) : '', custoPerda != null ? custoPerda.toFixed(2) : ''].join(';')
    })
    const csv = '﻿' + header.join(';') + '\n' + rows.join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'rendimento_' + new Date().toLocaleDateString('en-CA') + '.csv'
    a.click()
    showToast('CSV exportado com sucesso.', 'ok')
  }

  // preview do modal
  const pv = useMemo(() => {
    if (!modal) return null
    const bruto = parseFloat(modal.form.peso_bruto) || 0, liquido = parseFloat(modal.form.peso_liquido) || 0
    if (bruto <= 0 || liquido <= 0) return null
    const rend = liquido / bruto * 100, perda = bruto - liquido
    const ins = insMap[modal.form.insumo_id]
    const cmKg = modal.form.insumo_id ? custoKg(modal.form.insumo_id) : 0
    const custoReal = cmKg > 0 && rend > 0 ? cmKg / (rend / 100) : null
    const custoAtual = cmKg > 0 && ins ? cmKg / ((ins.rendimento_pct || 100) / 100) : null
    const cor = rend >= 85 ? '#22c55e' : rend >= 70 ? '#f97316' : '#e11d48'
    return { rend, perda, custoReal, custoAtual, cor }
  }, [modal, insMap, data])

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field" style={{ minWidth: 200 }}>
          <label>Insumo</label>
          <SearchSelect value={fInsumo ? (idToNome[fInsumo] || '') : ''} onChange={(n) => { setFInsumo(n ? (nomeToId[n] || '') : ''); setPag(1) }} options={nomes} placeholder="Todos os insumos" />
        </div>
        <div className="ds-field">
          <label>Período</label>
          <select className="field" defaultValue="mes_atual" onChange={(e) => setPeriodo(e.target.value)} style={{ minWidth: 130 }}>
            <option value="periodo">Personalizado</option>
            <option value="mes_atual">Mês Atual</option>
            <option value="mes_anterior">Mês Anterior</option>
          </select>
        </div>
        <div className="ds-field">
          <label>De</label>
          <input type="date" className="field" value={de} onChange={(e) => { setDe(e.target.value); setPag(1) }} />
        </div>
        <div className="ds-field">
          <label>Até</label>
          <input type="date" className="field" value={ate} onChange={(e) => { setAte(e.target.value); setPag(1) }} />
        </div>
        <div className="ds-actions">
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{filtrado.length} registro{filtrado.length !== 1 ? 's' : ''}</span>
          <button className="btn-ghost" onClick={exportarCSV}>Exportar CSV</button>
          <button className="btn-primary" onClick={() => setModal({ id: null, form: novoForm() })}>+ Novo Teste</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Insumo</th><th>Data do Teste</th><th className="r">Peso Bruto</th><th className="r">Peso Líquido</th>
                <th className="r">Rendimento</th><th className="r">Perda (kg)</th><th className="r">Perda (%)</th>
                <th className="r">Custo Real/kg</th><th className="r">Custo Total da Perda</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <tr><td colSpan={10} className="empty">Carregando…</td></tr>
                : !slice.length
                  ? <tr><td colSpan={10} className="empty">Nenhum teste encontrado. Clique em "+ Novo Teste" para registrar.</td></tr>
                  : slice.map((t) => {
                    const rend = t.rendimento_pct || 0, bruto = t.peso_bruto || 0, liquido = t.peso_liquido || 0
                    const perdaKg = bruto - liquido, perdaPct = bruto > 0 ? perdaKg / bruto * 100 : 0
                    const cmKg = custoKg(t.insumo_id)
                    const custoReal = cmKg > 0 && rend > 0 ? cmKg / (rend / 100) : null
                    const custoPerda = cmKg > 0 ? perdaKg * cmKg : null
                    return (
                      <tr key={t.id}>
                        <td>{insMap[t.insumo_id]?.nome || '—'}</td>
                        <td className="mono">{brDate(t.criado_em)}</td>
                        <td className="r mono">{fmtKg(bruto)}</td>
                        <td className="r mono">{fmtKg(liquido)}</td>
                        <td className="r mono">{rend.toFixed(1)}%</td>
                        <td className="r mono">{fmtKg(perdaKg)}</td>
                        <td className="r mono">{perdaPct.toFixed(1)}%</td>
                        <td className="r mono">{custoReal != null ? fmtBRL(custoReal) : '—'}</td>
                        <td className="r mono">{custoPerda != null ? fmtBRL(custoPerda) : 'R$ 0,00'}</td>
                        <td>
                          <div className="rd-act">
                            <button onClick={() => setModal({ id: t.id, form: { insumo_id: t.insumo_id, peso_bruto: String(bruto), peso_liquido: String(liquido), observacao: t.observacao || '' } })}>Editar</button>
                            <button className="del" onClick={() => excluir(t.id)}>Excluir</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
        <div className="pag-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{filtrado.length ? `Mostrando ${(pagAtual - 1) * porPag + 1} a ${Math.min(pagAtual * porPag, filtrado.length)} de ${filtrado.length}` : 'Nenhum registro'}</span>
            <select className="field" style={{ height: 30, padding: '0 8px', fontSize: 12 }} value={porPag} onChange={(e) => { setPorPag(+e.target.value); setPag(1) }}>
              <option value={10}>10 por página</option><option value={25}>25 por página</option><option value={50}>50 por página</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button>
            {Array.from({ length: totalPags }, (_, i) => i + 1).filter((p) => totalPags <= 7 || Math.abs(p - pagAtual) <= 2 || p === 1 || p === totalPags).map((p, idx, arr) => (
              <span key={p} style={{ display: 'inline-flex', gap: 4 }}>
                {idx > 0 && p - arr[idx - 1] > 1 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
                <button className={'pag-btn' + (p === pagAtual ? ' active' : '')} onClick={() => setPag(p)}>{p}</button>
              </span>
            ))}
            <button className="pag-btn" disabled={pagAtual === totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
          </div>
        </div>
      </div>

      {modal && (
        <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="modal">
            <h2>{modal.id ? 'Editar Teste de Rendimento' : 'Novo Teste de Rendimento'}</h2>
            <div className="fg">
              <label>Insumo *</label>
              <SearchSelect value={modal.form.insumo_id ? (idToNome[modal.form.insumo_id] || '') : ''} onChange={(n) => setModal((m) => m && ({ ...m, form: { ...m.form, insumo_id: n ? (nomeToId[n] || '') : '' } }))} options={nomes} placeholder="Selecione o insumo..." />
            </div>
            <div className="row2">
              <div className="fg">
                <label>Peso Bruto (kg) *</label>
                <input type="number" min="0" step="0.001" placeholder="Ex: 5.000" value={modal.form.peso_bruto} onChange={(e) => setModal((m) => m && ({ ...m, form: { ...m.form, peso_bruto: e.target.value } }))} />
              </div>
              <div className="fg">
                <label>Peso Líquido (kg) *</label>
                <input type="number" min="0" step="0.001" placeholder="Ex: 4.250" value={modal.form.peso_liquido} onChange={(e) => setModal((m) => m && ({ ...m, form: { ...m.form, peso_liquido: e.target.value } }))} />
              </div>
            </div>
            {pv && (
              <div className="rd-prev">
                <div><div className="pl">Rendimento</div><div className="pv" style={{ color: pv.cor }}>{pv.rend.toFixed(1)}%</div></div>
                <div><div className="pl">Perda</div><div className="pv" style={{ color: '#e11d48' }}>{fmtKg(pv.perda)}</div></div>
                <div><div className="pl">Custo Real/kg</div><div className="pv" style={{ color: '#f97316' }}>{pv.custoReal != null ? fmtBRL(pv.custoReal) : '—'}</div></div>
                <div><div className="pl">Custo Atual/kg</div><div className="pv" style={{ color: '#64748b' }}>{pv.custoAtual != null ? fmtBRL(pv.custoAtual) : '—'}</div></div>
              </div>
            )}
            <div className="fg">
              <label>Observação</label>
              <textarea placeholder="Ex: lote com pouca perda, bom fornecedor..." value={modal.form.observacao} onChange={(e) => setModal((m) => m && ({ ...m, form: { ...m.form, observacao: e.target.value } }))} />
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={() => setModal(null)}>Cancelar</button>
              <div style={{ flex: 1 }} />
              <button className="btn-pri" disabled={saveMut.isPending} onClick={() => saveMut.mutate(modal)}>{saveMut.isPending ? 'Salvando…' : 'Salvar teste'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
