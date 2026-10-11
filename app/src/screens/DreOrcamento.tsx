import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useToastTipo } from '../lib/toast'
import { isoD, fmtDia } from '../lib/date'
import { downloadCsv } from '../lib/csv'

// Orçamento (Fase 3 do DRE): teto MENSAL por conta → orçado × realizado, com semáforo.
// Realizado = compras do PERÍODO (entradas_estoque) agrupadas pela conta do insumo.
// O teto é mensal; no período comparo com o ritmo esperado (pró-rata por dias do mês).

type Conta = { id: string; codigo: string; nome: string; grupo: string; parent_codigo?: string | null }
type Insumo = { id: string; conta_gerencial_id?: string | null }
type Entrada = { insumo_id: string; loja_id?: string | null; custo_total?: number | null; criado_em?: string; tipo?: string; conta_gerencial_id?: string | null }
type Orc = { conta_gerencial_id: string; valor_mensal?: number | null }
type Loja = { id: string; nome: string }

const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const parseNum = (s: string) => { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0 }
const fmtTeto = (n: number) => n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''  // 35301 → "35.301,00"
const GRUPO_LBL: Record<string, string> = { custo: 'Custo', despesa: 'Despesa', investimento: 'Investimento' }
const statusOf = (p: number) => p > 1.05 ? 'bad' : p >= 0.95 ? 'warn' : 'good'
const cor = (s: string) => s === 'bad' ? '#e11d48' : s === 'warn' ? '#d97706' : '#16a34a'

// quantos "meses cheios" o período [de,ate] representa: soma, por mês tocado,
// (dias do mês dentro do intervalo ÷ dias totais do mês). Mês inteiro = 1; metade = 0,5.
function mesesEquivalentes(de: string, ate: string): number {
  if (!de || !ate) return 0
  const d0 = new Date(de + 'T00:00:00'), d1 = new Date(ate + 'T00:00:00')
  if (d1 < d0) return 0
  let mult = 0, y = d0.getFullYear(), m = d0.getMonth()
  while (y < d1.getFullYear() || (y === d1.getFullYear() && m <= d1.getMonth())) {
    const diasNoMes = new Date(y, m + 1, 0).getDate()
    const ini = Math.max(d0.getTime(), new Date(y, m, 1).getTime())
    const fim = Math.min(d1.getTime(), new Date(y, m, diasNoMes).getTime())
    mult += (Math.floor((fim - ini) / 86400000) + 1) / diasNoMes
    m++; if (m > 11) { m = 0; y++ }
  }
  return mult
}

