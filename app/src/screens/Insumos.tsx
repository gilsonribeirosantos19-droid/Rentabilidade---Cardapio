import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './insumos.css'

// Title Case pt-BR enquanto digita: 1ª letra de cada palavra maiúscula (igual à normalização do banco)
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sp, c) => sp + (c as string).toUpperCase())

type Insumo = {
  id: string
  tenant_id?: string
  codigo_interno?: number
  nome?: string
  ncm?: string
  tipo_item?: string
  familia?: string
  categoria?: string
  subgrupo?: string
  unidade_medida?: string
  unidade_compra?: string
  preco_compra?: number
  rendimento_pct?: number
  participa_cmv?: string
  tipo_baixa?: string
  observacao?: string | null
  ativo?: boolean
}
type Saldo = { insumo_id: string; custo_medio?: number; quantidade?: number; loja_id?: string }
type Form = Partial<Insumo>

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtCodigo = (c?: number) => (c != null ? String(c).padStart(6, '0') : '—')
const getStatus = (i: Insumo) => { const r = Number(i.rendimento_pct ?? 100); return r < 60 ? 'critico' : r < 72 ? 'atencao' : 'ativo' }
const ST_TXT: Record<string, string> = { ativo: 'Ativo', atencao: 'Estoque baixo', critico: 'Crítico' }
const uniq = (arr: (string | undefined)[]) => [...new Set(arr.filter(Boolean) as string[])].sort()
const novoForm = (): Form => ({ participa_cmv: 'sim', tipo_baixa: 'consumo', ativo: true })

