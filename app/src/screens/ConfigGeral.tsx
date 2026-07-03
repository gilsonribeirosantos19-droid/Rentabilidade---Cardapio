import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import './config.css'

// Configurações › Geral — cadastros auxiliares (CRUD real no Supabase).
// item_classificacoes (tipo_item/familia/grupo/subgrupo/embalagem), unidades_medida,
// categorias (ficha), grupos_compra (+ grupos_compra_itens) e lojas.

type Row = { id: string; nome?: string; created_at?: string; abreviacao?: string; tipo?: string; razao_social?: string; cnpj?: string; endereco?: string; horario_manha?: string; horario_tarde?: string }
type CadKey = 'tipo_item' | 'familia' | 'grupo' | 'subgrupo' | 'embalagem' | 'unidade' | 'cat_ficha' | 'grupo_compra' | 'loja'

type Cad = { key: CadKey; label: string; table: string; clsfTipo?: string; special?: 'unidade' | 'loja' | 'grupo_compra' }
const CADS: Cad[] = [
  { key: 'loja', label: 'Lojas / Filiais', table: 'lojas', special: 'loja' },
  { key: 'grupo_compra', label: 'Grupos de Compra', table: 'grupos_compra', special: 'grupo_compra' },
  { key: 'unidade', label: 'Unidades de Medida', table: 'unidades_medida', special: 'unidade' },
  { key: 'cat_ficha', label: 'Categorias de Fichas', table: 'categorias' },
  { key: 'tipo_item', label: 'Tipo do Item', table: 'item_classificacoes', clsfTipo: 'tipo_item' },
  { key: 'familia', label: 'Família', table: 'item_classificacoes', clsfTipo: 'familia' },
  { key: 'grupo', label: 'Grupo (Categoria)', table: 'item_classificacoes', clsfTipo: 'grupo' },
  { key: 'subgrupo', label: 'Subgrupo', table: 'item_classificacoes', clsfTipo: 'subgrupo' },
  { key: 'embalagem', label: 'Embalagens Fornecedor', table: 'item_classificacoes', clsfTipo: 'embalagem' },
]

