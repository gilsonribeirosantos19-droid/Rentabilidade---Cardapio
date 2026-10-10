import * as Sentry from '@sentry/react'

// Monitor de erros (Sentry). Liga SÓ se existir a chave VITE_SENTRY_DSN
// (em dev local, sem a chave, fica desligado e não envia nada).
// Privacidade/LGPD: o Session Replay mascara TODO texto e bloqueia mídia —
// grava só o "esqueleto" da tela pra entender o que levou ao erro, sem expor dados.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

export function initSentry() {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,            // 'production' no build publicado
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,                         // 10% das navegações (performance) — econômico
    replaysSessionSampleRate: 0,                   // não grava sessões normais
    replaysOnErrorSampleRate: 1,                   // grava o replay QUANDO dá erro (útil + barato)
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed',
      'Non-Error promise rejection captured',
    ],
  })
}

// Identifica QUEM/qual loja teve o erro (aparece no painel do Sentry).
// Sem e-mail por padrão seria mais conservador, mas o e-mail agiliza o suporte;
// se precisar remover por LGPD, é só tirar o campo `email` abaixo.
export function setSentryUser(u: { id?: string; email?: string; nome?: string; tenant_id?: string | null } | null) {
  if (!dsn) return
  if (!u) { Sentry.setUser(null); return }
  Sentry.setUser({ id: u.id, email: u.email, username: u.nome })
  Sentry.setTag('tenant', u.tenant_id || 'sem-tenant')
}
