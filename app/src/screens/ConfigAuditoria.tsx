import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import { downloadCsv } from '../lib/csv'
import { isoD } from '../lib/date'
import './estoque.css'

// Trilha de auditoria ("quem fez o quê") — Fase 1. Só ADMIN (tela escondida/bloqueada
// pra não-admin via ADMIN_ONLY_KEYS). Os eventos são gravados por GATILHOS no banco
// (tabela `auditoria`, só-anexar). Aqui é só leitura: filtros + lista + exportar CSV.

type Aud = {
  id: string; criado_em?: string; usuario_id?: string | null; usuario_nome?: string | null
  acao?: string; entidade?: string; registro_id?: string | null; registro_desc?: string | null
  dados?: { old?: Record<string, unknown>; new?: Record<string, unknown> } | null
}

const PER = 20
// entidades auditadas na Fase 1 (valor = nome da tabela)
const ENT_OPTS: { v: string; l: string }[] = [
  { v: 'insumos', l: 'Insumos / Itens' },
  { v: 'produtos', l: 'Produtos' },
  { v: 'fichas_tecnicas', l: 'Fichas técnicas' },
  { v: 'entradas_estoque', l: 'Entradas de estoque' },
  { v: 'saidas_estoque', l: 'Saídas de estoque' },
  { v: 'nfe_recebidas', l: 'NF-e' },
  { v: 'usuarios', l: 'Usuários' },
]
const ENT_LABEL: Record<string, string> = Object.fromEntries(ENT_OPTS.map((e) => [e.v, e.l]))

// traduz (entidade + operação) para uma frase amigável
function acaoLabel(a: Aud): string {
  const ent = a.entidade || ''
  const ns = (a.dados?.new?.status as string) || ''
  const os = (a.dados?.old?.status as string) || ''
  if (ent === 'nfe_recebidas') {
    if (a.acao === 'DELETE') return 'Excluiu NF-e'
    if (ns === 'excluida') return 'Excluiu NF-e'
    if (ns === 'estornada' || (os === 'processada' && ns === 'em_transito')) return 'Estornou NF-e'
    if (ns === 'processada') return 'Processou NF-e'
    return 'Alterou NF-e'
  }
  const wasOn = a.dados?.old?.ativo !== false, nowOff = a.dados?.new?.ativo === false
  if (ent === 'produtos' && a.acao === 'UPDATE' && wasOn && nowOff) return 'Inativou produto'
  if (ent === 'insumos' && a.acao === 'UPDATE' && wasOn && nowOff) return 'Inativou item'
  if (ent === 'fichas_tecnicas' && a.acao === 'UPDATE' && a.dados?.old?.status !== 'arquivada' && a.dados?.new?.status === 'arquivada') return 'Arquivou ficha'
  const map: Record<string, [string, string, string]> = {
    insumos: ['Criou item', 'Editou item', 'Excluiu item'],
    produtos: ['Criou produto', 'Editou produto', 'Excluiu produto'],
    fichas_tecnicas: ['Criou ficha', 'Editou ficha', 'Excluiu ficha'],
    entradas_estoque: ['Registrou entrada', 'Editou entrada', 'Excluiu entrada'],
    saidas_estoque: ['Registrou saída', 'Editou saída', 'Excluiu saída'],
    usuarios: ['Criou usuário', 'Editou usuário', 'Removeu usuário'],
  }
  const t = map[ent]
  const idx = a.acao === 'INSERT' ? 0 : a.acao === 'UPDATE' ? 1 : 2
  return t ? t[idx] : `${a.acao || '—'} · ${ent}`
}
const acaoCor = (a: Aud) => a.acao === 'DELETE' ? '#e11d48' : a.acao === 'INSERT' ? '#16a34a' : '#2563eb'
const fmtDH = (s?: string) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// campos que mudaram num UPDATE (old → new), ignorando ruído técnico
const IGNORAR = new Set(['atualizado_em', 'updated_at', 'criado_em', 'created_at'])
function diffCampos(a: Aud): { campo: string; de: string; para: string }[] {
  const o = a.dados?.old || {}, n = a.dados?.new || {}
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !IGNORAR.has(k))
  const fmt = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v)
  return keys
    .filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => ({ campo: k, de: fmt(o[k]), para: fmt(n[k]) }))
}

