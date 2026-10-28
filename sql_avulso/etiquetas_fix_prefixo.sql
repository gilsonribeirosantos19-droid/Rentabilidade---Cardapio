-- =====================================================================
-- ETIQUETAS · FIX — coluna "abreviacao" não existe em lojas
-- Recria emitir_etiqueta e emitir_avulsa usando as 3 primeiras letras
-- do NOME da loja como prefixo do código. Não mexe em tabelas/dados.
-- Rodar no SQL Editor (ref trczpnjidqfippbfxtpe).
-- =====================================================================

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
