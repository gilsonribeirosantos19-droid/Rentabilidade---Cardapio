import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { DreLancamentos } from './DreLancamentos'
import './dre.css'

export function Dre() {
  const [tab, setTab] = useState<'dre' | 'lancamentos'>('dre')
  return (
    <div className="dre-screen">
      <div className="dre-tabs">
        <button className={'dre-tab' + (tab === 'dre' ? ' on' : '')} onClick={() => setTab('dre')}>Demonstrativo</button>
        <button className={'dre-tab' + (tab === 'lancamentos' ? ' on' : '')} onClick={() => setTab('lancamentos')}>Lançamentos manuais</button>
      </div>
      {tab === 'dre' ? <DreDemo /> : <DreLancamentos />}
    </div>
  )
}

// DRE Gerencial de Compras — hierarquia grupo (2.1) → conta (Salmão) → insumos.
// Compras = entradas_estoque.custo_total (manual/nfe) por insumo×mês. Receita = recebimento_vendas.
type Conta = { id: string; codigo: string; nome: string; grupo: string; parent_codigo?: string | null; ordem?: number }
type Insumo = { id: string; nome?: string; conta_gerencial_id?: string | null }
type Entrada = { insumo_id: string; loja_id?: string | null; custo_total?: number | null; criado_em?: string; tipo?: string }
type Venda = { loja_id?: string | null; data?: string; faturado?: number | null }
type Lanc = { conta_gerencial_id: string; loja_id?: string | null; data?: string; valor?: number | null }
type Loja = { id: string; nome: string }
type Linha = { cls: string; label: string; vals: number[]; anc?: string[]; gkey?: string; pad: number }

const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const z12 = () => Array(12).fill(0) as number[]
const sum12 = (a: number[], b: number[]) => a.map((v, i) => v + b[i])
const brl = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const anoAtual = new Date().getFullYear()
const byCod = (a: Conta, b: Conta) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true })

