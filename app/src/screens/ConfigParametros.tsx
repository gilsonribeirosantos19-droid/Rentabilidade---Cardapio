import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import './config.css'

// Configurações › Parâmetros — regras de negócio (tabela `parametros`: modulo, chave, valor=string).
// Parâmetros "Em breve" salvam mas não têm efeito ainda → ficam desabilitados com selo.

type PType = 'radio' | 'select' | 'input'
type Opt = { v: string; l: string }
type Field = { chave: string; label: string; type: PType; def: string; options?: Opt[]; hint?: string; min?: number; max?: number; step?: number; embreve?: boolean }
type Modulo = { key: string; label: string; desc: string; search: string; embreve?: boolean; fields: Field[] }

const SIMNAO: Opt[] = [{ v: 'sim', l: 'Sim' }, { v: 'nao', l: 'Não' }]

const MODULOS: Modulo[] = [
  {
    key: 'estoque', label: 'Estoque', desc: 'Regras de controle e movimentação de estoque.', search: 'estoque',
    fields: [
      { chave: 'permitir_negativo', label: 'Permitir estoque negativo', type: 'radio', def: 'nao' },
      { chave: 'data_movimentacao', label: 'Data de movimentação do estoque (entrada de NF-e)', type: 'select', def: 'emissao', options: [{ v: 'emissao', l: 'Data de emissão da nota' }, { v: 'processamento', l: 'Data de processamento (lançamento)' }, { v: 'manual', l: 'Manual (informar ao processar)' }], hint: 'Em que data a entrada afeta o estoque/CMV.' },
      { chave: 'controla_validade', label: 'Controla validade', type: 'radio', def: 'nao', embreve: true },
      { chave: 'obrigar_lote', label: 'Obrigar lote', type: 'radio', def: 'nao' },
      { chave: 'dias_alerta_validade', label: 'Dias para alerta de validade', type: 'input', def: '7', min: 1, max: 365, embreve: true },
      { chave: 'alerta_min_pct', label: 'Alerta de estoque mínimo (%)', type: 'input', def: '20', min: 0, max: 100, hint: 'Alertar quando o estoque atingir X% do mínimo definido.', embreve: true },
    ],
  },
  {
    key: 'pcp', label: 'PCP', desc: 'Regras da produção e da produção sugerida.', search: 'pcp producao', embreve: true,
    fields: [
      { chave: 'media_dias', label: 'Média para produção sugerida', type: 'select', def: '7', options: [{ v: '7', l: 'Últimos 7 dias' }, { v: '15', l: 'Últimos 15 dias' }, { v: '30', l: 'Últimos 30 dias' }], embreve: true },
      { chave: 'considerar_dia_sem', label: 'Considerar mesmo dia da semana', type: 'radio', def: 'nao', embreve: true },
      { chave: 'considerar_sobra', label: 'Considerar sobra anterior', type: 'radio', def: 'sim', embreve: true },
      { chave: 'margem_seguranca', label: 'Margem de segurança padrão (%)', type: 'input', def: '10', min: 0, max: 100, embreve: true },
      { chave: 'separar_loja', label: 'Separar cálculo por loja', type: 'radio', def: 'sim', embreve: true },
      { chave: 'separar_turno', label: 'Separar cálculo por turno', type: 'radio', def: 'nao', embreve: true },
    ],
  },
  {
    key: 'producao', label: 'Produção', desc: 'Regras dos lançamentos de produção do dia.', search: 'producao lancamentos',
    fields: [
      { chave: 'obrigar_responsavel', label: 'Obrigar responsável', type: 'radio', def: 'nao' },
      { chave: 'obrigar_turno', label: 'Obrigar turno', type: 'radio', def: 'nao' },
      { chave: 'obrigar_obs_ajuste', label: 'Obrigar observação em ajuste', type: 'radio', def: 'nao' },
      { chave: 'permitir_edicao', label: 'Permitir edição após fechamento', type: 'radio', def: 'nao', embreve: true },
      { chave: 'permitir_sem_ficha', label: 'Permitir produção sem ficha técnica', type: 'radio', def: 'sim', embreve: true },
    ],
  },
  {
    key: 'porcionamento', label: 'Porcionamento', desc: 'Regras do controle de rendimento e perdas.', search: 'porcionamento rendimento perdas', embreve: true,
    fields: [
      { chave: 'obrigar_lote', label: 'Obrigar lote', type: 'radio', def: 'nao', embreve: true },
      { chave: 'obrigar_fornecedor', label: 'Obrigar fornecedor', type: 'radio', def: 'nao', embreve: true },
      { chave: 'obrigar_responsavel', label: 'Obrigar responsável', type: 'radio', def: 'nao', embreve: true },
      { chave: 'rendimento_minimo', label: 'Rendimento mínimo padrão (%)', type: 'input', def: '70', min: 0, max: 100, embreve: true },
      { chave: 'alertar_perda_alta', label: 'Alertar quando perda alta', type: 'radio', def: 'sim', embreve: true },
      { chave: 'pct_max_perda', label: 'Percentual máximo de perda permitido (%)', type: 'input', def: '40', min: 0, max: 100, embreve: true },
    ],
  },
  {
    key: 'compras', label: 'Compras', desc: 'Regras do processo de compras e aprovações.', search: 'compras pedidos aprovacao',
    fields: [
      { chave: 'exigir_aprovacao', label: 'Exigir aprovação de pedido', type: 'radio', def: 'nao' },
      { chave: 'aprovar_acima_valor', label: 'Exigir aprovação p/ pedidos acima de (R$)', type: 'input', def: '0', min: 0, hint: '0 = nunca exige por valor. Ex.: 2000 = pedidos acima de R$ 2.000 precisam de aprovação (alçada).', embreve: true },
      { chave: 'permitir_sem_fornecedor', label: 'Permitir pedido sem fornecedor', type: 'radio', def: 'sim' },
      { chave: 'usar_forn_principal', label: 'Usar fornecedor principal automaticamente', type: 'radio', def: 'sim', embreve: true },
      { chave: 'considerar_menor_preco', label: 'Considerar menor preço na sugestão', type: 'radio', def: 'sim', embreve: true },
      { chave: 'cobertura_padrao_dias', label: 'Cobertura desejada padrão (dias)', type: 'input', def: '7', min: 1, max: 90, hint: 'Quantos dias de estoque a Sugestão de Compra tenta cobrir.', embreve: true },
      { chave: 'lead_time_padrao', label: 'Prazo de entrega padrão (dias)', type: 'input', def: '2', min: 0, max: 60, hint: 'Dias que o fornecedor leva pra entregar — usado no ponto de pedido.', embreve: true },
      { chave: 'arredondar_embalagem', label: 'Arredondar sugestão pela embalagem de compra', type: 'radio', def: 'sim', embreve: true },
    ],
  },
  {
    key: 'ficha', label: 'Ficha Técnica', desc: 'Regras de cálculo e composição das fichas.', search: 'ficha tecnica custo calculo', embreve: true,
    fields: [
      { chave: 'considerar_rendimento', label: 'Considerar rendimento do insumo', type: 'radio', def: 'sim', embreve: true },
      { chave: 'base_custo', label: 'Base de custo usada', type: 'select', def: 'medio', options: [{ v: 'medio', l: 'Custo Médio' }, { v: 'atual', l: 'Custo Atual' }], embreve: true },
      { chave: 'arredondamento', label: 'Arredondamento (casas decimais)', type: 'select', def: '2', options: [{ v: '2', l: '2 casas' }, { v: '3', l: '3 casas' }, { v: '4', l: '4 casas' }], embreve: true },
    ],
  },
  {
    key: 'cmv', label: 'CMV', desc: 'Regras de cálculo do CMV teórico e real.', search: 'cmv custo mercadoria', embreve: true,
    fields: [
      { chave: 'meta_pct', label: 'Meta padrão de CMV (%)', type: 'input', def: '30', min: 0, max: 100, embreve: true },
      { chave: 'considerar_perdas', label: 'Considerar perdas no CMV', type: 'radio', def: 'sim', embreve: true },
      { chave: 'considerar_ajustes', label: 'Considerar ajustes de estoque', type: 'radio', def: 'sim', embreve: true },
      { chave: 'considerar_producao', label: 'Considerar produção no CMV', type: 'radio', def: 'nao', embreve: true },
    ],
  },
  {
    key: 'precificacao', label: 'Precificação (Margem Real)', desc: 'Taxas que saem da venda — pra calcular a margem de verdade.', search: 'precificacao margem real delivery ifood rappi cartao imposto taxa lucro',
    fields: [
      { chave: 'taxa_delivery', label: 'Taxa delivery próprio / padrão (%)', type: 'input', def: '27', min: 0, max: 100, step: 0.1, hint: 'Comissão média do delivery quando não é iFood/Rappi.' },
      { chave: 'taxa_ifood', label: 'Taxa iFood (%)', type: 'input', def: '27', min: 0, max: 100, step: 0.1, hint: 'Comissão do iFood sobre a venda.', embreve: true },
      { chave: 'taxa_rappi', label: 'Taxa Rappi (%)', type: 'input', def: '25', min: 0, max: 100, step: 0.1, hint: 'Comissão do Rappi sobre a venda.', embreve: true },
      { chave: 'taxa_cartao', label: 'Taxa de cartão (%)', type: 'input', def: '3', min: 0, max: 100, step: 0.1, hint: 'Taxa da maquininha (vendas no salão).' },
      { chave: 'taxa_servico', label: 'Taxa de serviço / garçom (%)', type: 'input', def: '10', min: 0, max: 100, step: 0.1, hint: 'Os 10% do garçom — se aplicável ao seu cálculo.', embreve: true },
      { chave: 'imposto', label: 'Imposto sobre venda (%)', type: 'input', def: '6', min: 0, max: 100, step: 0.1, hint: 'Simples Nacional / imposto sobre faturamento.' },
      { chave: 'margem_minima', label: 'Margem mínima alvo (%)', type: 'input', def: '20', min: 0, max: 100, step: 0.1, hint: 'Abaixo disso, o prato acende alerta vermelho.' },
    ],
  },
  {
    key: 'dashboard', label: 'Dashboard', desc: 'Regras de exibição e atualização do dashboard.', search: 'dashboard indicadores', embreve: true,
    fields: [
      { chave: 'atualizacao_auto', label: 'Atualização automática', type: 'radio', def: 'sim', embreve: true },
      { chave: 'intervalo', label: 'Intervalo de atualização (minutos)', type: 'select', def: '5', options: [{ v: '5', l: '5 minutos' }, { v: '10', l: '10 minutos' }, { v: '15', l: '15 minutos' }, { v: '30', l: '30 minutos' }], embreve: true },
      { chave: 'periodo_padrao', label: 'Período padrão', type: 'select', def: 'hoje', options: [{ v: 'hoje', l: 'Hoje' }, { v: '7', l: 'Últimos 7 dias' }, { v: '30', l: 'Últimos 30 dias' }, { v: 'mes', l: 'Mês atual' }], embreve: true },
      { chave: 'exibir_valores', label: 'Exibir valores financeiros', type: 'radio', def: 'sim', embreve: true },
    ],
  },
]

