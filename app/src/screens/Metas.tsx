import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import './metas.css'

// Gestão › Metas — acompanhamento diário (Meta × Realizado × Diferença), no modelo da planilha.
// Meta = valor do dia da semana (metas_semana) ou exceção da data (metas_excecao).
// Realizado = faturado de icomanda_recebimento (só dias 'processado' — o portão da integração).

type MetaSem = { loja_id: string; dia_semana: number; valor?: number; canal?: string }
type MetaExc = { id?: string; loja_id: string; data: string; valor?: number; motivo?: string | null }
type Canal = { canal?: string; faturado?: number; pessoas?: number }
type Rec = { loja_id: string; data: string; faturado?: number; ticket_medio?: number; pessoas?: number; status?: string; por_canal?: Canal[] }

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// Canais de venda (o iComanda separa; o sync grava em icomanda_recebimento.por_canal).
// 'total' = a loja inteira (padrão de quase todas). Só quem separa (ex.: Cidade Nova) usa Salão/Delivery.
const CANAIS = ['total', 'Salão', 'Delivery', 'Balcão']
const CANAL_LB: Record<string, string> = { total: 'Total (loja toda)', 'Salão': 'Salão', 'Delivery': 'Delivery', 'Balcão': 'Balcão' }
const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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
  const [canalFil, setCanalFil] = useState('total')     // filtro de canal (só aparece p/ loja que separa)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [toast, setToast] = useState<{ m: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ m, err }); window.setTimeout(() => setToast(null), err ? 5000 : 3000) }

  // default de loja = primeira, quando carregar
  const lojaSel = lojaFil || (lojas[0]?.id ?? '')

  const ini = `${mes}-01`
  const [ay, am] = mes.split('-').map(Number)
  const fim = `${mes}-${pad(new Date(ay, am, 0).getDate())}`

  const { data: metaSem = [] } = useQuery({ queryKey: ['metas-sem', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('metas_semana').select('loja_id,dia_semana,valor,canal').eq('tenant_id', tenantId); return (data ?? []) as MetaSem[] } })
  const { data: metaExc = [] } = useQuery({ queryKey: ['metas-exc', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('metas_excecao').select('id,loja_id,data,valor,motivo').eq('tenant_id', tenantId); return (data ?? []) as MetaExc[] } })
  const { data: lojaMeta = [] } = useQuery({ queryKey: ['metas-lojaticket', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,meta_ticket').eq('tenant_id', tenantId); return (data ?? []) as { id: string; meta_ticket?: number }[] } })
  const { data: rec = [] } = useQuery({ queryKey: ['metas-rec', tenantId, mes], enabled: !!tenantId, queryFn: () => fetchAll<Rec>((f, t) => supabase.from('icomanda_recebimento').select('loja_id,data,faturado,ticket_medio,pessoas,status,por_canal').eq('tenant_id', tenantId).eq('status', 'processado').gte('data', ini).lte('data', fim).range(f, t)) })

  const semMap = useMemo(() => { const m: Record<string, number> = {}; metaSem.forEach((s) => { m[`${s.loja_id}|${s.dia_semana}|${s.canal || 'total'}`] = Number(s.valor) || 0 }); return m }, [metaSem])
  const excMap = useMemo(() => { const m: Record<string, number> = {}; metaExc.forEach((e) => { m[`${e.loja_id}|${e.data}`] = Number(e.valor) || 0 }); return m }, [metaExc])
  const recMap = useMemo(() => { const m: Record<string, Rec> = {}; rec.forEach((r) => { m[`${r.loja_id}|${r.data}`] = r }); return m }, [rec])
  const metaTkMap = useMemo(() => { const m: Record<string, number> = {}; lojaMeta.forEach((l) => { m[l.id] = Number(l.meta_ticket) || 0 }); return m }, [lojaMeta])
  const metaTkAtual = lojaSel && lojaSel !== 'todas' ? (metaTkMap[lojaSel] || 0) : 0

  // Canais que cada loja separa (só aparece se tiver meta > 0 num canal != total). Só a Cidade Nova, na prática.
  const lojaCanais = useMemo(() => { const m: Record<string, string[]> = {}; metaSem.forEach((s) => { const c = s.canal || 'total'; if (c !== 'total' && (Number(s.valor) || 0) > 0) { (m[s.loja_id] ||= []); if (!m[s.loja_id].includes(c)) m[s.loja_id].push(c) } }); for (const k in m) m[k].sort((a, b) => CANAIS.indexOf(a) - CANAIS.indexOf(b)); return m }, [metaSem])
  const splitCanais = lojaSel && lojaSel !== 'todas' ? (lojaCanais[lojaSel] || []) : []
  const isSplit = splitCanais.length > 0
  const canalEff = isSplit ? (splitCanais.includes(canalFil) ? canalFil : splitCanais[0]) : 'total'

  const metaDia = (lojaId: string, ds: string, dow: number, canal: string) => (canal === 'total' ? (excMap[`${lojaId}|${ds}`] ?? semMap[`${lojaId}|${dow}|total`] ?? 0) : (semMap[`${lojaId}|${dow}|${canal}`] ?? 0))
  // realizado + pessoas de um dia, no canal (total = faturado da loja; senão vem do por_canal)
  const realCanal = (r: Rec | undefined, canal: string) => { if (!r) return { fat: 0, pes: 0 }; if (canal === 'total') return { fat: Number(r.faturado) || 0, pes: Number(r.pessoas) || 0 }; const c = (r.por_canal || []).find((x) => norm(x.canal) === norm(canal)); return { fat: Number(c?.faturado) || 0, pes: Number(c?.pessoas) || 0 } }

  const rows = useMemo(() => {
    if (!lojaSel) return []
    const last = new Date(ay, am, 0).getDate()
    const isCur = now.getFullYear() === ay && now.getMonth() + 1 === am
    const upto = isCur ? now.getDate() : last
    const lojasCalc = lojaSel === 'todas' ? lojas : lojas.filter((l) => l.id === lojaSel)
    const canalUse = lojaSel === 'todas' ? 'total' : canalEff
    const out = []
    for (let d = 1; d <= upto; d++) {
      const ds = `${mes}-${pad(d)}`
      const dow = new Date(ay, am - 1, d).getDay()
      let meta = 0, real = 0, pes = 0
      for (const l of lojasCalc) { meta += metaDia(l.id, ds, dow, canalUse); const { fat, pes: p } = realCanal(recMap[`${l.id}|${ds}`], canalUse); real += fat; pes += p }
      const ticket = pes > 0 ? real / pes : null
      out.push({ d, ds, dow, meta, real, pes, dif: real - meta, pct: meta > 0 ? (real / meta) * 100 : null, ticket })
    }
    return out
  }, [lojaSel, canalEff, mes, lojas, semMap, excMap, recMap])

  const resumo = useMemo(() => {
    let meta = 0, real = 0, pes = 0, bat = 0, comReal = 0
    rows.forEach((r) => { meta += r.meta; real += r.real; pes += r.pes; if (r.real > 0) { comReal++; if (r.dif >= 0) bat++ } })
    return { meta, real, dif: real - meta, bat, comReal, ticket: pes > 0 ? real / pes : 0 }
  }, [rows])

  // ---- config (modal) ---- sem é indexado por `${loja}|${canal}`
  const [sem, setSem] = useState<Record<string, Record<number, string>>>({})
  const [cfgCanal, setCfgCanal] = useState('total')
  const [metaTk, setMetaTk] = useState<Record<string, string>>({})
  const [excs, setExcs] = useState<MetaExc[]>([])
  const openCfg = () => {
    const s: Record<string, Record<number, string>> = {}, mt: Record<string, string> = {}
    lojas.forEach((l) => { CANAIS.forEach((canal) => { const key = `${l.id}|${canal}`; s[key] = {}; for (let dow = 0; dow <= 6; dow++) { const v = semMap[`${l.id}|${dow}|${canal}`]; s[key][dow] = v ? String(v) : '' } }); const t = metaTkMap[l.id]; mt[l.id] = t ? String(t) : '' })
    setSem(s); setCfgCanal('total'); setMetaTk(mt); setExcs(metaExc.map((e) => ({ ...e }))); setCfgOpen(true)
  }
  const salvar = useMutation({
    mutationFn: async () => {
      const rowsSem = lojas.flatMap((l) => CANAIS.flatMap((canal) => Array.from({ length: 7 }, (_, dow) => ({ tenant_id: tenantId, loja_id: l.id, dia_semana: dow, canal, valor: parseNum(sem[`${l.id}|${canal}`]?.[dow]) }))))
      const { error: e1 } = await supabase.from('metas_semana').upsert(rowsSem, { onConflict: 'tenant_id,loja_id,dia_semana,canal' }); if (e1) throw e1
      for (const l of lojas) { const { error } = await supabase.from('lojas').update({ meta_ticket: parseNum(metaTk[l.id]) }).eq('id', l.id); if (error) throw error }
      await supabase.from('metas_excecao').delete().eq('tenant_id', tenantId)
      const rowsExc = excs.filter((e) => e.loja_id && e.data).map((e) => ({ tenant_id: tenantId, loja_id: e.loja_id, data: e.data, valor: parseNum(e.valor), motivo: (e.motivo || '').trim() || null }))
      if (rowsExc.length) { const { error } = await supabase.from('metas_excecao').insert(rowsExc); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['metas-sem'] }); qc.invalidateQueries({ queryKey: ['metas-exc'] }); qc.invalidateQueries({ queryKey: ['metas-lojaticket'] }); setCfgOpen(false); showToast('Metas salvas!') },
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
        {isSplit && <div className="fld"><label>Canal</label>
          <select value={canalEff} onChange={(e) => setCanalFil(e.target.value)}>{splitCanais.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>}
        <div className="grow" />
        <button className="cbtn" onClick={openCfg}>⚙️ Configurar metas</button>
      </div>

      <div className="month">
        <div className="mc"><div className="lb">Meta do mês</div><div className="vl">{brl(resumo.meta)}</div></div>
        <div className="mc"><div className="lb">Realizado</div><div className="vl">{brl(resumo.real)}</div></div>
        <div className="mc"><div className="lb">Diferença acumulada</div><div className={'vl ' + difCls(resumo.dif)}>{resumo.dif >= 0 ? '+' : '−'}{brl(Math.abs(resumo.dif)).replace('R$ ', 'R$ ')}</div></div>
        <div className="mc"><div className="lb">Dias que bateram</div><div className="vl">{resumo.bat} / {resumo.comReal}</div></div>
        <div className="mc"><div className="lb">Ticket médio do mês</div><div className="vl">{resumo.ticket ? brl(resumo.ticket) : '—'}{metaTkAtual ? <span className="pct"> / meta {brl(metaTkAtual)}</span> : null}</div></div>
      </div>

      <table className="d">
        <thead><tr><th>Data</th><th>Meta</th><th>Realizado</th><th>Diferença</th><th>% da meta</th><th>Ticket</th></tr></thead>
        <tbody>
          {!rows.length ? <tr><td colSpan={6} className="empty">Sem dias no período (ou metas ainda não cadastradas — clique em “Configurar metas”).</td></tr>
            : rows.map((r) => {
              const hoje = r.ds === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
              const tkCls = metaTkAtual && r.ticket != null ? (r.ticket >= metaTkAtual ? 'tk-ok' : 'tk-low') : ''
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
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                <div className="fld"><label>Canal</label>
                  <select value={cfgCanal} onChange={(e) => setCfgCanal(e.target.value)} style={{ height: 32, border: '1px solid #cbd5e1', borderRadius: 7, padding: '0 10px', fontSize: 12.5, background: '#fff' }}>
                    {CANAIS.map((c) => <option key={c} value={c}>{CANAL_LB[c]}</option>)}
                  </select>
                </div>
                <span style={{ color: '#94a3b8', fontSize: 12, paddingBottom: 6 }}>Preencha o <b>Total</b> pra quase todas as lojas. Só quem separa (ex.: Cidade Nova) preenche <b>Salão</b> e <b>Delivery</b> (deixando o Total em branco).</span>
              </div>
              <div className="cfg-lb">Meta por dia da semana (R$) — <b>{CANAL_LB[cfgCanal]}</b>{cfgCanal === 'total' ? ' + meta de ticket médio' : ''}</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="mgrid">
                  <thead><tr><th>Loja</th>{DOW.map((d) => <th key={d}>{d}</th>)}{cfgCanal === 'total' && <th style={{ paddingLeft: 14, borderLeft: '2px solid #e5e9f0' }}>🎫 Ticket</th>}</tr></thead>
                  <tbody>
                    {lojas.map((l) => { const key = `${l.id}|${cfgCanal}`; return (
                      <tr key={l.id}><td>{l.nome}</td>
                        {Array.from({ length: 7 }, (_, dow) => (
                          <td key={dow}><input className="minp" value={sem[key]?.[dow] ?? ''} onChange={(e) => setSem((s) => ({ ...s, [key]: { ...(s[key] || {}), [dow]: e.target.value } }))} placeholder="0" /></td>
                        ))}
                        {cfgCanal === 'total' && <td style={{ paddingLeft: 14, borderLeft: '2px solid #e5e9f0' }}><input className="minp" value={metaTk[l.id] ?? ''} onChange={(e) => setMetaTk((m) => ({ ...m, [l.id]: e.target.value }))} placeholder="0,00" /></td>}
                      </tr>
                    ) })}
                  </tbody>
                </table>
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
