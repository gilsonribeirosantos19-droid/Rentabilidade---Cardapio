import { useEffect, useMemo, useRef, useState } from 'react'
import { useLoja } from '../lib/loja'
import { useAuth } from '../lib/auth'
import { supabase, fetchAll } from '../lib/db'
import { SearchSelect } from '../components/SearchSelect'
import './faturamento.css'

// Vendas por Dia — detalhado por loja × DIA (lê o portão icomanda_recebimento, só 'processado').
// Dois filtros SEPARADOS: Canal (salão/delivery/balcão — EXATO, do faturamento.por_tipo) e
// Turno (almoço/jantar — recorte por horário, corte 17h, aproximado pela proporção do dia).

type Canal = { canal: string; faturado: number; comandas: number; pessoas: number; desconto: number; taxa: number; couvert: number }
type RecRow = { loja_id: string; data: string; status: string; faturado?: number; desconto?: number; taxa?: number; couvert?: number; qtd_comandas?: number; pessoas?: number; fat_almoco?: number; fat_jantar?: number; por_canal?: Canal[] | null }
type Row = { id: string; loja: string; data: string; canal: string; dMovimento: string; comandas: number; pessoas: number; faturado: number; desconto: number; taxa: number; couvert: number; ticket: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (v: number) => v.toLocaleString('pt-BR')
const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }
const fmtDia = (iso: string) => iso.split('-').reverse().join('/')
const PERIODO_OPTS = ['Personalizado', 'Mês Atual', 'Mês Anterior']
const TURNO_FILTRO = ['Todos', 'Almoço', 'Jantar']
const CANAL_FILTRO = ['Todos', 'Salão', 'Delivery']

