import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useLoja } from '../lib/loja'
import { SearchSelect } from '../components/SearchSelect'
import './monitorvendas.css'

// Recebimento de Vendas — o PORTÃO da integração com o iComanda (por loja × DIA).
// Pré-lista TODOS os dias do período como "Não Recebido"; quando a puxada do dia
// grava em icomanda_recebimento, o dia vira Processado (entra nos relatórios) ou
// Com Erro (fica bloqueado). Botão "Puxar do iComanda" roda o motor no modo diário.

type Situacao = 'com_erros' | 'nao_recebido' | 'processado'
type RecRow = { loja_id: string; data: string; status: string; faturado?: number; desconto?: number; taxa?: number; couvert?: number; qtd_caixas?: number; qtd_comandas?: number; qtd_canceladas?: number; pessoas?: number; ticket_medio?: number; erros?: string | null; data_integracao?: string | null }
type Row = { id: string; situacao: Situacao; loja: string; dMovimento: string; faturado: number; desconto: number; caixas: number; comandas: number; canceladas: number; pessoas: number; ticket: number; dIntegracao: string; erros: string }

const SIT_META: Record<Situacao, { nome: string; dot: string }> = {
  com_erros: { nome: 'Com Erro', dot: '#ef4444' },
  nao_recebido: { nome: 'Não Recebido', dot: '#111827' },
  processado: { nome: 'Processado', dot: '#16a34a' },
}
const ORDER: Situacao[] = ['com_erros', 'nao_recebido', 'processado']
const PERIODO_OPTS = ['Personalizado', 'Mês Atual', 'Mês Anterior']

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mesInicio = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const mesFim = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA') }
const fmtDia = (iso: string) => iso.split('-').reverse().join('/')
const fmtTs = (ts?: string | null) => ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
function diasPeriodo(de: string, ate: string): string[] {
  const out: string[] = []
  const hoje = new Date().toLocaleDateString('en-CA')
  const fim = ate > hoje ? hoje : ate  // nunca mostra dias FUTUROS (só até hoje)
  let d = new Date(fim + 'T12:00:00'); const start = new Date(de + 'T12:00:00')
  let guard = 0
  while (d >= start && guard++ < 400) { out.push(d.toLocaleDateString('en-CA')); d = new Date(d.getTime() - 86400000) }
  return out
}
const mapSit = (s: string): Situacao => s === 'processado' ? 'processado' : 'com_erros'

