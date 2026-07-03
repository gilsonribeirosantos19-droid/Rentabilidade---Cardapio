import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import './config.css'

// Configurações › Permissões — grupos de acesso (grupos_acesso) + vincular usuários
// (usuarios.role = nome do grupo) + matriz de permissões por módulo (permissoes).

type Grupo = { id: string; nome: string; ativo?: boolean }
type Usuario = { id: string; nome?: string; email?: string; role?: string; ativo?: boolean }
type Perm = { modulo: string; visualizar?: boolean; criar?: boolean; editar?: boolean; excluir?: boolean }

const MODULO_GROUPS = [
  { lbl: 'Operação', mods: [{ id: 'estoque', lbl: 'Estoque' }, { id: 'ajustes', lbl: 'Ajustes de Estoque' }] },
  { lbl: 'Cadastros', mods: [{ id: 'insumos', lbl: 'Insumos' }, { id: 'fichas_tecnicas', lbl: 'Fichas Técnicas' }, { id: 'fornecedores', lbl: 'Fornecedores' }] },
  { lbl: 'Compras', mods: [{ id: 'compras', lbl: 'Compras' }] },
  { lbl: 'Análises', mods: [{ id: 'relatorios', lbl: 'Relatórios' }, { id: 'cmv', lbl: 'CMV Teórico × Real' }, { id: 'rendimento', lbl: 'Rendimentos' }, { id: 'pdv', lbl: 'PDV / Vendas' }] },
  { lbl: 'PCP', mods: [{ id: 'pcp', lbl: 'PCP / Produção' }, { id: 'porcionamento', lbl: 'Porcionamento' }] },
  { lbl: 'Portal', mods: [{ id: 'portal_gerente', lbl: 'Portal do Gerente' }, { id: 'dashboard', lbl: 'Dashboard' }, { id: 'configuracoes', lbl: 'Configurações' }] },
]
const ALL_MODS = MODULO_GROUPS.flatMap((g) => g.mods)

type PState = Record<string, { hab: boolean; ct: boolean }>

