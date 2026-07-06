import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './config.css'

// Produção › Item de Porcionamento — define, para um insumo (matéria-prima),
// quais derivados ele gera (também insumos), com % rendimento de cada.
// É o que faz o insumo aparecer como "porcionável" na Ordem de Porcionamento.

type Insumo = { id: string; nome?: string; codigo_interno?: number; unidade_medida?: string; tipo_item?: string }
type Setor = { id: string; nome?: string }
type Item = { id: string; insumo_id: string; setor_id?: string | null; perda_pct?: number; ativo?: boolean }
type Deriv = { id?: string; item_porcionamento_id?: string; insumo_id: string; rendimento_pct?: number }
type FormD = { insumoId: string; rend: string }
type Form = { id?: string; insumoId: string; setorId: string; perda: string; ativo: boolean; derivados: FormD[] }

const fmtCod = (c?: number) => (c != null ? String(c).padStart(6, '0') : '')

export function ItemPorcionamento() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [form, setForm] = useState<Form | null>(null)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 6000 : 2600) }

  const { data: insumos = [] } = useQuery({ queryKey: ['ip-insumos', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome,codigo_interno,unidade_medida,tipo_item').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Insumo[] } })
  const { data: setores = [] } = useQuery({ queryKey: ['ip-setores', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('setores_producao').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Setor[] } })
  const { data: itens = [], isLoading, error: qErr } = useQuery({ queryKey: ['ip-itens', tenantId], enabled: !!tenantId, queryFn: async () => { const { data, error } = await supabase.from('itens_porcionamento').select('*').eq('tenant_id', tenantId); if (error) throw error; return (data ?? []) as Item[] } })
  const { data: derivados = [] } = useQuery({ queryKey: ['ip-derivados', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('itens_porcionamento_derivados').select('*').eq('tenant_id', tenantId); return (data ?? []) as Deriv[] } })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const insNomes = useMemo(() => insumos.map((i) => i.nome || ''), [insumos])
  const insByNome = useMemo(() => new Map(insumos.map((i) => [i.nome || '', i.id])), [insumos])
  const insMeta = useMemo(() => Object.fromEntries(insumos.map((i) => [i.nome || '', fmtCod(i.codigo_interno)])) as Record<string, string>, [insumos])
  const setorNome = useMemo(() => Object.fromEntries(setores.map((s) => [s.id, s.nome])) as Record<string, string>, [setores])
  const derivsOf = (itemId: string) => derivados.filter((d) => d.item_porcionamento_id === itemId)

  const novo = () => setForm({ insumoId: '', setorId: '', perda: '0', ativo: true, derivados: [{ insumoId: '', rend: '' }] })
  const editar = (it: Item) => setForm({ id: it.id, insumoId: it.insumo_id, setorId: it.setor_id ?? '', perda: String(it.perda_pct ?? 0), ativo: it.ativo !== false, derivados: derivsOf(it.id).map((d) => ({ insumoId: d.insumo_id, rend: String(d.rendimento_pct ?? 0) })) })

  const setD = (i: number, patch: Partial<FormD>) => setForm((f) => f ? { ...f, derivados: f.derivados.map((d, j) => j === i ? { ...d, ...patch } : d) } : f)
  const addD = () => setForm((f) => f ? { ...f, derivados: [...f.derivados, { insumoId: '', rend: '' }] } : f)
  const rmD = (i: number) => setForm((f) => f ? { ...f, derivados: f.derivados.filter((_, j) => j !== i) } : f)

  const saveMut = useMutation({
    mutationFn: async (fm: Form) => {
      if (!fm.insumoId) throw new Error('Selecione o item original (matéria-prima).')
      const ders = fm.derivados.filter((d) => d.insumoId)
      if (ders.length === 0) throw new Error('Adicione pelo menos um item derivado.')
      const body = { insumo_id: fm.insumoId, setor_id: fm.setorId || null, perda_pct: parseFloat(fm.perda.replace(',', '.')) || 0, ativo: fm.ativo }
      let itemId = fm.id
      if (itemId) { const { error } = await supabase.from('itens_porcionamento').update(body).eq('id', itemId); if (error) throw error }
      else { const { data, error } = await supabase.from('itens_porcionamento').insert({ ...body, tenant_id: tenantId }).select('id').single(); if (error) throw error; itemId = (data as { id: string }).id }
      const rows = ders.map((d) => ({ tenant_id: tenantId, item_porcionamento_id: itemId, insumo_id: d.insumoId, rendimento_pct: parseFloat(d.rend.replace(',', '.')) || 0 }))
      // insere os NOVOS antes de apagar os antigos: se o insert falhar, os derivados existentes
      // não são perdidos. Depois apaga todos os antigos (tudo desse item, menos os recém-inseridos).
      const { data: ins, error } = await supabase.from('itens_porcionamento_derivados').insert(rows).select('id'); if (error) throw error
      const novos = (ins ?? []).map((r: { id: string }) => r.id)
      let delQ = supabase.from('itens_porcionamento_derivados').delete().eq('item_porcionamento_id', itemId)
      if (novos.length) delQ = delQ.not('id', 'in', '(' + novos.join(',') + ')')
      const { error: delErr } = await delQ; if (delErr) throw delErr
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ip-itens'] }); qc.invalidateQueries({ queryKey: ['ip-derivados'] }); setForm(null); showToast('Item de porcionamento salvo.') },
    onError: (e: Error) => { console.error('[ItemPorcionamento]', e); showToast('Erro: ' + e.message, true) },
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('itens_porcionamento').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ip-itens'] }); qc.invalidateQueries({ queryKey: ['ip-derivados'] }); setForm(null); showToast('Excluído.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const somaRend = form ? form.derivados.reduce((a, d) => a + (parseFloat(d.rend.replace(',', '.')) || 0), 0) : 0
  const perdaNum = form ? (parseFloat(form.perda.replace(',', '.')) || 0) : 0
  const total = somaRend + perdaNum

  return (
    <div className="cfg-screen">
      <div className="usr-top">
        <div className="t">Define quais <b>derivados</b> cada matéria-prima gera (ex.: Salmão → Filé, Pele, Aparas). Original e derivados são <b>insumos já cadastrados</b>. É isso que "liga" o item pra aparecer na Ordem de Porcionamento.</div>
        <button className="cfg-btn pri" onClick={novo}>+ Novo</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, alignItems: 'start' }}>
        {/* LISTA */}
        <div className="cfg-card">
          {isLoading ? <div className="empty">Carregando…</div>
            : qErr ? <div className="empty" style={{ color: '#b91c1c' }}>Erro: {(qErr as Error).message}</div>
              : itens.length === 0 ? <div className="empty">Nenhum item. Clique em “+ Novo”.</div>
                : (
                  <table>
                    <thead><tr><th>Item original</th><th className="c">Derivados</th></tr></thead>
                    <tbody>
                      {itens.map((it) => (
                        <tr key={it.id} style={{ cursor: 'pointer', background: form?.id === it.id ? '#fff7ed' : undefined }} onClick={() => editar(it)}>
                          <td>{insMap[it.insumo_id]?.nome || '—'}{it.ativo === false ? <span className="muted"> (inativo)</span> : null}</td>
                          <td className="c mono">{derivsOf(it.id).length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </div>

        {/* FORM */}
        {!form ? (
          <div className="cfg-card"><div className="empty">Selecione um item à esquerda ou clique em “+ Novo”.</div></div>
        ) : (
          <div className="cfg-card">
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 120px 120px', gap: 12, alignItems: 'end', marginBottom: 14 }}>
                <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Item original (matéria-prima) *</label>
                  <SearchSelect value={insMap[form.insumoId]?.nome || ''} options={insNomes} meta={insMeta} placeholder="Selecione o insumo…" onChange={(nm) => setForm({ ...form, insumoId: insByNome.get(nm) || '' })} />
                </div>
                <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Setor de Produção</label><select value={form.setorId} onChange={(e) => setForm({ ...form, setorId: e.target.value })}><option value="">—</option>{setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></div>
                <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Perda esperada (%)</label><input value={form.perda} onChange={(e) => setForm({ ...form, perda: e.target.value })} /></div>
                <div className="cfg-fg" style={{ marginBottom: 0 }}><label>Situação</label><select value={form.ativo ? '1' : '0'} onChange={(e) => setForm({ ...form, ativo: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select></div>
              </div>

              <div className="cfg-card">
                <table>
                  <thead><tr><th>Item derivado <span className="muted" style={{ fontWeight: 400 }}>(insumo cadastrado)</span></th><th className="c" style={{ width: 60 }}>Un.</th><th className="r" style={{ width: 130 }}>% Rendimento</th><th style={{ width: 40 }}></th></tr></thead>
                  <tbody>
                    {form.derivados.map((d, i) => (
                      <tr key={i}>
                        <td><SearchSelect value={insMap[d.insumoId]?.nome || ''} options={insNomes} meta={insMeta} placeholder="Selecione o derivado…" onChange={(nm) => setD(i, { insumoId: insByNome.get(nm) || '' })} /></td>
                        <td className="c muted">{insMap[d.insumoId]?.unidade_medida || '—'}</td>
                        <td className="r"><input value={d.rend} onChange={(e) => setD(i, { rend: e.target.value })} style={{ width: 90, height: 28, border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right', padding: '0 8px', fontFamily: 'DM Mono, monospace' }} /></td>
                        <td className="c"><button className="act del" onClick={() => rmD(i)} title="Remover">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={2} style={{ padding: '6px 12px', background: '#f8fafc', fontWeight: 700 }}>Rendimento {somaRend.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% + perda {perdaNum}% = <span style={{ color: Math.abs(total - 100) < 0.01 ? '#166534' : '#b45309' }}>{total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</span></td><td colSpan={2} style={{ background: '#f8fafc' }} /></tr></tfoot>
                </table>
                <div style={{ padding: 8 }}><button className="cfg-btn" onClick={addD}>+ Adicionar derivado</button></div>
              </div>

              {Math.abs(total - 100) > 0.01 && <div className="p-hint" style={{ marginTop: 8, color: '#b45309' }}>Dica: rendimentos dos derivados + perda deveriam somar 100% (agora {total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%).</div>}

              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {form.id && <button className="cfg-btn danger" onClick={() => { if (confirm('Excluir este item de porcionamento?')) delMut.mutate(form.id!) }}>Excluir</button>}
                <button className="cfg-btn" onClick={() => setForm(null)}>Cancelar</button>
                <button className="cfg-btn pri" disabled={saveMut.isPending} onClick={() => saveMut.mutate(form)}>{saveMut.isPending ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