function DreDemo() {
  const { tenantId } = useAuth()
  const [ano, setAno] = useState(anoAtual)
  const [lojaId, setLojaId] = useState('')
  const [modo, setModo] = useState<'rs' | 'pc'>('rs')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())

  const ini = `${ano}-01-01`, fim = `${ano}-12-31T23:59:59`

  const { data: lojas = [] } = useQuery({ queryKey: ['dre-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] } })
  const { data: contas = [] } = useQuery({ queryKey: ['dre-contas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('contas_gerenciais').select('*').eq('tenant_id', tenantId).eq('ativo', true); return (data ?? []) as Conta[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['dre-insumos', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,conta_gerencial_id').eq('tenant_id', tenantId).order('nome').order('id').range(f, t)) })
  const { data: entradas = [], isLoading: loadE } = useQuery({ queryKey: ['dre-entradas', tenantId, ano], enabled: !!tenantId, queryFn: () => fetchAll<Entrada>((f, t) => supabase.from('entradas_estoque').select('insumo_id,loja_id,custo_total,criado_em,tipo').eq('tenant_id', tenantId).gte('criado_em', ini).lte('criado_em', fim).order('criado_em').order('id').range(f, t)) })
  const { data: vendas = [] } = useQuery({ queryKey: ['dre-vendas', tenantId, ano], enabled: !!tenantId, queryFn: () => fetchAll<Venda>((f, t) => supabase.from('recebimento_vendas').select('loja_id,data,faturado,status').eq('tenant_id', tenantId).eq('status', 'processado').gte('data', ini.slice(0, 10)).lte('data', `${ano}-12-31`).order('data').order('id').range(f, t)) })
  const { data: lancs = [] } = useQuery({ queryKey: ['dre-lancamentos', tenantId, ano], enabled: !!tenantId, queryFn: () => fetchAll<Lanc>((f, t) => supabase.from('lancamentos_gerenciais').select('conta_gerencial_id,loja_id,data,valor').eq('tenant_id', tenantId).gte('data', ini.slice(0, 10)).lte('data', `${ano}-12-31`).order('data').order('id').range(f, t)) })

  const model = useMemo(() => {
    const contaById = new Map(contas.map((c) => [c.id, c]))
    const childrenOf = (codigo: string | null) => contas.filter((c) => (c.parent_codigo || null) === codigo).sort(byCod)
    const grupoCusto = contas.find((c) => c.codigo === '2.1') || contas.find((c) => c.grupo === 'custo')
    const insById = new Map(insumos.map((i) => [i.id, i]))
    const contaDoInsumo = (insId: string) => { const cid = insById.get(insId)?.conta_gerencial_id; return (cid && contaById.has(cid)) ? cid : grupoCusto?.id }

    // compras por insumo × mês
    const porInsumo = new Map<string, number[]>()
    entradas.forEach((e) => {
      if (e.tipo !== 'manual' && e.tipo !== 'nfe' && e.tipo !== 'nfe_importada') return
      if (lojaId && (e.loja_id || '') !== lojaId) return
      const d = e.criado_em ? new Date(e.criado_em) : null
      if (!d || d.getFullYear() !== ano) return
      const arr = porInsumo.get(e.insumo_id) || z12(); arr[d.getMonth()] += Number(e.custo_total) || 0; porInsumo.set(e.insumo_id, arr)
    })
    // insumos (com compra) agrupados por conta
    const insDaConta = new Map<string, { nome: string; vals: number[] }[]>()
    porInsumo.forEach((vals, insId) => {
      if (vals.every((v) => v === 0)) return
      const cid = contaDoInsumo(insId); if (!cid) return
      const l = insDaConta.get(cid) || []; l.push({ nome: insById.get(insId)?.nome || '(insumo)', vals }); insDaConta.set(cid, l)
    })
    insDaConta.forEach((l) => l.sort((a, b) => b.vals.reduce((x, y) => x + y, 0) - a.vals.reduce((x, y) => x + y, 0)))

    // lançamentos por conta × mês
    const lancPorConta = new Map<string, number[]>()
    lancs.forEach((l) => {
      if (lojaId && (l.loja_id || '') !== lojaId) return
      if (!l.data || l.data.slice(0, 4) !== String(ano)) return
      const m = parseInt(l.data.slice(5, 7), 10) - 1; if (m < 0 || m > 11) return
      const arr = lancPorConta.get(l.conta_gerencial_id) || z12(); arr[m] += Number(l.valor) || 0; lancPorConta.set(l.conta_gerencial_id, arr)
    })
    // receita por mês
    const receita = z12()
    vendas.forEach((v) => { if (lojaId && (v.loja_id || '') !== lojaId) return; if (!v.data || v.data.slice(0, 4) !== String(ano)) return; const m = parseInt(v.data.slice(5, 7), 10) - 1; if (m >= 0 && m < 12) receita[m] += Number(v.faturado) || 0 })

    // caminha a árvore de contas (recursivo)
    function walk(c: Conta, anc: string[], nivel: number): { vals: number[]; lines: Linha[] } {
      const gkey = 'g' + c.id
      const kids = childrenOf(c.codigo)
      const myIns = insDaConta.get(c.id) || []
      const myLanc = lancPorConta.get(c.id)
      const childAnc = [...anc, gkey]
      let vals = z12(); const childLines: Linha[] = []
      kids.forEach((k) => { const r = walk(k, childAnc, nivel + 1); vals = sum12(vals, r.vals); childLines.push(...r.lines) })
      let insVals = z12(); myIns.forEach((it) => insVals = sum12(insVals, it.vals)); vals = sum12(vals, insVals)
      if (myLanc) vals = sum12(vals, myLanc)
      const colaps = kids.length > 0 || myIns.length > 0 || !!(myLanc && myLanc.some((v) => v))
      const caret = colaps ? '<span class="dre-caret">›</span>' : '<span style="display:inline-block;width:15px"></span>'
      const self: Linha = { cls: nivel === 0 ? 'dre-grupo' : 'dre-sub', label: `${caret}<span class="dre-cod">${c.codigo}</span>${c.nome}`, vals, anc, gkey: colaps ? gkey : undefined, pad: nivel }
      const insLines: Linha[] = myIns.map((it) => ({ cls: 'dre-item', label: it.nome, vals: it.vals, anc: childAnc, pad: nivel + 1 }))
      const lancLine: Linha[] = (myLanc && myLanc.some((v) => v)) ? [{ cls: 'dre-item', label: '➕ Lançamentos manuais (sem nota)', vals: myLanc, anc: childAnc, pad: nivel + 1 }] : []
      return { vals, lines: [self, ...childLines, ...insLines, ...lancLine] }
    }

    const linhas: Linha[] = [{ cls: 'dre-receita', label: '<span class="dre-cod">1</span>Receita de Vendas', vals: receita, pad: 0 }]
    let totGrupos = z12()
    childrenOf(null).forEach((g) => { const r = walk(g, [], 0); totGrupos = sum12(totGrupos, r.vals); linhas.push(...r.lines) })
    const resultado = receita.map((r, i) => r - totGrupos[i])
    linhas.push({ cls: 'dre-result', label: '<span class="dre-cod">=</span>Resultado', vals: resultado, pad: 0 })

    const tot = (a: number[]) => a.reduce((x, y) => x + y, 0)
    return { linhas, receita, recT: tot(receita), gruT: tot(totGrupos), resT: tot(resultado), temContas: contas.length > 0 }
  }, [contas, insumos, entradas, vendas, lancs, lojaId, ano])

  const cell = (v: number, base: number) => modo === 'rs' ? brl(v) : (base > 0 ? (v / base * 100).toFixed(2).replace('.', ',') + '%' : '0,00%')
  const toggle = (g: string) => setAbertos((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n })
  const pc = (v: number) => (model.recT > 0 ? (v / model.recT * 100).toFixed(1).replace('.', ',') : '0') + '% da receita'
  const allKeys = () => new Set(model.linhas.map((l) => l.gkey).filter(Boolean) as string[])

  return (
    <>
      <div className="dre-bar">
        <div className="dre-fld"><label>Loja</label>
          <select value={lojaId} onChange={(e) => setLojaId(e.target.value)}><option value="">Todas as lojas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        </div>
        <div className="dre-fld"><label>Exercício</label>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>{[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <div className="dre-grow" />
        <button className="dre-lnk" onClick={() => setAbertos(abertos.size ? new Set() : allKeys())}>{abertos.size ? '– recolher tudo' : '+ expandir tudo'}</button>
        <div className="dre-fld"><label>Exibir</label><div className="dre-seg"><button className={modo === 'rs' ? 'on' : ''} onClick={() => setModo('rs')}>R$</button><button className={modo === 'pc' ? 'on' : ''} onClick={() => setModo('pc')}>%</button></div></div>
      </div>

      <div className="dre-kpis">
        <div className="dre-kpi"><div className="rail" style={{ background: '#16a34a' }} /><div className="k">Receita ({ano})</div><div className="v">{brl(model.recT)}</div><div className="d">vendas no ano</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: '#14315F' }} /><div className="k">Compras / Custos+Desp.</div><div className="v">{brl(model.gruT)}</div><div className="d">{pc(model.gruT)}</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: '#f97316' }} /><div className="k">Resultado</div><div className="v" style={{ color: model.resT >= 0 ? '#16a34a' : '#e11d48' }}>{brl(model.resT)}</div><div className="d">{pc(model.resT)}</div></div>
        <div className="dre-kpi"><div className="rail" style={{ background: '#64748b' }} /><div className="k">Contas no plano</div><div className="v">{contas.length}</div><div className="d">cadastradas</div></div>
      </div>

      <div className="dre-card">
        <div className="dre-ch"><div><div className="t">Demonstrativo por conta</div><div className="s">{lojaId ? (lojas.find((l) => l.id === lojaId)?.nome) : 'Todas as lojas'} · {ano}</div></div>
          <div className="dre-hint">clique numa conta para abrir</div>
        </div>
        {!model.temContas ? (
          <div className="dre-empty">Plano de contas ainda não criado. Rode os SQL <b>dre_fase1_fundacao.sql</b> e <b>dre_contas_analiticas.sql</b>.</div>
        ) : loadE ? (<div className="dre-empty">Carregando compras do ano…</div>) : (
          <div className="dre-scroll">
            <table className="dre">
              <thead><tr><th className="l dre-stick">Conta</th>{MES.map((m) => <th key={m}>{m}</th>)}<th className="dre-tot">Total</th></tr></thead>
              <tbody>
                {model.linhas.map((ln, idx) => {
                  const hidden = ln.anc && ln.anc.some((a) => !abertos.has(a))
                  const totLinha = ln.vals.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={idx} className={ln.cls + (ln.gkey && abertos.has(ln.gkey) ? ' open' : '') + (hidden ? ' dre-hidden' : '')}
                      style={ln.gkey ? { cursor: 'pointer' } : undefined} onClick={ln.gkey ? () => toggle(ln.gkey!) : undefined}>
                      <td className="l dre-stick" style={{ paddingLeft: 12 + ln.pad * 16 }} dangerouslySetInnerHTML={{ __html: ln.label }} />
                      {ln.vals.map((v, i) => <td key={i}>{cell(v, model.receita[i])}</td>)}
                      <td className="dre-tot">{cell(totLinha, model.recT)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dre-note">
        <b>Hierarquia:</b> <b>Grupo</b> (2.1 Custos) → <b>Conta</b> (Salmão, Embalagens…) → <b>insumos</b> do estoque. As compras somam de <code>entradas_estoque</code> por insumo e sobem até a conta; a receita vem de <code>recebimento_vendas</code>. Use a aba <b>Classificar itens</b> para dizer em que conta cada insumo entra.
      </div>
    </>
  )
}
