import { test, expect } from '@playwright/test'

// DEGRAU 2 do e2e: fluxo COM login (entra no sistema e cai na Visão geral). É a porta de entrada
// pros testes de fluxo (NF-e→estoque→custo, permissões etc.), que só fazem sentido logado.
//
// SÓ roda quando houver credenciais de um USUÁRIO DE TESTE (tenant 0001 = Ambiente de Testes,
// NUNCA um cliente real) nas variáveis de ambiente E2E_EMAIL / E2E_SENHA — no app/.env.local
// (local, gitignored) ou em GitHub Secrets (CI). Sem elas, o teste é PULADO (não quebra nada).
//
// ATENÇÃO: também exige VITE_SUPA_KEY = chave publishable REAL do projeto (a chave placeholder
// do smoke test não conecta no banco, então o login falharia).

const EMAIL = process.env.E2E_EMAIL
const SENHA = process.env.E2E_SENHA

test.describe('login (degrau 2)', () => {
  test.skip(!EMAIL || !SENHA, 'defina E2E_EMAIL e E2E_SENHA (usuário de teste do tenant 0001) para rodar')

  test('entra com o usuário de teste e cai na Visão geral', async ({ page }) => {
    await page.goto('/')

    await page.locator('input[type="email"]').fill(EMAIL!)
    await page.locator('input[type="password"]').fill(SENHA!)
    await page.getByRole('button', { name: 'Entrar' }).click()

    // saiu da tela de login…
    await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeHidden()
    // …e chegou no sistema (a barra de topo do workspace só existe logado)
    await expect(page.locator('.topbar')).toBeVisible()
  })
})
