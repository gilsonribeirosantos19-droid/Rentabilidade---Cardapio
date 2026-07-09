import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './metas.css'

// Gestão › Metas — acompanhamento diário (Meta × Realizado × Diferença), no modelo da planilha.
// Meta = valor do dia da semana (metas_semana) ou exceção da data (metas_excecao).
// Realizado = faturado de icomanda_recebimento (só dias 'processado' — o portão da integração).

type MetaSem = { loja_id: string; dia_semana: number; valor?: number }
type MetaExc = { id?: string; loja_id: string; data: string; valor?: number; motivo?: string | null }
type Rec = { loja_id: string; data: string; faturado?: number; ticket_medio?: number; pessoas?: number; status?: string }

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseNum = (v: unknown) => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0
const pad = (n: number) => String(n).padStart(2, '0')

export function Metas() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const qc = useQueryClient()
  const now = new Date()
  const [mes, setMes] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)
  const [lojaFil, setLojaFil] = useState('')            // '' até as lojas carregarem; senão id ou 'todas'
  const [cfgOpen, setCfgOpen] = useState(false)
  const [toast, setToast] = useState<{ m: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ m, err }); window.setTimeout(() => setToast(null), err ? 5000 : 3000) }

  // default de loja = primeira, quando carregar
  const lojaSel = lojaFil || (lojas[0]?.id ?? '')

  const ini = `${mes}-01`
  const [ay, am] = mes.split('-').map(Number)
  const fim = `${mes}-${pad(new Date(ay, am, 0).getDate())}`

  const { data: metaSem = [] } = useQuery({ queryKey: ['metas-sem', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('metas_semana').select('loja_id,dia_semana,valor').eq('tenant_id', tenantId); return (data ?? []) as MetaSem[] } })
  const { data: metaExc = [] } = useQuery({ queryKey: ['metas-exc', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('metas_excecao').select('id,loja_id,data,valor,motivo').eq('tenant_id', tenantId); return (data ?? []) as MetaExc[] } })
  const { data: ticketMeta = 0 } = useQuery({ queryKey: ['metas-ticket', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('parametros').select('valor').eq('tenant_id', tenantId).eq('modulo', 'metas').eq('chave', 'ticket_medio').limit(1); return parseNum(data?.[0]?.valor) } })
  const { data: rec = [] } = useQuery({ queryKey: ['metas-rec', tenantId, mes], enabled: !!tenantId, queryFn: () => fetchAll<Rec>((f, t) => supabase.from('icomanda_recebimento').select('loja_id,data,faturado,ticket_medio,pessoas,status').eq('tenant_id', tenantId).eq('status', 'processado').gte('data', ini).lte('data', fim).range(f, t)) })

  const semMap = useMemo(() => { const m: Record<string, number> = {}; metaSem.forEach((s) => { m[`${s.loja_id}|${s.dia_semana}`] = Number(s.valor) || 0 }); return m }, [metaSem])
  const excMap = useMemo(() => { const m: Record<string, number> = {}; metaExc.forEach((e) => { m[`${e.loja_id}|${e.data}`] = Number(e.valor) || 0 }); return m }, [metaExc])
  const recMap = useMemo(() => { const m: Record<string, Rec> = {}; rec.forEach((r) => { m[`${r.loja_id}|${r.data}`] = r }); return m }, [rec])

  const metaDia = (lojaId: string, ds: string, dow: number) => (excMap[`${lojaId}|${ds}`] ?? semMap[`${lojaId}|${dow}`] ?? 0)

  const rows = useMemo(() => {
    if (!lojaSel) return []
    const last = new Date(ay, am, 0).getDate()
    const isCur = now.getFullYear() === ay && now.getMonth() + 1 === am
    const upto = isCur ? now.getDate() : last
    const lojasCalc = lojaSel === 'todas' ? lojas : lojas.filter((l) => l.id === lojaSel)
    const out = []
    for (let d = 1; d <= upto; d++) {
      const ds = `${mes}-${pad(d)}`
      const dow = new Date(ay, am - 1, d).getDay()
      let meta = 0, real = 0, pes = 0
      for (const l of lojasCalc) { meta += metaDia(l.id, ds, dow); const r = recMap[`${l.id}|${ds}`]; if (r) { real += Number(r.faturado) || 0; pes += Number(r.pessoas) || 0 } }
      const ticket = lojaSel === 'todas' ? (pes > 0 ? real / pes : null) : (recMap[`${lojaSel}|${ds}`]?.ticket_medio ?? null)
      out.push({ d, ds, dow, meta, real, pes, dif: real - meta, pct: meta > 0 ? (real / meta) * 100 : null, ticket: ticket != null ? Number(ticket) : null })
    }
    return out
  }, [lojaSel, mes, lojas, semMap, excMap, recMap])

  const resumo = useMemo(() => {
    let meta = 0, real = 0, pes = 0, bat = 0, comReal = 0
    rows.forEach((r) => { meta += r.meta; real += r.real; pes += r.pes; if (r.real > 0) { comReal++; if (r.dif >= 0) bat++ } })
    return { meta, real, dif: real - meta, bat, comReal, ticket: pes > 0 ? real / pes : 0 }
  }, [rows])

  // ---- config (modal) ----
  const [sem, setSem] = useState<Record<string, Record<number, string>>>({})
  const [ticket, setTicket] = useState('')
  const [excs, setExcs] = useState<MetaExc[]>([])
  const openCfg = () => {
    const s: Record<string, Record<number, string>> = {}
    lojas.forEach((l) => { s[l.id] = {}; for (let dow = 0; dow <= 6; dow++) { const v = semMap[`${l.id}|${dow}`]; s[l.id][dow] = v ? String(v) : '' } })
    setSem(s); setTicket(ticketMeta ? String(ticketMeta) : ''); setExcs(metaExc.map((e) => ({ ...e }))); setCfgOpen(true)
  }
  const salvar = useMutation({
    mutationFn: async () => {
      const rowsSem = lojas.flatMap((l) => Array.from({ length: 7 }, (_, dow) => ({ tenant_id: tenantId, loja_id: l.id, dia_semana: dow, valor: parseNum(sem[l.id]?.[dow]) })))
      const { error: e1 } = await supabase.from('metas_semana').upsert(rowsSem, { onConflict: 'tenant_id,loja_id,dia_semana' }); if (e1) throw e1
      const tv = String(parseNum(ticket))
      const { data: ex } = await supabase.from('parametros').select('id').eq('tenant_id', tenantId).eq('modulo', 'metas').eq('chave', 'ticket_medio').limit(1)
      if (ex?.length) { const { error } = await supabase.from('parametros').update({ valor: tv }).eq('id', (ex[0] as { id: string }).id); if (error) throw error }
      else { const { error } = await supabase.from('parametros').insert({ tenant_id: tenantId, modulo: 'metas', chave: 'ticket_medio', valor: tv }); if (error) throw error }
      await supabase.from('metas_excecao').delete().eq('tenant_id', tenantId)
      const rowsExc = excs.filter((e) => e.loja_id && e.data).map((e) => ({ tenant_id: tenantId, loja_id: e.loja_id, data: e.data, valor: parseNum(e.valor), motivo: (e.motivo || '').trim() || null }))
      if (rowsExc.length) { const { error } = await supabase.from('metas_excecao').insert(rowsExc); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['metas-sem'] }); qc.invalidateQueries({ queryKey: ['metas-exc'] }); qc.invalidateQueries({ queryKey: ['metas-ticket'] }); setCfgOpen(false); showToast('Metas salvas!') },
    onError: (e: Error) => showToast('Erro: ' + e.message, true),
  })

  const lojaNome = (id: string) => lojas.find((l) => l.id === id)?.nome || id
  const difCls = (v: number) => v >= 0 ? 'pos' : 'neg'

  return (
    <div className="metas-screen">
      <div className="m-head">
        <h1>Metas — Acompanhamento Diário</h1>
        <p>Meta × Realizado, dia a dia. Verde quando bate, vermelho quando falta. (Realizado = vendas já processadas no Recebimento.)</p>
      </div>

      <div className="m-toolbar">
        <div className="fld"><label>Loja</label>
          <select value={lojaSel} onChange={(e) => setLojaFil(e.target.value)}>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            <option value="todas">Rede (todas)</option>
          </select>
        </div>
        <div className="fld"><label>Mês</label><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></div>
        <div className="grow" />
        <button className="cbtn" onClick={openCfg}>⚙️ Configurar metas</button>
      </div>

      <div className="month">
        <div className="mc"><div className="lb">Meta do mês</div><div className="vl">{brl(resumo.meta)}</div></div>
        <div className="mc"><div className="lb">Realizado</div><div className="vl">{brl(resumo.real)}</div></div>
        <div className="mc"><div className="lb">Diferença acumulada</div><div className={'vl ' + difCls(resumo.dif)}>{resumo.dif >= 0 ? '+' : '−'}{brl(Math.abs(resumo.dif)).replace('R$ ', 'R$ ')}</div></div>
        <div className="mc"><div className="lb">Dias que bateram</div><div className="vl">{resumo.bat} / {resumo.comReal}</div></div>
        <div className="mc"><div className="lb">Ticket médio do mês</div><div className="vl">{resumo.ticket ? brl(resumo.ticket) : '—'}{ticketMeta ? <span className="pct"> / meta {brl(ticketMeta)}</span> : null}</div></div>
      </div>

      <table className="d">
        <thead><tr><th>Data</th><th>Meta</th><th>Realizado</th><th>Diferença</th><th>% da meta</th><th>Ticket</th></tr></thead>
        <tbody>
          {!rows.length ? <tr><td colSpan={6} className="empty">Sem dias no período (ou metas ainda não cadastradas — clique em “Configurar metas”).</td></tr>
            : rows.map((r) => {
              const hoje = r.ds === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
              const tkCls = ticketMeta && r.ticket != null ? (r.ticket >= ticketMeta ? 'tk-ok' : 'tk-low') : ''
              return (
                <tr key={r.ds} className={hoje ? 'today' : ''}>
                  <td>{DOW[r.dow].toLowerCase()}, {pad(r.d)}/{pad(am)}{hoje ? ' · hoje' : ''}</td>
                  <td>{brl(r.meta)}</td>
                  <td>{r.real > 0 ? brl(r.real) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td>{r.real > 0 ? <span className={'chip-dif ' + difCls(r.dif)}>{r.dif >= 0 ? '+' : '−'}{brl(Math.abs(r.dif))}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td className="pct">{r.pct != null && r.real > 0 ? Math.round(r.pct) + '%' : '—'}</td>
                  <td className={tkCls}>{r.ticket != null ? brl(r.ticket) : '—'}</td>
                </tr>
              )
            })}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td>Acumulado</td><td>{brl(resumo.meta)}</td><td>{brl(resumo.real)}</td><td className={difCls(resumo.dif)}>{resumo.dif >= 0 ? '+' : '−'}{brl(Math.abs(resumo.dif))}</td><td className="pct">{resumo.meta > 0 ? Math.round((resumo.real / resumo.meta) * 100) + '%' : '—'}</td><td>{resumo.ticket ? brl(resumo.ticket) : '—'}</td></tr></tfoot>}
      </table>

      <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 14 }}>🎫 A coluna <b>Ticket</b> é o ticket médio <b>de cada loja</b> no dia, comparado à meta (verde ≥ meta, vermelho abaixo). Ver o ticket <b>por garçom</b> dentro da loja (quem puxa a média pra baixo) é opcional — entra na <span className="gtag">FASE B</span> (precisa puxar do iComanda).</p>

      {/* ===== MODAL CONFIG ===== */}
      {cfgOpen && (
        <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setCfgOpen(false) }}>
          <div className="modal">
            <div className="mh"><h2>⚙️ Configurar metas</h2><button className="mx" onClick={() => setCfgOpen(false)}>✕</button></div>
            <div className="mb">
              <div className="cfg-lb">Meta por dia da semana (R$)</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="mgrid">
                  <thead><tr><th>Loja</th>{DOW.map((d) => <th key={d}>{d}</th>)}</tr></thead>
                  <tbody>
                    {lojas.map((l) => (
                      <tr key={l.id}><td>{l.nome}</td>
                        {Array.from({ length: 7 }, (_, dow) => (
                          <td key={dow}><input className="minp" value={sem[l.id]?.[dow] ?? ''} onChange={(e) => setSem((s) => ({ ...s, [l.id]: { ...(s[l.id] || {}), [dow]: e.target.value } }))} placeholder="0" /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '16px 0', alignItems: 'flex-end' }}>
                <div className="fld"><label>Meta de ticket médio (mesma pra todas as lojas)</label><input className="minp" style={{ width: 120 }} value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="0,00" /></div>
              </div>

              <div className="cfg-lb">Exceções por data <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>(feriado / evento — sobrescreve só aquele dia)</span></div>
              <table className="exc">
                <thead><tr><th style={{ width: 150 }}>Loja</th><th style={{ width: 140 }}>Data</th><th style={{ width: 130 }}>Meta do dia</th><th>Motivo</th><th style={{ width: 36 }} /></tr></thead>
                <tbody>
                  {excs.map((e, i) => (
                    <tr key={i}>
                      <td><select value={e.loja_id} onChange={(ev) => setExcs((x) => x.map((y, j) => j === i ? { ...y, loja_id: ev.target.value } : y))}><option value="">Selecione…</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></td>
                      <td><input type="date" value={e.data} onChange={(ev) => setExcs((x) => x.map((y, j) => j === i ? { ...y, data: ev.target.value } : y))} /></td>
                      <td><input className="minp" value={e.valor ?? ''} onChange={(ev) => setExcs((x) => x.map((y, j) => j === i ? { ...y, valor: ev.target.value as unknown as number } : y))} placeholder="0" /></td>
                      <td><input style={{ width: '100%' }} value={e.motivo ?? ''} onChange={(ev) => setExcs((x) => x.map((y, j) => j === i ? { ...y, motivo: ev.target.value } : y))} placeholder="ex.: Feriado" /></td>
                      <td><button className="x" onClick={() => setExcs((x) => x.filter((_, j) => j !== i))}>✕</button></td>
                    </tr>
                  ))}
                  {!excs.length && <tr><td colSpan={5} style={{ color: '#94a3b8', padding: '8px' }}>Nenhuma exceção.</td></tr>}
                </tbody>
              </table>
              <button className="addbtn" onClick={() => setExcs((x) => [...x, { loja_id: '', data: '', valor: 0, motivo: '' }])}>+ Adicionar exceção</button>
            </div>
            <div className="mf">
              <button className="cbtn" onClick={() => setCfgOpen(false)}>Cancelar</button>
              <button className="cbtn solid" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Salvar metas'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'toast' + (toast.err ? ' err' : '')}>{toast.m}</div>}
    </div>
  )
}
