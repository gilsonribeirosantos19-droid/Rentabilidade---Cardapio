-- =====================================================================
-- ETIQUETAS · Etapa 1 — Fundação no banco do Aiko (DDL + RLS)
-- Cria só tabelas NOVAS (+ 2 colunas additivas em lojas). Não altera o
-- que existe. Reversível (drop). Padrão de RLS igual ao DRE/Auditoria.
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- =====================================================================

-- modo de conservação (idempotente)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'modo_conservacao') then
    create type modo_conservacao as enum
      ('resfriado','congelado','ambiente','descongelando','aberto');
  end if;
end $$;

-- lojas: colunas additivas p/ o rodapé do rótulo (razao_social/cnpj/endereco já existem)
alter table public.lojas add column if not exists cep    text;
alter table public.lojas add column if not exists cidade text;

-- 1) item etiquetável: aponta pro catálogo do Aiko (insumo OU ficha) + config de rótulo
create table if not exists public.etiqueta_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  insumo_id uuid references public.insumos(id)          on delete cascade,
  ficha_id  uuid references public.fichas_tecnicas(id)  on delete cascade,
  categoria text,
  marca_forn_default text,
  sif_default text,
  alergenicos text,                 -- só cadastro; NÃO imprime (decisão do dono)
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint etiqueta_itens_um_catalogo check (num_nonnulls(insumo_id, ficha_id) = 1)
);
create index        if not exists ix_etit_tenant on public.etiqueta_itens(tenant_id);
create unique index if not exists uq_etit_insumo on public.etiqueta_itens(tenant_id, insumo_id) where insumo_id is not null;
create unique index if not exists uq_etit_ficha  on public.etiqueta_itens(tenant_id, ficha_id)  where ficha_id  is not null;

-- 2) prazos por modo (só os modos com prazo aparecem na emissão)
create table if not exists public.etiqueta_prazos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null references public.etiqueta_itens(id) on delete cascade,
  modo modo_conservacao not null,
  prazo_horas int not null check (prazo_horas between 1 and 17520),  -- 1h a 730d
  temperatura text,
  unique (item_id, modo)
);
create index if not exists ix_etpz_tenant on public.etiqueta_prazos(tenant_id);

-- 3) operadores (tablet/PIN) — não são usuários do Supabase
create table if not exists public.operadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  pin_hash text not null,           -- bcrypt; NUNCA exposto ao cliente (ver grants)
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_oper_tenant on public.operadores(tenant_id, loja_id);

-- 4) etiquetas (criadas SÓ via RPC; snapshots garantem histórico/avulsa)
create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  codigo text not null,                                   -- SPN-XXXXXXXX
  item_id uuid references public.etiqueta_itens(id) on delete set null,  -- null = avulsa
  nome_snap text not null,                                -- nome no momento (histórico)
  categoria_snap text,
  modo modo_conservacao not null,
  quantidade numeric,
  unidade text,
  manipulacao_em timestamptz not null,
  validade_em    timestamptz not null,
  val_original date,
  lote text,
  fabricacao date,
  marca_forn text,
  sif text,
  operador_id uuid references public.operadores(id) on delete set null,
  usuario_id uuid,
  responsavel_nome text,
  status text not null default 'ativa'
    check (status in ('ativa','utilizada','descartada','cancelada')),
  motivo_descarte text,
  custo_unit_snap numeric,                                -- do custo médio do Aiko → perda R$
  reimpressoes int not null default 0,
  baixado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_etiqueta_codigo unique (tenant_id, codigo)
);
create index if not exists ix_etq_tenant_loja on public.etiquetas(tenant_id, loja_id);
create index if not exists ix_etq_status      on public.etiquetas(tenant_id, loja_id, status);
create index if not exists ix_etq_validade    on public.etiquetas(tenant_id, validade_em);

-- =========================== RLS (padrão Aiko) ===========================
alter table public.etiqueta_itens  enable row level security;
alter table public.etiqueta_prazos enable row level security;
alter table public.operadores      enable row level security;
alter table public.etiquetas        enable row level security;

-- cadastros: tenant gerencia (igual DRE/contas_gerenciais)
drop policy if exists tenant_policy on public.etiqueta_itens;
create policy tenant_policy on public.etiqueta_itens for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());

drop policy if exists tenant_policy on public.etiqueta_prazos;
create policy tenant_policy on public.etiqueta_prazos for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());

drop policy if exists tenant_policy on public.operadores;
create policy tenant_policy on public.operadores for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());

-- etiquetas: LEITURA por tenant; ESCRITA só via RPC (sem policy de insert/update/delete)
drop policy if exists etiquetas_read on public.etiquetas;
create policy etiquetas_read on public.etiquetas for select
  using (tenant_id = get_my_tenant_id());

-- =========================== GRANTS ===========================
-- cadastros de prazos: gerente/admin gerenciam direto
grant select, insert, update, delete on public.etiqueta_itens  to authenticated;
grant select, insert, update, delete on public.etiqueta_prazos to authenticated;
-- operadores: cliente LÊ só colunas seguras (pin_hash FORA); escrita só via RPC
grant select (id, tenant_id, loja_id, nome, tentativas, bloqueado_ate, ativo, created_at)
  on public.operadores to authenticated;
-- etiquetas: cliente só LÊ; emissão/baixa via RPC
grant select on public.etiquetas to authenticated;

-- =====================================================================
-- Próximo arquivo (Etapa 1b): os RPCs — emitir_etiqueta, emitir_avulsa,
-- baixar_etiqueta, registrar_reimpressao, salvar_operador/validar_operador,
-- dashboard, relatorio. Entram depois que estas tabelas forem validadas.
-- =====================================================================
