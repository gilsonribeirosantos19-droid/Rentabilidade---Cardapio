import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import './fiscal.css'
import './distribuicao.css'

// Distribuição › Nova Requisição — cria uma requisição de uma FILIAL ao CD direto no app
// (útil pro admin/compras, além do Portal do Gerente). Cai na mesma fila da Central.

type Insumo = { id: string; nome?: string; categoria?: string; codigo_interno?: number; unidade_medida?: string; unidade_compra?: string; preco_compra?: number }
type Saldo = { insumo_id: string; quantidade?: number }
type Loja = { id: string; nome?: string; is_cd?: boolean }

const num = (v?: string) => parseFloat((v || '0').replace(',', '.')) || 0
const fmtQ = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export function DistribuicaoNovaRequisicao() {
  const { tenantId, usuario } = useAuth()
  const qc = useQueryClient()
  const [filialId, setFilialId] = useState('')
  const [busca, setBusca] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3500) }

  const { data: insumos = [] } = useQuery({ queryKey: ['dnr-ins', tenantId], enabled: !!tenantId, queryFn: () => fetchAll<Insumo>((f, t) => supabase.from('insumos').select('id,nome,categoria,codigo_interno,unidade_medida,unidade_compra,preco_compra').eq('tenant_id', tenantId).eq('ativo', true).order('nome').range(f, t)) })
  const { data: lojas = [] } = useQuery({ queryKey: ['dnr-lojas', tenantId], enabled: !!tenantId, queryFn: async () => { const { data } = await supabase.from('lojas').select('id,nome,is_cd').eq('tenant_id', tenantId).order('nome'); return (data ?? []) as Loja[] } })
  const cdLoja = useMemo(() => lojas.find((l) => l.is_cd) || null, [lojas])
  const { data: saldosCd = [] } = useQuery({ queryKey: ['dnr-saldocd', cdLoja?.id], enabled: !!tenantId && !!cdLoja?.id, queryFn: async () => { const { data } = await supabase.from('saldo_estoque').select('insumo_id,quantidade').eq('tenant_id', tenantId).eq('loja_id', cdLoja!.id); return (data ?? []) as Saldo[] } })

  const cdSaldoMap = useMemo(() => Object.fromEntries(saldosCd.map((s) => [s.insumo_id, s.quantidade ?? 0])) as Record<string, number>, [saldosCd])
  const defUn = (i?: Insumo) => i?.unidade_medida || i?.unidade_compra || 'un'
  const filtrados = useMemo(() => { const b = norm(busca); return insumos.filter((i) => !b || norm(i.nome).includes(b) || norm(i.categoria).includes(b)).slice(0, 300) }, [insumos, busca])
  const selIds = Object.keys(qty).filter((id) => num(qty[id]) > 0)

  const enviar = async () => {
    if (!filialId) { showToast('Escolha a filial solicitante.', 'err'); return }
    if (!cdLoja) { showToast('Nenhum CD configurado.', 'err'); return }
    if (!selIds.length) { showToast('Informe a quantidade de ao menos um item.', 'err'); return }
    setBusy(true)
    try {
      const { data: req, error } = await supabase.from('requisicoes').insert({ tenant_id: tenantId, loja_id: filialId, cd_loja_id: cdLoja.id, status: 'enviada', origem: 'app', modo: 'transferencia', observacao: obs.trim() || null, solicitante_id: usuario?.id || null }).select('id').single()
      if (error) throw error
      const reqId = (req as { id: string }).id
      const rows = selIds.map((id) => { const ins = insumos.find((x) => x.id === id); return { requisicao_id: reqId, tenant_id: tenantId, insumo_id: id, qtd_pedida: num(qty[id]), unidade: defUn(ins), custo_unitario: ins?.preco_compra ?? null } })
      const { error: e2 } = await supabase.from('requisicao_itens').insert(rows); if (e2) throw e2
      qc.invalidateQueries({ queryKey: ['dist-reqs'] })
      setQty({}); setObs(''); showToast('Requisição enviada ao CD!')
    } catch (e: any) { showToast('Erro: ' + e.message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="fiscal-screen">
      <div className="mon-top">
        <div><div className="fh-title">Nova Requisição</div><div className="fh-sub">Crie uma requisição de uma filial ao CD{cdLoja ? ` (${cdLoja.nome})` : ''}</div></div>
      </div>

      {!cdLoja && <div className="tbl-wrap" style={{ marginTop: 12 }}><div className="empty">Nenhum Centro de Distribuição configurado. Marque a matriz como CD em Configurações › Geral › Lojas.</div></div>}

      {cdLoja && <>
        <div className="f1">
          <div className="ds-field"><label>Filial solicitante *</label>
            <select className="field" value={filialId} onChange={(e) => setFilialId(e.target.value)} style={{ minWidth: 190 }}>
              <option value="">Selecione a filial…</option>
              {lojas.filter((l) => !l.is_cd).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="ds-field"><label>Buscar item</label><input className="field" style={{ minWidth: 240 }} placeholder="Nome ou categoria…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div className="ds-field" style={{ flex: 1 }}><label>Observação</label><input className="field" style={{ width: '100%' }} placeholder="(opcional)" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>

        <div className="tbl-wrap" style={{ marginTop: 4 }}><div className="tbl-scroll" style={{ maxHeight: '52vh' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 64 }} className="r">Código</th><th>Item</th><th className="c">Un.</th><th className="r">Estoque no CD</th><th className="r" style={{ width: 120 }}>Qtd que peço</th></tr></thead>
            <tbody>
              {filtrados.map((i) => { const cd = cdSaldoMap[i.id] ?? 0; return (
                <tr key={i.id} style={{ background: num(qty[i.id]) > 0 ? '#f0fdfa' : undefined }}>
                  <td className="r mono" style={{ color: '#64748b', fontSize: 12 }}>{i.codigo_interno != null ? String(i.codigo_interno).padStart(6, '0') : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{i.nome}</td>
                  <td className="c" style={{ color: '#94a3b8' }}>{defUn(i)}</td>
                  <td className="r mono" style={{ color: cd > 0 ? '#0f766e' : '#dc2626' }}>{cd > 0 ? fmtQ(cd) : '— sem estoque'}</td>
                  <td className="r"><input value={qty[i.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} placeholder="0" style={{ width: 96, height: 28, border: '1px solid #cbd5e1', borderRadius: 5, textAlign: 'right', padding: '0 8px', fontFamily: 'DM Mono, monospace', fontSize: 12, background: '#fff' }} /></td>
                </tr>
              ) })}
              {!filtrados.length && <tr><td colSpan={5} className="empty">Nenhum item.</td></tr>}
            </tbody>
          </table>
        </div></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}><b>{selIds.length}</b> {selIds.length === 1 ? 'item' : 'itens'} selecionado(s)</span>
          <div style={{ marginLeft: 'auto' }} />
          <button className="btn-g" style={{ background: '#0d9488', color: '#fff', borderColor: '#0d9488' }} disabled={busy || !filialId || !selIds.length} onClick={enviar}>{busy ? 'Enviando…' : '📤 Enviar requisição ao CD'}</button>
        </div>
      </>}

      {toast && <div className={'toast ' + toast.tipo}>{toast.msg}</div>}
    </div>
  )
}
