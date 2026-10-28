-- =====================================================================
-- ETIQUETAS · Fase 1 v2 — RESET do modelo (tabelas estavam VAZIAS)
-- Substitui etiquetas_fase1.sql + etiquetas_fase1b_rpcs.sql.
-- Modelo enxuto: produto de etiqueta = cadastro PRÓPRIO (nome + grupo/estação
-- + prazos por modo) com vínculo OPCIONAL a insumo/ficha (custo/previsão).
-- Modos conforme a planilha real: resfriado/congelado/ambiente/quente/descongelado (+ aberto).
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- =====================================================================

-- reset (vazio; recriação limpa)
drop table if exists public.etiquetas       cascade;
drop table if exists public.etiqueta_prazos cascade;
drop table if exists public.operadores      cascade;
drop table if exists public.etiqueta_itens  cascade;
drop type  if exists modo_conservacao;

create type modo_conservacao as enum
  ('resfriado','congelado','ambiente','quente','descongelado','aberto');

-- lojas: colunas do rodapé (idempotente)
alter table public.lojas add column if not exists cep    text;
alter table public.lojas add column if not exists cidade text;

-- 0) grupos de etiqueta (cadastro próprio, estilo Fixee; filtro na emissão)
create table public.etiqueta_grupos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  nome text not null,
  ordem int,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index ix_etgr_tenant on public.etiqueta_grupos(tenant_id);

-- 1) produto de etiqueta (cadastro próprio; vínculo ao catálogo é OPCIONAL)
create table public.etiqueta_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  nome text not null,
  grupo_id uuid references public.etiqueta_grupos(id) on delete set null,   -- grupo (cadastro, estilo Fixee)
  insumo_id uuid references public.insumos(id)         on delete set null,  -- opcional (custo/previsão)
  ficha_id  uuid references public.fichas_tecnicas(id) on delete set null,  -- opcional
  marca_forn_default text, sif_default text, alergenicos text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index ix_etit_tenant on public.etiqueta_itens(tenant_id);
create index ix_etit_grupo  on public.etiqueta_itens(tenant_id, grupo_id);

-- 2) prazos por modo (em horas; UI usa dias+horas)
create table public.etiqueta_prazos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null references public.etiqueta_itens(id) on delete cascade,
  modo modo_conservacao not null,
  prazo_horas int not null check (prazo_horas between 1 and 17520),
  temperatura text,
  unique (item_id, modo)
);
create index ix_etpz_tenant on public.etiqueta_prazos(tenant_id);

-- 3) operadores (tablet/PIN)
create table public.operadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  pin_hash text not null,
  tentativas int not null default 0, bloqueado_ate timestamptz,
  ativo boolean not null default true, created_at timestamptz not null default now()
);
create index ix_oper_tenant on public.operadores(tenant_id, loja_id);

-- 4) etiquetas (só via RPC; snapshots)
create table public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  codigo text not null,
  item_id uuid references public.etiqueta_itens(id) on delete set null,   -- null = avulsa
  nome_snap text not null, grupo_snap text,
  modo modo_conservacao not null, quantidade numeric, unidade text,
  manipulacao_em timestamptz not null, validade_em timestamptz not null,
  val_original date, lote text, fabricacao date, marca_forn text, sif text,
  operador_id uuid references public.operadores(id) on delete set null,
  usuario_id uuid, responsavel_nome text,
  status text not null default 'ativa' check (status in ('ativa','utilizada','descartada','cancelada')),
  motivo_descarte text, custo_unit_snap numeric,
  reimpressoes int not null default 0, baixado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_etiqueta_codigo unique (tenant_id, codigo)
);
create index ix_etq_tenant_loja on public.etiquetas(tenant_id, loja_id);
create index ix_etq_status      on public.etiquetas(tenant_id, loja_id, status);
create index ix_etq_validade    on public.etiquetas(tenant_id, validade_em);

-- ===== RLS =====
alter table public.etiqueta_grupos enable row level security;
alter table public.etiqueta_itens  enable row level security;
alter table public.etiqueta_prazos enable row level security;
alter table public.operadores      enable row level security;
alter table public.etiquetas        enable row level security;

create policy tenant_policy on public.etiqueta_grupos for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
create policy tenant_policy on public.etiqueta_itens for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
create policy tenant_policy on public.etiqueta_prazos for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
create policy tenant_policy on public.operadores for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
create policy etiquetas_read on public.etiquetas for select
  using (tenant_id = get_my_tenant_id());

-- ===== GRANTS =====
grant select, insert, update, delete on public.etiqueta_grupos to authenticated;
grant select, insert, update, delete on public.etiqueta_itens  to authenticated;
grant select, insert, update, delete on public.etiqueta_prazos to authenticated;
grant select (id, tenant_id, loja_id, nome, tentativas, bloqueado_ate, ativo, created_at)
  on public.operadores to authenticated;
grant select on public.etiquetas to authenticated;

