-- =====================================================================
-- ETIQUETAS · Fase 2 — finalização
--  1) PIN opcional POR LOJA (lojas.etq_exige_pin) + RPC p/ ligar/desligar (só admin)
--  2) emitir_etiqueta / emitir_avulsa: validam loja do tenant, exigem operador+PIN
--     quando a loja pede, e PIN errado CONTA a tentativa (antes o raise desfazia
--     o contador → bloqueio após 5 erros nunca acontecia)
--  3) etq_salvar_prazos: troca os prazos de um produto de uma vez só (atômico)
--  4) índice p/ filtro por período (created_at)
-- Assinaturas das RPCs NÃO mudam (o front atual continua funcionando).
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- =====================================================================

-- 1) PIN opcional por loja ---------------------------------------------
alter table public.lojas add column if not exists etq_exige_pin boolean not null default false;

create or replace function public.etq_definir_exige_pin(p_loja_id uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app_is_admin() then raise exception 'Só administrador pode alterar a exigência de PIN'; end if;
  update lojas set etq_exige_pin = coalesce(p_valor, false)
   where id = p_loja_id and tenant_id = get_my_tenant_id();
  if not found then raise exception 'Loja não encontrada'; end if;
end $$;
grant execute on function public.etq_definir_exige_pin(uuid, boolean) to authenticated;

-- 2) emissão ------------------------------------------------------------
-- PIN errado → a função RETORNA VAZIO (sem raise) para o contador de tentativas
-- ser gravado. O front trata "0 linhas + operador informado" como PIN incorreto.
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
  v_prefixo text; v_resp text; v_cod text; v_marca text; v_sif text; v_exige boolean; i int;
begin
  select upper(left(regexp_replace(coalesce(nome,''), '[^A-Za-z0-9]', '', 'g'), 3)), coalesce(etq_exige_pin,false)
    into v_prefixo, v_exige from lojas where id=p_loja_id and tenant_id=v_tenant;
  if not found then raise exception 'Loja inválida'; end if;
  if v_exige and p_operador_id is null then raise exception 'Esta loja exige operador + PIN para emitir'; end if;

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

  if p_operador_id is not null then
    if not exists (select 1 from operadores where id=p_operador_id and tenant_id=v_tenant and loja_id=p_loja_id and ativo) then
      raise exception 'Operador não pertence a esta loja ou está inativo'; end if;
    if not validar_operador(p_operador_id, p_pin) then return; end if;   -- PIN errado: vazio (tentativa gravada)
    v_resp := (select nome from operadores where id=p_operador_id);       -- com PIN, o RESP é o operador
  else
    v_resp := p_responsavel;
  end if;

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
  v_validade timestamptz; v_prefixo text; v_resp text; v_cod text; v_exige boolean; i int;
begin
  if coalesce(trim(p_nome),'') = '' then raise exception 'Informe o nome do produto'; end if;
  select upper(left(regexp_replace(coalesce(nome,''), '[^A-Za-z0-9]', '', 'g'), 3)), coalesce(etq_exige_pin,false)
    into v_prefixo, v_exige from lojas where id=p_loja_id and tenant_id=v_tenant;
  if not found then raise exception 'Loja inválida'; end if;
  if v_exige and p_operador_id is null then raise exception 'Esta loja exige operador + PIN para emitir'; end if;

  if p_prazo_horas is null or p_prazo_horas < 1 or p_prazo_horas > 17520 then raise exception 'Prazo inválido (1 h a 730 dias)'; end if;
  if p_manipulacao > now()+interval '15 minutes' then raise exception 'A manipulação não pode estar no futuro'; end if;
  v_validade := p_manipulacao + make_interval(hours => p_prazo_horas);
  if p_val_original is not null then
    if p_val_original < current_date then raise exception 'A validade original já venceu'; end if;
    v_validade := least(v_validade, (p_val_original + interval '1 day' - interval '1 second'));
  end if;

  if p_operador_id is not null then
    if not exists (select 1 from operadores where id=p_operador_id and tenant_id=v_tenant and loja_id=p_loja_id and ativo) then
      raise exception 'Operador não pertence a esta loja ou está inativo'; end if;
    if not validar_operador(p_operador_id, p_pin) then return; end if;
    v_resp := (select nome from operadores where id=p_operador_id);
  else
    v_resp := p_responsavel;
  end if;

  for i in 1..greatest(p_copias,1) loop
    v_cod := _etq_novo_codigo(v_tenant, v_prefixo);
    return query
      insert into etiquetas(tenant_id,loja_id,codigo,item_id,nome_snap,grupo_snap,modo,
        quantidade,unidade,manipulacao_em,validade_em,val_original,lote,fabricacao,
        marca_forn,sif,operador_id,usuario_id,responsavel_nome)
      values (v_tenant,p_loja_id,v_cod,null,trim(p_nome),coalesce(nullif(trim(p_grupo),''),'Avulsa'),p_modo,
        p_quantidade,p_unidade,p_manipulacao,v_validade,p_val_original,p_lote,p_fabricacao,
        p_marca_forn,p_sif,p_operador_id,auth.uid(),v_resp)
      returning *;
  end loop;
end $$;

-- 3) prazos atômicos ----------------------------------------------------
-- p_prazos = [{"modo":"resfriado","prazo_horas":72,"temperatura":"0 a 4°C"}, ...]
create or replace function public.etq_salvar_prazos(p_item_id uuid, p_prazos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := get_my_tenant_id();
begin
  if not exists (select 1 from etiqueta_itens where id=p_item_id and tenant_id=v_tenant) then
    raise exception 'Produto não encontrado'; end if;
  delete from etiqueta_prazos where item_id=p_item_id and tenant_id=v_tenant;
  insert into etiqueta_prazos(tenant_id, item_id, modo, prazo_horas, temperatura)
  select v_tenant, p_item_id, (x->>'modo')::modo_conservacao, (x->>'prazo_horas')::int, nullif(trim(x->>'temperatura'),'')
    from jsonb_array_elements(coalesce(p_prazos,'[]'::jsonb)) x
   where coalesce((x->>'prazo_horas')::int,0) > 0;
end $$;
grant execute on function public.etq_salvar_prazos(uuid, jsonb) to authenticated;

-- 4) índice p/ telas filtradas por período ------------------------------
create index if not exists ix_etq_created on public.etiquetas(tenant_id, created_at desc);

-- 5) módulo ligado p/ o Sushi PN (os demais clientes ligam em Config › Parâmetros)
insert into public.parametros(tenant_id, modulo, chave, valor)
values ('ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'::uuid, 'etiquetas', 'modulo_ativo', 'sim')
on conflict (tenant_id, modulo, chave) do nothing;
