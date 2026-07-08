import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import { Romaneio } from './Romaneio'
import './fiscal.css'
import './distribuicao.css'

// Distribuição › Romaneios — histórico dos romaneios (requisições já enviadas pelo CD),
// com reimpressão. Reusa o componente Romaneio (mesmo doc da Central).

type Req = { id: string; numero?: number; loja_id?: string; cd_loja_id?: string; status?: string; valor_total?: number; created_at?: string; enviado_em?: string; requisicao_itens?: { count: number }[] }
type Item = { id: string; insumo_id: string; qtd_atendida?: number; unidade?: string }
type Insumo = { id: string; nome?: string; unidade_medida?: string }
type Loja = { id: string; nome?: string; cnpj?: string }

const brl = (v?: number | null) => (v == null) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
const reqNo = (n?: number) => 'REQ-' + String(n ?? 0).padStart(6, '0')

export function DistribuicaoRomaneios() {
  const { tenantId } = useAuth()
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Req | null>(null)

  const { data: reqs = [], isLoading } = useQuery({ queryKey: ['rom-reqs', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Req>((f, t) => supabase.from('requisicoes').select('*, requisicao_itens(count)').eq('tenant_id', tenantId).in('status', ['a_caminho', 'recebida']).order('enviado_em', { ascending: false }).range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['rom-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome,cnpj').eq('tenant_id', tenantId); return (data ?? []) as Loja[] } })
  const { data: insumos = [] } = useQuery({ queryKey: ['rom-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,unidade_medida').eq('tenant_id', tenantId).range(f, t)) })
  const { data: itens = [] } = useQuery({ queryKey: ['rom-itens', sel?.id], enabled: !!sel?.id, queryFn: async () => { const { data } = await supabase.from('requisicao_itens').select('id,insumo_id,qtd_atendida,unidade').eq('requisicao_id', sel!.id).order('id'); return (data ?? []) as Item[] } })

  const lojaMap = useMemo(() => Object.fromEntries(lojas.map((l) => [l.id, l])) as Record<string, Loja>, [lojas])
  const insMap = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])) as Record<string, Insumo>, [insumos])

  const lista = useMemo(() => {
    const b = busca.toLowerCase().trim()
    return reqs.filter((r) => !b || reqNo(r.numero).toLowerCase().includes(b) || (lojaMap[r.loja_id || '']?.nome || '').toLowerCase().includes(b))
  }, [reqs, busca, lojaMap])

  return (
    <div className="fiscal-screen">
      <div className="mon-top">
        <div><div className="fh-title">Romaneios</div><div className="fh-sub">Histórico de romaneios de separação/entrega — clique para reimprimir</div></div>
      </div>

      <div className="f1">
        <div className="ds-field"><label>Buscar</label><input className="field" style={{ minWidth: 240 }} placeholder="Nº da requisição ou filial…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      </div>

      <div className="tbl-wrap" style={{ marginTop: 4 }}><div className="tbl-scroll">
        <table className="tbl">
          <thead><tr><th style={{ width: 90 }}>Nº</th><th>Filial destino</th><th className="c">Enviado em</th><th className="r">Itens</th><th className="r">Valor</th><th>Situação</th><th className="c" style={{ width: 130 }}>Romaneio</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="empty">Carregando…</td></tr>
              : lista.length === 0 ? <tr><td colSpan={7} className="empty">Nenhum romaneio ainda. Eles aparecem aqui quando o CD confirma um envio.</td></tr>
                : lista.map((r) => { const n = r.requisicao_itens?.[0]?.count ?? 0; return (
                  <tr key={r.id}>
                    <td className="mono">{reqNo(r.numero)}</td>
                    <td style={{ fontWeight: 600 }}>{lojaMap[r.loja_id || '']?.nome || '—'}</td>
                    <td className="c" style={{ color: '#64748b' }}>{fmtD(r.enviado_em || r.created_at)}</td>
                    <td className="r mono">{n}</td>
                    <td className="r mono">{brl(r.valor_total)}</td>
                    <td><span className={'dist-chip ' + (r.status === 'recebida' ? 'd-rec' : 'd-env')}>{r.status === 'recebida' ? 'Recebida' : 'Em trânsito'}</span></td>
                    <td className="c"><button className="btn-g" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => setSel(r)}>🖨 Ver</button></td>
                  </tr>
                ) })}
          </tbody>
        </table>
      </div></div>

      {sel && <Romaneio
        numeroLabel={reqNo(sel.numero)}
        dataLabel={fmtD(sel.enviado_em || sel.created_at)}
        cd={lojaMap[sel.cd_loja_id || '']} filial={lojaMap[sel.loja_id || '']}
        linhas={itens.filter((it) => (it.qtd_atendida ?? 0) > 0).map((it) => ({ nome: insMap[it.insumo_id]?.nome || '—', unidade: it.unidade || insMap[it.insumo_id]?.unidade_medida, qtd: it.qtd_atendida ?? 0 }))}
        onClose={() => setSel(null)}
      />}
    </div>
  )
}
