import { Fragment, useMemo, useState } from 'react'
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
type Canal = { canal?: string; faturado?: number; pessoas?: number; comandas?: number }
type Rec = { loja_id: string; data: string; faturado?: number; ticket_medio?: number; pessoas?: number; qtd_comandas?: number; status?: string; por_canal?: Canal[] }

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// Canais de venda (o iComanda separa; o sync grava em icomanda_recebimento.por_canal).
// 'total' = a loja inteira (padrão de quase todas). Só quem separa (ex.: Cidade Nova) usa Salão/Delivery.
const CANAIS = ['total', 'Salão', 'Delivery']  // Balcão entra no Salão (não é canal separado)
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
  const [lojaFil, setLojaFil] = useState('')            // unidade selecionada: `${lojaId}::${canal}` ou 'todas'
  const [semana, setSemana] = useState(0)               // 0 = mês inteiro; 1..N = semana (bloco de 7 dias)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [toast, setToast] = useState<{ m: string; err?: boolean } | null>(null)
  const showToast = (m: string, err = false) => { setToast({ m, err }); window.setTimeout(() => setToast(null), err ? 5000 : 3000) }

  const ini = `${mes}-01`
  const [ay, am] = mes.split('-').map(Number)
  const fim = `${mes}-${pad(new Date(ay, am, 0).getDate())}`

  const { data: metaSem = [] } = useQuery({ queryKey: ['metas-sem', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('metas_semana').select('loja_id,dia_semana,valor,canal').eq('tenant_id', tenantId); return (data ?? []) as MetaSem[] } })
  const { data: metaExc = [] } = useQuery({ queryKey: ['metas-exc', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('metas_excecao').select('id,loja_id,data,valor,motivo').eq('tenant_id', tenantId); return (data ?? []) as MetaExc[] } })
  const { data: lojaMeta = [] } = useQuery({ queryKey: ['metas-lojaticket', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,meta_ticket').eq('tenant_id', tenantId); return (data ?? []) as { id: string; meta_ticket?: number }[] } })
  const { data: rec = [] } = useQuery({ queryKey: ['metas-rec', tenantId, mes], enabled: !!tenantId, queryFn: () => fetchAll<Rec>((f, t) => supabase.from('icomanda_recebimento').select('loja_id,data,faturado,ticket_medio,pessoas,qtd_comandas,status,por_canal').eq('tenant_id', tenantId).eq('status', 'processado').gte('data', ini).lte('data', fim).range(f, t)) })

  const semMap = useMemo(() => { const m: Record<string, number> = {}; metaSem.forEach((s) => { m[`${s.loja_id}|${s.dia_semana}|${s.canal || 'total'}`] = Number(s.valor) || 0 }); return m }, [metaSem])
  const excMap = useMemo(() => { const m: Record<string, number> = {}; metaExc.forEach((e) => { m[`${e.loja_id}|${e.data}`] = Number(e.valor) || 0 }); return m }, [metaExc])
  const recMap = useMemo(() => { const m: Record<string, Rec> = {}; rec.forEach((r) => { m[`${r.loja_id}|${r.data}`] = r }); return m }, [rec])
  const metaTkMap = useMemo(() => { const m: Record<string, number> = {}; lojaMeta.forEach((l) => { m[l.id] = Number(l.meta_ticket) || 0 }); return m }, [lojaMeta])

  // Canais que cada loja separa (só se tiver meta > 0 num canal != total). Na prática, só a Cidade Nova.
  const lojaCanais = useMemo(() => { const m: Record<string, string[]> = {}; metaSem.forEach((s) => { const c = s.canal || 'total'; if (c !== 'total' && (Number(s.valor) || 0) > 0) { (m[s.loja_id] ||= []); if (!m[s.loja_id].includes(c)) m[s.loja_id].push(c) } }); for (const k in m) m[k].sort((a, b) => CANAIS.indexOf(a) - CANAIS.indexOf(b)); return m }, [metaSem])
  // Unidades da lista: loja normal = 1 linha (Total); loja que separa = 1 linha por canal (Cidade Nova · Salão / · Delivery).
  // Salão = a própria loja (nome puro); Delivery = "loja" independente ("Nome Delivery").
  const units = useMemo(() => { const out: { value: string; lojaId: string; canal: string; label: string }[] = []; lojas.forEach((l) => { const cs = lojaCanais[l.id]; if (cs && cs.length) cs.forEach((c) => out.push({ value: `${l.id}::${c}`, lojaId: l.id, canal: c, label: c === 'Salão' ? l.nome : `${l.nome} ${c}` })); else out.push({ value: `${l.id}::total`, lojaId: l.id, canal: 'total', label: l.nome }) }); return out }, [lojas, lojaCanais])
  const selUnit = lojaFil || units[0]?.value || ''
  const isTodas = selUnit === 'todas'
  const selLoja = isTodas ? 'todas' : (selUnit.split('::')[0] || '')
  const selCanal = isTodas ? 'total' : (selUnit.split('::')[1] || 'total')
  const metaTkAtual = !isTodas && selLoja ? (metaTkMap[selLoja] || 0) : 0

  const metaDia = (lojaId: string, ds: string, dow: number, canal: string) => (canal === 'total' ? (excMap[`${lojaId}|${ds}`] ?? semMap[`${lojaId}|${dow}|total`] ?? 0) : (semMap[`${lojaId}|${dow}|${canal}`] ?? 0))
  // realizado + pessoas de um dia, no canal. total = faturado da loja; Delivery = por_canal;
  // Salão = total − Delivery (inclui balcão e o que mais não for delivery).
  const realCanal = (r: Rec | undefined, canal: string) => {
    if (!r) return { fat: 0, pes: 0, com: 0 }
    const tot = { fat: Number(r.faturado) || 0, pes: Number(r.pessoas) || 0, com: Number(r.qtd_comandas) || 0 }
    if (canal === 'total') return tot
    const d = (r.por_canal || []).find((x) => norm(x.canal) === norm('Delivery'))
    const del = { fat: Number(d?.faturado) || 0, pes: Number(d?.pessoas) || 0, com: Number(d?.comandas) || 0 }
    if (norm(canal) === norm('Delivery')) return del
    return { fat: Math.max(0, tot.fat - del.fat), pes: Math.max(0, tot.pes - del.pes), com: Math.max(0, tot.com - del.com) }  // Salão
  }

  const rows = useMemo(() => {
    if (!selLoja) return []
    const last = new Date(ay, am, 0).getDate()
    const isCur = now.getFullYear() === ay && now.getMonth() + 1 === am
    const upto = isCur ? now.getDate() : last
    const lojasCalc = isTodas ? lojas : lojas.filter((l) => l.id === selLoja)
    const canalUse = isTodas ? 'total' : selCanal
    const out = []
    for (let d = 1; d <= upto; d++) {
      const ds = `${mes}-${pad(d)}`
      const dow = new Date(ay, am - 1, d).getDay()
      let meta = 0, real = 0, pes = 0, com = 0
      for (const l of lojasCalc) {
        // no "Rede (todas)", a meta de uma loja que separa = soma dos canais dela
        if (isTodas) { const cs = lojaCanais[l.id]; meta += cs && cs.length ? cs.reduce((s, c) => s + metaDia(l.id, ds, dow, c), 0) : metaDia(l.id, ds, dow, 'total') }
        else meta += metaDia(l.id, ds, dow, selCanal)
        const { fat, pes: p, com: c } = realCanal(recMap[`${l.id}|${ds}`], canalUse); real += fat; pes += p; com += c
      }
      const ticket = com > 0 ? real / com : null   // ticket médio = faturado ÷ comandas (por mesa/pedido)
      out.push({ d, ds, dow, meta, real, pes, com, dif: real - meta, pct: meta > 0 ? (real / meta) * 100 : null, ticket })
    }
    return out
  }, [selLoja, selCanal, isTodas, mes, lojas, lojaCanais, semMap, excMap, recMap])

  // Semanas do mês (blocos de 7 dias) — pro filtro de acompanhamento semanal
  const semanas = useMemo(() => { const last = new Date(ay, am, 0).getDate(); const out: { n: number; ini: number; fim: number }[] = []; for (let s = 1; s <= last; s += 7) out.push({ n: out.length + 1, ini: s, fim: Math.min(s + 6, last) }); return out }, [mes])
  // Meta TOTAL do período selecionado (todos os dias do mês OU da semana — não só até hoje)
  const metaPeriodoTotal = useMemo(() => {
    const last = new Date(ay, am, 0).getDate()
    const wk = semana ? semanas.find((w) => w.n === semana) : null
    const d1 = wk ? wk.ini : 1, d2 = wk ? wk.fim : last
    const lojasCalc = isTodas ? lojas : lojas.filter((l) => l.id === selLoja)
    let t = 0
    for (let d = d1; d <= d2; d++) { const ds = `${mes}-${pad(d)}`; const dow = new Date(ay, am - 1, d).getDay(); for (const l of lojasCalc) { if (isTodas) { const cs = lojaCanais[l.id]; t += cs && cs.length ? cs.reduce((s, c) => s + metaDia(l.id, ds, dow, c), 0) : metaDia(l.id, ds, dow, 'total') } else t += metaDia(l.id, ds, dow, selCanal) } }
    return t
  }, [semana, semanas, selLoja, selCanal, isTodas, mes, lojas, lojaCanais, semMap, excMap])
  // linhas do período (aplica o filtro de semana)
  const rowsView = useMemo(() => { if (!semana) return rows; const wk = semanas.find((w) => w.n === semana); return wk ? rows.filter((r) => r.d >= wk.ini && r.d <= wk.fim) : rows }, [rows, semana, semanas])

  const resumo = useMemo(() => {
    let real = 0, pes = 0, com = 0, bat = 0, comReal = 0, metaAteHoje = 0
    rowsView.forEach((r) => { metaAteHoje += r.meta; real += r.real; pes += r.pes; com += r.com; if (r.real > 0) { comReal++; if (r.dif >= 0) bat++ } })
    return { meta: metaAteHoje, real, dif: real - metaAteHoje, bat, comReal, ticket: com > 0 ? real / com : 0 }
  }, [rowsView])

  // ---- config (modal) ---- sem é indexado por `${loja}|${canal}`; split = loja que separa canais
  const [sem, setSem] = useState<Record<string, Record<number, string>>>({})
  const [split, setSplit] = useState<Record<string, boolean>>({})
  const [metaTk, setMetaTk] = useState<Record<string, string>>({})
  const [excs, setExcs] = useState<MetaExc[]>([])
  const openCfg = () => {
    const s: Record<string, Record<number, string>> = {}, mt: Record<string, string> = {}, sp: Record<string, boolean> = {}
    lojas.forEach((l) => { CANAIS.forEach((canal) => { const key = `${l.id}|${canal}`; s[key] = {}; for (let dow = 0; dow <= 6; dow++) { const v = semMap[`${l.id}|${dow}|${canal}`]; s[key][dow] = v ? String(v) : '' } }); const t = metaTkMap[l.id]; mt[l.id] = t ? String(t) : ''; sp[l.id] = (lojaCanais[l.id]?.length || 0) > 0 })
    setSem(s); setSplit(sp); setMetaTk(mt); setExcs(metaExc.map((e) => ({ ...e }))); setCfgOpen(true)
  }
  const salvar = useMutation({
    mutationFn: async () => {
      // loja que separa: grava só os canais (total = 0); loja normal: grava só o total (canais = 0)
      const rowsSem = lojas.flatMap((l) => { const isSp = !!split[l.id]; return CANAIS.flatMap((canal) => Array.from({ length: 7 }, (_, dow) => { const use = isSp ? canal !== 'total' : canal === 'total'; return { tenant_id: tenantId, loja_id: l.id, dia_semana: dow, canal, valor: use ? parseNum(sem[`${l.id}|${canal}`]?.[dow]) : 0 } })) })
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
          <select value={selUnit} onChange={(e) => setLojaFil(e.target.value)} style={{ minWidth: 200 }}>
            {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            <option value="todas">Rede (todas)</option>
          </select>
        </div>
        <div className="fld"><label>Mês</label><input type="month" value={mes} onChange={(e) => { setMes(e.target.value); setSemana(0) }} /></div>
        <div className="fld"><label>Semana</label>
          <select value={semana} onChange={(e) => setSemana(Number(e.target.value))}>
            <option value={0}>Mês inteiro</option>
            {semanas.map((w) => <option key={w.n} value={w.n}>Semana {w.n} ({pad(w.ini)}–{pad(w.fim)}/{pad(am)})</option>)}
          </select>
        </div>
        <div className="grow" />
        <button className="cbtn" onClick={openCfg}>⚙️ Configurar metas</button>
      </div>

      <div className="msum">
        <span className="lb">Meta {semana ? 'da semana' : 'do mês'}</span> <b>{brl(metaPeriodoTotal)}</b>
        <span className="sep">·</span>
        <span className="lb">Realizado {semana ? 'na semana' : 'até agora'}</span> <b>{brl(resumo.real)}</b>
        <span className="sep">·</span>
        <span className="lb">Diferença</span> <b style={{ color: resumo.dif >= 0 ? '#16a34a' : '#dc2626' }}>{resumo.dif >= 0 ? '+' : '−'}{brl(Math.abs(resumo.dif))}</b> <span className="lb">({resumo.meta > 0 ? Math.round((resumo.real / resumo.meta) * 100) : 0}% da meta)</span>
        <span className="sep">·</span>
        <span className="lb">D.bateram</span> <b>{resumo.bat}/{resumo.comReal}</b>
        <span className="sep">·</span>
        <span className="lb">Ticket Médio</span> <b>{resumo.ticket ? brl(resumo.ticket) : '—'}</b>{metaTkAtual ? <span className="lb"> / meta {brl(metaTkAtual)}</span> : null}
      </div>

      <table className="d">
        <thead><tr><th>Data</th><th>Meta</th><th>Realizado</th><th>Diferença</th><th>% da meta</th><th>Ticket</th></tr></thead>
        <tbody>
          {!rowsView.length ? <tr><td colSpan={6} className="empty">Sem dias no período (ou metas ainda não cadastradas — clique em “Configurar metas”).</td></tr>
            : rowsView.map((r) => {
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
        {rowsView.length > 0 && <tfoot><tr><td>Acumulado</td><td>{brl(resumo.meta)}</td><td>{brl(resumo.real)}</td><td className={difCls(resumo.dif)}>{resumo.dif >= 0 ? '+' : '−'}{brl(Math.abs(resumo.dif))}</td><td className="pct">{resumo.meta > 0 ? Math.round((resumo.real / resumo.meta) * 100) + '%' : '—'}</td><td>{resumo.ticket ? brl(resumo.ticket) : '—'}</td></tr></tfoot>}
      </table>

      <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 14 }}>🎫 A coluna <b>Ticket</b> é o ticket médio <b>por comanda</b> (faturado ÷ comandas, por mesa/pedido) de cada loja no dia, comparado à meta (verde ≥ meta, vermelho abaixo). Ver o ticket <b>por garçom</b> dentro da loja (quem puxa a média pra baixo) é opcional — entra na <span className="gtag">FASE B</span> (precisa puxar do iComanda).</p>

      {/* ===== MODAL CONFIG ===== */}
      {cfgOpen && (
        <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) setCfgOpen(false) }}>
          <div className="modal">
            <div className="mh"><h2>⚙️ Configurar metas</h2><button className="mx" onClick={() => setCfgOpen(false)}>✕</button></div>
            <div className="mb">
              <div className="cfg-lb">Meta por dia da semana (R$) + meta de ticket <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>— marque ☑ na loja que separa Salão/Delivery (ex.: Cidade Nova)</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="mgrid">
                  <thead><tr><th style={{ width: 26, textAlign: 'center' }} title="Separar por canal">🔀</th><th>Loja</th>{DOW.map((d) => <th key={d}>{d}</th>)}<th style={{ paddingLeft: 14, borderLeft: '2px solid #e5e9f0' }}>🎫 Ticket</th></tr></thead>
                  <tbody>
                    {lojas.map((l) => { const isSp = !!split[l.id]; const tk = `${l.id}|total`; return (
                      <Fragment key={l.id}>
                        <tr>
                          <td style={{ textAlign: 'center' }}><input type="checkbox" checked={isSp} title="Separar Salão/Delivery" onChange={(e) => setSplit((s) => ({ ...s, [l.id]: e.target.checked }))} /></td>
                          <td>{l.nome}{isSp && <span style={{ color: '#94a3b8', fontSize: 11 }}> · por canal ↓</span>}</td>
                          {isSp ? DOW.map((_, i) => <td key={i} style={{ background: '#f8fafc' }} />) : Array.from({ length: 7 }, (_, dow) => (
                            <td key={dow}><input className="minp" value={sem[tk]?.[dow] ?? ''} onChange={(e) => setSem((s) => ({ ...s, [tk]: { ...(s[tk] || {}), [dow]: e.target.value } }))} placeholder="0" /></td>
                          ))}
                          <td style={{ paddingLeft: 14, borderLeft: '2px solid #e5e9f0' }}><input className="minp" value={metaTk[l.id] ?? ''} onChange={(e) => setMetaTk((m) => ({ ...m, [l.id]: e.target.value }))} placeholder="0,00" /></td>
                        </tr>
                        {isSp && ['Salão', 'Delivery'].map((canal) => { const key = `${l.id}|${canal}`; return (
                          <tr key={canal}>
                            <td />
                            <td style={{ paddingLeft: 22, color: '#475569', fontWeight: 400 }}>· {canal}</td>
                            {Array.from({ length: 7 }, (_, dow) => (
                              <td key={dow}><input className="minp" value={sem[key]?.[dow] ?? ''} onChange={(e) => setSem((s) => ({ ...s, [key]: { ...(s[key] || {}), [dow]: e.target.value } }))} placeholder="0" /></td>
                            ))}
                            <td style={{ borderLeft: '2px solid #e5e9f0' }} />
                          </tr>
                        ) })}
                      </Fragment>
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