export function Insumos() {
  const { tenantId } = useAuth()
  const { lojaId } = useLoja()   // custo respeita a loja global (Todas = maior, só visão geral)
  const qc = useQueryClient()
  const [tab, setTab] = useState<'cadastro' | 'produtos' | 'custos'>('produtos')
  const [cadForm, setCadForm] = useState<Form>(novoForm())
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const [dup, setDup] = useState<Insumo | null>(null); const [dupNome, setDupNome] = useState('')
  // filtros Produtos
  const [busca, setBusca] = useState(''); const [fTipo, setFTipo] = useState(''); const [fFam, setFFam] = useState('')
  const [fGrupo, setFGrupo] = useState(''); const [fSub, setFSub] = useState(''); const [fStatus, setFStatus] = useState('')
  // filtros Custos
  const [cBusca, setCBusca] = useState(''); const [cCat, setCCat] = useState(''); const [cStatus, setCStatus] = useState('')

  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600) }

  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['insumos', tenantId], enabled: !!tenantId,
    // fetchAll: vence o teto de 1000 do PostgREST (senão itens somem da tela silenciosamente)
    queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('*').eq('tenant_id', tenantId).order('nome').range(f, t)),
  })
  const { data: saldos = [] } = useQuery({
    queryKey: ['saldos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id, custo_medio, quantidade, loja_id').eq('tenant_id', tenantId).range(f, t)),
  })
  // custo médio RESPEITANDO a loja global: loja selecionada → custo dela; "Todas" → maior (visão geral).
  const custoMedio = (id: string) => {
    const rows = saldos.filter((s) => s.insumo_id === id && (s.custo_medio || 0) > 0)
    if (lojaId) { const s = rows.find((x) => x.loja_id === lojaId); return s ? (s.custo_medio || 0) : 0 }
    return rows.reduce((b, s) => Math.max(b, s.custo_medio || 0), 0)
  }

  // classificações do CADASTRO (Config › Geral) — pra grupos/famílias/subgrupos NOVOS aparecerem
  // no filtro/select mesmo antes de algum insumo usar (senão só apareciam os já em uso).
  const { data: clsf = [] } = useQuery({
    queryKey: ['insumos-clsf', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('item_classificacoes').select('nome,tipo').eq('tenant_id', tenantId); return (data ?? []) as { nome: string; tipo: string }[] },
  })

  const opts = useMemo(() => {
    const cad = (tipo: string) => clsf.filter((c) => c.tipo === tipo).map((c) => c.nome)
    return {
      tipos: uniq(lista.map((i) => i.tipo_item)), familias: uniq([...cad('familia'), ...lista.map((i) => i.familia)]),
      grupos: uniq([...cad('grupo'), ...lista.map((i) => i.categoria)]), subgrupos: uniq([...cad('subgrupo'), ...lista.map((i) => i.subgrupo)]),
      unidades: uniq(lista.map((i) => i.unidade_medida)),
    }
  }, [lista, clsf])

  const produtos = useMemo(() => {
    const q = norm(busca.trim())
    return lista.filter((i) => {
      if (q && !norm([i.nome, i.codigo_interno, i.categoria].filter(Boolean).join(' ')).includes(q)) return false
      if (fTipo && (i.tipo_item || '') !== fTipo) return false
      if (fFam && (i.familia || '') !== fFam) return false
      if (fGrupo && (i.categoria || '') !== fGrupo) return false
      if (fSub && (i.subgrupo || '') !== fSub) return false
      // Status: 'false' = só inativos; 'true' ou vazio (padrão) = só ativos (igual ao original)
      if (fStatus === 'false') { if (i.ativo !== false) return false }
      else if (i.ativo === false) return false
      return true
    })
  }, [lista, busca, fTipo, fFam, fGrupo, fSub, fStatus])

  const custos = useMemo(() => {
    const q = norm(cBusca.trim())
    return lista.filter((i) => {
      if (q && !norm(i.nome || '').includes(q)) return false
      if (cCat && (i.categoria || '') !== cCat) return false
      if (cStatus && getStatus(i) !== cStatus) return false
      return true
    })
  }, [lista, cBusca, cCat, cStatus])

  const saveMut = useMutation({
    mutationFn: async (f: Form) => {
      const nome = (f.nome || '').trim()
      if (!nome) throw new Error('Informe a descrição.')
      if (!f.tipo_item) throw new Error('Selecione o tipo do item.')
      if (!f.unidade_medida) throw new Error('Selecione a unidade.')
      const und = f.unidade_medida || null
      const payload = {
        nome, categoria: f.categoria || null, unidade_medida: und, unidade_compra: und,
        tipo_baixa: f.tipo_baixa || 'consumo', tipo_item: f.tipo_item || null, familia: f.familia || null,
        subgrupo: f.subgrupo || null, participa_cmv: f.participa_cmv === 'nao' ? 'nao' : 'sim', ativo: f.ativo !== false,
      }
      if (f.id) {
        const { error } = await supabase.from('insumos').update(payload).eq('id', f.id); if (error) throw error
      } else {
        // próximo código = maior do banco + 1 (busca FRESCA, não da lista em memória, que poderia
        // estar capada ou desatualizada → evita gerar código duplicado). codigo_interno é inteiro.
        const { data: mx } = await supabase.from('insumos').select('codigo_interno').eq('tenant_id', tenantId).order('codigo_interno', { ascending: false }).limit(1)
        const prox = (Number(mx?.[0]?.codigo_interno) || 0) + 1
        const { error } = await supabase.from('insumos').insert({ ...payload, tenant_id: tenantId, preco_compra: 0, rendimento_pct: 100, codigo_interno: prox }); if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); showToast('Item salvo.', 'ok'); setCadForm(novoForm()); setTab('produtos') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('insumos').update({ ativo: false }).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos'] }); showToast('Item desativado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  const editar = (item: Insumo) => { setCadForm(item); setTab('cadastro') }
  // Duplicar: abre um pop-up rápido só com o nome. A classificação toda é copiada do item
  // de origem; ao salvar, cria um item NOVO (código gerado automático). Ágil p/ vários da mesma categoria.
  const duplicar = (item: Insumo) => { setDup(item); setDupNome((item.nome || '') + ' (cópia)') }
  const confirmarDup = () => {
    if (!dup) return
    const nome = dupNome.trim(); if (!nome) { showToast('Informe o nome.', 'err'); return }
    const { id, codigo_interno, ...rest } = dup; void id; void codigo_interno
    saveMut.mutate({ ...rest, nome })
    setDup(null)
  }
  const setF = (k: keyof Form, v: string | boolean) => setCadForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="ins-screen">
      <div className="mod-tabs">
        <button className={'mod-tab' + (tab === 'cadastro' ? ' active' : '')} onClick={() => { setCadForm(novoForm()); setTab('cadastro') }}>Cadastro de Item</button>
        <button className={'mod-tab' + (tab === 'produtos' ? ' active' : '')} onClick={() => setTab('produtos')}>Produtos / Itens</button>
        <button className={'mod-tab' + (tab === 'custos' ? ' active' : '')} onClick={() => setTab('custos')}>Base de Custos da Ficha Técnica</button>
      </div>

      {/* ===== CADASTRO DE ITEM ===== */}
      {tab === 'cadastro' && (
        <div className="ins-body">
          <div className="form-card">
            <div className="form-section">
              <div className="form-section-title">1. Identificação</div>
              <div className="form-grid-3">
                <div className="form-group"><label className="form-label">Código interno</label><input className="form-input" readOnly value={cadForm.id ? fmtCodigo(cadForm.codigo_interno) : ''} placeholder="Gerado automaticamente" /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Descrição do item *</label><input className="form-input" value={cadForm.nome || ''} onChange={(e) => setF('nome', titleCase(e.target.value))} placeholder="Ex: Salmão fresco" /></div>
                <div className="form-group"><label className="form-label">NCM</label><input className="form-input" value={cadForm.ncm || ''} onChange={(e) => setF('ncm', e.target.value)} placeholder="00000000" /></div>
                <div className="form-group"><label className="form-label">Status *</label>
                  <select className="form-select" value={cadForm.ativo === false ? 'false' : 'true'} onChange={(e) => setF('ativo', e.target.value === 'true')}>
                    <option value="true">Ativo</option><option value="false">Inativo</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title">2. Classificação</div>
              <div className="form-grid-3">
                <Sel label="Tipo do item *" value={cadForm.tipo_item} options={opts.tipos} onChange={(v) => setF('tipo_item', v)} />
                <Sel label="Família" value={cadForm.familia} options={opts.familias} onChange={(v) => setF('familia', v)} />
                <Sel label="Grupo (Categoria)" value={cadForm.categoria} options={opts.grupos} onChange={(v) => setF('categoria', v)} />
                <Sel label="Subgrupo" value={cadForm.subgrupo} options={opts.subgrupos} onChange={(v) => setF('subgrupo', v)} />
                <div className="form-group"><label className="form-label">Participa do CMV</label>
                  <select className="form-select" value={cadForm.participa_cmv === 'nao' ? 'nao' : 'sim'} onChange={(e) => setF('participa_cmv', e.target.value)}><option value="sim">Sim</option><option value="nao">Não</option></select>
                </div>
                <div className="form-group"><label className="form-label">Tipo de baixa</label>
                  <select className="form-select" value={cadForm.tipo_baixa || 'consumo'} onChange={(e) => setF('tipo_baixa', e.target.value)}><option value="consumo">Consumo</option><option value="producao">Produção</option><option value="nao_baixa">Não baixa</option></select>
                </div>
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title">3. Unidade e Embalagem</div>
              <div className="form-grid-3">
                <Sel label="Unidade de estoque *" value={cadForm.unidade_medida} options={opts.unidades} onChange={(v) => setF('unidade_medida', v)} />
                <div className="form-group"><label className="form-label">Local / Depósito padrão</label><input className="form-input" placeholder="Ex: Câmara fria" /></div>
              </div>
            </div>
            <div className="form-footer">
              <button className="f-btn" onClick={() => { setCadForm(novoForm()); setTab('produtos') }}>Cancelar</button>
              <button className="f-btn primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate(cadForm)}>{saveMut.isPending ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PRODUTOS / ITENS ===== */}
      {tab === 'produtos' && (
        <div className="ins-body">
          <div className="prod-toolbar">
            <div className="prod-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Buscar item..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <FSel value={fTipo} onChange={setFTipo} ph="Tipo do item ▾" options={opts.tipos} />
            <FSel value={fFam} onChange={setFFam} ph="Família ▾" options={opts.familias} />
            <FSel value={fGrupo} onChange={setFGrupo} ph="Grupo ▾" options={opts.grupos} />
            <FSel value={fSub} onChange={setFSub} ph="Subgrupo ▾" options={opts.subgrupos} />
            <select className="prod-filter" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">Status ▾</option><option value="true">Ativo</option><option value="false">Inativo</option></select>
          </div>
          <div className="tbl-card"><div className="tbl-scroll">
            <table>
              <thead><tr>
                <th><svg className="colgrid" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>Código Interno</th>
                <th>Descrição</th><th>Tipo do Item</th><th>Grupo</th><th>Unidade</th><th className="r">Qtd. Emb.</th><th className="c">Calcula CMV</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={8} className="empty">Carregando…</td></tr>
                  : produtos.length === 0 ? <tr><td colSpan={8} className="empty">Nenhum item encontrado</td></tr>
                  : produtos.map((i) => (
                    <tr key={i.id} onClick={() => editar(i)}>
                      <td className="td-mono" style={{ color: '#64748b', fontSize: 11 }}>{fmtCodigo(i.codigo_interno)}</td>
                      <td style={{ color: '#0f172a' }}>{i.nome}</td>
                      <td style={{ color: '#64748b' }}>{i.tipo_item || '—'}</td>
                      <td style={{ color: '#475569' }}>{i.categoria || '—'}</td>
                      <td style={{ color: '#64748b' }}>{i.unidade_medida || '—'}</td>
                      <td className="r td-mono" style={{ color: '#64748b' }}>—</td>
                      <td className="c">{i.participa_cmv !== 'nao' ? <span className="cmv-on">✓</span> : <span className="cmv-off" />}</td>
                      <td><button className="acoes-btn" onClick={(e) => { e.stopPropagation(); setMenu({ id: i.id, x: e.clientX, y: e.clientY }) }}>⋮</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div></div>
        </div>
      )}

      {/* ===== BASE DE CUSTOS ===== */}
      {tab === 'custos' && (
        <div className="ins-body">
          <div className="prod-toolbar">
            <div className="prod-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input placeholder="Buscar insumo..." value={cBusca} onChange={(e) => setCBusca(e.target.value)} />
            </div>
            <FSel value={cCat} onChange={setCCat} ph="Categoria ▾" options={opts.grupos} />
            <select className="prod-filter" value={cStatus} onChange={(e) => setCStatus(e.target.value)}><option value="">Status ▾</option><option value="ativo">Ativo</option><option value="atencao">Estoque baixo</option><option value="critico">Crítico</option></select>
          </div>
          <div className="tbl-card"><div className="tbl-scroll">
            <table>
              <thead><tr><th>Insumo</th><th>Categoria</th><th>Unidade</th><th className="r">Custo Médio</th><th className="r">Custo Real/kg</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {custos.length === 0 ? <tr><td colSpan={7} className="empty">Nenhum insumo encontrado</td></tr>
                  : custos.map((i) => {
                    const cm = custoMedio(i.id)
                    const rend = Number(i.rendimento_pct ?? 100)
                    const base = cm > 0 ? cm : Number(i.preco_compra) || 0
                    const real = base / (rend / 100)
                    const st = getStatus(i)
                    return (
                      <tr key={i.id} onClick={() => editar(i)}>
                        <td style={{ color: '#0f172a' }}>{i.nome}</td>
                        <td style={{ color: '#475569' }}>{i.categoria || '—'}</td>
                        <td style={{ color: '#64748b' }}>{i.unidade_compra || i.unidade_medida || '—'}</td>
                        <td className="r td-mono" style={{ color: cm > 0 ? '#0f172a' : '#94a3b8' }}>{cm > 0 ? brl(cm) : '—'}</td>
                        <td className="r td-mono" style={{ color: '#0f172a' }}>{brl(real)}</td>
                        <td><span className="badge b-cat">{ST_TXT[st]}</span></td>
                        <td><button className="acoes-btn" onClick={(e) => { e.stopPropagation(); setMenu({ id: i.id, x: e.clientX, y: e.clientY }) }}>⋮</button></td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div></div>
        </div>
      )}

      {menu && (
        <div style={{ position: 'fixed', top: menu.y + 4, left: menu.x - 120, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,.14)', zIndex: 1000, minWidth: 130, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
          <button style={menuItemStyle} onClick={() => { const ins = lista.find((x) => x.id === menu.id); if (ins) editar(ins); setMenu(null) }}>✎ Editar</button>
          <button style={menuItemStyle} onClick={() => { const ins = lista.find((x) => x.id === menu.id); if (ins) duplicar(ins); setMenu(null) }}>⧉ Duplicar</button>
          <button style={{ ...menuItemStyle, color: '#ef4444' }} onClick={() => { const ins = lista.find((x) => x.id === menu.id); if (ins && confirm(`Desativar "${ins.nome}"?`)) delMut.mutate(ins.id); setMenu(null) }}>🗑 Desativar</button>
        </div>
      )}

      {dup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }} onClick={() => setDup(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(440px, 92vw)', boxShadow: '0 18px 48px rgba(0,0,0,.25)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef1f5' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Duplicar item</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Copia a classificação de <b>{dup.nome}</b>. Só ajuste o nome.</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <label className="form-label">Nome do novo item *</label>
              <input className="form-input" autoFocus value={dupNome} onChange={(e) => setDupNome(titleCase(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') confirmarDup() }} placeholder="Ex: Abacate" />
            </div>
            <div style={{ padding: '12px 20px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="f-btn" onClick={() => setDup(null)}>Cancelar</button>
              <button className="f-btn primary" disabled={saveMut.isPending} onClick={confirmarDup}>{saveMut.isPending ? 'Salvando…' : 'Duplicar'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}

const menuItemStyle = { display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 13px', background: 'none', border: 'none', fontSize: 13, fontFamily: 'inherit', color: '#334155', cursor: 'pointer' }

function SearchSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const filtered = options.filter((o) => norm(o).includes(norm(q)))
  return (
    <div className="ss" ref={ref}>
      <button type="button" className={'ss-btn' + (value ? '' : ' ph')} onClick={() => { setOpen((o) => !o); setQ('') }}>
        {value || placeholder}
      </button>
      {open && (
        <div className="ss-pop">
          <input className="ss-q" autoFocus placeholder="Digite para buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ss-list">
            <div className="ss-opt" onClick={() => { onChange(''); setOpen(false) }}>{placeholder}</div>
            {filtered.map((o) => <div key={o} className={'ss-opt' + (o === value ? ' on' : '')} onClick={() => { onChange(o); setOpen(false) }}>{o}</div>)}
            {filtered.length === 0 && <div className="ss-none">Nada encontrado</div>}
          </div>
        </div>
      )}
    </div>
  )
}
function Sel({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="form-group"><label className="form-label">{label}</label>
      <SearchSelect value={value || ''} options={options} placeholder="Selecione..." onChange={onChange} />
    </div>
  )
}
function FSel({ value, onChange, ph, options }: { value: string; onChange: (v: string) => void; ph: string; options: string[] }) {
  return <SearchSelect value={value} onChange={onChange} placeholder={ph} options={options} />
}
