-- ════════════════════════════════════════════════════════════════════════════
--  METAS — Fase A (acompanhamento diário)
--  Meta por DIA DA SEMANA (7 valores por loja) + EXCEÇÕES por data (feriado/evento).
--  O realizado vem de icomanda_recebimento (faturado/ticket). A meta de ticket médio
--  única fica em `parametros` (modulo='metas', chave='ticket_medio').
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Meta por dia da semana (0=Dom .. 6=Sáb), por loja
create table if not exists public.metas_semana (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  loja_id    uuid not null references public.lojas(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  valor      numeric not null default 0,
  unique (tenant_id, loja_id, dia_semana)
);

-- 2) Exceção por data (sobrescreve a meta do dia — feriado/evento)
create table if not exists public.metas_excecao (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  loja_id   uuid not null references public.lojas(id) on delete cascade,
  data      date not null,
  valor     numeric not null default 0,
  motivo    text,
  unique (tenant_id, loja_id, data)
);

-- 3) RLS por tenant (padrão do projeto)
alter table public.metas_semana  enable row level security;
alter table public.metas_excecao enable row level security;

drop policy if exists tenant_policy on public.metas_semana;
create policy tenant_policy on public.metas_semana
  for all using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());

drop policy if exists tenant_policy on public.metas_excecao;
create policy tenant_policy on public.metas_excecao
  for all using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());

grant select, insert, update, delete on public.metas_semana  to authenticated, anon;
grant select, insert, update, delete on public.metas_excecao to authenticated, anon;

-- Obs.: meta de ticket médio (única) fica em parametros (modulo='metas', chave='ticket_medio').
-- O app assume 0/sem meta quando ausente — não precisa pré-gravar nada aqui.
