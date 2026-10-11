import { test, expect } from '@playwright/test'
import { login, abrirTela, temCredenciais } from './helpers'

// NAVEGAÇÃO LOGADA (degrau 2): o robô entra e abre as telas principais, uma a uma, conferindo que
// NENHUMA quebra ao carregar (sem erro de JS) e que a tela realmente abriu (o breadcrumb mostra o
// nome dela). Pega o bug comum "tela dá erro ao abrir pra certos dados/perfis". Só leitura.
// Roda contra o tenant 0001 (Ambiente de Testes). Pulado sem credenciais.

// Uma amostra representativa cobrindo módulos variados, telas agrupadas e não-agrupadas, e uma
// tela cheia (Fiscal, que não tem breadcrumb). full=true → não checa breadcrumb, só "não quebrou".
const TELAS: { modulo: string; grupo?: string; tela: string; full?: boolean }[] = [
  { modulo: 'Estoque', grupo: 'Consultas', tela: 'Saldo de Estoque' },
  { modulo: 'Estoque', grupo: 'Lançamentos', tela: 'Entradas' },
  { modulo: 'Cadastros', tela: 'Insumos' },
  { modulo: 'Cadastros', tela: 'Fichas Técnicas' },
  { modulo: 'Compras', tela: 'Pedidos de Compra' },
  { modulo: 'Gestão', tela: 'CMV Teórico × Real' },
  { modulo: 'Gestão', grupo: 'DRE de Compras', tela: 'Demonstrativo' },
  { modulo: 'PDV', tela: 'Faturamento' },
  { modulo: 'Configurações', tela: 'Geral' },
  { modulo: 'Fiscal', tela: 'Monitor NF-e', full: true },
]

test.describe('navegação logada', () => {
  test.skip(!temCredenciais, 'defina E2E_EMAIL e E2E_SENHA para rodar')

  test('abre as telas principais sem quebrar', async ({ page }) => {
    const erros: string[] = []
    page.on('pageerror', (e) => erros.push(String(e)))

    await login(page)

    for (const t of TELAS) {
      await abrirTela(page, t.modulo, t.tela, t.grupo)
      if (t.full) {
        // tela cheia (Fiscal) não tem breadcrumb — basta ter renderizado algo e não ter quebrado
        await expect(page.locator('.main')).not.toBeEmpty()
      } else {
        await expect(page.locator('.topbar .crumb')).toContainText(t.tela, { timeout: 15_000 })
      }
    }

    expect(erros, `erros de JS ao navegar: ${erros.join(' | ')}`).toEqual([])
  })
})