export function ConfigPermissoes() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [selId, setSelId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [nome, setNome] = useState('')
  const [tab, setTab] = useState<'usuarios' | 'perms'>('usuarios')
  const [vinc, setVinc] = useState<Set<string>>(new Set())
  const [perms, setPerms] = useState<PState>({})
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 7000 : 2600) }

  const { data: grupos = [] } = useQuery({
    queryKey: ['cfg-grupos', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('grupos_acesso').select('*').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Grupo[] },
  })
  const { data: usuarios = [] } = useQuery({
    queryKey: ['cfg-perm-usuarios', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('usuarios').select('*').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Usuario[] },
  })

  const grp = grupos.find((g) => g.id === selId)
  const isAdmin = (grp?.nome || '').toLowerCase() === 'administrador'
  const aberto = isNew || !!grp

  // permissões do grupo selecionado
  const { data: permData } = useQuery({
    queryKey: ['cfg-perm', tenantId, grp?.nome], enabled: !!tenantId && !!grp,
    queryFn: async () => { const { data } = await supabase.from('permissoes').select('modulo,visualizar,criar,editar,excluir').eq('tenant_id', tenantId).eq('perfil', grp!.nome); return (data ?? []) as Perm[] },
  })

  // init matriz quando carrega permissões / troca grupo
  useEffect(() => {
    if (!grp) return
    const out: PState = {}
    ALL_MODS.forEach((m) => {
      if (isAdmin) { out[m.id] = { hab: true, ct: true }; return }
      const p = (permData ?? []).find((x) => x.modulo === m.id)
      const hab = p?.visualizar === true
      const ct = !!(p?.visualizar && (p.criar || p.editar || p.excluir))
      out[m.id] = { hab, ct }
    })
    setPerms(out)
  }, [permData, grp?.nome, isAdmin])

  // init vínculos de usuário quando troca grupo
  useEffect(() => {
    if (!grp) { setVinc(new Set()); return }
    setVinc(new Set(usuarios.filter((u) => u.role === grp.nome).map((u) => u.id)))
  }, [grp?.nome, usuarios])

  const selecionar = (id: string) => { const g = grupos.find((x) => x.id === id); if (!g) return; setSelId(id); setIsNew(false); setNome(g.nome); setTab('usuarios') }
  const novo = () => { setSelId(null); setIsNew(true); setNome(''); setTab('usuarios'); setVinc(new Set()) }
  const fechar = () => { setSelId(null); setIsNew(false); setNome('') }

  const grupoSaveMut = useMutation({
    mutationFn: async () => {
      const n = nome.trim(); if (!n) throw new Error('Informe o nome do grupo.')
      if (selId) { const { error } = await supabase.from('grupos_acesso').update({ nome: n }).eq('id', selId); if (error) throw error; return selId }
      const { data, error } = await supabase.from('grupos_acesso').insert({ tenant_id: tenantId, nome: n, ativo: true }).select('id').single(); if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ['cfg-grupos'] }); setSelId(id); setIsNew(false); showToast(selId ? 'Grupo atualizado.' : 'Grupo criado.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })
  const grupoDelMut = useMutation({
    mutationFn: async () => { if (!selId) return; const { error } = await supabase.from('grupos_acesso').delete().eq('id', selId); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cfg-grupos'] }); fechar(); showToast('Grupo excluído.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })
  const [delAsk, setDelAsk] = useState(false)

  const vincSaveMut = useMutation({
    mutationFn: async () => {
      if (!grp) return
      for (const u of usuarios) {
        const nowIn = vinc.has(u.id), wasIn = u.role === grp.nome
        if (nowIn && !wasIn) { const { error } = await supabase.from('usuarios').update({ role: grp.nome }).eq('id', u.id); if (error) throw error }
        else if (!nowIn && wasIn) { const { error } = await supabase.from('usuarios').update({ role: null }).eq('id', u.id); if (error) throw error }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cfg-perm-usuarios'] }); showToast('Vínculos salvos.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const permSaveMut = useMutation({
    mutationFn: async () => {
      if (!grp) return
      const rows = ALL_MODS.map((m) => { const s = perms[m.id] || { hab: false, ct: false }; return { tenant_id: tenantId, perfil: grp.nome, modulo: m.id, visualizar: s.hab, criar: s.hab && s.ct, editar: s.hab && s.ct, excluir: s.hab && s.ct } })
      const { error } = await supabase.from('permissoes').upsert(rows, { onConflict: 'tenant_id,perfil,modulo' }); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cfg-perm'] }); showToast('Permissões salvas.') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  // handlers da matriz
  const setMod = (id: string, next: { hab: boolean; ct: boolean }) => setPerms((p) => ({ ...p, [id]: next }))
  const onHab = (id: string, checked: boolean) => setMod(id, { hab: checked, ct: checked ? (perms[id]?.ct ?? false) : false })
  const onCT = (id: string, checked: boolean) => setMod(id, { hab: checked ? true : (perms[id]?.hab ?? false), ct: checked })
  const onSL = (id: string, checked: boolean) => setMod(id, { hab: checked, ct: false })

  const toggleVinc = (id: string) => setVinc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const grupoAtual = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.id, u.role])) as Record<string, string | undefined>, [usuarios])

  return (
    <div className="cfg-screen">
      <div style={{ fontSize: 13, color: '#64748b', margin: '12px 0 14px' }}>Gerencie grupos de acesso e defina o que cada grupo pode fazer no sistema.</div>

      <div className="perm-wrap">
        {/* ESQUERDA: grupos */}
        <div className="grp-panel">
          <div className="grp-head"><span className="lbl">Grupos de Acesso</span><button className="cfg-btn pri" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={novo}>+ Novo</button></div>
          {grupos.length === 0 ? <div className="grp-note" style={{ textAlign: 'center' }}>Nenhum grupo cadastrado</div>
            : grupos.map((g) => (
              <div key={g.id} className={'grp-item' + (g.id === selId ? ' on' : '')} onClick={() => selecionar(g.id)}>
                <span className="nm">{g.nome}</span>
                <span className="st" style={{ color: g.ativo !== false ? '#16a34a' : '#94a3b8' }}>{g.ativo !== false ? 'Ativo' : 'Inativo'}</span>
              </div>
            ))}
        </div>

        {/* DIREITA: detalhe ou vazio */}
        {!aberto ? (
          <div className="grp-empty">Selecione um grupo para gerenciar (ou clique em “+ Novo”).</div>
        ) : (
          <div className="grp-detail">
            <div className="grp-dh">
              <input className="grp-nome-in" placeholder="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} disabled={isAdmin} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <button className="cfg-btn pri" style={{ height: 32 }} disabled={isAdmin || grupoSaveMut.isPending} onClick={() => grupoSaveMut.mutate()}>{grupoSaveMut.isPending ? 'Salvando…' : 'Salvar grupo'}</button>
                {selId && !isAdmin && <button className="cfg-btn danger" style={{ height: 32 }} onClick={() => setDelAsk(true)}>Excluir</button>}
                <button className="grp-x" onClick={fechar}>×</button>
              </div>
            </div>

            <div className="grp-tabs">
              <button className={tab === 'usuarios' ? 'on' : ''} onClick={() => setTab('usuarios')}>Vincular Usuários</button>
              <button className={tab === 'perms' ? 'on' : ''} onClick={() => setTab('perms')} disabled={isNew}>Permissões / Acesso</button>
            </div>

            {/* ABA USUÁRIOS */}
            {tab === 'usuarios' && (
              isNew ? <div className="grp-note">Salve o grupo primeiro para vincular usuários.</div>
                : <>
                  <div className="grp-note">Usuários marcados pertencem a este grupo.</div>
                  <table className="vinc-tbl">
                    <thead><tr><th style={{ width: 40 }}>Sel.</th><th>Login / E-mail</th><th>Nome</th><th>Grupo Atual</th><th>Situação</th></tr></thead>
                    <tbody>
                      {usuarios.length === 0 ? <tr><td colSpan={5} style={{ color: '#94a3b8', padding: 14 }}>Nenhum usuário cadastrado.</td></tr>
                        : usuarios.map((u) => (
                          <tr key={u.id}>
                            <td><input type="checkbox" checked={vinc.has(u.id)} onChange={() => toggleVinc(u.id)} /></td>
                            <td className="mono" style={{ fontSize: 11.5, color: '#475569' }}>{u.email || '—'}</td>
                            <td style={{ fontWeight: 500 }}>{u.nome || '—'}</td>
                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{grupoAtual[u.id] || '—'}</td>
                            <td style={{ fontSize: 11.5, color: u.ativo !== false ? '#16a34a' : '#94a3b8' }}>{u.ativo !== false ? 'Ativo' : 'Inativo'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div className="grp-foot"><button className="cfg-btn pri" disabled={vincSaveMut.isPending} onClick={() => vincSaveMut.mutate()}>{vincSaveMut.isPending ? 'Salvando…' : 'Salvar vínculos'}</button></div>
                </>
            )}

            {/* ABA PERMISSÕES */}
            {tab === 'perms' && !isNew && (
              <>
                <table className="perm-matrix">
                  <thead><tr><th style={{ minWidth: 220 }}>Módulo / Funcionalidade</th><th className="pc">Habilitado</th><th className="pc">Controle Total</th><th className="pc">Somente Leitura</th></tr></thead>
                  <tbody>
                    {MODULO_GROUPS.map((g) => (
                      <Fragment key={g.lbl}>
                        <tr className="grp-row"><td colSpan={4}>{g.lbl}</td></tr>
                        {g.mods.map((m) => {
                          const s = perms[m.id] || { hab: false, ct: false }
                          const sl = s.hab && !s.ct
                          return (
                            <tr key={m.id} className={isAdmin ? 'perm-disabled' : ''}>
                              <td style={{ paddingLeft: 28 }}>{m.lbl}</td>
                              <td className="pc"><input type="checkbox" checked={s.hab} disabled={isAdmin} onChange={(e) => onHab(m.id, e.target.checked)} /></td>
                              <td className="pc"><input type="checkbox" checked={s.ct} disabled={isAdmin} onChange={(e) => onCT(m.id, e.target.checked)} /></td>
                              <td className="pc"><input type="checkbox" checked={sl} disabled={isAdmin} onChange={(e) => onSL(m.id, e.target.checked)} /></td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {!isAdmin && <div className="grp-foot"><button className="cfg-btn pri" disabled={permSaveMut.isPending} onClick={() => permSaveMut.mutate()}>{permSaveMut.isPending ? 'Salvando…' : 'Salvar permissões'}</button></div>}
                {isAdmin && <div className="grp-note">O grupo <b>Administrador</b> tem acesso total e não pode ser editado.</div>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="adm-aviso">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <span><b>Administrador</b> — tem acesso total e não pode ser editado nem excluído.</span>
      </div>

      {delAsk && (
        <div className="cfg-ov" onClick={(e) => { if (e.target === e.currentTarget) setDelAsk(false) }}>
          <div className="cfg-modal" style={{ width: 'min(400px,94vw)' }}>
            <div className="mh"><h2>Excluir grupo</h2><button className="mx" onClick={() => setDelAsk(false)}>✕</button></div>
            <div className="mb"><p style={{ fontSize: 13, color: '#334155' }}>Excluir o grupo <b>{grp?.nome}</b>? Os usuários deste grupo ficam sem perfil.</p></div>
            <div className="mf">
              <button className="cfg-btn" onClick={() => setDelAsk(false)}>Cancelar</button>
              <button className="cfg-btn danger" disabled={grupoDelMut.isPending} onClick={() => { grupoDelMut.mutate(); setDelAsk(false) }}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
