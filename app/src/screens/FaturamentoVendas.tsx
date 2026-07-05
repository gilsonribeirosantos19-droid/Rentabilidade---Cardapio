import { useEffect, useMemo, useRef, useState } from 'react'
import { useLoja } from '../lib/loja'
import { useAuth } from '../lib/auth'
import { supabase, fetchAll } from '../lib/db'
import { SearchSelect } from '../components/SearchSelect'
import './faturamento.css'

// Faturamento por Loja (mensal) — lê a tabela icomanda_faturamento (número CHEIO,
// vindo do bloco filiais.listar do iComanda: bate 100% com o relatório do PDV).
// Botão "Puxar do iComanda" chama a Edge Function icomanda-sync p/ atualizar a competência.

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const p1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
const int = (v: number) => v.toLocaleString('pt-BR')

const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }
const PERIODO_OPTS = ['Personalizado', 'Mês Atual', 'Mês Anterior']

type FatRow = { lojaId: string; loja: string; faturado: number; caixas: number; comissao: number; pessoas: number; comandas: number }

export function FaturamentoVendas() {
  const { lojas } = useLoja()
  const { tenantId } = useAuth()
  const [de, setDe] = useState('2026-06-01')
  const [ate, setAte] = useState('2026-06-30')
  const [periodoSel, setPeriodoSel] = useState('Personalizado')
  const [lojaSet, setLojaSet] = useState<Set<string>>(new Set())
  const [lojaOpen, setLojaOpen] = useState(false)
  const initRef = useRef(false)
  useEffect(() => { if (!initRef.current && lojas.length) { initRef.current = true; setLojaSet(new Set(lojas.map((l) => l.nome))) } }, [lojas])
  const allSel = lojas.length > 0 && lojaSet.size === lojas.length
  const lojaLabel = allSel ? 'Todas as lojas' : lojaSet.size === 0 ? 'Nenhuma' : lojaSet.size === 1 ? [...lojaSet][0] : `${lojaSet.size} lojas`
  const toggleLoja = (n: string) => setLojaSet((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s })
  const toggleTodas = () => setLojaSet(allSel ? new Set() : new Set(lojas.map((l) => l.nome)))

  // --- dados REAIS do iComanda (icomanda_faturamento) ---
  const [rows, setRows] = useState<FatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const lojaNome = useMemo(() => { const m: Record<string, string> = {}; lojas.forEach((l) => { m[l.id] = l.nome }); return m }, [lojas])
  // agrega por loja somando faturado/caixas/comissão(taxa)/pessoas/comandas dos dias do intervalo
  const buildRows = (data: Record<string, unknown>[]): FatRow[] => {
    const map = new Map<string, FatRow>()
    for (const r of data) {
      const key = String(r.loja_id)
      const ex = map.get(key)
      if (ex) { ex.faturado += Number(r.faturado) || 0; ex.caixas += Number(r.qtd_caixas) || 0; ex.comissao += Number(r.taxa) || 0; ex.pessoas += Number(r.pessoas) || 0; ex.comandas += Number(r.qtd_comandas) || 0 }
      else map.set(key, { lojaId: key, loja: lojaNome[key] || String(r.filial_nome || '—'), faturado: Number(r.faturado) || 0, caixas: Number(r.qtd_caixas) || 0, comissao: Number(r.taxa) || 0, pessoas: Number(r.pessoas) || 0, comandas: Number(r.qtd_comandas) || 0 })
    }
    return [...map.values()]
  }
  // lê o PORTÃO (icomanda_recebimento) — SÓ os dias 'processado' (regra: relatório só vê o aprovado)
  async function fetchFat(): Promise<FatRow[]> {
    const data = await fetchAll<Record<string, unknown>>((f, t) =>
      supabase.from('icomanda_recebimento').select('*').eq('tenant_id', tenantId).eq('status', 'processado').gte('data', de).lte('data', ate).range(f, t))
    return buildRows(data)
  }
  async function carregar() {
    try { setRows(await fetchFat()) }
    catch (e) { setMsg('Erro ao carregar faturamento: ' + (e as Error).message); setRows([]) }
  }
  useEffect(() => {
    if (!tenantId || !de || !ate) { setRows([]); return }
    let alive = true
    setLoading(true)
    fetchFat()
      .then((r) => { if (alive) setRows(r) })
      .catch((e) => { if (alive) { setMsg('Erro ao carregar faturamento: ' + (e as Error).message); setRows([]) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, de, ate, lojaNome])
  async function puxar() {
    if (!tenantId || syncing || !de || !ate) return
    setSyncing(true); setMsg('Puxando do iComanda… (dia a dia, pode levar ~1 min)')
    try {
      const { data, error } = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, data_ini: de, data_fim: ate } })
      if (error) throw error
      if (data?.status !== 'ok') throw new Error(data?.mensagem || 'erro no iComanda')
      setMsg(`✓ ${data.dias} dias · ${data.processados} processados${data.com_erro ? ` · ${data.com_erro} com erro` : ''}.`)
      await carregar()
    } catch (e) {
      setMsg('Erro ao puxar: ' + (e as Error).message)
    } finally { setSyncing(false) }
  }

  const setPeriodo = (label: string) => {
    const lb = label || 'Personalizado'; setPeriodoSel(lb); const d = new Date()
    if (lb === 'Mês Atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (lb === 'Mês Anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(l.toLocaleDateString('en-CA')) }
    else { setDe(''); setAte('') }
  }

  // filtra por loja + ordena por faturamento desc
  const lista = useMemo(() => {
    const filtraLoja = lojaSet.size > 0 && !allSel
    return rows.filter((r) => !filtraLoja || lojaSet.has(r.loja)).sort((a, b) => b.faturado - a.faturado)
  }, [rows, lojaSet, allSel])
  const totFat = lista.reduce((a, r) => a + r.faturado, 0)
  const totCx = lista.reduce((a, r) => a + r.caixas, 0)
  const totCom = lista.reduce((a, r) => a + r.comissao, 0)
  const totPes = lista.reduce((a, r) => a + r.pessoas, 0)
  const totCmd = lista.reduce((a, r) => a + r.comandas, 0)

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
                {lojas.map((l) => <label key={l.id} className="ms-opt"><input type="checkbox" checked={lojaSet.has(l.nome)} onChange={() => toggleLoja(l.nome)} />{l.nome}</label>)}
              </div>
            </>}
          </div>
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
          : loading ? <span className="mock-tag">Carregando faturamento…</span>
          : <span className="mock-tag" style={{ background: '#eef2ff', color: '#3730a3', borderColor: 'transparent' }}>● Faturamento real — só dias Processados na Recebimento de Vendas (número cheio)</span>}
      </div>

      <div className="grid-wrap">
        <table>
          <thead>
            <tr>
              <th className="c">#</th>
              <th>Fantasia</th>
              <th className="r">Comandas</th>
              <th className="r">Pessoas</th>
              <th className="r">Nº de Caixas</th>
              <th className="r">Faturamento</th>
              <th className="r">Comissão</th>
              <th className="r">% Participação</th>
            </tr>
          </thead>
          <tbody>
            {!lista.length
              ? <tr><td colSpan={8} className="empty">Nenhum faturamento no filtro. Clique em "Puxar do iComanda".</td></tr>
              : <>
                {lista.map((r, i) => {
                  const pct = totFat > 0 ? r.faturado / totFat * 100 : 0
                  return (
                    <tr key={r.lojaId}>
                      <td className="c">{i + 1}</td>
                      <td>{r.loja}</td>
                      <td className="r">{int(r.comandas)}</td>
                      <td className="r">{int(r.pessoas)}</td>
                      <td className="r">{int(r.caixas)}</td>
                      <td className="r">{brl(r.faturado)}</td>
                      <td className="r">{brl(r.comissao)}</td>
                      <td className="r">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
                          <span style={{ width: 54, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: '#f97316' }} />
                          </span>
                          {p1(pct)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                <tr className="fill" aria-hidden="true"><td colSpan={8} /></tr>
              </>}
          </tbody>
          {lista.length > 0 && <tfoot>
            <tr>
              <td className="c" />
              <td>{lista.length} lojas</td>
              <td className="r">{int(totCmd)}</td>
              <td className="r">{int(totPes)}</td>
              <td className="r">{int(totCx)}</td>
              <td className="r">{brl(totFat)}</td>
              <td className="r">{brl(totCom)}</td>
              <td className="r">100,0%</td>
            </tr>
          </tfoot>}
        </table>
      </div>
    </div>
  )
}
