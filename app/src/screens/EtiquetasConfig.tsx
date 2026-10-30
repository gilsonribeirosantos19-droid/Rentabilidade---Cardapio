import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { usePerms } from '../lib/perms'
import { useToastTipo } from '../lib/toast'
import { buildQrItems, EtqPrintArea, applyFormato, type EtqForLabel, type PrintData } from './etqLabel'
import './etiquetas.css'

type Operador = { id: string; nome: string; loja_id?: string | null; ativo?: boolean; bloqueado_ate?: string | null }
type Grupo = { id: string; nome: string }
type OpForm = { id?: string; nome: string; loja_id: string; pin: string }

const FORMATOS: { v: string; nm: string; sz: string; w: number; h: number }[] = [
  { v: '60x60', nm: 'Padrão', sz: '60 × 60 mm', w: 60, h: 60 },
  { v: '60x80', nm: 'Grande', sz: '60 × 80 mm', w: 60, h: 80 },
  { v: '60x40', nm: 'Compacta', sz: '60 × 40 mm', w: 60, h: 40 },
]
const getFmt = () => { try { return localStorage.getItem('etq_formato') || '60x40' } catch { return '60x40' } }

type Loja = { id: string; nome?: string }
export function EtiquetasConfig({ lojas }: { lojas: Loja[] }) {
  const [aba, setAba] = useState<'operadores' | 'responsaveis' | 'formato' | 'grupos'>('operadores')
  return (
    <div className="etq-screen">
      <div className="etq-head"><h1>Configurações</h1><span className="sub">Operadores (PIN), responsáveis, formato da etiqueta e grupos</span></div>
      <div className="etq-tabs">
        <button className={'etq-tab' + (aba === 'operadores' ? ' on' : '')} onClick={() => setAba('operadores')}>Operadores</button>
        <button className={'etq-tab' + (aba === 'responsaveis' ? ' on' : '')} onClick={() => setAba('responsaveis')}>Responsáveis</button>
        <button className={'etq-tab' + (aba === 'formato' ? ' on' : '')} onClick={() => setAba('formato')}>Formato da etiqueta</button>
        <button className={'etq-tab' + (aba === 'grupos' ? ' on' : '')} onClick={() => setAba('grupos')}>Grupos</button>
      </div>
      {aba === 'operadores' ? <Operadores lojas={lojas} /> : aba === 'responsaveis' ? <Responsaveis /> : aba === 'formato' ? <Formato /> : <Grupos />}
    </div>
  )
}