const fmtData = (d?: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
type Modal = { key: CadKey; id?: string; nome: string; abrev: string; razao: string; cnpj: string; ende: string; hm: string; ht: string }
type GModal = { id?: string; nome: string; sel: Set<string> }

export function ConfigGeral() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [open, setOpen] = useState<Set<CadKey>>(new Set(['loja']))
  const [modal, setModal] = useState<Modal | null>(null)
  const [gModal, setGModal] = useState<GModal | null>(null)
  const [del, setDel] = useState<{ table: string; id: string; nome: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [insBusca, setInsBusca] = useState('')
  const [checando, setChecando] = useState<string | null>(null)

  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 8000 : 2600) }
  const invalidar = () => qc.invalidateQueries({ queryKey: ['cfg'] })

  const useCfg = (table: string, filtro?: (q: ReturnType<typeof supabase.from>) => unknown) =>
    useQuery({
      queryKey: ['cfg', table, tenantId], enabled: !!tenantId,
      queryFn: async () => {
        let q = supabase.from(table).select('*').eq('tenant_id', tenantId)
        if (filtro) q = filtro(q as never) as typeof q
        const { data, error } = await q.order('nome')
        if (error) throw error
        return (data ?? []) as Row[]
      },
    })

  const clsf = useCfg('item_classificacoes')
  const unid = useCfg('unidades_medida')
  const cat = useCfg('categorias', (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq('tipo', 'ficha'))
  const gc = useCfg('grupos_compra')
  const lojas = useCfg('lojas')
  const insumos = useQuery({
    queryKey: ['cfg', 'insumos-sel', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Row[] },
  })
  const gcItens = useQuery({
    queryKey: ['cfg', 'grupos_compra_itens', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('grupos_compra_itens').select('grupo_id,insumo_id').eq('tenant_id', tenantId); return (data ?? []) as { grupo_id: string; insumo_id: string }[] },
  })

  const rowsFor = (c: Cad): Row[] => {
    if (c.clsfTipo) return (clsf.data ?? []).filter((r) => r.tipo === c.clsfTipo)
    if (c.key === 'unidade') return unid.data ?? []
    if (c.key === 'cat_ficha') return cat.data ?? []
    if (c.key === 'grupo_compra') return gc.data ?? []
    if (c.key === 'loja') return lojas.data ?? []
    return []
  }

  const cadsFiltrados = useMemo(() => { const q = busca.trim().toLowerCase(); return q ? CADS.filter((c) => c.label.toLowerCase().includes(q)) : CADS }, [busca])
  const toggleOpen = (k: CadKey) => setOpen((p) => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s })

  // ---- salvar (genérico) ----
  const saveMut = useMutation({
    mutationFn: async (m: Modal) => {
      const c = CADS.find((x) => x.key === m.key)!
      const nome = m.nome.trim()
      if (!nome) throw new Error('Informe o nome.')
      const body: Record<string, unknown> = { nome }
      if (c.special === 'unidade') body.abreviacao = m.abrev.trim() || null
      if (c.special === 'loja') { body.razao_social = m.razao.trim() || null; body.cnpj = m.cnpj.trim() || null; body.endereco = m.ende.trim() || null; body.horario_manha = m.hm.trim() || null; body.horario_tarde = m.ht.trim() || null }
      if (m.id) {
        const { error } = await supabase.from(c.table).update(body).eq('id', m.id); if (error) throw error
      } else {
        if (c.clsfTipo) { body.tipo = c.clsfTipo; body.ativo = true }
        if (c.key === 'cat_ficha') body.tipo = 'ficha'
        if (c.key === 'grupo_compra' || c.key === 'loja') body.ativo = true
        const { error } = await supabase.from(c.table).insert({ ...body, tenant_id: tenantId }); if (error) throw error
      }
    },
    onSuccess: () => { invalidar(); setModal(null); showToast('Salvo.') },
    onError: (e: Error) => { console.error('[ConfigGeral] erro ao salvar:', e); showToast('Erro ao salvar: ' + e.message, true) },
  })

  // ---- salvar grupo de compra (+ itens) ----
  const gSaveMut = useMutation({
    mutationFn: async (g: GModal) => {
      const nome = g.nome.trim(); if (!nome) throw new Error('Informe o nome do grupo.')
      let grupoId = g.id
      if (grupoId) {
        const { error } = await supabase.from('grupos_compra').update({ nome }).eq('id', grupoId); if (error) throw error
      } else {
        const { data, error } = await supabase.from('grupos_compra').insert({ nome, ativo: true, tenant_id: tenantId }).select('id').single(); if (error) throw error
        grupoId = (data as { id: string }).id
      }
      await supabase.from('grupos_compra_itens').delete().eq('grupo_id', grupoId)
      if (g.sel.size) {
        const rows = [...g.sel].map((insumo_id) => ({ tenant_id: tenantId, grupo_id: grupoId, insumo_id }))
        const { error } = await supabase.from('grupos_compra_itens').insert(rows); if (error) throw error
      }
    },
    onSuccess: () => { invalidar(); setGModal(null); showToast('Grupo salvo.') },
    onError: (e: Error) => showToast(e.message, true),
  })

  const delMut = useMutation({
    mutationFn: async (d: { table: string; id: string }) => { const { error } = await supabase.from(d.table).delete().eq('id', d.id); if (error) throw error },
    onSuccess: () => { invalidar(); setDel(null); showToast('Excluído.') },
    onError: (e: Error) => showToast(e.message, true),
  })

  const novo = (c: Cad) => {
    if (c.special === 'grupo_compra') { setGModal({ nome: '', sel: new Set() }); setInsBusca(''); return }
    setModal({ key: c.key, nome: '', abrev: '', razao: '', cnpj: '', ende: '', hm: '', ht: '' })
  }
  const editar = (c: Cad, r: Row) => {
    if (c.special === 'grupo_compra') {
      const sel = new Set((gcItens.data ?? []).filter((x) => x.grupo_id === r.id).map((x) => x.insumo_id))
      setGModal({ id: r.id, nome: r.nome ?? '', sel }); setInsBusca(''); return
    }
    setModal({ key: c.key, id: r.id, nome: r.nome ?? '', abrev: r.abreviacao ?? '', razao: r.razao_social ?? '', cnpj: r.cnpj ?? '', ende: r.endereco ?? '', hm: r.horario_manha ?? '', ht: r.horario_tarde ?? '' })
  }

  // ---- verifica se o cadastro está em uso antes de permitir excluir ----
  const cnt = async (table: string, build: (q: any) => any): Promise<number> => {
    try { const { count, error } = await build(supabase.from(table).select('*', { count: 'exact', head: true })); if (error) return 0; return count || 0 } catch { return 0 }
  }
  const contarUso = async (c: Cad, r: Row): Promise<{ qtd: number; onde: string }> => {
    const nome = r.nome ?? ''
    const T = (q: any) => q.eq('tenant_id', tenantId)
    switch (c.key) {
      case 'tipo_item': return { qtd: await cnt('insumos', (q) => T(q).eq('tipo_item', nome)), onde: 'insumo(s)' }
      case 'familia': return { qtd: await cnt('insumos', (q) => T(q).eq('familia', nome)), onde: 'insumo(s)' }
      case 'grupo': return { qtd: await cnt('insumos', (q) => T(q).eq('categoria', nome)), onde: 'insumo(s)' }
      case 'subgrupo': return { qtd: await cnt('insumos', (q) => T(q).eq('subgrupo', nome)), onde: 'insumo(s)' }
      case 'embalagem': return { qtd: await cnt('insumo_fornecedores', (q) => T(q).eq('embalagem_descricao', nome)), onde: 'vínculo(s) de fornecedor' }
      case 'cat_ficha': return { qtd: await cnt('fichas_tecnicas', (q) => T(q).eq('categoria', nome)), onde: 'ficha(s)' }
      case 'unidade': {
        const vals = [nome, r.abreviacao].filter(Boolean) as string[]
        const a = await cnt('insumos', (q) => T(q).in('unidade_medida', vals))
        const b = await cnt('insumos', (q) => T(q).in('unidade_compra', vals))
        return { qtd: a + b, onde: 'insumo(s)' }
      }
      case 'grupo_compra': return { qtd: await cnt('grupos_compra_itens', (q) => q.eq('grupo_id', r.id)), onde: 'item(ns) no grupo' }
      case 'loja': {
        let total = 0
        for (const t of ['saldo_estoque', 'entradas', 'saidas', 'usuarios', 'nfe_recebidas']) total += await cnt(t, (q) => T(q).eq('loja_id', r.id))
        return { qtd: total, onde: 'movimentação(ões)/usuário(s)' }
      }
      default: return { qtd: 0, onde: '' }
    }
  }
  const pedirExcluir = async (c: Cad, r: Row) => {
    if (checando) return
    setChecando(r.id)
    try {
      const { qtd, onde } = await contarUso(c, r)
      if (qtd > 0) { showToast(`Não é possível excluir "${r.nome}": ${qtd} ${onde} ${qtd > 1 ? 'usam' : 'usa'} este cadastro. Reclassifique ou remova o uso antes.`, true); return }
      setDel({ table: c.table, id: r.id, nome: r.nome ?? '' })
    } finally { setChecando(null) }
  }

  const modalCad = modal ? CADS.find((c) => c.key === modal.key)! : null
  const insFiltrados = useMemo(() => { const q = insBusca.trim().toLowerCase(); return (insumos.data ?? []).filter((i) => !q || (i.nome ?? '').toLowerCase().includes(q)) }, [insumos.data, insBusca])

  return (
    <div className="cfg-screen">
      <div className="cfg-top">
        <input className="cfg-search" placeholder="Buscar configuração..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="cfg-grid">
        {cadsFiltrados.map((c) => {
          const rows = rowsFor(c)
          const aberto = open.has(c.key)
          return (
            <div className="cfg-card" key={c.key}>
              <div className={'ch' + (aberto ? ' open' : '')} onClick={() => toggleOpen(c.key)}>
                <span className="car">▶</span>
                <span className="ti">{c.label}</span>
                <span className="cnt">{rows.length}</span>
                <button className="add" onClick={(e) => { e.stopPropagation(); novo(c) }}>+ Adicionar</button>
              </div>
              {aberto && (
                <div className="cb">
                  {rows.length === 0 ? <div className="empty">Nenhum registro.</div> : (
                    <table>
                      <thead><tr><th>Nome</th><th>Criado em</th><th className="r">Ações</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.nome}{c.special === 'unidade' && r.abreviacao ? <span className="muted"> ({r.abreviacao})</span> : null}{c.special === 'loja' && r.cnpj ? <span className="muted mono"> · {r.cnpj}</span> : null}</td>
                            <td className="muted">{fmtData(r.created_at)}</td>
                            <td className="r">
                              <button className="act" onClick={() => editar(c, r)}>Editar</button>
                              <button className="act del" disabled={checando === r.id} onClick={() => pedirExcluir(c, r)}>{checando === r.id ? 'Verificando…' : 'Excluir'}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ===== modal genérico ===== */}
      {modal && modalCad && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className={'cfg-modal' + (modalCad.special === 'loja' ? ' wide' : '')}>
            <div className="mh"><h2>{modal.id ? 'Editar' : 'Novo'} — {modalCad.label}</h2><button className="mx" onClick={() => setModal(null)}>✕</button></div>
            <div className="mb">
              <div className="cfg-fg"><label>Nome *</label><input autoFocus value={modal.nome} onChange={(e) => setModal({ ...modal, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveMut.mutate(modal) }} /></div>
              {modalCad.special === 'unidade' && <div className="cfg-fg"><label>Abreviação (ex: kg, L, un)</label><input value={modal.abrev} onChange={(e) => setModal({ ...modal, abrev: e.target.value })} /></div>}
              {modalCad.special === 'loja' && <>
                <div className="cfg-fg"><label>Razão Social</label><input value={modal.razao} onChange={(e) => setModal({ ...modal, razao: e.target.value })} /></div>
                <div className="cfg-fg row2">
                  <div><label>CNPJ</label><input value={modal.cnpj} onChange={(e) => setModal({ ...modal, cnpj: e.target.value })} /></div>
                  <div><label>Endereço</label><input value={modal.ende} onChange={(e) => setModal({ ...modal, ende: e.target.value })} /></div>
                </div>
                <div className="cfg-fg row2">
                  <div><label>Horário manhã</label><input value={modal.hm} onChange={(e) => setModal({ ...modal, hm: e.target.value })} placeholder="ex: 08:00 - 12:00" /></div>
                  <div><label>Horário tarde</label><input value={modal.ht} onChange={(e) => setModal({ ...modal, ht: e.target.value })} placeholder="ex: 14:00 - 18:00" /></div>
                </div>
              </>}
            </div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setModal(null)}>Cancelar</button>
              <button className="cfg-btn pri" disabled={saveMut.isPending} onClick={() => saveMut.mutate(modal)}>{saveMut.isPending ? 'Salvando…' : (modal.id ? 'Salvar alterações' : 'Salvar')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== modal grupo de compra ===== */}
      {gModal && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setGModal(null) }}>
          <div className="cfg-modal wide">
            <div className="mh"><h2>{gModal.id ? 'Editar' : 'Novo'} — Grupo de Compra</h2><button className="mx" onClick={() => setGModal(null)}>✕</button></div>
            <div className="mb">
              <div className="cfg-fg"><label>Nome do grupo *</label><input autoFocus value={gModal.nome} onChange={(e) => setGModal({ ...gModal, nome: e.target.value })} /></div>
              <div className="cfg-fg">
                <label>Insumos do grupo ({gModal.sel.size} selecionados)</label>
                <input className="cfg-search" style={{ width: '100%', marginBottom: 8 }} placeholder="Buscar insumo..." value={insBusca} onChange={(e) => setInsBusca(e.target.value)} />
                <div className="cfg-ins-box">
                  {insFiltrados.map((i) => (
                    <label key={i.id}>
                      <input type="checkbox" checked={gModal.sel.has(i.id)} onChange={() => setGModal((g) => { if (!g) return g; const s = new Set(g.sel); s.has(i.id) ? s.delete(i.id) : s.add(i.id); return { ...g, sel: s } })} />
                      {i.nome}
                    </label>
                  ))}
                  {insFiltrados.length === 0 && <div className="empty">Nenhum insumo.</div>}
                </div>
              </div>
            </div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setGModal(null)}>Cancelar</button>
              <button className="cfg-btn pri" disabled={gSaveMut.isPending} onClick={() => gSaveMut.mutate(gModal)}>{gSaveMut.isPending ? 'Salvando…' : (gModal.id ? 'Salvar alterações' : 'Salvar')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== confirmar exclusão ===== */}
      {del && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setDel(null) }}>
          <div className="cfg-modal" style={{ width: 'min(400px,94vw)' }}>
            <div className="mh"><h2>Excluir</h2><button className="mx" onClick={() => setDel(null)}>✕</button></div>
            <div className="mb"><p style={{ fontSize: 13, color: '#334155' }}>Excluir <b>{del.nome}</b>? Esta ação não pode ser desfeita.</p></div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setDel(null)}>Cancelar</button>
              <button className="cfg-btn danger" disabled={delMut.isPending} onClick={() => delMut.mutate(del)}>{delMut.isPending ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
