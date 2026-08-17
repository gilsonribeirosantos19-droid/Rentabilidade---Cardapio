-- atender_requisicao: envio do CD (Distribuição) de forma ATÔMICA (A4 da auditoria).
--
-- Problema que resolve: o front fazia, item a item, transferir_estoque() e DEPOIS um
-- UPDATE de qtd_atendida em chamadas separadas. Se a rede caísse ENTRE as duas, no reenvio
-- o item transferia de novo (dupla-baixa no CD + entrada dobrada na filial). E entre itens,
-- uma falha no meio deixava a requisição transferida "pela metade".
--
-- Aqui tudo roda numa transação só (a função é atômica): ou transfere TODOS os itens
-- informados + grava qtd_atendida + marca a requisição como 'a_caminho', ou não faz NADA.
-- Idempotência: item que JÁ tem qtd_atendida > 0 não é re-transferido (permite reenvio
-- de uma requisição que teve itens adicionados depois).
--
-- SECURITY INVOKER (default): roda com a permissão de quem chama — mesma da transferir_estoque
-- que o front já usava. Não eleva privilégio; o RLS continua valendo.
--
-- p_itens: jsonb no formato [{"item_id": "<uuid>", "qtd": <numeric>}, ...]
-- p_dry_run: true = simula (NÃO grava nada; retorna o "plano" do que faria).

create or replace function public.atender_requisicao(
  p_req_id uuid,
  p_itens jsonb,
  p_responsavel text default null,
  p_dry_run boolean default false
) returns jsonb
language plpgsql
as $$
declare
  v_req      public.requisicoes%rowtype;
  v_now      timestamptz := now();
  v_el       jsonb;
  v_item_id  uuid;
  v_qtd      numeric;
  v_ins      uuid;
  v_ja       numeric;
  v_custo    numeric;
  v_enviados int := 0;
  v_valor    numeric := 0;
  v_plano    jsonb := '[]'::jsonb;
begin
  -- lê a requisição (o RLS garante tenant/permissão do chamador)
  select * into v_req from public.requisicoes where id = p_req_id;
  if not found then raise exception 'Requisição não encontrada.'; end if;
  if v_req.cd_loja_id is null then raise exception 'Requisição sem CD de origem definido.'; end if;

  for v_el in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_item_id := (v_el->>'item_id')::uuid;
    v_qtd     := coalesce((v_el->>'qtd')::numeric, 0);
    if v_qtd <= 0 then continue; end if;

    -- lê o item pra pegar insumo, o que já foi atendido (idempotência) e o custo
    select insumo_id, coalesce(qtd_atendida, 0), coalesce(custo_unitario, 0)
      into v_ins, v_ja, v_custo
      from public.requisicao_itens
      where id = v_item_id and requisicao_id = p_req_id;
    if not found then continue; end if;

    if v_ja > 0 then
      -- já transferido num envio anterior → só soma no total, não re-transfere
      v_enviados := v_enviados + 1;
      v_valor    := v_valor + v_ja * v_custo;
      v_plano    := v_plano || jsonb_build_object('item_id', v_item_id, 'acao', 'ja_atendido', 'qtd', v_ja);
      continue;
    end if;

    if p_dry_run then
      v_plano := v_plano || jsonb_build_object('item_id', v_item_id, 'insumo_id', v_ins, 'acao', 'transferir', 'qtd', v_qtd);
    else
      -- baixa no CD + entrada na filial (MESMA função já usada, agora dentro da transação)
      perform public.transferir_estoque(
        v_req.tenant_id, v_ins, v_req.cd_loja_id, v_req.loja_id, v_qtd, v_now,
        'Distribuição #' || v_req.numero, p_responsavel
      );
      update public.requisicao_itens set qtd_atendida = v_qtd where id = v_item_id;
    end if;

    v_enviados := v_enviados + 1;
    v_valor    := v_valor + v_qtd * v_custo;
  end loop;

  if v_enviados = 0 then raise exception 'Informe a quantidade atendida de ao menos um item.'; end if;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'req', v_req.numero, 'itens', v_enviados, 'valor', v_valor, 'plano', v_plano);
  end if;

  update public.requisicoes
     set status = 'a_caminho', enviado_em = v_now, valor_total = v_valor
   where id = p_req_id;

  return jsonb_build_object('ok', true, 'req', v_req.numero, 'itens', v_enviados, 'valor', v_valor);
end;
$$;

grant execute on function public.atender_requisicao(uuid, jsonb, text, boolean) to anon, authenticated;

-- ROLLBACK (se precisar desfazer): volta o front pro loop antigo e rode:
-- drop function if exists public.atender_requisicao(uuid, jsonb, text, boolean);