export function ConfigAuditoria() {
  const { tenantId } = useAuth()
  const now = new Date()
  const [fEnt, setFEnt] = useState('')
  const [fUser, setFUser] = useState('')
  const [de, setDe] = useState(isoD(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [ate, setAte] = useState(isoD(now))
  const [busca, setBusca] = useState('')
  const [pag, setPag] = useState(1)
  const [ver, setVer] = useState<Aud | null>(null)

  // lista de usuários (p/ o filtro) — admin lê usuarios do tenant
  const { data: usuarios = [] } = useQuery({
    queryKey: ['aud-users', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('usuarios').select('nome').eq('tenant_id', tenantId).order('nome'); return ((data ?? []) as { nome?: string }[]).map((u) => u.nome).filter(Boolean) as string[] },
  })
  const userOpts = useMemo(() => ['Sistema', ...usuarios], [usuarios])

  // aplica os filtros atuais num query builder do Supabase (encadeável)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aplicaFiltros = (q: any): any => {
    let qq = q
    if (fEnt) qq = qq.eq('entidade', fEnt)
    if (fUser === 'Sistema') qq = qq.is('usuario_id', null)
    else if (fUser) qq = qq.eq('usuario_nome', fUser)
    // filtro de data em horário de Brasília (-03): criado_em é timestamptz em UTC,
    // então à noite o evento "vira o dia seguinte" em UTC. O offset -03:00 conserta.
    if (de) qq = qq.gte('criado_em', de + 'T00:00:00-03:00')
    if (ate) qq = qq.lte('criado_em', ate + 'T23:59:59-03:00')
    if (busca.trim()) qq = qq.ilike('registro_desc', `%${busca.trim()}%`)
    return qq
  }

  const { data, isLoading } = useQuery({
    queryKey: ['auditoria', tenantId, fEnt, fUser, de, ate, busca, pag], enabled: !!tenantId,
    queryFn: async () => {
      const from = (pag - 1) * PER
      let q = supabase.from('auditoria').select('*', { count: 'exact' }).eq('tenant_id', tenantId)
      q = aplicaFiltros(q)
      const { data, count } = await q.order('criado_em', { ascending: false }).range(from, from + PER - 1)
      return { rows: (data ?? []) as Aud[], count: count ?? 0 }
    },
  })
  const rows = data?.rows ?? []
  const total = data?.count ?? 0
  const totalPags = Math.max(1, Math.ceil(total / PER))
  const pagAtual = Math.min(pag, totalPags)

  const exportar = async () => {
    const all = await fetchAll<Aud>((f, t) => {
      let q = supabase.from('auditoria').select('*').eq('tenant_id', tenantId)
      q = aplicaFiltros(q)
      return q.order('criado_em', { ascending: false }).range(f, t)
    })
    if (!all.length) return
    const head = ['Data/Hora', 'Usuário', 'Ação', 'Tipo', 'Registro', 'ID']
    const linhas = all.map((a) => [fmtDH(a.criado_em), a.usuario_nome || 'Sistema', acaoLabel(a), ENT_LABEL[a.entidade || ''] || a.entidade || '', a.registro_desc || '', a.registro_id || ''])
    downloadCsv(`auditoria_${new Date().toLocaleDateString('en-CA')}.csv`, [head, ...linhas])
  }

  return (
    <div className="est-screen">
      <div className="ds-filterbar">
        <div className="ds-field" style={{ minWidth: 170 }}><label>Tipo</label>
          <SearchSelect value={ENT_LABEL[fEnt] || ''} options={ENT_OPTS.map((e) => e.l)} placeholder="Todos os tipos" onChange={(l) => { setFEnt(ENT_OPTS.find((e) => e.l === l)?.v || ''); setPag(1) }} />
        </div>
        <div className="ds-field" style={{ minWidth: 170 }}><label>Usuário</label>
          <SearchSelect value={fUser} options={userOpts} placeholder="Todos os usuários" onChange={(v) => { setFUser(v); setPag(1) }} />
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" value={de} onChange={(e) => { setDe(e.target.value); setPag(1) }} /></div>
        <div className="ds-field"><label>Até</label><input type="date" className="field" value={ate} onChange={(e) => { setAte(e.target.value); setPag(1) }} /></div>
        <div className="ds-field ds-grow"><label>Buscar registro</label><input className="field" style={{ width: '100%', minWidth: 180 }} placeholder="Nome, número, chave…" value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1) }} /></div>
        <div className="ds-actions">
          <button className="btn-ghost" onClick={() => { setFEnt(''); setFUser(''); setBusca(''); setDe(isoD(new Date(now.getFullYear(), now.getMonth(), 1))); setAte(isoD(now)); setPag(1) }}>Limpar filtros</button>
          <button className="btn-ghost" onClick={exportar} title="Exportar o resultado filtrado em CSV">⬇ Exportar CSV</button>
        </div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th>Data / Hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th className="c">Detalhe</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} className="empty">Carregando…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={5} className="empty">Nenhum evento no período/filtro.</td></tr>
              : rows.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ color: '#64748b', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDH(a.criado_em)}</td>
                  <td>{a.usuario_nome || <span style={{ color: '#94a3b8' }}>Sistema</span>}</td>
                  <td style={{ color: acaoCor(a), fontWeight: 600 }}>{acaoLabel(a)}</td>
                  <td>{a.registro_desc || <span style={{ color: '#cbd5e1' }}>—</span>}<span style={{ color: '#94a3b8', fontSize: 11 }}> · {ENT_LABEL[a.entidade || ''] || a.entidade}</span></td>
                  <td className="c"><button className="btn-ghost" style={{ height: 26, padding: '0 10px' }} onClick={() => setVer(a)}>Ver</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div>

      <div className="pag-bar">
        <span>{total ? `${(pagAtual - 1) * PER + 1}–${Math.min(pagAtual * PER, total)} de ${total} evento(s)` : '0 eventos'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="pag-btn" disabled={pagAtual === 1} onClick={() => setPag(pagAtual - 1)}>‹</button>
          <span className="pag-btn active">{pagAtual}</span>
          <button className="pag-btn" disabled={pagAtual >= totalPags} onClick={() => setPag(pagAtual + 1)}>›</button>
        </div>
      </div>

      {ver && (() => {
        const campos = ver.acao === 'UPDATE' ? diffCampos(ver) : []
        const snap = (ver.acao === 'INSERT' ? ver.dados?.new : ver.acao === 'DELETE' ? ver.dados?.old : null) || null
        return (
          <div className="ov" onClick={() => setVer(null)}>
            <div className="modal" style={{ width: 'min(620px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}>{acaoLabel(ver)}</h2>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDH(ver.criado_em)} · {ver.usuario_nome || 'Sistema'} · {ENT_LABEL[ver.entidade || ''] || ver.entidade}{ver.registro_desc ? ' · ' + ver.registro_desc : ''}</div>
                </div>
                <button className="icon-btn" onClick={() => setVer(null)}>✕</button>
              </div>
              {ver.acao === 'UPDATE' ? (
                campos.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13, padding: '8px 0' }}>Sem mudanças de campo registradas.</div>
                  : <table className="tbl"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
                      <tbody>{campos.map((c) => <tr key={c.campo}><td style={{ fontWeight: 600 }}>{c.campo}</td><td style={{ color: '#64748b' }}>{c.de}</td><td style={{ color: '#0f172a' }}>{c.para}</td></tr>)}</tbody>
                    </table>
              ) : (
                <table className="tbl"><thead><tr><th>Campo</th><th>Valor</th></tr></thead>
                  <tbody>{snap ? Object.entries(snap).filter(([k]) => !IGNORAR.has(k)).map(([k, v]) => <tr key={k}><td style={{ fontWeight: 600 }}>{k}</td><td style={{ color: '#334155' }}>{v === null || v === undefined || v === '' ? '—' : String(v)}</td></tr>) : <tr><td colSpan={2} className="empty">Sem dados.</td></tr>}</tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
