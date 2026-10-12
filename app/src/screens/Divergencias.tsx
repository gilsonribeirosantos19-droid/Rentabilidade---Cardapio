import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import './estoque.css'

type Insumo = { id: string; nome: string }
type Saldo = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_medio?: number }
type Ficha = { id: string; nome?: string; preco_venda?: number | null; status?: string }
type Vinc = { id: string; insumo_id: string; qtd_por_embalagem?: number | null; embalagem_descricao?: string; codigo_fornecedor?: string; fornecedor_id?: string }
type NfeItem = { id: string; descricao_nfe?: string; nfe_id?: string; codigo_item_fornecedor?: string }
type Nfe = { id: string; numero?: string; serie?: string; status?: string; nome_emitente?: string; valor_total?: number; created_at?: string; cnpj_emitente?: string }
type Venda = { produto_nome?: string; qtd?: number }
type Forn = { id: string; cnpj?: string }

const num = (v?: number) => (+((v ?? 0)) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const fmtHa = (h: number | null) => (h == null ? 'sem notas' : h < 1 ? 'agora há pouco' : h < 24 ? `há ${Math.floor(h)}h` : `há ${Math.floor(h / 24)}d`)
type Check = { key: string; titulo: string; cols: [string, string]; rows: { a: string; b: string }[]; sev: number; destino?: [string, string] }
// pede ao Shell pra abrir outra tela (aba), p/ ir resolver a divergência.
const irResolver = (key: string, label: string) => window.dispatchEvent(new CustomEvent('aiko:open-screen', { detail: { key, label } }))

export function Divergencias() {
  const { tenantId } = useAuth()
  const [open, setOpen] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['dv', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      // OTIMIZAÇÃO: antes baixava TODO o histórico (todas as notas + todos os itens + todas as
      // vendas de sempre) = lento. Agora puxa só o que cada verificação precisa: notas PENDENTES
      // (as que têm item sem vínculo), fichas ATIVAS e vendas dos últimos 90 dias.
      const { data: pendRaw } = await supabase.from('nfe_recebidas')
        .select('id,numero,status,cnpj_emitente')
        .eq('tenant_id', tenantId).is('excluida_em', null)
        .in('status', ['aguard_vinculacao', 'em_transito', 'com_erro'])
      const nfeRec = (pendRaw ?? []) as Nfe[]
      const pendIds = nfeRec.map((n) => n.id)
      const desdeVendas = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
      const [insumos, saldos, fichas, vinc, nfeItens, vendas, nfePresas, fornecedores, lojasR] = await Promise.all([
        fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome').eq('tenant_id', tenantId).order('id').range(f, t)),
        fetchAll<Saldo>((f, t) => supabase.from('saldo_estoque').select('insumo_id,loja_id,quantidade,custo_medio').eq('tenant_id', tenantId).order('id').range(f, t)),
        fetchAll<Ficha>((f, t) => supabase.from('fichas_tecnicas').select('id,nome,preco_venda,status').eq('tenant_id', tenantId).eq('status', 'ativa').order('id').range(f, t)),
        fetchAll<Vinc>((f, t) => supabase.from('insumo_fornecedores').select('id,insumo_id,qtd_por_embalagem,embalagem_descricao,codigo_fornecedor,fornecedor_id').eq('tenant_id', tenantId).order('id').range(f, t)),
        pendIds.length
          ? fetchAll<NfeItem>((f, t) => supabase.from('nfe_itens').select('id,descricao_nfe,nfe_id,codigo_item_fornecedor').eq('tenant_id', tenantId).is('vinculacao_id', null).in('nfe_id', pendIds).order('id').range(f, t))
          : Promise.resolve([] as NfeItem[]),
        fetchAll<Venda>((f, t) => supabase.from('vendas_produto_dia').select('produto_nome,qtd').eq('tenant_id', tenantId).is('ficha_id', null).gte('data', desdeVendas).order('loja_id').order('data').order('produto_id').range(f, t)).catch(() => [] as Venda[]),
        supabase.from('nfe_recebidas').select('numero,serie,nome_emitente,valor_total,created_at').eq('tenant_id', tenantId).eq('status', 'em_transito').then((r) => (r.data ?? []) as Nfe[], () => [] as Nfe[]),
        fetchAll<Forn>((f, t) => supabase.from('fornecedores').select('id,cnpj').eq('tenant_id', tenantId).order('id').range(f, t)),
        supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).then((r) => (r.data ?? []) as { id: string; nome: string }[], () => [] as { id: string; nome: string }[]),
      ])
      return { insumos, saldos, fichas, vinc, nfeItens, nfeRec, vendas, nfePresas, fornecedores, lojas: lojasR }
    },
  })

  // ── Saúde da NF-e: recebimento por loja (última nota, volume) — detecta loja que "parou" ──
  const { data: saude } = useQuery({
    queryKey: ['dv-saude', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString()
      const [lojasR, nfesR] = await Promise.all([
        supabase.from('lojas').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome'),
        fetchAll<{ loja_id?: string | null; created_at?: string }>((f, t) => supabase.from('nfe_recebidas').select('loja_id,created_at').eq('tenant_id', tenantId).gte('created_at', desde).order('id').range(f, t)),
      ])
      return { lojas: (lojasR.data ?? []) as { id: string; nome: string }[], nfes: nfesR }
    },
  })

  const saudeLojas = useMemo(() => {
    if (!saude) return [] as { nome: string; horas: number | null; hoje: number; d7: number; status: string }[]
    const agora = Date.now(), hojeStr = new Date().toLocaleDateString('en-CA'), seteDias = agora - 7 * 86400000
    const porLoja: Record<string, { ultima: number; hoje: number; d7: number }> = {}
    for (const n of saude.nfes) {
      const p = (porLoja[n.loja_id || 'sem'] ||= { ultima: 0, hoje: 0, d7: 0 })
      const t = n.created_at ? new Date(n.created_at).getTime() : 0
      if (t > p.ultima) p.ultima = t
      if (n.created_at && new Date(n.created_at).toLocaleDateString('en-CA') === hojeStr) p.hoje++
      if (t >= seteDias) p.d7++
    }
    return saude.lojas.map((l) => {
      const p = porLoja[l.id] || { ultima: 0, hoje: 0, d7: 0 }
      const horas = p.ultima ? (agora - p.ultima) / 3600000 : null
      const status = horas == null ? 'cinza' : horas < 24 ? 'ok' : horas < 48 ? 'warn' : 'bad'
      return { nome: l.nome, horas, hoje: p.hoje, d7: p.d7, status }
    })
  }, [saude])

  const checks = useMemo<Check[]>(() => {
    if (!data) return []
    const { insumos, saldos, fichas, vinc, nfeItens, nfeRec, vendas, nfePresas, fornecedores, lojas } = data
    const insMap: Record<string, string> = {}; insumos.forEach((i) => { insMap[i.id] = i.nome })
    const recMap: Record<string, Nfe> = {}; nfeRec.forEach((n) => { recMap[n.id] = n })
    const lojaMap: Record<string, string> = {}; lojas.forEach((l) => { lojaMap[l.id] = l.nome })
    const comLoja = (lid?: string | null) => lid ? (lojaMap[lid] || 'loja') : 'geral'
    // resolução por CNPJ+código (igual ao Monitor NF-e): um item com vinculacao_id nulo pode
    // JÁ estar coberto por um vínculo do fornecedor (mesmo CNPJ + mesmo código) → não é divergência.
    // Mapa/Set pré-montados: antes era O(itens × vínculos) por chamada (lento) → agora O(1).
    const dig = (s?: string) => (s || '').replace(/\D/g, '')
    const fornByCnpj = new Map(fornecedores.map((fo) => [dig(fo.cnpj), fo]))
    const vincSet = new Set(vinc.map((v) => v.fornecedor_id + '|' + (v.codigo_fornecedor || '')))
    const resolvido = (it: NfeItem) => {
      const n = recMap[it.nfe_id || '']; const forn = n ? fornByCnpj.get(dig(n.cnpj_emitente)) : null
      if (!forn || !it.codigo_item_fornecedor) return false
      return vincSet.has(forn.id + '|' + it.codigo_item_fornecedor)
    }
    const c: Check[] = []
    c.push({ key: 'nfe', titulo: 'Itens de NF-e sem vínculo', sev: 4, destino: ['fiscal/monitor', 'Monitor NF-e'], cols: ['NF-e', 'Produto da nota'], rows: nfeItens.filter((it) => { const n = recMap[it.nfe_id || '']; return n && n.status !== 'processada' && !resolvido(it) }).map((it) => ({ a: recMap[it.nfe_id || '']?.numero || '—', b: it.descricao_nfe || '—' })) })
    c.push({ key: 'custo', titulo: 'Saldo com custo médio zerado', sev: 2, destino: ['ajustes/custo', 'Ajuste de Custo Médio'], cols: ['Insumo', 'Saldo · Loja'], rows: saldos.filter((s) => (+(s.quantidade || 0) > 0) && !(+(s.custo_medio || 0) > 0)).map((s) => ({ a: insMap[s.insumo_id] || '—', b: num(s.quantidade) + ' · ' + comLoja(s.loja_id) })) })
    c.push({ key: 'neg', titulo: 'Estoque negativo', sev: 1, destino: ['ajustes/estoque', 'Ajuste de Estoque'], cols: ['Insumo', 'Saldo · Loja'], rows: saldos.filter((s) => +(s.quantidade || 0) < 0).map((s) => ({ a: insMap[s.insumo_id] || '—', b: num(s.quantidade) + ' · ' + comLoja(s.loja_id) })) })
    const vMap: Record<string, number> = {}; vendas.forEach((v) => { vMap[v.produto_nome || '—'] = (vMap[v.produto_nome || '—'] || 0) + (+(v.qtd || 0)) })
    c.push({ key: 'venda', titulo: 'Produtos vendidos sem ficha técnica', sev: 7, destino: ['fichas', 'Fichas Técnicas'], cols: ['Produto', 'Qtd vendida'], rows: Object.entries(vMap).map(([n, q]) => ({ a: n, b: num(q) })) })
    c.push({ key: 'ficha', titulo: 'Fichas ativas sem preço de venda', sev: 6, destino: ['fichas', 'Fichas Técnicas'], cols: ['Ficha', 'Preço'], rows: fichas.filter((f) => f.status === 'ativa' && !(+(f.preco_venda || 0) > 0)).map((f) => ({ a: f.nome || '—', b: '—' })) })
    c.push({ key: 'conv', titulo: 'Vínculos sem conversão (qtd na embalagem)', sev: 3, destino: ['insumos', 'Insumos'], cols: ['Insumo', 'Embalagem'], rows: vinc.filter((v) => !(+(v.qtd_por_embalagem || 0) > 0)).map((v) => ({ a: insMap[v.insumo_id] || '—', b: v.embalagem_descricao || '—' })) })
    const LIM = 6, agora = Date.now()
    c.push({ key: 'transito', titulo: `NF-e presas há +${LIM}h (XML não baixou)`, sev: 5, destino: ['fiscal/monitor', 'Monitor NF-e'], cols: ['NF-e / Fornecedor', 'Parada há'], rows: nfePresas.filter((n) => n.created_at && (agora - new Date(n.created_at).getTime()) / 3600000 >= LIM).sort((a, b) => +new Date(a.created_at!) - +new Date(b.created_at!)).map((n) => { const h = Math.floor((agora - new Date(n.created_at!).getTime()) / 3600000); return { a: `${n.numero}/${n.serie} · ${n.nome_emitente || '—'}`, b: `há ${h}h · R$ ${(+(n.valor_total || 0)).toFixed(2)}` } }) })
    // ORDENA POR GRAVIDADE: quem tem pendência vem primeiro; entre eles, erro de dinheiro (sev menor) na frente.
    c.sort((a, b) => (a.rows.length ? 0 : 1) - (b.rows.length ? 0 : 1) || a.sev - b.sev)
    return c
  }, [data])

  useEffect(() => { setOpen(new Set(checks.filter((c) => c.rows.length).map((c) => c.key))) }, [checks])
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const abrirSec = (k: string) => { setOpen((s) => new Set(s).add(k)); setTimeout(() => document.getElementById('dv-sec-' + k)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }

  if (isLoading) return <div className="est-screen"><div className="empty">Carregando verificações…</div></div>

  return (
    <div className="est-screen">
      {saudeLojas.length > 0 && (
        <div className="dv-sec" style={{ marginBottom: 14 }}>
          <div className="dv-sec-h" style={{ cursor: 'default' }}>
            <span style={{ fontSize: 15 }}>📡</span> Saúde da NF-e — recebimento por loja
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead><tr><th>Loja</th><th>Última nota</th><th style={{ textAlign: 'right' }}>Hoje</th><th style={{ textAlign: 'right' }}>7 dias</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
              <tbody>
                {saudeLojas.map((s, i) => (
                  <tr key={i}>
                    <td>{s.nome}</td>
                    <td style={{ fontWeight: 600, color: s.status === 'bad' ? '#dc2626' : s.status === 'warn' ? '#d97706' : s.status === 'cinza' ? '#94a3b8' : '#475569' }}>{fmtHa(s.horas)}</td>
                    <td style={{ textAlign: 'right' }}>{s.hoje}</td>
                    <td style={{ textAlign: 'right' }}>{s.d7}</td>
                    <td style={{ textAlign: 'center', fontSize: 15 }}>{s.status === 'ok' ? '🟢' : s.status === 'warn' ? '🟡' : s.status === 'bad' ? '🔴' : '⚪'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '7px 12px', fontSize: 11, color: '#94a3b8' }}>🟢 recebeu &lt;24h · 🟡 24–48h · 🔴 +48h sem nota · ⚪ nenhuma nota em 30 dias. Fins de semana são naturalmente mais quietos.</div>
        </div>
      )}
      <div className="dv-kpis">
        {checks.map((c) => <div key={c.key} className={'dv-kpi ' + (c.rows.length ? 'warn' : 'ok')} onClick={() => abrirSec(c.key)}><div className="l">{c.titulo}</div><div className="v">{c.rows.length}</div><div className="st">{c.rows.length ? ('pendência' + (c.rows.length > 1 ? 's' : '')) : 'tudo ok'}</div></div>)}
      </div>
      {checks.map((c) => (
        <div key={c.key} className="dv-sec" id={'dv-sec-' + c.key}>
          <div className="dv-sec-h" onClick={() => toggle(c.key)}>
            <span style={{ fontSize: 15 }}>{c.rows.length ? '⚠️' : '✅'}</span>{c.titulo}
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {c.rows.length > 0 && <button className="dv-exp" onClick={(e) => { e.stopPropagation(); downloadCsv(`divergencias_${c.key}.csv`, [[c.cols[0], c.cols[1]], ...c.rows.map((r) => [r.a, r.b])]) }}>⬇ CSV</button>}
              <span style={{ fontWeight: 700, color: c.rows.length ? '#dc2626' : '#16a34a' }}>{c.rows.length}</span>
            </span>
          </div>
          {open.has(c.key) && <div style={{ borderTop: '1px solid #f1f5f9' }}>
            {c.rows.length
              ? <>
                  <div className="tbl-scroll" style={{ maxHeight: 320 }}><table className="tbl"><thead><tr><th>{c.cols[0]}</th><th>{c.cols[1]}</th></tr></thead><tbody>{c.rows.map((r, i) => <tr key={i} className={c.destino ? 'dv-clic' : ''} onClick={() => c.destino && irResolver(c.destino[0], c.destino[1])} title={c.destino ? `Ir para ${c.destino[1]} para resolver` : undefined}><td>{r.a}</td><td>{r.b}</td></tr>)}</tbody></table></div>
                  {c.destino && <div style={{ padding: '7px 14px', fontSize: 11, color: '#94a3b8' }}>💡 Clique numa linha para resolver em <b style={{ color: '#64748b' }}>{c.destino[1]}</b>.</div>}
                </>
              : <div className="dv-empty-ok">✓ Nenhuma divergência aqui</div>}
          </div>}
        </div>
      ))}
    </div>
  )
}
