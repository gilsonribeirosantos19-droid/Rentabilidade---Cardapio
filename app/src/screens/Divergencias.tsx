import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import './estoque.css'

type Insumo = { id: string; nome: string }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }
type Ficha = { id: string; nome?: string; preco_venda?: number | null; status?: string }
type Vinc = { id: string; insumo_id: string; qtd_por_embalagem?: number | null; embalagem_descricao?: string; codigo_fornecedor?: string; fornecedor_id?: string }
type NfeItem = { id: string; descricao_nfe?: string; nfe_id?: string; codigo_item_fornecedor?: string }
type Nfe = { id: string; numero?: string; serie?: string; status?: string; nome_emitente?: string; valor_total?: number; created_at?: string; cnpj_emitente?: string }
type Venda = { produto_nome?: string; quantidade?: number }
type Forn = { id: string; cnpj?: string }

const num = (v?: number) => (+((v ?? 0)) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
type Check = { key: string; titulo: string; cols: [string, string]; rows: { a: string; b: string }[] }

export function Divergencias() {
  const { tenantId } = useAuth()
  const [open, setOpen] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['dv', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const [insumos, saldos, fichas, vinc, nfeItens, nfeRec, vendas, nfePresas, fornecedores] = await Promise.all([
        fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).range(f, t)),
        fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,quantidade,custo_medio').eq('tenant_id', tenantId).range(f, t)),
        fetchAll<Ficha>((f, t) => supabase.from('fichas_tecnicas').select('id,nome,preco_venda,status').eq('tenant_id', tenantId).range(f, t)),
        fetchAll<Vinc>((f, t) => supabase.from('insumo_fornecedores').select('id,insumo_id,qtd_por_embalagem,embalagem_descricao,codigo_fornecedor,fornecedor_id').eq('tenant_id', tenantId).range(f, t)),
        fetchAll<NfeItem>((f, t) => supabase.from('nfe_itens').select('id,descricao_nfe,nfe_id,codigo_item_fornecedor').eq('tenant_id', tenantId).is('vinculacao_id', null).range(f, t)),
        fetchAll<Nfe>((f, t) => supabase.from('nfe_recebidas').select('id,numero,status,cnpj_emitente').eq('tenant_id', tenantId).range(f, t)),
        fetchAll<Venda>((f, t) => supabase.from('vendas_item').select('produto_nome,quantidade').eq('tenant_id', tenantId).is('ficha_id', null).range(f, t)).catch(() => [] as Venda[]),
        supabase.from('nfe_recebidas').select('numero,serie,nome_emitente,valor_total,created_at').eq('tenant_id', tenantId).eq('status', 'em_transito').then((r) => (r.data ?? []) as Nfe[], () => [] as Nfe[]),
        fetchAll<Forn>((f, t) => supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', tenantId).range(f, t)),
      ])
      return { insumos, saldos, fichas, vinc, nfeItens, nfeRec, vendas, nfePresas, fornecedores }
    },
  })

  const checks = useMemo<Check[]>(() => {
    if (!data) return []
    const { insumos, saldos, fichas, vinc, nfeItens, nfeRec, vendas, nfePresas, fornecedores } = data
    const insMap: Record<string, string> = {}; insumos.forEach((i) => { insMap[i.id] = i.nome })
    const recMap: Record<string, Nfe> = {}; nfeRec.forEach((n) => { recMap[n.id] = n })
    // resolução por CNPJ+código (igual ao Monitor NF-e): um item com vinculacao_id nulo pode
    // JÁ estar coberto por um vínculo do fornecedor (mesmo CNPJ + mesmo código) → não é divergência.
    const dig = (s?: string) => (s || '').replace(/\D/g, '')
    const fornByCnpj = (cnpj?: string) => fornecedores.find((fo) => dig(fo.cnpj) === dig(cnpj))
    const resolvido = (it: NfeItem) => {
      const n = recMap[it.nfe_id || '']; const forn = n ? fornByCnpj(n.cnpj_emitente) : null
      if (!forn || !it.codigo_item_fornecedor) return false
      return vinc.some((v) => v.fornecedor_id === forn.id && (v.codigo_fornecedor || '') === (it.codigo_item_fornecedor || ''))
    }
    const c: Check[] = []
    c.push({ key: 'nfe', titulo: 'Itens de NF-e sem vínculo', cols: ['NF-e', 'Produto da nota'], rows: nfeItens.filter((it) => { const n = recMap[it.nfe_id || '']; return n && n.status !== 'processada' && !resolvido(it) }).map((it) => ({ a: recMap[it.nfe_id || '']?.numero || '—', b: it.descricao_nfe || '—' })) })
    c.push({ key: 'custo', titulo: 'Saldo com custo médio zerado', cols: ['Insumo', 'Saldo'], rows: saldos.filter((s) => (+(s.quantidade || 0) > 0) && !(+(s.custo_medio || 0) > 0)).map((s) => ({ a: insMap[s.insumo_id] || '—', b: num(s.quantidade) })) })
    c.push({ key: 'neg', titulo: 'Estoque negativo', cols: ['Insumo', 'Saldo'], rows: saldos.filter((s) => +(s.quantidade || 0) < 0).map((s) => ({ a: insMap[s.insumo_id] || '—', b: num(s.quantidade) })) })
    const vMap: Record<string, number> = {}; vendas.forEach((v) => { vMap[v.produto_nome || '—'] = (vMap[v.produto_nome || '—'] || 0) + (+(v.quantidade || 0)) })
    c.push({ key: 'venda', titulo: 'Produtos vendidos sem ficha técnica', cols: ['Produto', 'Qtd vendida'], rows: Object.entries(vMap).map(([n, q]) => ({ a: n, b: num(q) })) })
    c.push({ key: 'ficha', titulo: 'Fichas ativas sem preço de venda', cols: ['Ficha', 'Preço'], rows: fichas.filter((f) => f.status === 'ativa' && !(+(f.preco_venda || 0) > 0)).map((f) => ({ a: f.nome || '—', b: '—' })) })
    c.push({ key: 'conv', titulo: 'Vínculos sem conversão (qtd na embalagem)', cols: ['Insumo', 'Embalagem'], rows: vinc.filter((v) => !(+(v.qtd_por_embalagem || 0) > 0)).map((v) => ({ a: insMap[v.insumo_id] || '—', b: v.embalagem_descricao || '—' })) })
    const LIM = 6, agora = Date.now()
    c.push({ key: 'transito', titulo: `NF-e presas há +${LIM}h (XML não baixou)`, cols: ['NF-e / Fornecedor', 'Parada há'], rows: nfePresas.filter((n) => n.created_at && (agora - new Date(n.created_at).getTime()) / 3600000 >= LIM).sort((a, b) => +new Date(a.created_at!) - +new Date(b.created_at!)).map((n) => { const h = Math.floor((agora - new Date(n.created_at!).getTime()) / 3600000); return { a: `${n.numero}/${n.serie} · ${n.nome_emitente || '—'}`, b: `há ${h}h · R$ ${(+(n.valor_total || 0)).toFixed(2)}` } }) })
    return c
  }, [data])

  useEffect(() => { setOpen(new Set(checks.filter((c) => c.rows.length).map((c) => c.key))) }, [checks])
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const abrirSec = (k: string) => { setOpen((s) => new Set(s).add(k)); setTimeout(() => document.getElementById('dv-sec-' + k)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }

  if (isLoading) return <div className="est-screen"><div className="empty">Carregando verificações…</div></div>

  return (
    <div className="est-screen">
      <div className="dv-kpis">
        {checks.map((c) => <div key={c.key} className={'dv-kpi ' + (c.rows.length ? 'warn' : 'ok')} onClick={() => abrirSec(c.key)}><div className="l">{c.titulo}</div><div className="v">{c.rows.length}</div></div>)}
      </div>
      {checks.map((c) => (
        <div key={c.key} className="dv-sec" id={'dv-sec-' + c.key}>
          <div className="dv-sec-h" onClick={() => toggle(c.key)}>
            <span style={{ fontSize: 15 }}>{c.rows.length ? '⚠️' : '✅'}</span>{c.titulo}
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: c.rows.length ? '#dc2626' : '#16a34a' }}>{c.rows.length}</span>
          </div>
          {open.has(c.key) && <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {c.rows.length
              ? <div className="tbl-scroll" style={{ maxHeight: 320 }}><table className="tbl"><thead><tr><th>{c.cols[0]}</th><th>{c.cols[1]}</th></tr></thead><tbody>{c.rows.map((r, i) => <tr key={i}><td>{r.a}</td><td>{r.b}</td></tr>)}</tbody></table></div>
              : <div className="dv-empty-ok">✓ Nenhuma divergência aqui</div>}
          </div>}
        </div>
      ))}
    </div>
  )
}
