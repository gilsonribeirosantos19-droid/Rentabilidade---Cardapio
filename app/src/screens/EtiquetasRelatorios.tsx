import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import './etiquetas.css'

type Row = {
  id: string; codigo: string; nome_snap: string; grupo_snap?: string | null; modo: string; loja_id?: string | null
  manipulacao_em: string; validade_em: string; status: string; baixado_em?: string | null
  responsavel_nome?: string | null; motivo_descarte?: string | null; created_at?: string
}

const MODO_LABEL: Record<string, string> = {
  resfriado: 'Refrigerado', congelado: 'Congelado', ambiente: 'Temp. Ambiente',
  quente: 'Quente', descongelado: 'Descongelado', aberto: 'Aberto',
}
const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const ymd = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Manaus' }) : ''
const hojeYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' })
const diasAtras = (n: number) => new Date(Date.now() - n * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Manaus' })

function situacao(e: Row): string {
  if (e.status === 'utilizada') return 'Utilizada'
  if (e.status === 'descartada') return 'Descartada'
  if (e.status === 'cancelada') return 'Cancelada'
  return new Date(e.validade_em).getTime() < Date.now() ? 'Vencida' : 'Ativa'
}

export function EtiquetasRelatorios({ lojaId, lojas }: { lojaId: string | null; lojas: { id: string; nome?: string }[] }) {
  const { tenantId } = useAuth()
  const [de, setDe] = useState(diasAtras(30))
  const [ate, setAte] = useState(hojeYmd())
  const [aba, setAba] = useState<'resumo' | 'detalhado'>('resumo')

  // busca só o período/loja escolhidos (Manaus = UTC-4 fixo)
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['etq-rel', tenantId, de, ate, lojaId], enabled: !!tenantId && !!de && !!ate,
    queryFn: () => fetchAll<Row>((f, t) => {
      let q = supabase.from('etiquetas').select('id,codigo,nome_snap,grupo_snap,modo,loja_id,manipulacao_em,validade_em,status,baixado_em,responsavel_nome,motivo_descarte,created_at')
        .eq('tenant_id', tenantId).gte('created_at', `${de}T00:00:00-04:00`).lte('created_at', `${ate}T23:59:59.999-04:00`)
      if (lojaId) q = q.eq('loja_id', lojaId)
      return q.order('created_at', { ascending: false }).order('id').range(f, t)
    }),
  })
  const lojaNome = (id?: string | null) => lojas.find((l) => l.id === id)?.nome || '—'

  const rows = useMemo(() => lista.filter((r) => {
    const k = ymd(r.created_at)
    if (de && k < de) return false
    if (ate && k > ate) return false
    if (lojaId && r.loja_id !== lojaId) return false
    return true
  }), [lista, de, ate, lojaId])

  const resumo = useMemo(() => {
    const total = rows.length
    const utilizadas = rows.filter((r) => r.status === 'utilizada').length
    const descartadas = rows.filter((r) => r.status === 'descartada').length
    const vencidas = rows.filter((r) => r.status === 'ativa' && new Date(r.validade_em).getTime() < Date.now()).length
    const porGrupo: Record<string, number> = {}; rows.forEach((r) => { const g = r.grupo_snap || '—'; porGrupo[g] = (porGrupo[g] || 0) + 1 })
    const porResp: Record<string, number> = {}; rows.forEach((r) => { const g = r.responsavel_nome || '—'; porResp[g] = (porResp[g] || 0) + 1 })
    const ord = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])
    return { total, utilizadas, descartadas, vencidas, porGrupo: ord(porGrupo), porResp: ord(porResp) }
  }, [rows])

  function exportarCsv() {
    const head = ['Código', 'Produto', 'Grupo', 'Modo', 'Manipulação', 'Validade', 'Situação', 'Responsável', 'Loja']
    const body = rows.map((r) => [r.codigo, r.nome_snap, r.grupo_snap || '', MODO_LABEL[r.modo] || r.modo, fmtDT(r.manipulacao_em), fmtDT(r.validade_em), situacao(r), r.responsavel_nome || '', lojaNome(r.loja_id)])
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `etiquetas_${de}_a_${ate}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="etq-screen">
      <div className="etq-head">
        <h1>Relatórios</h1>
        <span className="sub">Emissões por período{lojaId ? ' · loja selecionada' : ' · todas as lojas'}</span>
      </div>

      <div className="etq-toolbar">
        <div className="etq-fg" style={{ minWidth: 0 }}><label style={{ fontSize: 11 }}>De</label><input type="date" className="etq-sel" style={{ minWidth: 150 }} value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="etq-fg" style={{ minWidth: 0 }}><label style={{ fontSize: 11 }}>Até</label><input type="date" className="etq-sel" style={{ minWidth: 150 }} value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div className="etq-seg" style={{ marginLeft: 'auto' }}>
          <button className={aba === 'resumo' ? 'on' : ''} onClick={() => setAba('resumo')}>Resumo</button>
          <button className={aba === 'detalhado' ? 'on' : ''} onClick={() => setAba('detalhado')}>Detalhado</button>
        </div>
        <button className="etq-btn" onClick={exportarCsv}>⬇ Exportar CSV</button>
      </div>

      {isLoading ? <div className="etq-empty">Carregando…</div>
        : aba === 'resumo' ? <>
          <div className="etq-kpis">
            <div className="etq-kpi"><span className="lab">Emitidas no período</span><span className="num">{resumo.total}</span></div>
            <div className="etq-kpi"><span className="lab">Utilizadas</span><span className="num">{resumo.utilizadas}</span></div>
            <div className="etq-kpi red"><span className="lab">Descartadas</span><span className="num">{resumo.descartadas}</span></div>
            <div className="etq-kpi amber"><span className="lab">Vencidas s/ baixa</span><span className="num">{resumo.vencidas}</span></div>
          </div>
          <div className="etq-panels">
            <div className="etq-panel">
              <h3>Por grupo</h3>
              <table className="etq-tbl"><tbody>
                {resumo.porGrupo.length === 0 ? <tr><td className="etq-empty">Sem dados</td></tr>
                  : resumo.porGrupo.map(([g, n]) => <tr key={g}><td>{g}</td><td className="r" style={{ fontWeight: 700 }}>{n}</td></tr>)}
              </tbody></table>
            </div>
            <div className="etq-panel">
              <h3>Por responsável</h3>
              <table className="etq-tbl"><tbody>
                {resumo.porResp.map(([g, n]) => <tr key={g}><td>{g}</td><td className="r" style={{ fontWeight: 700 }}>{n}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        </>
        : <div className="etq-card">
          <table className="etq-tbl">
            <thead><tr><th>Código</th><th>Produto</th><th>Grupo</th><th>Modo</th><th>Manipulação</th><th>Validade</th><th>Situação</th><th>Responsável</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={8} className="etq-empty">Nenhuma etiqueta no período.</td></tr>
                : rows.slice(0, 1000).map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: "'Roboto Condensed', monospace", fontWeight: 600 }}>{r.codigo}</td>
                    <td>{r.nome_snap}</td><td style={{ color: '#64748b' }}>{r.grupo_snap || '—'}</td>
                    <td style={{ color: '#64748b' }}>{MODO_LABEL[r.modo] || r.modo}</td>
                    <td style={{ color: '#64748b' }}>{fmtDT(r.manipulacao_em)}</td>
                    <td style={{ color: '#64748b' }}>{fmtDT(r.validade_em)}</td>
                    <td>{situacao(r)}</td><td style={{ color: '#64748b' }}>{r.responsavel_nome || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>}
      <div className="etq-hint" style={{ marginTop: 10 }}>{rows.length} etiqueta(s) no período.</div>
    </div>
  )
}