-- =====================================================================
-- RPCs
-- =====================================================================
create or replace function public.salvar_operador(
  p_loja_id uuid, p_nome text, p_pin text, p_operador_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_tenant uuid := get_my_tenant_id(); v_id uuid;
begin
  if p_pin is not null and p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN deve ter 4 a 6 dígitos'; end if;
  if p_operador_id is null then
    if p_pin is null then raise exception 'Informe o PIN'; end if;
    insert into operadores(tenant_id, loja_id, nome, pin_hash)
      values (v_tenant, p_loja_id, p_nome, crypt(p_pin, gen_salt('bf'))) returning id into v_id;
  else
    update operadores set nome=coalesce(p_nome,nome), loja_id=coalesce(p_loja_id,loja_id),
      pin_hash=case when p_pin is null then pin_hash else crypt(p_pin, gen_salt('bf')) end,
      tentativas=0, bloqueado_ate=null
    where id=p_operador_id and tenant_id=v_tenant returning id into v_id;
  end if; return v_id;
end $$;

create or replace function public.validar_operador(p_operador_id uuid, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_tenant uuid := get_my_tenant_id(); r public.operadores;
begin
  select * into r from operadores where id=p_operador_id and tenant_id=v_tenant and ativo;
  if not found then return false; end if;
  if r.bloqueado_ate is not null and r.bloqueado_ate > now() then raise exception 'Operador bloqueado até %', r.bloqueado_ate; end if;
  if crypt(p_pin, r.pin_hash) = r.pin_hash then
    update operadores set tentativas=0, bloqueado_ate=null where id=r.id; return true;
  else
    update operadores set tentativas=tentativas+1,
      bloqueado_ate=case when tentativas+1>=5 then now()+interval '15 minutes' else null end where id=r.id;
    return false;
  end if;
end $$;

create or replace function public._etq_novo_codigo(p_tenant uuid, p_prefixo text)
returns text language plpgsql as $$
declare c text;
begin
  loop
    c := upper(coalesce(nullif(trim(p_prefixo),''),'ETQ')) || '-' ||
         upper(substr(md5(random()::text || clock_timestamp()::text),1,8));
    exit when not exists (select 1 from etiquetas where tenant_id=p_tenant and codigo=c);
  end loop; return c;
end $$;

-- emitir N etiquetas de um produto cadastrado
create or replace function public.emitir_etiqueta(
  p_item_id uuid, p_modo modo_conservacao, p_loja_id uuid,
  p_quantidade numeric default null, p_unidade text default null, p_copias int default 1,
  p_manipulacao timestamptz default now(),
  p_marca_forn text default null, p_sif text default null,
  p_lote text default null, p_fabricacao date default null, p_val_original date default null,
  p_operador_id uuid default null, p_pin text default null, p_responsavel text default null
) returns setof public.etiquetas language plpgsql security definer set search_path = public, extensions as $$
declare v_tenant uuid := get_my_tenant_id();
  v_prazo int; v_validade timestamptz; v_nome text; v_grupo text; v_custo numeric;
  v_prefixo text; v_resp text; v_cod text; v_marca text; v_sif text; i int;
begin
  select ep.prazo_horas, ei.nome,
         (select g.nome from etiqueta_grupos g where g.id = ei.grupo_id),
         coalesce(p_marca_forn,ei.marca_forn_default),
         coalesce(p_sif,ei.sif_default),
         case when ei.insumo_id is not null then
           (select se.custo_medio from saldo_estoque se
             where se.tenant_id=v_tenant and se.insumo_id=ei.insumo_id and se.loja_id=p_loja_id) end
    into v_prazo, v_nome, v_grupo, v_marca, v_sif, v_custo
    from etiqueta_itens ei
    join etiqueta_prazos ep on ep.item_id=ei.id and ep.modo=p_modo
   where ei.id=p_item_id and ei.tenant_id=v_tenant;
  if v_prazo is null then raise exception 'Produto sem prazo cadastrado para o modo %', p_modo; end if;
  if p_manipulacao > now()+interval '15 minutes' then raise exception 'A manipulação não pode estar no futuro'; end if;
  v_validade := p_manipulacao + make_interval(hours => v_prazo);
  if p_val_original is not null then
    if p_val_original < current_date then raise exception 'A validade original já venceu'; end if;
    v_validade := least(v_validade, (p_val_original + interval '1 day' - interval '1 second'));
  end if;
  if p_operador_id is not null and not validar_operador(p_operador_id,p_pin) then raise exception 'PIN incorreto'; end if;
  select upper(left(regexp_replace(coalesce(nome,''), '[^A-Za-z0-9]', '', 'g'), 3)) into v_prefixo from lojas where id=p_loja_id;
  v_resp := coalesce(p_responsavel, (select nome from operadores where id=p_operador_id));
  for i in 1..greatest(p_copias,1) loop
    v_cod := _etq_novo_codigo(v_tenant, v_prefixo);
    return query
      insert into etiquetas(tenant_id,loja_id,codigo,item_id,nome_snap,grupo_snap,modo,
        quantidade,unidade,manipulacao_em,validade_em,val_original,lote,fabricacao,
        marca_forn,sif,operador_id,usuario_id,responsavel_nome,custo_unit_snap)
      values (v_tenant,p_loja_id,v_cod,p_item_id,v_nome,v_grupo,p_modo,
        p_quantidade,p_unidade,p_manipulacao,v_validade,p_val_original,p_lote,p_fabricacao,
        v_marca,v_sif,p_operador_id,auth.uid(),v_resp,v_custo)
      returning *;
  end loop;
end $$;

-- emitir avulsa (sem cadastro; prazo e grupo informados)
create or replace function public.emitir_avulsa(
  p_nome text, p_modo modo_conservacao, p_prazo_horas int, p_loja_id uuid,
  p_grupo text default 'Avulsa',
  p_quantidade numeric default null, p_unidade text default null, p_copias int default 1,
  p_manipulacao timestamptz default now(), p_temperatura text default null,
  p_marca_forn text default null, p_sif text default null,
  p_lote text default null, p_fabricacao date default null, p_val_original date default null,
  p_operador_id uuid default null, p_pin text default null, p_responsavel text default null
) returns setof public.etiquetas language plpgsql security definer set search_path = public, extensions as $$
declare v_tenant uuid := get_my_tenant_id();
  v_validade timestamptz; v_prefixo text; v_resp text; v_cod text; i int;
begin
  if p_prazo_horas is null or p_prazo_horas < 1 or p_prazo_horas > 17520 then raise exception 'Prazo inválido (1 h a 730 dias)'; end if;
  if p_manipulacao > now()+interval '15 minutes' then raise exception 'A manipulação não pode estar no futuro'; end if;
  v_validade := p_manipulacao + make_interval(hours => p_prazo_horas);
  if p_val_original is not null then
    if p_val_original < current_date then raise exception 'A validade original já venceu'; end if;
    v_validade := least(v_validade, (p_val_original + interval '1 day' - interval '1 second'));
  end if;
  if p_operador_id is not null and not validar_operador(p_operador_id,p_pin) then raise exception 'PIN incorreto'; end if;
  select upper(left(regexp_replace(coalesce(nome,''), '[^A-Za-z0-9]', '', 'g'), 3)) into v_prefixo from lojas where id=p_loja_id;
  v_resp := coalesce(p_responsavel, (select nome from operadores where id=p_operador_id));
  for i in 1..greatest(p_copias,1) loop
    v_cod := _etq_novo_codigo(v_tenant, v_prefixo);
    return query
      insert into etiquetas(tenant_id,loja_id,codigo,item_id,nome_snap,grupo_snap,modo,
        quantidade,unidade,manipulacao_em,validade_em,val_original,lote,fabricacao,
        marca_forn,sif,operador_id,usuario_id,responsavel_nome)
      values (v_tenant,p_loja_id,v_cod,null,p_nome,coalesce(p_grupo,'Avulsa'),p_modo,
        p_quantidade,p_unidade,p_manipulacao,v_validade,p_val_original,p_lote,p_fabricacao,
        p_marca_forn,p_sif,p_operador_id,auth.uid(),v_resp)
      returning *;
  end loop;
end $$;

create or replace function public.baixar_etiqueta(
  p_codigo text, p_status text, p_motivo text default null,
  p_operador_id uuid default null, p_pin text default null
) returns public.etiquetas language plpgsql security definer set search_path = public, extensions as $$
declare v_tenant uuid := get_my_tenant_id(); r public.etiquetas;
begin
  if p_status not in ('utilizada','descartada','cancelada') then raise exception 'Status inválido'; end if;
  if p_status='descartada' and coalesce(p_motivo,'') not in ('vencido','qualidade','contaminacao','sobra','avaria','outro') then
    raise exception 'Descarte exige um motivo válido'; end if;
  if p_status='cancelada' and p_operador_id is not null then raise exception 'Cancelamento só por gerente/admin'; end if;
  if p_operador_id is not null and not validar_operador(p_operador_id,p_pin) then raise exception 'PIN incorreto'; end if;
  update etiquetas set status=p_status,
    motivo_descarte=case when p_status='descartada' then p_motivo else null end, baixado_em=now()
  where tenant_id=v_tenant and codigo=p_codigo and status='ativa' returning * into r;
  if not found then raise exception 'Etiqueta não encontrada ou já baixada'; end if;
  return r;
end $$;

create or replace function public.registrar_reimpressao(p_etiqueta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update etiquetas set reimpressoes=reimpressoes+1 where id=p_etiqueta_id and tenant_id=get_my_tenant_id();
end $$;

grant execute on function public.salvar_operador(uuid,text,text,uuid) to authenticated;
grant execute on function public.validar_operador(uuid,text) to authenticated;
grant execute on function public.emitir_etiqueta(uuid,modo_conservacao,uuid,numeric,text,int,timestamptz,text,text,text,date,date,uuid,text,text) to authenticated;
grant execute on function public.emitir_avulsa(text,modo_conservacao,int,uuid,text,numeric,text,int,timestamptz,text,text,text,text,date,date,uuid,text,text) to authenticated;
grant execute on function public.baixar_etiqueta(text,text,text,uuid,text) to authenticated;
grant execute on function public.registrar_reimpressao(uuid) to authenticated;