export function DreOrcamento() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const { toast, setToast, showToast } = useToastTipo(2200)
  const now = new Date()
  const [de, setDe] = useState(isoD(new Date(now.getFullYear(), now.getMonth(), 1)))  // 1º dia do mês atual
  const [ate, setAte] = useState(isoD(now))
  const [periodoSel, setPeriodoSel] = useState('Mês atual')
  const [lojaId, setLojaId] = useState('')        // '' = todas (orçamento geral)
  const [vals, setVals] = useState<Record<string, string>>({})

  const ano = Number((ate || de || '').slice(0, 4)) || now.getFullYear()  // ano do teto = ano do período
  const mult = useMemo(() => mesesEquivalentes(de, ate), [de, ate])       // "meses equivalentes" do período

  // atalhos de período (padrão do sistema)
  function setPreset(p: string) {
    setPeriodoSel(p)
    const n = new Date()
    if (p === 'Mês atual') { setDe(isoD(new Date(n.getFullYear(), n.getMonth(), 1))); setAte(isoD(n)) }
    else if (p === 'Mês anterior') { setDe(isoD(new Date(n.getFullYear(), n.getMonth() - 1, 1))); setAte(isoD(new Date(n.getFullYear(), n.getMonth(), 0))) }
    // 'Período' = mantém as datas atuais; o usuário edita De/Até
  }
  const { data: lojas = [] } = useQuery({ queryKey: ['dre-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] } })
  const { data: contas = [] } = useQuery({ queryKey: ['dre-contas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('contas_gerenciais').select('*').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Conta[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['dre-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,conta_gerencial_id').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: entradas = [] } = useQuery({ queryKey: ['dre-orc-entradas', tenantId, de, ate], enabled: !!tenantId && !!de && !!ate, queryFn: () => fetchAll<Entrada>((f, t) => supabase.from('entradas_estoque').select('insumo_id,loja_id,custo_total,criado_em,tipo,conta_gerencial_id').eq('tenant_id', tenantId).gte('criado_em', de).lte('criado_em', ate + 'T23:59:59').order('criado_em').order('id').range(f, t)) })
  // Todas (consolidado) → carrega TODAS as linhas (todas as lojas + geral) p/ SOMAR; loja específica → só a dela
  const { data: orcs = [] } = useQuery({ queryKey: ['dre-orcamentos', tenantId, ano, lojaId], enabled: !!tenantId, queryFn: async () => { let q = supabase.from('orcamentos_gerenciais').select('conta_gerencial_id,valor_mensal').eq('tenant_id', tenantId).eq('ano', ano); if (lojaId) q = q.eq('loja_id', lojaId); const { data } = await q; return (data ?? []) as Orc[] } })

  const consolidado = !lojaId   // "Todas as lojas" → soma dos tetos (só-leitura; edita por loja)
  const tetoByConta = useMemo(() => { const m = new Map<string, number>(); orcs.forEach((o) => m.set(o.conta_gerencial_id, (m.get(o.conta_gerencial_id) || 0) + (Number(o.valor_mensal) || 0))); return m }, [orcs])
  useEffect(() => { if (consolidado) { setVals({}); return } const m: Record<string, string> = {}; orcs.forEach((o) => { if (Number(o.valor_mensal)) m[o.conta_gerencial_id] = fmtTeto(Number(o.valor_mensal)) }); setVals(m) }, [orcs, ano, consolidado])

  // contas folha (analíticas), agrupadas por pai
  const folhas = useMemo(() => { const pais = new Set(contas.map((c) => c.parent_codigo).filter(Boolean)); return contas.filter((c) => !pais.has(c.codigo)).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true })) }, [contas])
  const paiNome = (cod?: string | null) => contas.find((c) => c.codigo === cod)?.nome || '—'

  // realizado por conta no período selecionado (entradas já vêm filtradas por data na query)
  const realDaConta = useMemo(() => {
    const insConta = new Map(insumos.map((i) => [i.id, i.conta_gerencial_id]))
    const porConta = new Map<string, number>()
    entradas.forEach((e) => {
      if (e.tipo !== 'manual' && e.tipo !== 'nfe' && e.tipo !== 'nfe_importada') return
      if (lojaId && (e.loja_id || '') !== lojaId) return
      const cid = e.conta_gerencial_id || insConta.get(e.insumo_id); if (!cid) return   // conta efetiva (override da entrada senão a do insumo)
      porConta.set(cid, (porConta.get(cid) || 0) + (Number(e.custo_total) || 0))
    })
    return porConta
  }, [insumos, entradas, lojaId])

  const salvar = useMutation({
    mutationFn: async ({ contaId, valor }: { contaId: string; valor: number }) => {
      const lid = lojaId || null   // upsert manual (loja nula = orçamento geral)
      let sel = supabase.from('orcamentos_gerenciais').select('id').eq('tenant_id', tenantId).eq('conta_gerencial_id', contaId).eq('ano', ano)
      sel = lid ? sel.eq('loja_id', lid) : sel.is('loja_id', null)
      const { data: ex } = await sel.limit(1)
      if (ex && ex.length) { const { error } = await supabase.from('orcamentos_gerenciais').update({ valor_mensal: valor }).eq('id', (ex[0] as { id: string }).id); if (error) throw error }
      else { const { error } = await supabase.from('orcamentos_gerenciais').insert({ tenant_id: tenantId, conta_gerencial_id: contaId, ano, loja_id: lid, valor_mensal: valor }); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dre-orcamentos'] }) }, onError: (e: Error) => showToast(e.message, 'err'),
  })
  const onBlur = (contaId: string) => { const v = parseNum(vals[contaId] || ''); const antes = orcs.find((o) => o.conta_gerencial_id === contaId)?.valor_mensal || 0; if (v !== Number(antes)) salvar.mutate({ contaId, valor: v }); setVals((m) => ({ ...m, [contaId]: fmtTeto(v) })) }  // reformata ao sair

  const orcadoDe = (cid: string) => consolidado ? (tetoByConta.get(cid) || 0) : parseNum(vals[cid] || '')
  const totOrc = folhas.reduce((a, c) => a + orcadoDe(c.id), 0)   // soma dos tetos mensais
  const totEsp = totOrc * mult                                    // esperado p/ o período (pró-rata)
  const totReal = folhas.reduce((a, c) => a + (realDaConta.get(c.id) || 0), 0)
  const ritmo = totEsp > 0 ? totReal / totEsp : 0                 // realizado ÷ esperado
  const saldoEsp = totEsp - totReal                               // folga (+) / estouro (−) no período

  // agrupa folhas por pai (código do grupo)
  const grupos = useMemo(() => { const m = new Map<string, Conta[]>(); folhas.forEach((c) => { const k = c.parent_codigo || '?'; (m.get(k) || m.set(k, []).get(k)!).push(c) }); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })) }, [folhas])

  // exporta orçado × realizado do período pra CSV
  function exportar() {
    const rows: (string | number)[][] = [['Grupo', 'Conta', 'Teto mensal', 'Esperado', 'Realizado', 'Ritmo %', 'Situacao']]
    grupos.forEach(([paiCod, itens]) => itens.forEach((c) => {
      const orc = orcadoDe(c.id), esp = orc * mult, real = realDaConta.get(c.id) || 0
      const p = esp > 0 ? real / esp : 0, s = statusOf(p)
      const sit = orc > 0 ? (s === 'bad' ? 'Acima' : s === 'warn' ? 'No limite' : 'No ritmo') : 'sem teto'
      rows.push([`${paiCod} ${paiNome(paiCod)}`, c.nome, Math.round(orc), Math.round(esp), Math.round(real), orc > 0 ? Math.round(p * 100) : '', sit])
    }))
    const loja = lojaId ? (lojas.find((l) => l.id === lojaId)?.nome || 'loja') : 'geral'
    downloadCsv(`orcamento-${loja}-${fmtDia(de)}-a-${fmtDia(ate)}.csv`.replace(/[/\s]/g, '-'), rows)
  }

  return (
    <div className="dre-screen">
      <div className="dre-bar">
        <div className="dre-fld"><label>Loja</label><select value={lojaId} onChange={(e) => setLojaId(e.target.value)}><option value="">Todas as lojas (consolidado)</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
        <div className="dre-fld"><label>Período</label><select value={periodoSel} onChange={(e) => setPreset(e.target.value)}><option>Mês atual</option><option>Mês anterior</option><option>Período</option></select></div>
        <div className="dre-fld"><label>De</label><input className="dre-dt" type="date" value={de} onChange={(e) => { setDe(e.target.value); setPeriodoSel('Período') }} /></div>
        <div className="dre-fld"><label>Até</label><input className="dre-dt" type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodoSel('Período') }} /></div>
        <div className="dre-grow" />
        <button className="dre-btn" onClick={exportar}>⬇ Exportar</button>
      </div>

      <div className="dre-kpis">
        <div className="dre-kpi"><div className="rail" style={{ background: '#14315F' }} /><div className="k">Teto mensal</div><div className="v">{brl(totOrc)}</div><div className="d">soma dos tetos / mês</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: '#64748b' }} /><div className="k">Esperado no período</div><div className="v">{brl(totEsp)}</div><div className="d">proporcional aos dias</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: '#f97316' }} /><div className="k">Realizado</div><div className="v">{brl(totReal)}</div><div className="d">comprado no período</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: totOrc > 0 ? cor(statusOf(ritmo)) : '#64748b' }} /><div className="k">{saldoEsp >= 0 ? 'No ritmo' : 'Acima do ritmo'}</div><div className="v" style={{ color: totOrc > 0 ? cor(statusOf(ritmo)) : '#1e2030' }}>{totOrc > 0 ? Math.round(ritmo * 100) + '%' : '—'}</div><div className="d">do esperado</div></div>
      </div>

      <div className="dre-card">
        <div className="dre-ch"><div><div className="t">Orçado × Realizado por conta</div><div className="s">{fmtDia(de)} a {fmtDia(ate)} · {consolidado ? 'teto = soma das lojas (edite o teto em cada loja)' : 'clique no valor do teto pra editar'}</div></div>
          <div className="legend" style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11.5, color: '#586084' }}><span><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', marginRight: 5, background: '#16a34a' }} />Dentro</span><span><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', marginRight: 5, background: '#d97706' }} />No limite</span><span><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', marginRight: 5, background: '#e11d48' }} />Estourou</span></div>
        </div>
        <div className="dre-scroll">
          <table className="dre">
            <thead><tr><th className="l dre-stick">Conta</th><th>Teto / mês</th><th>Esperado</th><th>Realizado</th><th className="l" style={{ textAlign: 'left' }}>Ritmo</th><th>Situação</th></tr></thead>
            <tbody>
              {grupos.length === 0 ? <tr><td colSpan={6} className="dre-empty">Sem contas. Monte o plano de contas primeiro.</td></tr>
                : grupos.map(([paiCod, itens]) => (
                  <>
                    <tr key={'g' + paiCod} className="dre-grupo" style={{ cursor: 'default' }}><td className="l dre-stick" colSpan={6}><span className="dre-cod">{paiCod}</span>{paiNome(paiCod)} <span style={{ fontSize: 10.5, color: '#586084', fontWeight: 400 }}>· {GRUPO_LBL[itens[0]?.grupo] || ''}</span></td></tr>
                    {itens.map((c) => {
                      const orc = orcadoDe(c.id), esp = orc * mult, real = realDaConta.get(c.id) || 0
                      const p = esp > 0 ? real / esp : 0, s = statusOf(p), w = Math.min(p, 1.5) / 1.5 * 100
                      return (
                        <tr key={c.id} className="dre-sub" style={{ cursor: 'default' }}>
                          <td className="l dre-stick" style={{ paddingLeft: 30, fontWeight: 400 }}>{c.nome}</td>
                          <td>{consolidado
                            ? <span className="mono" style={{ display: 'inline-block', width: 96, textAlign: 'right', fontSize: 12.5, color: orc > 0 ? '#1e2030' : '#cbd5e1' }}>{orc > 0 ? brl(orc) : '—'}</span>
                            : <input value={vals[c.id] ?? ''} placeholder="0,00" inputMode="decimal" onFocus={(e) => e.target.select()} onChange={(e) => setVals((m) => ({ ...m, [c.id]: e.target.value }))} onBlur={() => onBlur(c.id)}
                              style={{ width: 104, height: 28, textAlign: 'right', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0 8px', fontFamily: 'DM Mono, monospace', fontSize: 12.5 }} />}</td>
                          <td className="mono" style={{ color: orc > 0 ? '#586084' : '#cbd5e1' }}>{orc > 0 ? brl(esp) : '—'}</td>
                          <td className="mono">{real > 0 ? brl(real) : '—'}</td>
                          <td className="l">{orc > 0 ? <><span style={{ display: 'inline-block', width: 120, height: 8, borderRadius: 5, background: '#eceff5', position: 'relative', verticalAlign: 'middle', overflow: 'hidden' }}><span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w + '%', background: cor(s), borderRadius: 5 }} /></span> <span className="mono" style={{ fontSize: 12, color: cor(s) }}>{Math.round(p * 100)}%</span></> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td>{orc > 0 ? <span className={'pill p-' + s} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: cor(s), background: s === 'bad' ? 'rgba(225,29,72,.1)' : s === 'warn' ? 'rgba(217,119,6,.14)' : 'rgba(22,163,74,.12)' }}>{s === 'bad' ? 'Acima' : s === 'warn' ? 'No limite' : 'No ritmo'}</span> : <span style={{ color: '#cbd5e1', fontSize: 12 }}>sem teto</span>}</td>
                        </tr>
                      )
                    })}
                  </>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="dre-note">O <b>teto</b> é o valor que você planeja gastar <b>por mês</b> em cada conta (salva ao sair do campo). O <b>esperado</b> é a fatia desse teto proporcional aos dias do período (ex.: 7 de 31 dias ≈ 23% do teto). O <b>realizado</b> é o que já foi comprado no período. O <b>ritmo</b> compara realizado ÷ esperado: verde = no ritmo, amarelo = chegando no limite, vermelho = gastando mais rápido que o planejado. Assim dá pra fechar o controle a cada 7 dias sem esperar o mês acabar.</div>
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
