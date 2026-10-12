import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { custoMedioNaData, type Mov } from '../src/lib/cost'
import { temCredenciais, E2E_EMAIL, E2E_SENHA } from './helpers'

// PARIDADE custo BANCO × NAVEGADOR (teste de INTEGRAÇÃO, não de UI): conecta no Supabase como o
// robô (tenant 0001) e confere que o custo médio da função do banco (RPC custo_medio_ate) BATE com
// o do navegador (lib/cost.ts → custoMedioNaData), pro mesmo insumo/loja. É a "paridade" que
// sofremos pra acertar no C2 — aqui ela fica travada: se alguém mexer no cálculo ou na RPC e eles
// divergirem, o teste quebra. Comparo POR LOJA (stream único) e com data futura (pega tudo → sem
// ruído de corte por fuso). Pulado sem credenciais/URL/chave.

const URL = process.env.VITE_SUPA_URL
const KEY = process.env.VITE_SUPA_KEY
const TENANT = '00000000-0000-0000-0000-000000000001' // Ambiente de Testes
const ATE = '2099-12-31'                              // data futura → inclui todo o histórico
const TOL = 0.01                                      // 1 centavo de tolerância (ponto flutuante)

type EntRow = { insumo_id: string; loja_id?: string | null; quantidade?: number; custo_unitario?: number; criado_em?: string }
type SaiRow = { insumo_id: string; loja_id?: string | null; quantidade?: number; criado_em?: string }

test.describe('paridade custo banco × navegador', () => {
  test.skip(!temCredenciais || !URL || !KEY, 'precisa de E2E_EMAIL/E2E_SENHA + VITE_SUPA_URL/KEY')

  test('custo_medio_ate (banco) == custoMedioNaData (navegador) por loja', async () => {
    const sb = createClient(URL!, KEY!)
    const { error: errAuth } = await sb.auth.signInWithPassword({ email: E2E_EMAIL!, password: E2E_SENHA! })
    expect(errAuth, `login falhou: ${errAuth?.message}`).toBeFalsy()

    // movimentos do tenant inteiro (o RLS já restringe ao tenant do robô = 0001)
    const { data: ents = [] } = await sb.from('entradas_estoque').select('insumo_id,loja_id,quantidade,custo_unitario,criado_em')
    const { data: sais = [] } = await sb.from('saidas_estoque').select('insumo_id,loja_id,quantidade,criado_em')
    const { data: lojas = [] } = await sb.from('lojas').select('id')

    const divergencias: string[] = []
    let comparados = 0

    for (const loja of lojas as { id: string }[]) {
      const { data: cm = [], error } = await sb.rpc('custo_medio_ate', { p_tenant: TENANT, p_ate: ATE, p_loja: loja.id })
      expect(error, `RPC falhou: ${error?.message}`).toBeFalsy()

      // contexto do navegador = só os movimentos daquela loja (mesmo recorte que o p_loja da RPC)
      const ctx = {
        entradas: (ents as EntRow[]).filter((e) => (e.loja_id || null) === loja.id) as Mov[],
        saidas: (sais as SaiRow[]).filter((s) => (s.loja_id || null) === loja.id) as Mov[],
      }

      for (const r of cm as { insumo_id: string; custo_medio: number }[]) {
        const banco = Number(r.custo_medio) || 0
        if (banco <= 0) continue                                   // sem custo → nada a comparar
        const nav = custoMedioNaData(r.insumo_id, ATE, ctx).custo
        comparados++
        if (Math.abs(banco - nav) > TOL) {
          divergencias.push(`loja ${loja.id.slice(0, 8)} · insumo ${r.insumo_id.slice(0, 8)}: banco=${banco.toFixed(4)} nav=${nav.toFixed(4)}`)
        }
      }
    }

    // não pode passar "de graça": tem que ter comparado algo de verdade
    expect(comparados, 'nenhum insumo com custo para comparar (ambiente de testes vazio?)').toBeGreaterThan(0)
    expect(divergencias, `divergências banco×navegador:\n${divergencias.slice(0, 20).join('\n')}`).toEqual([])
  })
})
