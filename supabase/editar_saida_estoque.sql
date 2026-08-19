-- editar_saida_estoque: corrigir a quantidade de uma SAÍDA já lançada, de forma ATÔMICA (M2/M3).
--
-- É o "Editar saída" do Portal do Gerente: muda a qtd de uma saída (ou apaga se ficar 0) e reajusta
-- o saldo pela diferença. Antes eram passos soltos (ler saldo → update/delete da saída → upsert
-- saldo) e a qtd ANTIGA vinha do cache da tela. Aqui: transação única com trava, e a qtd antiga é
-- lida do banco (autoritativa). Saldo com piso 0. Custo médio NÃO muda (saída não mexe no custo).
--
-- p: { tenant_id, loja_id, insumo_id, saida_id, nova_qtd }

create or replace function public.editar_saida_estoque(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_tenant uuid := (p->>'tenant_id')::uuid;
  v_loja   uuid := (p->>'loja_id')::uuid;
  v_insumo uuid := (p->>'insumo_id')::uuid;
  v_saida  uuid := (p->>'saida_id')::uuid;
  v_nova   numeric := coalesce((p->>'nova_qtd')::numeric, 0);
  v_old numeric; v_qA numeric; v_qN numeric;
begin
  if v_tenant is null or v_loja is null or v_insumo is null or v_saida is null then
    raise exception 'tenant/loja/insumo/saida são obrigatórios';
  end if;
  if v_nova < 0 then raise exception 'quantidade inválida'; end if;

  insert into public.saldo_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_medio, atualizado_em)
  values (v_tenant, v_insumo, v_loja, 0, 0, now())
  on conflict (tenant_id, insumo_id, loja_id) do nothing;

  -- TRAVA o saldo e lê a qtd atual
  select quantidade into v_qA
    from public.saldo_estoque
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja
   for update;
  v_qA := coalesce(v_qA, 0);

  -- qtd ANTIGA da saída, direto do banco (não confia no cache da tela)
  select quantidade into v_old
    from public.saidas_estoque
   where id = v_saida and tenant_id = v_tenant;
  if not found then raise exception 'saída não encontrada'; end if;
  v_old := coalesce(v_old, 0);

  -- devolve a antiga, tira a nova, piso 0
  v_qN := greatest(0, round(v_qA + v_old - v_nova, 4));

  if v_nova <= 0 then
    delete from public.saidas_estoque where id = v_saida and tenant_id = v_tenant;
  else
    update public.saidas_estoque set quantidade = v_nova where id = v_saida and tenant_id = v_tenant;
  end if;

  update public.saldo_estoque set quantidade = v_qN, atualizado_em = now()
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja;

  return jsonb_build_object('ok', true, 'saldo', v_qN);
end;
$$;

grant execute on function public.editar_saida_estoque(jsonb) to anon, authenticated;

-- ROLLBACK: drop function if exists public.editar_saida_estoque(jsonb);
