import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SearchSelect } from '../components/SearchSelect'
import './estoque.css'

type Insumo = { id: string; nome: string; categoria?: string; tipo_item?: string; unidade_medida?: string; unidade_compra?: string; familia?: string; subgrupo?: string; participa_cmv?: string; minimo?: number }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }
type Mov = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_unitario?: number; criado_em?: string; created_at?: string }
type Loja = { id: string; nome: string }

const brl = (v?: number | null) => (v == null || v === 0) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtd = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const uniq = (a: (string | undefined)[]) => [...new Set(a.filter(Boolean).map((v) => ('' + v).trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt'))

// busca paginada (equivalente ao apiAll do utils.js — vence o limite de 1000 do PostgREST)
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []; let from = 0; const size = 1000
  for (;;) {
    const { data, error } = await build(from, from + size - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]; out.push(...rows)
    if (rows.length < size) break
    from += size
  }
  return out
}

export function SaldoEstoque() {
  const { tenantId } = useAuth()
  const [posicao, setPosicao] = useState<'atual' | 'mes_anterior' | 'especifica'>('atual')
  const [dataBase, setDataBase] = useState('')
  const [categoria, setCategoria] = useState('')   // = "Grupo" (mesmo campo)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [familia, setFamilia] = useState('')
  const [subgrupo, setSubgrupo] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [unidade, setUnidade] = useState('')
  const [somenteCmv, setSomenteCmv] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)

  const { data: insumos = [] } = useQuery({
    queryKey: ['est-insumos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria,tipo_item,unidade_medida,unidade_compra,familia,subgrupo,participa_cmv,minimo').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)),
  })
  const { data: lojas = [] } = useQuery({
    queryKey: ['est-lojas', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'); return (data ?? []) as Loja[] },
  })
  const { data: saldos = [], isLoading: loadingSaldos } = useQuery({
    queryKey: ['est-saldos', tenantId], enabled: !!tenantId,
    queryFn: () => fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,quantidade,custo_medio').eq('tenant_id', tenantId).range(f, t)),
  })
  // fornecedor: vínculos insumo→fornecedor (p/ o filtro) — pequeno, sempre carregado
  const { data: fornData } = useQuery({
    queryKey: ['est-forn', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const [vinc, forns] = await Promise.all([
        fetchAll<{ insumo_id: string; fornecedor_id: string }>((f, t) => supabase.from('insumo_fornecedores').select('insumo_id,fornecedor_id').eq('tenant_id', tenantId).range(f, t)),
        supabase.from('fornecedores').select('id,nome').eq('tenant_id', tenantId).order('nome').then((r) => r.data ?? []),
      ])
      const map: Record<string, Set<string>> = {}
      vinc.forEach((v) => { (map[v.insumo_id] = map[v.insumo_id] || new Set()).add(v.fornecedor_id) })
      return { map, forns: forns as Loja[] }
    },
  })
  // entradas/saídas só no modo histórico
  const histAtivo = posicao !== 'atual'
  const { data: entradas = [], isLoading: loadEnt } = useQuery({
    queryKey: ['est-entradas', tenantId], enabled: !!tenantId && histAtivo,
    queryFn: () => fetchAll<Mov>((f, t) => supabase.from('entradas_estoque').select('insumo_id,loja_id,quantidade,custo_unitario,criado_em,created_at').eq('tenant_id', tenantId).range(f, t)),
  })
  const { data: saidas = [], isLoading: loadSai } = useQuery({
    queryKey: ['est-saidas', tenantId], enabled: !!tenantId && histAtivo,
    queryFn: () => fetchAll<Mov>((f, t) => supabase.from('saidas_estoque').select('insumo_id,loja_id,quantidade,criado_em,created_at').eq('tenant_id', tenantId).range(f, t)),
  })

  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])
  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l])) as Record<string, Loja>, [lojas])
  const fornMap = fornData?.map || {}

  const cats = useMemo(() => uniq(insumos.map((i) => i.categoria)), [insumos])
  const tipos = useMemo(() => uniq(insumos.map((i) => i.tipo_item)), [insumos])
  const familias = useMemo(() => uniq(insumos.map((i) => i.familia)), [insumos])
  const subgrupos = useMemo(() => uniq(insumos.map((i) => i.subgrupo)), [insumos])
  const unidades = useMemo(() => uniq(insumos.map((i) => i.unidade_medida || i.unidade_compra)), [insumos])

  const onPosChange = (v: string) => {
    setPosicao(v as any)
    if (v === 'mes_anterior') {
      const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth(), 0)
      setDataBase(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`)
    } else if (v === 'atual') { setDataBase('') }
  }

  // reconstrói o saldo na data (média móvel ponderada), igual ao Kardex
  const saldosCalc = useMemo<Saldo[]>(() => {
    if (posicao === 'atual') return saldos
    if (!dataBase) return []
    const dtLim = dataBase + 'T23:59:59'
    const dtOf = (m: Mov) => m.criado_em || m.created_at || ''
    const map: Record<string, Saldo> = {}
    const ents = entradas.filter((e) => dtOf(e) <= dtLim).sort((a, b) => dtOf(a).localeCompare(dtOf(b)))
    for (const e of ents) {
      const key = e.insumo_id + '|' + (e.loja_id || '')
      const cur = (map[key] = map[key] || { insumo_id: e.insumo_id, loja_id: e.loja_id || null, quantidade: 0, custo_medio: 0 })
      const qtdE = e.quantidade || 0, custoE = e.custo_unitario || 0
      if (qtdE === 0) { cur.custo_medio = custoE; continue }
      const nq = (cur.quantidade || 0) + qtdE
      if (nq > 0) cur.custo_medio = ((cur.quantidade || 0) * (cur.custo_medio || 0) + qtdE * custoE) / nq
      cur.quantidade = nq
    }
    for (const s of saidas.filter((x) => dtOf(x) <= dtLim)) {
      const key = s.insumo_id + '|' + (s.loja_id || '')
      const cur = (map[key] = map[key] || { insumo_id: s.insumo_id, loja_id: s.loja_id || null, quantidade: 0, custo_medio: 0 })
      cur.quantidade = Math.max(0, (cur.quantidade || 0) - (s.quantidade || 0))
    }
    return Object.values(map)
  }, [posicao, dataBase, saldos, entradas, saidas])

  const rows = useMemo(() => {
    const out = saldosCalc.map((s) => {
      const ins = insMap[s.insumo_id]; if (!ins) return null
      if (categoria && (ins.categoria || '') !== categoria) return null
      if (tipo && (ins.tipo_item || '') !== tipo) return null
      if (somenteCmv && ins.participa_cmv === 'nao') return null
      if (busca && !norm(ins.nome).includes(norm(busca))) return null
      if (familia && (ins.familia || '') !== familia) return null
      if (subgrupo && (ins.subgrupo || '') !== subgrupo) return null
      if (unidade && (ins.unidade_medida || ins.unidade_compra || '') !== unidade) return null
      if (fornecedor && !(fornMap[ins.id] && fornMap[ins.id].has(fornecedor))) return null
      const valor = (s.quantidade || 0) * (s.custo_medio || 0)
      return { ins, loja: s.loja_id ? lojaMap[s.loja_id] : null, s, valor }
    }).filter(Boolean) as { ins: Insumo; loja: Loja | null; s: Saldo; valor: number }[]
    out.sort((a, b) => b.valor - a.valor)
    return out
  }, [saldosCalc, insMap, lojaMap, fornMap, categoria, tipo, somenteCmv, busca, familia, subgrupo, unidade, fornecedor])

  const totalValor = rows.reduce((s, r) => s + r.valor, 0)
  const mfAtivo = !!(tipo || familia || subgrupo || unidade || fornecedor || somenteCmv)
  const carregando = loadingSaldos || (histAtivo && (loadEnt || loadSai))
  const thSaldo = posicao === 'atual' ? 'Saldo Atual' : `Saldo em ${dataBase ? new Date(dataBase + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}`

  const fornOptions = (fornData?.forns || []).map((f) => f.nome)
  const fornByName = new Map((fornData?.forns || []).map((f) => [f.nome, f.id]))
  const limpar = () => { setTipo(''); setFamilia(''); setSubgrupo(''); setFornecedor(''); setUnidade(''); setSomenteCmv(false) }

  return (
    <div className="est-screen">
      <div className="est-title">Saldo de Estoque <span>— posição financeira por loja</span></div>

      <div className="ds-filterbar">
        <div className="ds-field">
          <label>Posição</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="field" style={{ minWidth: 150 }} value={posicao} onChange={(e) => onPosChange(e.target.value)}>
              <option value="atual">Posição Atual</option>
              <option value="mes_anterior">Fim Mês Anterior</option>
              <option value="especifica">Data Específica</option>
            </select>
            {posicao === 'especifica' && <input type="date" className="field" value={dataBase} onChange={(e) => setDataBase(e.target.value)} />}
          </div>
        </div>
        <div className="ds-field">
          <label>Categoria</label>
          <select className="field" style={{ minWidth: 170 }} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ds-field ds-grow">
          <label>Buscar</label>
          <input className="field" style={{ minWidth: 160, width: '100%' }} placeholder="Pesquisar item..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="ds-actions">
          <button className="btn-ghost" onClick={() => setAdvOpen((o) => !o)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Mais filtros {mfAtivo && <span className="mf-dot" />}
          </button>
        </div>
      </div>

      <div className={'se-adv' + (advOpen ? ' open' : '')}>
        <div className="se-adv-grid">
          <div><label className="mf-lbl">Tipo do item</label><SearchSelect value={tipo} onChange={setTipo} options={tipos} placeholder="Todos os tipos" /></div>
          <div><label className="mf-lbl">Família</label><SearchSelect value={familia} onChange={setFamilia} options={familias} placeholder="Todas" /></div>
          <div><label className="mf-lbl">Grupo</label><SearchSelect value={categoria} onChange={setCategoria} options={cats} placeholder="Todos os grupos" /></div>
          <div><label className="mf-lbl">Subgrupo</label><SearchSelect value={subgrupo} onChange={setSubgrupo} options={subgrupos} placeholder="Todos" /></div>
          <div><label className="mf-lbl">Fornecedor</label><SearchSelect value={fornData?.forns?.find((f) => f.id === fornecedor)?.nome || ''} onChange={(nm) => setFornecedor(fornByName.get(nm) || '')} options={fornOptions} placeholder="Todos" /></div>
          <div><label className="mf-lbl">Unidade</label><SearchSelect value={unidade} onChange={setUnidade} options={unidades} placeholder="Todas" /></div>
        </div>
        <div className="se-adv-foot">
          <label className="se-mf-chk"><input type="checkbox" checked={somenteCmv} onChange={(e) => setSomenteCmv(e.target.checked)} /> Somente itens que calculam CMV</label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={limpar}>Limpar filtros</button>
            <button className="btn-primary" onClick={() => setAdvOpen(false)}>Aplicar filtros</button>
          </div>
        </div>
      </div>

      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr>
            <th>Insumo</th><th>Categoria</th><th>Tipo do Item</th><th>Un.</th><th>Loja</th>
            <th className="r">{thSaldo}</th><th className="r">Custo Médio</th><th className="r">Valor em Estoque</th><th className="c">Status</th><th className="c">Calcula CMV</th>
          </tr></thead>
          {rows.length > 0 && <tfoot><tr style={{ background: '#f8fafc', fontWeight: 700 }}>
            <td colSpan={5} style={{ fontSize: 11, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '.05em' }}>TOTAL</td>
            <td className="r mono">—</td><td className="r mono">—</td>
            <td className="r mono" style={{ color: '#16a34a' }}>{'R$ ' + totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td /><td />
          </tr></tfoot>}
          <tbody>
            {carregando ? <tr><td colSpan={10} className="empty">Carregando…</td></tr>
              : (posicao !== 'atual' && !dataBase) ? <tr><td colSpan={10} className="empty">Selecione uma data base.</td></tr>
              : rows.length === 0 ? <tr><td colSpan={10} className="empty">Nenhum saldo encontrado.</td></tr>
              : rows.map((r, i) => {
                const q = r.s.quantidade || 0
                const status = (r.ins.minimo && r.ins.minimo > 0 && q < r.ins.minimo)
                  ? <span className="badge" style={{ background: '#fee2e2', color: '#dc2626' }}>Abaixo mín.</span>
                  : q === 0 ? <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Zerado</span>
                  : <span className="badge" style={{ background: '#dcfce7', color: '#16a34a' }}>OK</span>
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.ins.nome}</td>
                    <td>{r.ins.categoria || '—'}</td>
                    <td>{r.ins.tipo_item || '—'}</td>
                    <td>{r.ins.unidade_medida || r.ins.unidade_compra || '—'}</td>
                    <td>{r.loja?.nome || '—'}</td>
                    <td className="r mono">{qtd(q)}</td>
                    <td className="r mono">{brl(r.s.custo_medio)}</td>
                    <td className="r mono" style={{ fontWeight: 600 }}>{brl(r.valor)}</td>
                    <td className="c">{status}</td>
                    <td className="c">{r.ins.participa_cmv !== 'nao' ? <span className="cmv-box">✓</span> : <span className="cmv-box" />}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}
