import { test, expect } from '@playwright/test'

// SMOKE TEST (degrau 1 do e2e): o app SOBE e a tela de login aparece, sem erro de JavaScript.
// É o teste que mais pega desastre: build passa, mas o site abre EM BRANCO pro cliente. Nem o
// vitest nem o tsc enxergam isso — só abrindo no navegador de verdade. Não faz login nem toca em dado.

test('o app carrega sem tela branca e sem erro de JS no console', async ({ page }) => {
  const errosJs: string[] = []
  page.on('pageerror', (e) => errosJs.push(String(e)))

  await page.goto('/')

  // #root não ficou vazio (o React montou algo)
  await expect(page.locator('#root')).not.toBeEmpty()

  // nenhum erro de JavaScript derrubou a página no boot
  expect(errosJs, `erros de JS no boot: ${errosJs.join(' | ')}`).toEqual([])
})

test('mostra a tela de login (cabeçalho, campo de e-mail e botão Entrar)', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})