export function VendasDiario() {
  const { lojas } = useLoja()
  const { tenantId } = useAuth()
  const [de, setDe] = useState('2026-06-01')
  const [ate, setAte] = useState('2026-06-30')
  const [periodoSel, setPeriodoSel] = useState('Personalizado')
  const [lojaSet, setLojaSet] = useState<Set<string>>(new Set())
  const [lojaOpen, setLojaOpen] = useState(false)
  const [turnoSel, setTurnoSel] = useState('Todos')
  const [canalSel, setCanalSel] = useState('Todos')
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const initRef = useRef(false)
  useEffect(() => { if (!initRef.current && lojas.length) { initRef.current = true; setLojaSet(new Set(lojas.map((l) => l.id))) } }, [lojas])
  const allSel = lojas.length > 0 && lojaSet.size === lojas.length
  const lojaLabel = allSel ? 'Todas as lojas' : lojaSet.size === 0 ? 'Nenhuma' : lojaSet.size === 1 ? (lojas.find((l) => lojaSet.has(l.id))?.nome || '1 loja') : `${lojaSet.size} lojas`
  const toggleLoja = (id: string) => setLojaSet((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleTodas = () => setLojaSet(allSel ? new Set() : new Set(lojas.map((l) => l.id)))
  const setPeriodo = (label: string) => {
    const lb = label || 'Personalizado'; setPeriodoSel(lb); const d = new Date()
    if (lb === 'Mês Atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (lb === 'Mês Anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(l.toLocaleDateString('en-CA')) }
    else { setDe(''); setAte('') }
  }

  const [recebidos, setRecebidos] = useState<RecRow[]>([])
  const [loading, setLoading] = useState(false)
  const lojaNome = useMemo(() => { const m: Record<string, string> = {}; lojas.forEach((l) => { m[l.id] = l.nome }); return m }, [lojas])

  async function fetchDias(): Promise<RecRow[]> {
    return fetchAll<RecRow>((f, t) => supabase.from('icomanda_recebimento').select('*').eq('tenant_id', tenantId).eq('status', 'processado').gte('data', de).lte('data', ate).range(f, t))
  }
  useEffect(() => {
    if (!tenantId || !de || !ate) { setRecebidos([]); return }
    let alive = true
    setLoading(true)
    fetchDias()
      .then((r) => { if (alive) setRecebidos(r) })
      .catch((e) => { if (alive) { setMsg('Erro ao carregar: ' + (e as Error).message); setRecebidos([]) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, de, ate])
  async function puxar() {
    if (!tenantId || syncing || !de || !ate) return
    setSyncing(true); setMsg('Puxando do iComanda… (dia a dia, pode levar ~1 min)')
    try {
      const { data, error } = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, data_ini: de, data_fim: ate } })
      if (error) throw error
      if (data?.status !== 'ok') throw new Error(data?.mensagem || 'erro no iComanda')
      setMsg(`✓ ${data.dias} dias · ${data.processados} processados${data.com_erro ? ` · ${data.com_erro} com erro` : ''}.`)
      setRecebidos(await fetchDias())
    } catch (e) {
      setMsg('Erro ao puxar: ' + (e as Error).message)
    } finally { setSyncing(false) }
  }

  const lista = useMemo<Row[]>(() => {
    const filtraLoja = lojaSet.size > 0 && !allSel
    const base = recebidos.filter((r) => !filtraLoja || lojaSet.has(r.loja_id))
    const out: Row[] = []
    for (const r of base) {
      const loja = lojaNome[r.loja_id] || '—'
      // fator do turno: proporção do faturamento por hora (corte 17h). Todos = dia inteiro.
      const fa = Number(r.fat_almoco) || 0, fj = Number(r.fat_jantar) || 0
      const propA = fa + fj > 0 ? fa / (fa + fj) : 0
      const factor = turnoSel === 'Almoço' ? propA : turnoSel === 'Jantar' ? (1 - propA) : 1
      // canais do dia — só Salão e Delivery. Balcão (e qualquer outro) entra no SALÃO (não perde faturamento).
      const canalKey = (c: string) => c === 'Delivery' ? 'Delivery' : 'Salão'
      const canaisRaw: Canal[] = Array.isArray(r.por_canal) && r.por_canal.length
        ? r.por_canal
        : [{ canal: 'Salão', faturado: Number(r.faturado) || 0, comandas: Number(r.qtd_comandas) || 0, pessoas: Number(r.pessoas) || 0, desconto: Number(r.desconto) || 0, taxa: Number(r.taxa) || 0, couvert: Number(r.couvert) || 0 }]
      const agg = new Map<string, Canal>()
      for (const c of canaisRaw) {
        const k = canalKey(c.canal)
        const a = agg.get(k) || { canal: k, faturado: 0, comandas: 0, pessoas: 0, desconto: 0, taxa: 0, couvert: 0 }
        a.faturado += Number(c.faturado) || 0; a.comandas += Number(c.comandas) || 0; a.pessoas += Number(c.pessoas) || 0
        a.desconto += Number(c.desconto) || 0; a.taxa += Number(c.taxa) || 0; a.couvert += Number(c.couvert) || 0
        agg.set(k, a)
      }
      const canais = [...agg.values()]
      for (const c of canais) {
        if (canalSel !== 'Todos' && c.canal !== canalSel) continue
        const faturado = +((Number(c.faturado) || 0) * factor).toFixed(2)
        if (!(faturado > 0)) continue
        const comandas = Math.round((Number(c.comandas) || 0) * factor)
        out.push({
          id: `${r.loja_id}|${r.data}|${c.canal}`, loja, data: r.data, canal: c.canal, dMovimento: fmtDia(r.data),
          comandas, pessoas: Math.round((Number(c.pessoas) || 0) * factor), faturado,
          desconto: +((Number(c.desconto) || 0) * factor).toFixed(2), taxa: +((Number(c.taxa) || 0) * factor).toFixed(2), couvert: +((Number(c.couvert) || 0) * factor).toFixed(2),
          ticket: comandas ? faturado / comandas : 0,
        })
      }
    }
    return out.sort((a, b) => b.data.localeCompare(a.data) || a.loja.localeCompare(b.loja) || a.canal.localeCompare(b.canal))
  }, [recebidos, lojaSet, allSel, lojaNome, turnoSel, canalSel])

  const tot = useMemo(() => {
    const t = { comandas: 0, pessoas: 0, faturado: 0, desconto: 0, taxa: 0, couvert: 0 }
    lista.forEach((r) => { t.comandas += r.comandas; t.pessoas += r.pessoas; t.faturado += r.faturado; t.desconto += r.desconto; t.taxa += r.taxa; t.couvert += r.couvert })
    return t
  }, [lista])
  const ticketMedio = tot.comandas > 0 ? tot.faturado / tot.comandas : 0

  return (
    <div className="fatv-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label>
          <div className="ms">
            <button className="ms-btn" onClick={() => setLojaOpen((o) => !o)}>{lojaLabel}<span style={{ color: '#94a3b8' }}>▾</span></button>
            {lojaOpen && <>
              <div className="ms-back" onClick={() => setLojaOpen(false)} />
              <div className="ms-pop">
                <label className="ms-opt"><input type="checkbox" checked={allSel} onChange={toggleTodas} /><b>Todas as lojas</b></label>
                <div className="ms-sep" />
                {lojas.map((l) => <label key={l.id} className="ms-opt"><input type="checkbox" checked={lojaSet.has(l.id)} onChange={() => toggleLoja(l.id)} />{l.nome}</label>)}
              </div>
            </>}
          </div>
        </div>
        <div className="ds-field" style={{ minWidth: 120 }}><label>Canal</label>
          <SearchSelect value={canalSel} options={CANAL_FILTRO} placeholder="Canal" onChange={(v) => setCanalSel(v || 'Todos')} />
        </div>
        <div className="ds-field" style={{ minWidth: 110 }}><label>Turno</label>
          <SearchSelect value={turnoSel} options={TURNO_FILTRO} placeholder="Turno" onChange={(v) => setTurnoSel(v || 'Todos')} />
        </div>
        <div className="ds-field" style={{ minWidth: 130 }}><label>Período</label>
          <SearchSelect value={periodoSel} options={PERIODO_OPTS} placeholder="Período" onChange={setPeriodo} />
        </div>
        <div className="ds-field"><label>De</label><input type="date" className="field" value={de} onChange={(e) => { setDe(e.target.value); setPeriodoSel('Personalizado') }} /></div>
        <div className="ds-field"><label>até</label><input type="date" className="field" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodoSel('Personalizado') }} /></div>
        <div className="ds-actions">
          <button className="btn-ghost" onClick={puxar} disabled={syncing || !tenantId}>{syncing ? '⏳ Puxando…' : '↻ Puxar do iComanda'}</button>
          <button className="btn-ghost">↓ Exportar</button>
        </div>
      </div>

      <div className="search-row">
        {msg
          ? <span className="mock-tag" style={{ background: msg.startsWith('Erro') ? '#fee2e2' : '#dcfce7', color: msg.startsWith('Erro') ? '#b91c1c' : '#166534', borderColor: 'transparent' }}>{msg}</span>
          : loading ? <span className="mock-tag">Carregando…</span>
          : <span className="mock-tag" style={{ background: '#eef2ff', color: '#3730a3', borderColor: 'transparent' }}>● Vendas por dia — só dias Processados{turnoSel !== 'Todos' ? ` · turno pelo caixa (rateado por canal)` : ''}</span>}
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              <th>Loja</th><th>Canal</th><th>D. Movimento</th>
              <th className="r">Comandas</th><th className="r">Pessoas</th>
              <th className="r">Faturamento</th><th className="r">Desconto</th><th className="r">Taxa</th><th className="r">Couvert</th><th className="r">Ticket</th>
            </tr>
          </thead>
          <tbody>
            {!lista.length
              ? <tr><td colSpan={10} className="empty">Nenhum dia processado no filtro. Clique em "Puxar do iComanda".</td></tr>
              : <>
                {lista.map((r) => (
                  <tr key={r.id}>
                    <td>{r.loja}</td>
                    <td>{r.canal}</td>
                    <td>{r.dMovimento}</td>
                    <td className="r">{int(r.comandas)}</td>
                    <td className="r">{int(r.pessoas)}</td>
                    <td className="r">{brl(r.faturado)}</td>
                    <td className="r">{brl(r.desconto)}</td>
                    <td className="r">{brl(r.taxa)}</td>
                    <td className="r">{brl(r.couvert)}</td>
                    <td className="r">{brl(r.ticket)}</td>
                  </tr>
                ))}
                <tr className="fill" aria-hidden="true"><td colSpan={10} /></tr>
              </>}
          </tbody>
          {lista.length > 0 && <tfoot>
            <tr>
              <td>{lista.length} linhas</td><td /><td />
              <td className="r">{int(tot.comandas)}</td><td className="r">{int(tot.pessoas)}</td>
              <td className="r">{brl(tot.faturado)}</td><td className="r">{brl(tot.desconto)}</td><td className="r">{brl(tot.taxa)}</td><td className="r">{brl(tot.couvert)}</td><td className="r">{brl(ticketMedio)}</td>
            </tr>
          </tfoot>}
        </table>
      </div>
    </div>
  )
}