type Responsavel = { id: string; nome: string; ativo?: boolean }
function Responsaveis() {
  const { tenantId } = useAuth()
  const { podeEditar } = usePerms()
  const canEdit = podeEditar('etiquetas/config')
  const qc = useQueryClient()
  const { toast, showToast } = useToastTipo(2400)
  const [novo, setNovo] = useState('')

  const { data: resps = [], isLoading } = useQuery({
    queryKey: ['etq-resps', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Responsavel>((f, t) => supabase.from('etiqueta_responsaveis').select('id,nome,ativo').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })

  const add = useMutation({
    mutationFn: async (nome: string) => { if (!nome.trim()) throw new Error('Informe o nome.'); const { error } = await supabase.from('etiqueta_responsaveis').insert({ tenant_id: tenantId, nome: nome.trim() }); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-resps'] }); setNovo(''); showToast('Responsável cadastrado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const rename = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => { const { error } = await supabase.from('etiqueta_responsaveis').update({ nome }).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-resps'] }); showToast('Renomeado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const toggle = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => { const { error } = await supabase.from('etiqueta_responsaveis').update({ ativo }).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-resps'] }); showToast('Atualizado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('etiqueta_responsaveis').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-resps'] }); showToast('Excluído.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <>
      <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 2 }}>Pessoas que aparecem no campo <b>RESP:</b> da etiqueta. Na tela de emitir, escolha o responsável antes de imprimir. <b>Os operadores ativos já aparecem automaticamente</b> — cadastre aqui só quem não é operador.</div>
      {canEdit && <div className="etq-toolbar">
        <div className="etq-search"><input placeholder="Nome do responsável..." value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add.mutate(novo) }} /></div>
        <button className="etq-btn etq-btn-pri" disabled={add.isPending || !novo.trim()} onClick={() => add.mutate(novo)}>+ Cadastrar</button>
      </div>}
      <div className="etq-card">
        <table className="etq-tbl">
          <thead><tr><th>Nome</th><th>Situação</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={3} className="etq-empty">Carregando…</td></tr>
              : resps.length === 0 ? <tr><td colSpan={3} className="etq-empty">Nenhum responsável. Cadastre acima.</td></tr>
              : resps.map((r) => (
                <tr key={r.id}>
                  <td>{r.nome}</td>
                  <td><span className={'etq-sit ' + (r.ativo !== false ? 'ok' : 'baixada')}>{r.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="r">{canEdit && <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button className="etq-btn etq-btn-sm" onClick={() => { const n = prompt('Novo nome:', r.nome); if (n && n.trim() && n.trim() !== r.nome) rename.mutate({ id: r.id, nome: n.trim() }) }}>Renomear</button>
                    <button className="etq-btn etq-btn-sm" onClick={() => toggle.mutate({ id: r.id, ativo: r.ativo === false })}>{r.ativo !== false ? 'Desativar' : 'Ativar'}</button>
                    <button className="etq-btn etq-btn-sm" onClick={() => { if (confirm(`Excluir o responsável "${r.nome}"?`)) del.mutate(r.id) }}>Excluir</button>
                  </div>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {toast && <div className={'etq-toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}

function Operadores({ lojas }: { lojas: Loja[] }) {
  const { tenantId } = useAuth()
  const { podeEditar, isAdmin } = usePerms()
  const canEdit = podeEditar('etiquetas/config')
  const qc = useQueryClient()
  const { toast, showToast } = useToastTipo(2600)
  const [edit, setEdit] = useState<OpForm | null>(null)

  const { data: ops = [], isLoading } = useQuery({
    queryKey: ['etq-ops', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Operador>((f, t) => supabase.from('operadores').select('id,nome,loja_id,ativo,bloqueado_ate').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })
  const lojaNome = (id?: string | null) => lojas.find((l) => l.id === id)?.nome || '—'

  const salvar = useMutation({
    mutationFn: async (f: OpForm) => {
      if (!f.nome.trim()) throw new Error('Informe o nome.')
      if (!f.loja_id) throw new Error('Selecione a loja.')
      if (!f.id && !/^[0-9]{4,6}$/.test(f.pin)) throw new Error('PIN deve ter 4 a 6 dígitos.')
      if (f.pin && !/^[0-9]{4,6}$/.test(f.pin)) throw new Error('PIN deve ter 4 a 6 dígitos.')
      const { error } = await supabase.rpc('salvar_operador', { p_loja_id: f.loja_id, p_nome: f.nome.trim(), p_pin: f.pin || null, p_operador_id: f.id || null })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-ops'] }); setEdit(null); showToast('Operador salvo.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const patch = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => { const { error } = await supabase.from('operadores').update(data).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-ops'] }); showToast('Atualizado.', 'ok') },
    onError: (e: Error) => showToast('Erro: ' + e.message + ' (rode o grant de operadores)', 'err'),
  })

  // PIN obrigatório por loja (lojas.etq_exige_pin) — só admin altera (RPC confere no servidor)
  const { data: lojasPin = [] } = useQuery({
    queryKey: ['etq-lojas-full', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('lojas').select('*').eq('tenant_id', tenantId); return (data ?? []) as { id: string; nome?: string; etq_exige_pin?: boolean }[] },
  })
  const exigePin = (id: string) => !!lojasPin.find((l) => l.id === id)?.etq_exige_pin
  const setPin = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => { const { error } = await supabase.rpc('etq_definir_exige_pin', { p_loja_id: id, p_valor: v }); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-lojas-full'] }); showToast('Exigência de PIN atualizada.', 'ok') },
    onError: (e: Error) => showToast('Erro: ' + e.message, 'err'),
  })

  return (
    <>
      <div className="etq-toolbar">
        <div style={{ flex: 1, fontSize: 12.5, color: '#64748b' }}>Operadores usam <b>nome + PIN</b> no tablet pra emitir/baixar. Após 5 PINs errados o operador é bloqueado por 15 min.</div>
        {canEdit && <button className="etq-btn etq-btn-pri" onClick={() => setEdit({ nome: '', loja_id: lojas.length === 1 ? lojas[0].id : '', pin: '' })}>+ Novo operador</button>}
      </div>
      <div className="etq-card">
        <table className="etq-tbl">
          <thead><tr><th>Nome</th><th>Loja</th><th>Situação</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={4} className="etq-empty">Carregando…</td></tr>
              : ops.length === 0 ? <tr><td colSpan={4} className="etq-empty">Nenhum operador. Clique em “+ Novo operador”.</td></tr>
              : ops.map((o) => {
                const bloq = o.bloqueado_ate && new Date(o.bloqueado_ate).getTime() > Date.now()
                return (
                  <tr key={o.id}>
                    <td>{o.nome}</td>
                    <td style={{ color: '#64748b' }}>{lojaNome(o.loja_id)}</td>
                    <td><span className={'etq-sit ' + (bloq ? 'vd' : o.ativo ? 'ok' : 'baixada')}>{bloq ? 'Bloqueado' : o.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td className="r">{canEdit && <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="etq-btn etq-btn-sm" onClick={() => setEdit({ id: o.id, nome: o.nome, loja_id: o.loja_id || '', pin: '' })}>Editar</button>
                      {bloq && <button className="etq-btn etq-btn-sm" onClick={() => patch.mutate({ id: o.id, data: { tentativas: 0, bloqueado_ate: null } })}>Desbloquear</button>}
                      <button className="etq-btn etq-btn-sm" onClick={() => patch.mutate({ id: o.id, data: { ativo: !o.ativo } })}>{o.ativo ? 'Desativar' : 'Ativar'}</button>
                    </div>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="etq-card" style={{ marginTop: 16 }}>
        <table className="etq-tbl">
          <thead><tr><th>Loja</th><th>Exigir operador + PIN ao emitir</th></tr></thead>
          <tbody>
            {lojas.map((l) => (
              <tr key={l.id}>
                <td>{l.nome}</td>
                <td>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: isAdmin ? 'pointer' : 'default' }}>
                    <input type="checkbox" checked={exigePin(l.id)} disabled={!isAdmin || setPin.isPending} onChange={(e) => setPin.mutate({ id: l.id, v: e.target.checked })} />
                    <span style={{ color: exigePin(l.id) ? '#0f766e' : '#64748b', fontWeight: 600 }}>{exigePin(l.id) ? 'Sim — escolhe o operador e digita o PIN' : 'Não — escolhe o responsável na lista'}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isAdmin && <div className="etq-hint" style={{ marginTop: 8 }}>Só o administrador pode mudar a exigência de PIN.</div>}
      {edit && (
        <div className="etq-ov" onClick={() => setEdit(null)}>
          <div className="etq-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px,100%)' }}>
            <div className="etq-mh"><h2>{edit.id ? 'Editar operador' : 'Novo operador'}</h2><button className="x" onClick={() => setEdit(null)}>✕</button></div>
            <div className="etq-mb">
              <div className="etq-fg"><label>Nome *</label><input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} placeholder="Ex.: Maria S." autoFocus /></div>
              <div className="etq-fg"><label>Loja *</label>
                <select value={edit.loja_id} onChange={(e) => setEdit({ ...edit, loja_id: e.target.value })}>
                  <option value="">Selecione...</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div className="etq-fg"><label>PIN (4 a 6 dígitos){edit.id ? ' — deixe em branco para manter' : ' *'}</label><input value={edit.pin} inputMode="numeric" maxLength={6} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '') })} placeholder="••••" /></div>
            </div>
            <div className="etq-mf">
              <button className="etq-btn" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="etq-btn etq-btn-pri" disabled={salvar.isPending} onClick={() => salvar.mutate(edit)}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={'etq-toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}

function Formato() {
  const [fmt, setFmt] = useState(getFmt())
  const [printData, setPrintData] = useState<PrintData>(null)
  const sel = (v: string) => { setFmt(v); try { localStorage.setItem('etq_formato', v) } catch { /* ignore */ } ; applyFormato() }

  async function testar() {
    const sample: EtqForLabel = {
      codigo: 'SPN-EXEMPLO1', nome_snap: 'Etiqueta de teste', grupo_snap: 'Teste', modo: 'resfriado',
      quantidade: 250, unidade: 'g', manipulacao_em: new Date().toISOString(),
      validade_em: new Date(Date.now() + 3 * 86400_000).toISOString(), marca_forn: 'Produção própria', sif: '', responsavel_nome: 'Teste',
    }
    const items = await buildQrItems([sample])
    setPrintData({ loja: null, items })
    setTimeout(() => { applyFormato(); window.print(); setTimeout(() => setPrintData(null), 500) }, 120)
  }

  return (
    <>
      <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 14, maxWidth: 560 }}>O formato é salvo <b>neste dispositivo</b> (cada tablet/PC pode ter o seu). Ajuste o papel da impressora de acordo.</div>
      <div className="etq-fmt-opts">
        {FORMATOS.map((f) => (
          <div key={f.v} className={'etq-fmt-card' + (fmt === f.v ? ' on' : '')} onClick={() => sel(f.v)}>
            <div className="box" style={{ width: f.w * 0.9, height: f.h * 0.9 }} />
            <div className="nm">{f.nm}</div><div className="sz">{f.sz}</div>
          </div>
        ))}
      </div>
      <button className="etq-btn etq-btn-pri" style={{ marginTop: 16 }} onClick={testar}>🖨 Testar impressão</button>
      <div className="etq-hint" style={{ marginTop: 10 }}>No diálogo do Chrome use <b>Margens: Nenhuma</b> pra sair 1 etiqueta por página.</div>
      <EtqPrintArea data={printData} />
    </>
  )
}

function Grupos() {
  const { tenantId } = useAuth()
  const { podeEditar } = usePerms()
  const canEdit = podeEditar('etiquetas/config')
  const qc = useQueryClient()
  const { toast, showToast } = useToastTipo(2400)
  const [novo, setNovo] = useState('')

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['etq-grupos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Grupo>((f, t) => supabase.from('etiqueta_grupos').select('id,nome').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)),
  })
  const contagem = useQuery({
    queryKey: ['etq-grupo-cont', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('etiqueta_itens').select('grupo_id').eq('tenant_id', tenantId); const m: Record<string, number> = {}; (data ?? []).forEach((r: { grupo_id?: string | null }) => { if (r.grupo_id) m[r.grupo_id] = (m[r.grupo_id] || 0) + 1 }); return m },
  })
  const cont = useMemo(() => contagem.data || {}, [contagem.data])

  const add = useMutation({
    mutationFn: async (nome: string) => { if (!nome.trim()) throw new Error('Informe o nome.'); const { error } = await supabase.from('etiqueta_grupos').insert({ tenant_id: tenantId, nome: nome.trim() }); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-grupos'] }); setNovo(''); showToast('Grupo criado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const rename = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => { const { error } = await supabase.from('etiqueta_grupos').update({ nome }).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-grupos'] }); showToast('Grupo renomeado.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('etiqueta_grupos').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['etq-grupos'] }); qc.invalidateQueries({ queryKey: ['etq-itens'] }); showToast('Grupo excluído.', 'ok') },
    onError: (e: Error) => showToast(e.message, 'err'),
  })

  return (
    <>
      {canEdit && <div className="etq-toolbar">
        <div className="etq-search"><input placeholder="Nome do novo grupo..." value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add.mutate(novo) }} /></div>
        <button className="etq-btn etq-btn-pri" disabled={add.isPending || !novo.trim()} onClick={() => add.mutate(novo)}>+ Criar grupo</button>
      </div>}
      <div className="etq-card">
        <table className="etq-tbl">
          <thead><tr><th>Grupo</th><th className="r">Produtos</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={3} className="etq-empty">Carregando…</td></tr>
              : grupos.length === 0 ? <tr><td colSpan={3} className="etq-empty">Nenhum grupo.</td></tr>
              : grupos.map((g) => (
                <tr key={g.id}>
                  <td>{g.nome}</td>
                  <td className="r" style={{ color: '#64748b' }}>{cont[g.id] || 0}</td>
                  <td className="r">{canEdit && <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="etq-btn etq-btn-sm" onClick={() => { const n = prompt('Novo nome do grupo:', g.nome); if (n && n.trim() && n.trim() !== g.nome) rename.mutate({ id: g.id, nome: n.trim() }) }}>Renomear</button>
                    <button className="etq-btn etq-btn-sm" onClick={() => { if (confirm(`Excluir o grupo "${g.nome}"? Os produtos dele ficam "sem grupo" (não são apagados).`)) del.mutate(g.id) }}>Excluir</button>
                  </div>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {toast && <div className={'etq-toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}
