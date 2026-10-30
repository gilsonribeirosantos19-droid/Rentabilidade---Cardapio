import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, fetchAll } from '../lib/db'
import { useAuth } from '../lib/auth'
import './etiquetas.css'

type Row = {
  id: string; nome_snap: string; loja_id?: string | null; modo: string
  validade_em: string; status: string; baixado_em?: string | null; created_at?: string
}

const HORA = 3600_000
const diaManaus = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : ''

export function EtiquetasDashboard({ lojaId }: { lojaId: string | null }) {
  const { tenantId } = useAuth()

  // só o necessário: TODAS as ativas (vencidas/vencendo) + as emitidas nos últimos 30 dias (gráfico/conformidade)
  const COLS = 'id,nome_snap,loja_id,modo,validade_em,status,baixado_em,created_at'
  const { data: ativasAll = [], isLoading: l1 } = useQuery({
    queryKey: ['etq-dash', 'ativas', tenantId, lojaId], enabled: !!tenantId,
    queryFn: () => fetchAll<Row>((f, t) => { let q = supabase.from('etiquetas').select(COLS).eq('tenant_id', tenantId).eq('status', 'ativa'); if (lojaId) q = q.eq('loja_id', lojaId); return q.order('created_at', { ascending: false }).order('id').range(f, t) }),
  })
  const { data: rows = [], isLoading: l2 } = useQuery({
    queryKey: ['etq-dash', 'recentes', tenantId, lojaId], enabled: !!tenantId,
    queryFn: () => { const desde = new Date(Date.now() - 30 * 24 * HORA).toISOString(); return fetchAll<Row>((f, t) => { let q = supabase.from('etiquetas').select(COLS).eq('tenant_id', tenantId).gte('created_at', desde); if (lojaId) q = q.eq('loja_id', lojaId); return q.order('created_at', { ascending: false }).order('id').range(f, t) }) },
  })
  const isLoading = l1 || l2

  const d = useMemo(() => {
    const now = Date.now()
    const ativas = ativasAll
    const vencidas = ativas.filter((r) => new Date(r.validade_em).getTime() < now)
    const vence24 = ativas.filter((r) => { const v = new Date(r.validade_em).getTime(); return v >= now && v < now + 24 * HORA })
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })
    const emitidasHoje = rows.filter((r) => diaManaus(r.created_at) === hoje).length

    // conformidade: baixadas dentro da validade + 2h de tolerância ÷ (finalizadas + vencidas ainda ativas)
    const finalizadas = rows.filter((r) => r.status === 'utilizada' || r.status === 'descartada')
    const conformes = finalizadas.filter((r) => r.baixado_em && new Date(r.baixado_em).getTime() <= new Date(r.validade_em).getTime() + 2 * HORA)
    const denom = finalizadas.length + vencidas.length
    const conformidade = denom ? Math.round((100 * conformes.length) / denom) : null

    // emitidas por dia (últimos 7 dias)
    const dias: { d: string; label: string; n: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(now - i * 24 * HORA)
      const key = dt.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' })
      dias.push({ d: key, label: dt.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit' }), n: 0 })
    }
    const byDia: Record<string, number> = {}
    rows.forEach((r) => { const k = diaManaus(r.created_at); byDia[k] = (byDia[k] || 0) + 1 })
    dias.forEach((x) => { x.n = byDia[x.d] || 0 })
    const maxDia = Math.max(1, ...dias.map((x) => x.n))

    // atenção agora: ativas vencidas/vencendo, ordenadas pela validade
    const atencao = ativas
      .filter((r) => new Date(r.validade_em).getTime() < now + 24 * HORA)
      .sort((a, b) => new Date(a.validade_em).getTime() - new Date(b.validade_em).getTime())
      .slice(0, 15)
      .map((r) => {
        const diff = new Date(r.validade_em).getTime() - now
        const venc = diff < 0
        const h = Math.round(Math.abs(diff) / HORA)
        return { nome: r.nome_snap, venc, txt: venc ? `venceu ${h}h atrás` : `vence em ${h}h` }
      })

    return { ativas: ativas.length, vencidas: vencidas.length, vence24: vence24.length, emitidasHoje, conformidade, dias, maxDia, atencao }
  }, [ativasAll, rows])

  return (
    <div className="etq-screen">
      <div className="etq-head">
        <h1>Dashboard</h1>
        <span className="sub">Visão das etiquetas{lojaId ? ' da loja selecionada' : ' (todas as lojas)'}</span>
      </div>

      {isLoading ? <div className="etq-empty">Carregando…</div> : <>
        <div className="etq-kpis">
          <div className="etq-kpi red"><span className="lab">Vencidas sem baixa</span><span className="num">{d.vencidas}</span><span className="foot">tirar de circulação</span></div>
          <div className="etq-kpi amber"><span className="lab">Vencem em 24h</span><span className="num">{d.vence24}</span><span className="foot">atenção</span></div>
          <div className="etq-kpi"><span className="lab">Etiquetas ativas</span><span className="num">{d.ativas}</span><span className="foot">em uso</span></div>
          <div className="etq-kpi"><span className="lab">Emitidas hoje</span><span className="num">{d.emitidasHoje}</span><span className="foot">no dia</span></div>
          <div className="etq-kpi green"><span className="lab">Conformidade</span><span className="num">{d.conformidade == null ? '—' : d.conformidade + '%'}</span><span className="foot">baixa no prazo · 30 dias</span></div>
        </div>

        <div className="etq-panels">
          <div className="etq-panel">
            <h3>Etiquetas emitidas por dia</h3>
            <div className="etq-chart">
              {d.dias.map((x) => (
                <div className="etq-chbar" key={x.d}>
                  <span className="vv">{x.n}</span>
                  <div className="b" style={{ height: `${(x.n / d.maxDia) * 100}%` }} />
                  <span className="d">{x.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="etq-panel">
            <h3>Atenção agora</h3>
            {d.atencao.length === 0
              ? <div className="etq-empty" style={{ padding: 16 }}>Nada vencendo nas próximas 24h. 👍</div>
              : <div className="etq-att">
                {d.atencao.map((a, i) => (
                  <div className="etq-atti" key={i}>
                    <span className="pin" style={{ background: a.venc ? '#e11d48' : '#d97706' }} />
                    <span className="nm">{a.nome}</span>
                    <span className="wh">{a.txt}</span>
                  </div>
                ))}
              </div>}
          </div>
        </div>
        <div className="etq-hint" style={{ marginTop: 12 }}>Indicadores de perda/descarte não entram no painel (decisão do time).</div>
      </>}
    </div>
  )
}
