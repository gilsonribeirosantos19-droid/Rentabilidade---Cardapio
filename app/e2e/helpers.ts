import { type Page, expect } from '@playwright/test'

// Credenciais do usuário de teste (tenant 0001). Vêm do .env.local (local) ou de Secrets (CI).
// .trim() defende contra espaço/enter invisível colado no valor do segredo (gotcha clássico de CI).
export const E2E_EMAIL = process.env.E2E_EMAIL?.trim()
export const E2E_SENHA = process.env.E2E_SENHA?.trim()
export const temCredenciais = !!E2E_EMAIL && !!E2E_SENHA

// Faz login e espera cair no sistema (a barra de topo só existe logado). Robusto p/ o CI (mais
// lento): espera até 30s pela .topbar OU detecta o banner de erro e falha com mensagem clara.
export async function login(page: Page) {
  await page.goto('/')
  await page.locator('input[type="email"]').fill(E2E_EMAIL!)
  await page.locator('input[type="password"]').fill(E2E_SENHA!)
  await page.getByRole('button', { name: 'Entrar' }).click()

  const topbar = page.locator('.topbar')
  const erroCred = page.getByText('inválid', { exact: false })   // "E-mail ou senha inválidos."
  await Promise.race([
    topbar.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {}),
    erroCred.waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {}),
  ])
  if (await erroCred.isVisible()) {
    throw new Error('Login REJEITADO pelo Supabase — confira os secrets E2E_EMAIL/E2E_SENHA (sem espaço/enter extra).')
  }
  // SEM reload de propósito: o app agora se recupera sozinho da corrida pós-login (auth.tsx faz
  // retry quando a leitura do usuário vem vazia). Se mesmo assim não chegar, dá o diagnóstico da tela.
  if (!(await topbar.isVisible())) {
    const url = page.url()
    const txt = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500)
    throw new Error(`Login não chegou na topbar. URL=${url} | TELA="${txt}"`)
  }
}

// Abre uma tela pela sidebar: clica no módulo (.modbar), expande o grupo se houver, clica na tela.
export async function abrirTela(page: Page, modulo: string, tela: string, grupo?: string) {
  await page.locator('.modbar .mod').filter({ hasText: modulo }).first().click()
  if (grupo) {
    const grp = page.locator('.secbar .sgrp').filter({ hasText: grupo })
    if (((await grp.getAttribute('class')) || '').includes('col')) {
      await grp.locator('.sgrp-h').click()   // grupo recolhido → expande
    }
  }
  await page.locator('.secbar').getByText(tela, { exact: true }).first().click()
}