const DEFAULTS: Record<string, string> = {}
MODULOS.forEach((m) => m.fields.forEach((f) => { DEFAULTS[`${m.key}.${f.chave}`] = f.def }))

export function ConfigParametros() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set(['estoque']))
  const [val, setVal] = useState<Record<string, string>>({ ...DEFAULTS })
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const showToast = (msg: string, err = false) => { setToast({ msg, err }); window.setTimeout(() => setToast(null), err ? 7000 : 2600) }

  const { data: params } = useQuery({
    queryKey: ['cfg-params', tenantId], enabled: !!tenantId,
    queryFn: async () => { const { data } = await supabase.from('parametros').select('modulo,chave,valor').eq('tenant_id', tenantId); return (data ?? []) as { modulo: string; chave: string; valor: string }[] },
  })
  useEffect(() => {
    if (!params) return
    const next = { ...DEFAULTS }
    params.forEach((p) => { const k = `${p.modulo}.${p.chave}`; if (k in next && p.valor != null) next[k] = String(p.valor) })
    setVal(next)
  }, [params])

  const setField = (mod: string, chave: string, v: string) => setVal((p) => ({ ...p, [`${mod}.${chave}`]: v }))
  const toggleOpen = (k: string) => setOpen((p) => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s })

  const salvarMut = useMutation({
    mutationFn: async (mod: Modulo) => {
      const rows = mod.fields.map((f) => ({ tenant_id: tenantId, modulo: mod.key, chave: f.chave, valor: String(val[`${mod.key}.${f.chave}`] ?? f.def) }))
      const { error } = await supabase.from('parametros').upsert(rows, { onConflict: 'tenant_id,modulo,chave' })
      if (error) throw error
    },
    onSuccess: (_d, mod) => { qc.invalidateQueries({ queryKey: ['cfg-params'] }); showToast(`Parâmetros de ${mod.label} salvos.`) },
    onError: (e: Error) => { console.error('[ConfigParametros]', e); showToast('Erro ao salvar: ' + e.message, true) },
  })

  const modsFiltrados = useMemo(() => { const q = busca.trim().toLowerCase(); return q ? MODULOS.filter((m) => (m.label + ' ' + m.search).toLowerCase().includes(q)) : MODULOS }, [busca])

  return (
    <div className="cfg-screen">
      <div className="cfg-top">
        <input className="cfg-search" placeholder="Buscar parâmetro..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="cfg-grid">
        {modsFiltrados.map((m) => {
          const aberto = open.has(m.key)
          return (
            <div className="cfg-card" key={m.key}>
              <div className={'ch' + (aberto ? ' open' : '')} onClick={() => toggleOpen(m.key)}>
                <span className="car">▶</span>
                <span className="ti">{m.label}{m.embreve && <span className="embreve-badge">Em breve</span>}</span>
                <span className="cnt muted" style={{ fontWeight: 400 }}>{m.desc}</span>
              </div>
              {aberto && (
                <div className="p-body">
                  <div className="p-grid">
                    {m.fields.map((f) => {
                      const key = `${m.key}.${f.chave}`
                      const dis = !!f.embreve
                      return (
                        <div className={'p-item' + (dis ? ' embreve' : '')} key={f.chave}>
                          <div className="p-label">{f.label}{dis && <span className="embreve-badge">Em breve</span>}</div>
                          {f.type === 'radio' && (
                            <div className="p-toggle">
                              {SIMNAO.map((o) => <button key={o.v} className={val[key] === o.v ? 'on' : ''} disabled={dis} onClick={() => setField(m.key, f.chave, o.v)}>{o.l}</button>)}
                            </div>
                          )}
                          {f.type === 'select' && (
                            <select className="p-select" disabled={dis} value={val[key] ?? f.def} onChange={(e) => setField(m.key, f.chave, e.target.value)}>
                              {f.options!.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                            </select>
                          )}
                          {f.type === 'input' && (
                            <input className="p-input" type="number" min={f.min} max={f.max} step={f.step} disabled={dis} value={val[key] ?? f.def} onChange={(e) => setField(m.key, f.chave, e.target.value)} />
                          )}
                          {f.hint && <div className="p-hint">{f.hint}</div>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="p-footer">
                    <button className="cfg-btn pri" disabled={m.embreve || salvarMut.isPending} onClick={() => salvarMut.mutate(m)}>{salvarMut.isPending && salvarMut.variables?.key === m.key ? 'Salvando…' : 'Salvar alterações'}</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="info-card">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        <div><b>Importante:</b> os parâmetros definem o comportamento do sistema. Alterações podem impactar cálculos e processos em andamento. Os marcados <b>“Em breve”</b> ainda não têm efeito.</div>
      </div>

      {toast && <div className={'cfg-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
    </div>
  )
}
