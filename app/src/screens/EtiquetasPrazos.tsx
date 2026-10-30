import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { useToastTipo } from '../lib/toast'
import { SearchSelect } from '../components/SearchSelect'
import './etiquetas.css'

type Grupo = { id: string; nome: string }
type Item = {
  id: string; tenant_id?: string; nome: string; grupo_id?: string | null
  insumo_id?: string | null; ficha_id?: string | null
  marca_forn_default?: string | null; sif_default?: string | null; alergenicos?: string | null; ativo?: boolean
}
type Prazo = { id: string; item_id: string; modo: string; prazo_horas: number; temperatura?: string | null }
type Cat = { id: string; nome: string }

const MODOS: [string, string][] = [
  ['resfriado', 'Refrigerado'], ['congelado', 'Congelado'], ['ambiente', 'Temperatura Ambiente'],
  ['quente', 'Quente'], ['descongelado', 'Descongelado'], ['aberto', 'Aberto'],
]
const MODO_LABEL = Object.fromEntries(MODOS) as Record<string, string>

function fmtPrazo(h: number) {
  const d = Math.floor(h / 24), r = h % 24
  return [d ? `${d}d` : '', r ? `${r}h` : ''].filter(Boolean).join(' ') || '0h'
}

type PrazoForm = Record<string, { dias: string; horas: string; temp: string }>
type Form = {
  id?: string; nome: string; grupoNome: string
  tipoVinc: 'nenhum' | 'insumo' | 'ficha'; produtoId: string
  marca: string; sif: string; alerg: string; prazos: PrazoForm
}
const emptyPrazos = (): PrazoForm =>
  Object.fromEntries(MODOS.map(([k]) => [k, { dias: '', horas: '', temp: '' }])) as PrazoForm

