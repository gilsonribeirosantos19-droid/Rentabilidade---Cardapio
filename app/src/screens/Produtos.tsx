import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './produtos.css'

type Produto = {
  id: string
  tenant_id?: string
  codigo_pdv?: string
  nome?: string
  descricao_reduzida?: string
  tipo_item?: string
  categoria?: string
  familia?: string
  grupo?: string
  subgrupo?: string
  unidade_venda?: string
  tamanho?: string
  pesavel?: boolean
  preco_venda?: number | null
  participa_cmv?: boolean
  tipo_baixa?: string
  ncm?: string
  cest?: string
  origem?: string
  cfop?: string
  situacao?: string
  ativo?: boolean
}
type Form = Partial<Produto>

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const brl = (n?: number | null) => (n != null ? Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—')
const TIPO_LABEL: Record<string, string> = { produto_acabado: 'Produto acabado', revenda: 'Mercadoria p/ revenda', combo: 'Combo', outro: 'Outro' }
const uniq = (a: (string | undefined)[]) => [...new Set(a.filter(Boolean) as string[])].sort()
const novo = (): Form => ({ situacao: 'ativo', participa_cmv: false, tipo_baixa: 'nao_baixar', unidade_venda: 'un', pesavel: false })

function sitBadge(p: Produto) {
  const sit = p.situacao || (p.ativo !== false ? 'ativo' : 'inativo')
  if (sit === 'ativo') return <span className="badge b-ativo">Ativo</span>
  if (sit === 'desenvolvimento') return <span className="badge b-desenv">Em desenv.</span>
  return <span className="badge b-inativo">Inativo</span>
}

export function Produtos() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [editing, setEditing] = useState<Form | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600) }

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['produtos', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('produtos').select('*').eq('tenant_id', tenantId).order('nome')
      if (error) throw error
      return data as Produto[]
    },
  })

  const opts = useMemo(() => ({
    grupos: uniq(lista.map((p) => p.grupo || p.categoria)),
    familias: uniq(lista.map((p) => p.familia)),
    subgrupos: uniq(lista.map((p) => p.subgrupo)),
  }), [lista])

  const filtrada = useMemo(() => {
    const q = norm(busca.trim())
    return lista.filter((p) => {
      if (q && !norm([p.nome, p.codigo_pdv].filter(Boolean).join(' ')).includes(q)) return false
      if (fGrupo && (p.grupo || p.categoria || '') !== fGrupo) return false
      return true
    })
  }, [lista, busca, fGrupo])

  const saveMut = useMutation({
    mutationFn: async (f: Form) => {
      const nome = (f.nome || '').trim()
      if (!nome) throw new Error('Informe o nome do produto.')
      const grupo = f.grupo || null
      const payload = {
        codigo_pdv: f.codigo_pdv || null, nome, descricao_reduzida: f.descricao_reduzida || null,
        tipo_item: f.tipo_item || null, categoria: grupo, familia: f.familia || null, grupo,
        subgrupo: f.subgrupo || null, unidade_venda: f.unidade_venda || 'un', tamanho: f.tamanho || null,
        pesavel: !!f.pesavel, preco_venda: f.preco_venda === undefined || f.preco_venda === ('' as unknown) ? null : Number(f.preco_venda),
        participa_cmv: !!f.participa_cmv, tipo_baixa: f.tipo_baixa || 'nao_baixar',
        ncm: f.ncm || null, cest: f.cest || null, origem: f.origem || null, cfop: f.cfop || null,
        situacao: f.situacao || 'ativo', ativo: (f.situacao || 'ativo') !== 'inativo',
      }
      if (f.id) { const { error } = await supabase.from('produtos').update(payload).eq('id', f.id); if (error) throw error }
      else { const { error } = await supabase.from('produtos').insert({ ...payload, tenant_id: tenantId }); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produtos'] }); setEditing(null); showToast('Produto salvo.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('produtos').update({ ativo: false, situacao: 'inativo' }).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produtos'] }); showToast('Produto inativado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const duplicar = (p: Produto) => { const { id, codigo_pdv, ...rest } = p; void id; void codigo_pdv; setEditing({ ...rest, nome: (p.nome || '') + ' (cópia)' }) }

  return (
    <div className="prod-screen">
      <div className="pr-toolbar">
        <div className="pr-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input placeholder="Buscar por nome ou código..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="pr-grupo"><SearchSelect value={fGrupo} onChange={setFGrupo} options={opts.grupos} placeholder="Todos os grupos" /></div>
        <button className="pr-novo" onClick={() => setEditing(novo())}>+ Novo Produto</button>
      </div>

      <div className="tbl-card"><div className="tbl-scroll">
        <table>
          <thead><tr>
            <th>Cód. Saipos</th><th>Produto</th><th>Grupo</th><th>Tipo</th><th className="r">Preço</th><th>CMV</th><th>Situação</th><th>Ações</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="empty">Carregando…</td></tr>
              : filtrada.length === 0 ? <tr><td colSpan={8} className="empty">Nenhum produto encontrado</td></tr>
              : filtrada.map((p) => (
                <tr key={p.id}>
                  <td className="td-mono" style={{ color: '#64748b' }}>{p.codigo_pdv || '—'}</td>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{p.nome}</td>
                  <td style={{ color: '#475569' }}>{p.grupo || p.categoria || '—'}</td>
                  <td><span className="badge b-tipo">{TIPO_LABEL[p.tipo_item || ''] || p.tipo_item || '—'}</span></td>
                  <td className="r td-mono">{brl(p.preco_venda)}</td>
                  <td><span className={'badge ' + (p.participa_cmv ? 'b-sim' : 'b-nao')}>{p.participa_cmv ? 'Sim' : 'Não'}</span></td>
                  <td>{sitBadge(p)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="act-btn" title="Editar" onClick={() => setEditing(p)}>✎</button>
                    <button className="act-btn" title="Duplicar" onClick={() => duplicar(p)}>⧉</button>
                    <button className="act-btn del" title="Inativar" onClick={() => { if (confirm(`Inativar "${p.nome}"?`)) delMut.mutate(p.id) }}>🗑</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div>

      {editing && <ProdutoModal inicial={editing} opts={opts} saving={saveMut.isPending} onClose={() => setEditing(null)} onSave={(f) => saveMut.mutate(f)} />}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

function ProdutoModal({ inicial, opts, saving, onClose, onSave }: {
  inicial: Form
  opts: { grupos: string[]; familias: string[]; subgrupos: string[] }
  saving: boolean
  onClose: () => void
  onSave: (f: Form) => void
}) {
  const [form, setForm] = useState<Form>(inicial)
  const set = (k: keyof Form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="overlay" onClick={onClose}>
      <div className="pm" onClick={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <h2>{form.id ? 'Editar Produto' : 'Novo Produto'}</h2>
          <div className="hb">
            <button className="pm-btn" onClick={onClose}>Cancelar</button>
            <button className="pm-btn primary" disabled={saving} onClick={() => onSave(form)}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        <div className="pm-body">
          <div className="sec-head"><span>📋</span> Identificação</div>
          <div className="form-row cols-3">
            <div className="form-group"><label>Código Saipos</label><input value={form.codigo_pdv || ''} onChange={(e) => set('codigo_pdv', e.target.value)} placeholder="Ex: 27816895" /></div>
            <div className="form-group"><label>Tipo do item</label>
              <select value={form.tipo_item || ''} onChange={(e) => set('tipo_item', e.target.value)}>
                <option value="">Selecione...</option>
                {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Situação</label>
              <select value={form.situacao || 'ativo'} onChange={(e) => set('situacao', e.target.value)}>
                <option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="desenvolvimento">Em desenvolvimento</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Nome / Descrição *</label><input value={form.nome || ''} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: TEMAKI SALMÃO" autoFocus /></div>
            <div className="form-group"><label>Descrição reduzida</label><input value={form.descricao_reduzida || ''} onChange={(e) => set('descricao_reduzida', e.target.value)} placeholder="Nome curto pro PDV" /></div>
          </div>

          <div className="sec-head"><span>🏷️</span> Classificação</div>
          <div className="form-row cols-3">
            <div className="form-group"><label>Família</label><SearchSelect value={form.familia || ''} onChange={(v) => set('familia', v)} options={opts.familias} /></div>
            <div className="form-group"><label>Grupo</label><SearchSelect value={form.grupo || ''} onChange={(v) => set('grupo', v)} options={opts.grupos} /></div>
            <div className="form-group"><label>Subgrupo</label><SearchSelect value={form.subgrupo || ''} onChange={(v) => set('subgrupo', v)} options={opts.subgrupos} /></div>
          </div>
          <div className="form-row cols-3">
            <div className="form-group"><label>Unidade de venda</label>
              <select value={form.unidade_venda || 'un'} onChange={(e) => set('unidade_venda', e.target.value)}>
                <option value="un">un</option><option value="kg">kg</option><option value="litro">litro</option><option value="ml">ml</option><option value="g">g</option>
              </select>
            </div>
            <div className="form-group"><label>Tamanho</label><input value={form.tamanho || ''} onChange={(e) => set('tamanho', e.target.value)} placeholder="Ex: Único, P, M, G" /></div>
            <div className="form-group"><label>&nbsp;</label><div className="form-check"><input type="checkbox" id="pesavel" checked={!!form.pesavel} onChange={(e) => set('pesavel', e.target.checked)} /><label htmlFor="pesavel">Pesável</label></div></div>
          </div>

          <div className="sec-head"><span>💰</span> Comercial / CMV</div>
          <div className="form-row cols-3">
            <div className="form-group"><label>Preço de venda (R$)</label><input type="number" step="0.01" min="0" value={form.preco_venda ?? ''} onChange={(e) => set('preco_venda', e.target.value)} placeholder="0,00" /></div>
            <div className="form-group"><label>&nbsp;</label><div className="form-check"><input type="checkbox" id="cmv" checked={!!form.participa_cmv} onChange={(e) => set('participa_cmv', e.target.checked)} /><label htmlFor="cmv">Participa do CMV</label></div></div>
            <div className="form-group"><label>Tipo de baixa de estoque</label>
              <select value={form.tipo_baixa || 'nao_baixar'} onChange={(e) => set('tipo_baixa', e.target.value)}>
                <option value="nao_baixar">Não baixar</option><option value="consumo">Consumo (baixa pela ficha)</option><option value="producao">Produção (PCP)</option>
              </select>
            </div>
          </div>

          <div className="sec-head"><span>🧾</span> Fiscal</div>
          <div className="form-row cols-4">
            <div className="form-group"><label>NCM</label><input value={form.ncm || ''} onChange={(e) => set('ncm', e.target.value)} placeholder="Ex: 21069090" /></div>
            <div className="form-group"><label>CEST</label><input value={form.cest || ''} onChange={(e) => set('cest', e.target.value)} placeholder="Ex: 1700100" /></div>
            <div className="form-group"><label>Origem</label><input value={form.origem || ''} onChange={(e) => set('origem', e.target.value)} placeholder="0 - Nacional" /></div>
            <div className="form-group"><label>CFOP</label><input value={form.cfop || ''} onChange={(e) => set('cfop', e.target.value)} placeholder="Ex: 5102" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}
