-- ============================================================================
-- encerrar_inventario(p_inventario_id, p_dry_run)
-- Fecha um inventário de forma ATÔMICA (tudo-ou-nada — roda numa transação).
-- Lógica "Opção C": reconcilia a contagem NA DATA do inventário e PRESERVA os
-- movimentos posteriores. Gera os ajustes datados, recalcula o saldo de HOJE e
-- marca o inventário como encerrado — se qualquer passo falhar, NADA é gravado.
--
-- p_dry_run = true  -> apenas RETORNA o plano (não grava nada). Use pra validar.
-- p_dry_run = false -> aplica de verdade.
--
-- SECURITY INVOKER: roda como o usuário logado (RLS por tenant continua valendo).
-- Rodar este arquivo inteiro no Supabase -> SQL Editor.
-- ============================================================================

create or replace function public.encerrar_inventario(
  p_inventario_id uuid,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_inv     public.inventarios%rowtype;
  v_data    timestamptz;
  v_loja    uuid;
  v_tenant  uuid;
  r         record;
  v_entAte  numeric;
  v_saiAte  numeric;
  v_entApos numeric;
  v_saiApos numeric;
  v_pos     numeric;
  v_diff    numeric;
  v_hoje    numeric;
  v_custo   numeric;
  v_plan    jsonb := '[]'::jsonb;
begin
  select * into v_inv from public.inventarios where id = p_inventario_id;
  if not found then raise exception 'Inventário não encontrado'; end if;
  if v_inv.status is distinct from 'ativo' then raise exception 'Inventário já encerrado'; end if;

  v_tenant := v_inv.tenant_id;
  v_loja   := v_inv.loja_id;
  -- data de referência = fim da contagem (meio-dia); inventário legado sem data -> hoje
  v_data := (coalesce(v_inv.data_final, v_inv.data_inicial, current_date)::date + time '12:00')::timestamptz;

  for r in
    select ii.insumo_id, ii.qtd_contada, i.nome, i.preco_compra
    from public.inventario_itens ii
    join public.insumos i on i.id = ii.insumo_id
    where ii.inventario_id = p_inventario_id
      and ii.qtd_contada is not null   -- só reconcilia itens CONTADOS; não contado fica intacto (não zera)
  loop
    -- posição do sistema NA DATA da contagem (movimentos até a data) e o que veio DEPOIS
    select coalesce(sum(quantidade),0) into v_entAte  from public.entradas_estoque
      where insumo_id = r.insumo_id and coalesce(loja_id, v_loja) = v_loja and criado_em <= v_data;
    select coalesce(sum(quantidade),0) into v_saiAte  from public.saidas_estoque
      where insumo_id = r.insumo_id and coalesce(loja_id, v_loja) = v_loja and criado_em <= v_data;
    select coalesce(sum(quantidade),0) into v_entApos from public.entradas_estoque
      where insumo_id = r.insumo_id and coalesce(loja_id, v_loja) = v_loja and criado_em > v_data;
    select coalesce(sum(quantidade),0) into v_saiApos from public.saidas_estoque
      where insumo_id = r.insumo_id and coalesce(loja_id, v_loja) = v_loja and criado_em > v_data;

    v_pos  := round(v_entAte - v_saiAte, 4);              -- o que o sistema acha que havia na data
    v_diff := round(r.qtd_contada - v_pos, 4);            -- ajuste a registrar, datado na contagem
    v_hoje := round(r.qtd_contada + (v_entApos - v_saiApos), 4); -- saldo de HOJE = contagem + mov. posteriores

    -- custo: preserva o custo médio atual; item novo sem custo -> preço de compra do cadastro
    select custo_medio into v_custo from public.saldo_estoque
      where insumo_id = r.insumo_id and loja_id = v_loja;
    if coalesce(v_custo,0) <= 0 then v_custo := coalesce(r.preco_compra, 0); end if;
    v_custo := coalesce(v_custo, 0);

    v_plan := v_plan || jsonb_build_object(
      'insumo', r.nome, 'qtd_contada', r.qtd_contada, 'pos_na_data', v_pos,
      'ajuste', v_diff, 'qtd_hoje', greatest(v_hoje,0), 'custo_medio', round(v_custo,6)
    );

    if not p_dry_run then
      -- movimento de ajuste DATADO na contagem (rastreável no Kardex/Movimentação)
      if v_diff > 0 then
        insert into public.entradas_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_unitario, tipo, observacao, criado_em)
        values (v_tenant, r.insumo_id, v_loja, v_diff, v_custo, 'ajuste', 'Ajuste de inventário', v_data);
      elsif v_diff < 0 then
        insert into public.saidas_estoque (tenant_id, insumo_id, loja_id, quantidade, tipo, motivo, criado_em)
        values (v_tenant, r.insumo_id, v_loja, abs(v_diff), 'ajuste', 'Ajuste de inventário', v_data);
      end if;
      -- saldo de HOJE (preserva movimentos posteriores)
      insert into public.saldo_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_medio, atualizado_em)
      values (v_tenant, r.insumo_id, v_loja, greatest(v_hoje,0), round(v_custo,6), now())
      on conflict (tenant_id, insumo_id, loja_id)
      do update set quantidade = excluded.quantidade, custo_medio = excluded.custo_medio, atualizado_em = excluded.atualizado_em;
    end if;
  end loop;

  if not p_dry_run then
    update public.inventarios set status = 'encerrado' where id = p_inventario_id;
  end if;

  return jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'itens', jsonb_array_length(v_plan), 'plano', v_plan);
end;
$$;

-- Permite que o app (usuário logado) chame a função
grant execute on function public.encerrar_inventario(uuid, boolean) to authenticated, anon;