export function EtiquetasPrazos() {
  const { tenantId } = useAuth()
  const { podeEditar } = usePerms()
  const canEdit = podeEditar('etiquetas/prazos')
  const qc = useQueryClient()
  const { toast, showToast } = useToastTipo(2600)
  const [busca, setBusca] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [editing, setEditing] = useState<Form | null>(null)

  const { data: grupos = [] } = useQuery({
    queryKey: ['etq-grupos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Grupo>((f, t) => supabase.from('etiqueta_grupos').select('id,nome').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })
  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['etq-itens', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Item>((f, t) => supabase.from('etiqueta_itens').select('*').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })
  const { data: prazos = [] } = useQuery({
    queryKey: ['etq-prazos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Prazo>((f, t) => supabase.from('etiqueta_prazos').select('*').eq('tenant_id', tenantId).order('id').range(f, t)),
  })
  const { data: insumos = [] } = useQuery({
    queryKey: ['etq-insumos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Cat>((f, t) => supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome').order('id').range(f, t)),
  })
  const { data: fichas = [] } = useQuery({
    queryKey: ['etq-fichas', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Cat>((f, t) => supabase.from('fichas_tecnicas').select('id,nome').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })

  const grupoById = useMemo(() => Object.fromEntries(grupos.map((g) => [g.id, g.nome])) as Record<string, string>, [grupos])
  const prazosByItem = useMemo(() => {
    const m: Record<string, Prazo[]> = {}
    prazos.forEach((p) => { (m[p.item_id] ||= []).push(p) })
    return m
  }, [prazos])

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return itens
      .filter((it) => (!q || it.nome.toLowerCase().includes(q)) && (!fGrupo || it.grupo_id === fGrupo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [itens, busca, fGrupo])

  const save = useMutation({
    mutationFn: async (form: Form) => {
      const nome = form.nome.trim()
      if (!nome) throw new Error('Informe o nome do produto.')
      // resolve/cria o grupo
      let grupoId: string | null = null
      const gNome = form.grupoNome.trim()
      if (gNome) {
        const existente = grupos.find((g) => g.nome.toLowerCase() === gNome.toLowerCase())
        if (existente) grupoId = existente.id
        else {
          const { data, error } = await supabase.from('etiqueta_grupos').insert({ tenant_id: tenantId, nome: gNome }).select('id'); if (error) throw error
          grupoId = data?.[0]?.id ?? null
        }
      }
      const payload = {
        tenant_id: tenantId, nome, grupo_id: grupoId,
        insumo_id: form.tipoVinc === 'insumo' ? form.produtoId || null : null,
        ficha_id: form.tipoVinc === 'ficha' ? form.produtoId || null : null,
        marca_forn_default: form.marca.trim() || null,
        sif_default: form.sif.trim() || null,
        alergenicos: form.alerg.trim() || null,
        ativo: true,
      }
      let itemId = form.id
      if (itemId) {
        const { error } = await supabase.from('etiqueta_itens').update(payload).eq('id', itemId); if (error) throw error
      } else {
        const { data, error } = await supabase.from('etiqueta_itens').insert(payload).select('id'); if (error) throw error
        itemId = data?.[0]?.id; if (!itemId) throw new Error('Falha ao salvar o produto.')
      }
      const linhas = MODOS.map(([k]) => {
        const p = form.prazos[k]
        const horas = (parseInt(p.dias) || 0) * 24 + (parseInt(p.horas) || 0)
        return horas > 0 ? { modo: k, prazo_horas: horas, temperatura: p.temp.trim() || null } : null
      }).filter(Boolean) as { modo: string; prazo_horas: number; temperatura: string | null }[]
      // troca os prazos de uma vez só no banco (atômico: falhou = nada muda)
      const { error } = await supabase.rpc('etq_salvar_prazos', { p_item_id: itemId, p_prazos: linhas })
      if (!error) return
      if (error.code !== 'PGRST202') throw error
      // fallback enquanto o SQL da fase 2 não rodou (RPC ausente): caminho antigo
      await supabase.from('etiqueta_prazos').delete().eq('item_id', itemId)
      if (linhas.length) { const { error: e2 } = await supabase.from('etiqueta_prazos').insert(linhas.map((l) => ({ ...l, tenant_id: tenantId, item_id: itemId }))); if (e2) throw e2 }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etq-grupos'] })
      qc.invalidateQueries({ queryKey: ['etq-itens'] })
      qc.invalidateQueries({ queryKey: ['etq-prazos'] })
      setEditing(null); showToast('Produto salvo.', 'ok')
    },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('etiqueta_itens').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-itens'] }); qc.invalidateQueries({ queryKey: ['etq-prazos'] }); showToast('Produto removido.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  function abrirEdit(it: Item) {
    const pf = emptyPrazos()
    for (const p of (prazosByItem[it.id] || [])) {
      pf[p.modo] = { dias: String(Math.floor(p.prazo_horas / 24) || ''), horas: String(p.prazo_horas % 24 || ''), temp: p.temperatura || '' }
    }
    setEditing({
      id: it.id, nome: it.nome, grupoNome: it.grupo_id ? (grupoById[it.grupo_id] || '') : '',
      tipoVinc: it.insumo_id ? 'insumo' : it.ficha_id ? 'ficha' : 'nenhum',
      produtoId: it.insumo_id || it.ficha_id || '',
      marca: it.marca_forn_default || '', sif: it.sif_default || '', alerg: it.alergenicos || '', prazos: pf,
    })
  }

  return (
    <div className="etq-screen">
      <div className="etq-head">
        <h1>Produtos & Prazos</h1>
        <span className="sub">Cadastro dos produtos de etiqueta: nome + grupo + prazos por modo de conservação</span>
      </div>

      <div className="etq-toolbar">
        <div className="etq-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="etq-sel" value={fGrupo} onChange={(e) => setFGrupo(e.target.value)}>
          <option value="">Todos os grupos</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
        {canEdit
          ? <button className="etq-btn etq-btn-pri" onClick={() => setEditing({ nome: '', grupoNome: '', tipoVinc: 'nenhum', produtoId: '', marca: '', sif: '', alerg: '', prazos: emptyPrazos() })}>+ Novo produto</button>
          : <span className="etq-ro">👁 Somente leitura</span>}
      </div>

      <div className="etq-card">
        <table className="etq-tbl">
          <thead><tr><th>Produto</th><th>Grupo</th><th>Prazos por modo</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={4} className="etq-empty">Carregando…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={4} className="etq-empty">Nenhum produto. Clique em “+ Novo produto”.</td></tr>
              : rows.map((it) => {
                const ps = prazosByItem[it.id] || []
                return (
                  <tr key={it.id} onClick={() => canEdit && abrirEdit(it)}>
                    <td>{it.nome}</td>
                    <td style={{ color: '#64748b', textTransform: 'lowercase' }}>{it.grupo_id ? (grupoById[it.grupo_id] || '—') : '—'}</td>
                    <td>
                      {ps.length === 0
                        ? <span className="etq-chip none">sem prazo</span>
                        : ps.slice().sort((a, b) => a.prazo_horas - b.prazo_horas).map((p) => (
                          <span key={p.id} className="etq-chip">{MODO_LABEL[p.modo] || p.modo} <b>{fmtPrazo(p.prazo_horas)}</b></span>
                        ))}
                    </td>
                    <td className="r">{canEdit && <button className="etq-btn etq-btn-sm" onClick={(e) => { e.stopPropagation(); if (confirm(`Remover "${it.nome}"?`)) del.mutate(it.id) }}>Remover</button>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="etq-hint" style={{ marginTop: 10 }}>{rows.length} produto(s){fGrupo ? ' no grupo selecionado' : ''}.</div>

      {editing && <ProdModal form={editing} grupos={grupos} insumos={insumos} fichas={fichas} saving={save.isPending} onClose={() => setEditing(null)} onSave={(f) => save.mutate(f)} />}
      {toast && <div className={'etq-toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function ProdModal({ form: inicial, grupos, insumos, fichas, saving, onClose, onSave }: {
  form: Form; grupos: Grupo[]; insumos: Cat[]; fichas: Cat[]; saving: boolean; onClose: () => void; onSave: (f: Form) => void
}) {
  const [form, setForm] = useState<Form>(inicial)
  const [novoGrupo, setNovoGrupo] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setPrazo = (modo: string, campo: 'dias' | 'horas' | 'temp', v: string) =>
    setForm((f) => ({ ...f, prazos: { ...f.prazos, [modo]: { ...f.prazos[modo], [campo]: v } } }))

  const lista = form.tipoVinc === 'ficha' ? fichas : insumos
  const nomeVinc = lista.find((x) => x.id === form.produtoId)?.nome || ''

  return (
    <div className="etq-ov" onClick={onClose}>
      <div className="etq-modal" onClick={(e) => e.stopPropagation()}>
        <div className="etq-mh"><h2>{form.id ? 'Editar produto' : 'Novo produto'}</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="etq-mb">
          <div className="etq-row2">
            <div className="etq-fg"><label>Nome do produto *</label><input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Shari (Arroz)" autoFocus /></div>
            <div className="etq-fg">
              <label>Grupo</label>
              {novoGrupo
                ? <input value={form.grupoNome} onChange={(e) => set('grupoNome', e.target.value)} placeholder="Nome do novo grupo" />
                : <select value={form.grupoNome} onChange={(e) => { if (e.target.value === '__novo') { setNovoGrupo(true); set('grupoNome', '') } else set('grupoNome', e.target.value) }}>
                    <option value="">Sem grupo</option>
                    {grupos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
                    <option value="__novo">+ Novo grupo…</option>
                  </select>}
            </div>
          </div>

          <div className="etq-fg">
            <label>Vínculo com o catálogo do Aiko (opcional — puxa custo/previsão)</label>
            <div className="etq-seg">
              <button className={form.tipoVinc === 'nenhum' ? 'on' : ''} onClick={() => { set('tipoVinc', 'nenhum'); set('produtoId', '') }}>Nenhum</button>
              <button className={form.tipoVinc === 'insumo' ? 'on' : ''} onClick={() => { set('tipoVinc', 'insumo'); set('produtoId', '') }}>Insumo</button>
              <button className={form.tipoVinc === 'ficha' ? 'on' : ''} onClick={() => { set('tipoVinc', 'ficha'); set('produtoId', '') }}>Ficha</button>
            </div>
          </div>
          {form.tipoVinc !== 'nenhum' && (
            <div className="etq-fg">
              <SearchSelect value={nomeVinc} options={lista.map((x) => x.nome)} placeholder="Buscar no catálogo..."
                onChange={(nm) => set('produtoId', lista.find((x) => x.nome === nm)?.id || '')} />
            </div>
          )}

          <div className="etq-row2">
            <div className="etq-fg"><label>Marca / fornecedor padrão</label><input value={form.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Ex.: Produção própria" /></div>
            <div className="etq-fg"><label>SIF padrão</label><input value={form.sif} onChange={(e) => set('sif', e.target.value)} placeholder="—" /></div>
          </div>

          <div className="etq-fg">
            <label>Prazos por modo de conservação</label>
            <div className="etq-prazos">
              <div className="etq-prazo-row" style={{ background: '#f8fafc' }}>
                <span className="ph">MODO</span><span className="ph">DIAS</span><span className="ph">HORAS</span><span className="ph">TEMPERATURA</span>
              </div>
              {MODOS.map(([k, label]) => (
                <div className="etq-prazo-row" key={k}>
                  <span className="md">{label}</span>
                  <input type="number" min="0" value={form.prazos[k].dias} onChange={(e) => setPrazo(k, 'dias', e.target.value)} placeholder="0" />
                  <input type="number" min="0" max="23" value={form.prazos[k].horas} onChange={(e) => setPrazo(k, 'horas', e.target.value)} placeholder="0" />
                  <input value={form.prazos[k].temp} onChange={(e) => setPrazo(k, 'temp', e.target.value)} placeholder="Ex.: 0 a 5 °C" />
                </div>
              ))}
            </div>
            <div className="etq-hint">Só os modos com prazo (dias e/ou horas) aparecem na emissão.</div>
          </div>
        </div>
        <div className="etq-mf">
          <button className="etq-btn" onClick={onClose}>Cancelar</button>
          <button className="etq-btn etq-btn-pri" disabled={saving} onClick={() => onSave(form)}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