export function MonitorVendas() {
  const { tenantId } = useAuth()
  const { lojas } = useLoja()
  const [de, setDe] = useState(mesInicio())
  const [ate, setAte] = useState(mesFim())
  const [periodoSel, setPeriodoSel] = useState('Mês Atual')
  const [lojaSet, setLojaSet] = useState<Set<string>>(new Set())
  const [lojaOpen, setLojaOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const initRef = useRef(false)
  // padrão: só UMA loja ativa (Ponta Negra). Usuário troca pra outra ou "Todas" no filtro.
  useEffect(() => {
    if (!initRef.current && lojas.length) {
      initRef.current = true
      const pn = lojas.find((l) => /ponta\s*negra/i.test(l.nome)) || lojas[0]
      setLojaSet(new Set([pn.id]))
    }
  }, [lojas])
  const allSel = lojas.length > 0 && lojaSet.size === lojas.length
  const lojaLabel = allSel ? 'Todas as lojas' : lojaSet.size === 0 ? 'Nenhuma loja' : lojaSet.size === 1 ? (lojas.find((l) => lojaSet.has(l.id))?.nome || '1 loja') : `${lojaSet.size} lojas`
  const toggleLoja = (id: string) => setLojaSet((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleTodasLojas = () => setLojaSet(allSel ? new Set() : new Set(lojas.map((l) => l.id)))
  const setPeriodo = (label: string) => {
    const lb = label || 'Personalizado'; setPeriodoSel(lb); const d = new Date()
    if (lb === 'Mês Atual') { setDe(mesInicio()); setAte(mesFim()) }
    else if (lb === 'Mês Anterior') { const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); const l = new Date(d.getFullYear(), d.getMonth(), 0); setDe(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`); setAte(l.toLocaleDateString('en-CA')) }
    else { setDe(''); setAte('') }
  }
  const [chips, setChips] = useState<Set<Situacao>>(new Set(ORDER))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [detId, setDetId] = useState<string | null>(null)

  // dias já recebidos (tabela do portão)
  const { data: recebidos = [], refetch } = useQuery({
    queryKey: ['ico-receb', tenantId, de, ate], enabled: !!tenantId && !!de && !!ate,
    queryFn: async () => fetchAll<RecRow>((f, t) => supabase.from('icomanda_recebimento').select('*').eq('tenant_id', tenantId).gte('data', de).lte('data', ate).range(f, t)).catch(() => [] as RecRow[]),
  })

  async function puxar() {
    if (!tenantId || syncing || !de || !ate) return
    setSyncing(true); setMsg('Puxando do iComanda… (dia a dia, pode levar ~1 min)')
    try {
      const { data, error } = await supabase.functions.invoke('icomanda-sync', { body: { tenant_id: tenantId, data_ini: de, data_fim: ate } })
      if (error) throw error
      if (data?.status !== 'ok') throw new Error(data?.mensagem || 'erro no iComanda')
      setMsg(`✓ ${data.dias} dias · ${data.processados} processados${data.com_erro ? ` · ${data.com_erro} com erro` : ''}.`)
      refetch()
    } catch (e) {
      setMsg('Erro ao puxar: ' + (e as Error).message)
    } finally { setSyncing(false) }
  }

  // monta as linhas: para cada loja × cada dia do período → registro recebido, senão "Não Recebido"
  const rows = useMemo<Row[]>(() => {
    const lojasShow = lojas.filter((l) => lojaSet.has(l.id))
    const dias = diasPeriodo(de, ate)
    const byKey: Record<string, RecRow> = {}
    recebidos.forEach((r) => { byKey[`${r.loja_id}|${r.data}`] = r })
    const out: Row[] = []
    lojasShow.forEach((l) => dias.forEach((dia) => {
      const rec = byKey[`${l.id}|${dia}`]
      if (rec) out.push({ id: `${l.id}|${dia}`, situacao: mapSit(rec.status), loja: l.nome, dMovimento: fmtDia(dia), faturado: Number(rec.faturado) || 0, desconto: Number(rec.desconto) || 0, caixas: Number(rec.qtd_caixas) || 0, comandas: Number(rec.qtd_comandas) || 0, canceladas: Number(rec.qtd_canceladas) || 0, pessoas: Number(rec.pessoas) || 0, ticket: Number(rec.ticket_medio) || 0, dIntegracao: fmtTs(rec.data_integracao), erros: rec.erros || '' })
      else out.push({ id: `${l.id}|${dia}`, situacao: 'nao_recebido', loja: l.nome, dMovimento: fmtDia(dia), faturado: 0, desconto: 0, caixas: 0, comandas: 0, canceladas: 0, pessoas: 0, ticket: 0, dIntegracao: '—', erros: '' })
    }))
    return out
  }, [recebidos, lojas, lojaSet, de, ate])

  const cnt = useMemo(() => { const c = { com_erros: 0, nao_recebido: 0, processado: 0 } as Record<Situacao, number>; rows.forEach((r) => { c[r.situacao]++ }); return c }, [rows])
  const totFat = useMemo(() => rows.filter((r) => r.situacao === 'processado').reduce((a, r) => a + r.faturado, 0), [rows])
  const lista = useMemo(() => rows.filter((r) => chips.has(r.situacao)), [rows, chips])

  const toggleChip = (s: Situacao) => setChips((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n })
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked = lista.length > 0 && lista.every((r) => sel.has(r.id))
  const toggleAll = (on: boolean) => setSel(on ? new Set(lista.map((r) => r.id)) : new Set())

  const det = detId ? rows.find((r) => r.id === detId) : null

  return (
    <div className="mvend-screen">
      <div className="ds-filterbar">
        <div className="ds-field"><label>Loja</label>
          <div className="ms">
            <button className="ms-btn" onClick={() => setLojaOpen((o) => !o)}>{lojaLabel}<span style={{ color: '#94a3b8' }}>▾</span></button>
            {lojaOpen && <>
              <div className="ms-back" onClick={() => setLojaOpen(false)} />
              <div className="ms-pop">
                <label className="ms-opt"><input type="checkbox" checked={allSel} onChange={toggleTodasLojas} /><b>Todas as lojas</b></label>
                <div className="ms-sep" />
                {lojas.map((l) => <label key={l.id} className="ms-opt"><input type="checkbox" checked={lojaSet.has(l.id)} onChange={() => toggleLoja(l.id)} />{l.nome}</label>)}
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
        </div>
      </div>

      <div className="kbar">
        <div className="it"><span className="k">Dias no período</span><span className="v">{rows.length}</span></div>
        <div className="it"><span className="k">Processados</span><span className="v ok">{cnt.processado}</span></div>
        <div className="it"><span className="k">Com erro</span><span className="v err">{cnt.com_erros}</span></div>
        <div className="it"><span className="k">Não recebidos</span><span className="v" style={{ color: '#111827' }}>{cnt.nao_recebido}</span></div>
        <div className="it"><span className="k">Faturamento (processado)</span><span className="v ok">R$ {brl(totFat)}</span></div>
      </div>

      <div className="sit-row">
        {ORDER.map((s) => (
          <label key={s} className="sit-chip">
            <input type="checkbox" checked={chips.has(s)} onChange={() => toggleChip(s)} />
            <span className="dot" style={{ background: SIT_META[s].dot }} />
            {SIT_META[s].nome} <span className="cnt">({cnt[s]})</span>
          </label>
        ))}
        {msg
          ? <span className="mock-tag" style={{ background: msg.startsWith('Erro') ? '#fee2e2' : '#dcfce7', color: msg.startsWith('Erro') ? '#b91c1c' : '#166534' }}>{msg}</span>
          : <span className="mock-tag">🔒 Só os dias <b>Processados</b> entram nos relatórios (Faturamento, Curva ABC). Erro fica de fora.</span>}
      </div>

      <div className="card">
        <div className="toolbar">
          <button className="btn-ghost btn-sm" onClick={() => refetch()}>↻ Atualizar</button>
          <button className="btn-ghost btn-sm" onClick={puxar} disabled={syncing}>{syncing ? '⏳ Puxando…' : '⇩ Puxar dias do período'}</button>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 400px)' }}>
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 34 }}><input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th className="c">Situação</th><th>Loja</th><th>Tipo</th><th>D. Movimento</th><th className="r">Venda</th><th>D. Integração</th>
              </tr>
            </thead>
            <tbody>
              {!lista.length
                ? <tr><td colSpan={7} className="empty">{lojas.length ? 'Nenhum dia neste filtro.' : 'Carregando lojas…'}</td></tr>
                : lista.map((r) => {
                  const m = SIT_META[r.situacao]
                  const nr = r.situacao === 'nao_recebido'
                  return (
                    <tr key={r.id} className={(sel.has(r.id) ? 'sel ' : '') + (r.situacao === 'com_erros' ? 'err' : '')} onClick={() => setDetId(r.id)}>
                      <td className="c" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                      <td className="c"><span className="sit-dot" style={{ background: m.dot }} title={m.nome} /></td>
                      <td>{r.loja}</td>
                      <td>Venda</td>
                      <td>{r.dMovimento}</td>
                      <td className="r">{nr ? '—' : brl(r.faturado)}</td>
                      <td>{r.dIntegracao}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <div className="pag"><span>{lista.length} de {rows.length} dias</span><span>{sel.size} selecionado(s)</span></div>
      </div>

      <div className="det err-panel">
        <div className="h2">{det ? `Detalhe — ${det.loja} · ${det.dMovimento}` : 'Detalhe do dia'}</div>
        {!det
          ? <div className="b-empty"><span className="i">i</span> Selecione um dia para ver o detalhe. Só os <b>Com Erro</b> exigem ação.</div>
          : det.situacao === 'nao_recebido'
            ? <div className="b-empty"><span className="i" style={{ background: '#eef1f5', color: '#111827' }}>⚫</span> Dia <b>{det.dMovimento}</b> ainda <b>não recebido</b>. Clique em <b>Puxar do iComanda</b>.</div>
            : det.situacao === 'com_erros'
              ? <div className="b-empty"><span className="i" style={{ background: '#fef2f2', color: '#ef4444' }}>!</span> <b>Falha na puxada:</b> {det.erros || 'erro desconhecido'}. Este dia <b>não entra nos relatórios</b> até ser reprocessado.</div>
              : <div className="b-empty"><span className="i" style={{ background: '#ecfdf5', color: '#16a34a' }}>✓</span> Recebido e <b>processado</b> · faturamento <b>R$ {brl(det.faturado)}</b> · desconto R$ {brl(det.desconto)} · {det.comandas} comandas ({det.canceladas} cancel.) · {det.pessoas} pessoas · ticket R$ {brl(det.ticket)} · {det.caixas} caixa(s). Já entra nos relatórios.</div>}
      </div>

      <div className="footbar">
        <span style={{ fontSize: 12, color: '#64748b' }}>Portão da integração · só os dias <b>Processados</b> alimentam Faturamento e Curva ABC</span>
      </div>
    </div>
  )
}
