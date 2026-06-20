-- ============================================================================
-- Preferências por usuário (config de colunas dos relatórios, etc.)
-- Rodar no Supabase > SQL Editor (uma vez).
-- ============================================================================

-- 1) Coluna que guarda as preferências do usuário (JSON)
alter table public.usuarios
  add column if not exists preferencias jsonb not null default '{}'::jsonb;

-- 2) Função SEGURA para o usuário gravar a PRÓPRIA preferência.
--    security definer = roda com privilégio, mas SÓ atualiza a linha do usuário
--    logado (auth.uid()) e SÓ a coluna preferencias. Não dá pra mexer em outras
--    colunas (ex: perfil) nem em outros usuários.
create or replace function public.salvar_preferencia(p_prefs jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.usuarios set preferencias = p_prefs where id = auth.uid();
$$;

grant execute on function public.salvar_preferencia(jsonb) to authenticated;
