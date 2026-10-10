import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useToastTipo } from '../lib/toast'

// Orçamento (Fase 3 do DRE): teto MENSAL por conta → orçado × realizado, com semáforo.
// Realizado = compras do mês (entradas_estoque) agrupadas pela conta do insumo.

type Conta = { id: string; codigo: string; nome: string; grupo: string; parent_codigo?: string | null }
type Insumo = { id: string; conta_gerencial_id?: string | null }
type Entrada = { insumo_id: string; custo_total?: number | null; criado_em?: string; tipo?: string }
type Orc = { conta_gerencial_id: string; valor_mensal?: number | null }

const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const parseNum = (s: string) => { const n = parseFloat((s || '').replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0 }
const anoAtual = new Date().getFullYear()
const GRUPO_LBL: Record<string, string> = { custo: 'Custo', despesa: 'Despesa', investimento: 'Investimento' }
const statusOf = (p: number) => p > 1.05 ? 'bad' : p >= 0.95 ? 'warn' : 'good'
const cor = (s: string) => s === 'bad' ? '#e11d48' : s === 'warn' ? '#d97706' : '#16a34a'

export function DreOrcamento() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const { toast, setToast, showToast } = useToastTipo(2200)
  const [ano, setAno] = useState(anoAtual)
  const [mes, setMes] = useState(new Date().getMonth())
  const [vals, setVals] = useState<Record<string, string>>({})

  const ini = `${ano}-01-01`, fim = `${ano}-12-31T23:59:59`
  const { data: contas = [] } = useQuery({ queryKey: ['dre-contas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('contas_gerenciais').select('*').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Conta[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['dre-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,conta_gerencial_id').eq('tenant_id', tenantId).order('id').range(f, t)) })
  const { data: entradas = [] } = useQuery({ queryKey: ['dre-entradas', tenantId, ano], enabled: !!tenantId, queryFn: () => fetchAll<Entrada>((f, t) => supabase.from('entradas_estoque').select('insumo_id,custo_total,criado_em,tipo').eq('tenant_id', tenantId).gte('criado_em', ini).lte('criado_em', fim).order('criado_em').order('id').range(f, t)) })
  const { data: orcs = [] } = useQuery({ queryKey: ['dre-orcamentos', tenantId, ano], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('orcamentos_gerenciais').select('conta_gerencial_id,valor_mensal').eq('tenant_id', tenantId).eq('ano', ano); return (data ?? []) as Orc[] } })

  useEffect(() => { const m: Record<string, string> = {}; orcs.forEach((o) => { if (Number(o.valor_mensal)) m[o.conta_gerencial_id] = String(o.valor_mensal).replace('.', ',') }); setVals(m) }, [orcs, ano])

  // contas folha (analíticas), agrupadas por pai
  const folhas = useMemo(() => { const pais = new Set(contas.map((c) => c.parent_codigo).filter(Boolean)); return contas.filter((c) => !pais.has(c.codigo)).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true })) }, [contas])
  const paiNome = (cod?: string | null) => contas.find((c) => c.codigo === cod)?.nome || '—'

  // realizado por conta no mês selecionado
  const realDaConta = useMemo(() => {
    const insConta = new Map(insumos.map((i) => [i.id, i.conta_gerencial_id]))
    const porConta = new Map<string, number>()
    entradas.forEach((e) => {
      if (e.tipo !== 'manual' && e.tipo !== 'nfe' && e.tipo !== 'nfe_importada') return
      const d = e.criado_em ? new Date(e.criado_em) : null
      if (!d || d.getFullYear() !== ano || d.getMonth() !== mes) return
      const cid = insConta.get(e.insumo_id); if (!cid) return
      porConta.set(cid, (porConta.get(cid) || 0) + (Number(e.custo_total) || 0))
    })
    return porConta
  }, [insumos, entradas, ano, mes])

  const salvar = useMutation({
    mutationFn: async ({ contaId, valor }: { contaId: string; valor: number }) => { const { error } = await supabase.from('orcamentos_gerenciais').upsert({ tenant_id: tenantId, conta_gerencial_id: contaId, ano, valor_mensal: valor }, { onConflict: 'tenant_id,conta_gerencial_id,ano' }); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dre-orcamentos'] }) }, onError: (e: Error) => showToast(e.message, 'err'),
  })
  const onBlur = (contaId: string) => { const v = parseNum(vals[contaId] || ''); const antes = orcs.find((o) => o.conta_gerencial_id === contaId)?.valor_mensal || 0; if (v !== Number(antes)) salvar.mutate({ contaId, valor: v }) }

  const orcadoDe = (cid: string) => parseNum(vals[cid] || '')
  const totOrc = folhas.reduce((a, c) => a + orcadoDe(c.id), 0)
  const totReal = folhas.reduce((a, c) => a + (realDaConta.get(c.id) || 0), 0)
  const saldo = totOrc - totReal

  // agrupa folhas por pai (código do grupo)
  const grupos = useMemo(() => { const m = new Map<string, Conta[]>(); folhas.forEach((c) => { const k = c.parent_codigo || '?'; (m.get(k) || m.set(k, []).get(k)!).push(c) }); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })) }, [folhas])

  return (
    <>
      <div className="dre-bar">
        <div className="dre-fld"><label>Ano</label><select value={ano} onChange={(e) => setAno(Number(e.target.value))}>{[anoAtual, anoAtual - 1, anoAtual + 1].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        <div className="dre-fld"><label>Mês (realizado)</label><select value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MES.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div className="dre-grow" />
        <div className="dre-hint" style={{ alignSelf: 'center' }}>defina o teto mensal de cada conta → comparo com o comprado em {MES[mes]}</div>
      </div>

      <div className="dre-kpis">
        <div className="dre-kpi"><div className="rail" style={{ background: '#14315F' }} /><div className="k">Orçado / mês</div><div className="v">{brl(totOrc)}</div><div className="d">soma dos tetos</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: '#f97316' }} /><div className="k">Realizado ({MES[mes].slice(0, 3)})</div><div className="v">{brl(totReal)}</div><div className="d">comprado no mês</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: saldo >= 0 ? '#16a34a' : '#e11d48' }} /><div className="k">{saldo >= 0 ? 'Dentro do teto' : 'Estourou'}</div><div className="v" style={{ color: saldo >= 0 ? '#16a34a' : '#e11d48' }}>{(saldo >= 0 ? '+' : '−') + 'R$ ' + Math.abs(Math.round(saldo)).toLocaleString('pt-BR')}</div><div className="d">orçado − realizado</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: '#64748b' }} /><div className="k">% do orçamento usado</div><div className="v">{totOrc > 0 ? Math.round(totReal / totOrc * 100) : 0}%</div><div className="d">no mês</div></div>
      </div>

      <div className="dre-card">
        <div className="dre-ch"><div><div className="t">Orçado × Realizado por conta</div><div className="s">{MES[mes]} de {ano} · clique no valor do teto pra editar</div></div>
          <div className="legend" style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11.5, color: '#586084' }}><span><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', marginRight: 5, background: '#16a34a' }} />Dentro</span><span><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', marginRight: 5, background: '#d97706' }} />No limite</span><span><span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', marginRight: 5, background: '#e11d48' }} />Estourou</span></div>
        </div>
        <div className="dre-scroll">
          <table className="dre">
            <thead><tr><th className="l dre-stick">Conta</th><th>Teto / mês</th><th>Realizado</th><th>Diferença</th><th className="l" style={{ textAlign: 'left' }}>Uso</th><th>Situação</th></tr></thead>
            <tbody>
              {grupos.length === 0 ? <tr><td colSpan={6} className="dre-empty">Sem contas. Monte o plano de contas primeiro.</td></tr>
                : grupos.map(([paiCod, itens]) => (
                  <>
                    <tr key={'g' + paiCod} className="dre-grupo" style={{ cursor: 'default' }}><td className="l dre-stick" colSpan={6}><span className="dre-cod">{paiCod}</span>{paiNome(paiCod)} <span style={{ fontSize: 10.5, color: '#586084', fontWeight: 400 }}>· {GRUPO_LBL[itens[0]?.grupo] || ''}</span></td></tr>
                    {itens.map((c) => {
                      const orc = orcadoDe(c.id), real = realDaConta.get(c.id) || 0
                      const p = orc > 0 ? real / orc : 0, s = statusOf(p), w = Math.min(p, 1.5) / 1.5 * 100, diff = orc - real
                      return (
                        <tr key={c.id} className="dre-sub" style={{ cursor: 'default' }}>
                          <td className="l dre-stick" style={{ paddingLeft: 30, fontWeight: 400 }}>{c.nome}</td>
                          <td><input value={vals[c.id] ?? ''} placeholder="0" onChange={(e) => setVals((m) => ({ ...m, [c.id]: e.target.value }))} onBlur={() => onBlur(c.id)}
                            style={{ width: 96, height: 28, textAlign: 'right', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0 8px', fontFamily: 'DM Mono, monospace', fontSize: 12.5 }} /></td>
                          <td className="mono">{real > 0 ? brl(real) : '—'}</td>
                          <td className="mono" style={{ color: orc > 0 ? (diff < 0 ? '#e11d48' : '#16a34a') : '#94a3c4' }}>{orc > 0 ? ((diff >= 0 ? '+' : '−') + 'R$ ' + Math.abs(Math.round(diff)).toLocaleString('pt-BR')) : '—'}</td>
                          <td className="l">{orc > 0 ? <><span style={{ display: 'inline-block', width: 120, height: 8, borderRadius: 5, background: '#eceff5', position: 'relative', verticalAlign: 'middle', overflow: 'hidden' }}><span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w + '%', background: cor(s), borderRadius: 5 }} /></span> <span className="mono" style={{ fontSize: 12, color: cor(s) }}>{Math.round(p * 100)}%</span></> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td>{orc > 0 ? <span className={'pill p-' + s} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: cor(s), background: s === 'bad' ? 'rgba(225,29,72,.1)' : s === 'warn' ? 'rgba(217,119,6,.14)' : 'rgba(22,163,74,.12)' }}>{s === 'bad' ? 'Estourou' : s === 'warn' ? 'No limite' : 'Dentro'}</span> : <span style={{ color: '#cbd5e1', fontSize: 12 }}>sem teto</span>}</td>
                        </tr>
                      )
                    })}
                  </>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="dre-note">O <b>teto</b> é o valor que você planeja gastar por mês em cada conta (salva ao sair do campo). O <b>realizado</b> é o que já foi comprado no mês escolhido. O semáforo compara os dois: verde (dentro), amarelo (chegando no limite), vermelho (estourou).</div>
      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}
