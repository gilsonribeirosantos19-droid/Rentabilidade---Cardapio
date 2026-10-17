-- ============================================================================
-- SSO-lite "entrar direto" (crachá automático) — parte do AIKO (fábrica de crachás)
-- O AIKO emite um token de USO ÚNICO e CURTO (60s) pro usuário logado. Ao clicar num
-- card do hub, o sistema-alvo recebe esse token, valida aqui e JÁ LOGA a pessoa (sem senha).
-- Rodar no Supabase do AIKO.
-- ============================================================================

-- 1) tokens de uso único. RLS ligada SEM policy => ninguém lê pela API; só service_role/definer.
create table if not exists public.sso_tokens (
  token      text primary key,
  email      text not null,
  sistema    text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
alter table public.sso_tokens enable row level security;
create index if not exists sso_tokens_exp_idx on public.sso_tokens (expires_at);

-- 2) o sistema-alvo chama esta função pra CONSUMIR o token (valida + marca usado) e receber o e-mail.
--    Protegida pelo MESMO token da ponte (ponte_config) que os sistemas já guardam.
--    Single-use garantido: o UPDATE só casa se ainda não foi usado e não expirou.
create or replace function public.sso_consumir_token(p_secret text, p_token text, p_sistema text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text; v_ok boolean;
begin
  select (token = p_secret) into v_ok from public.ponte_config where id = 1;
  if not coalesce(v_ok, false) then return jsonb_build_object('ok', false, 'erro', 'secret invalido'); end if;

  update public.sso_tokens
     set used_at = now()
   where token = p_token
     and sistema = p_sistema
     and used_at is null
     and expires_at > now()
  returning email into v_email;

  if v_email is null then return jsonb_build_object('ok', false, 'erro', 'token invalido, usado ou expirado'); end if;
  return jsonb_build_object('ok', true, 'email', v_email);
end $$;
grant execute on function public.sso_consumir_token(text, text, text) to anon, authenticated;

-- 3) faxina: apaga tokens velhos (opcional, pode rodar de vez em quando ou via cron)
-- delete from public.sso_tokens where expires_at < now() - interval '1 day';
