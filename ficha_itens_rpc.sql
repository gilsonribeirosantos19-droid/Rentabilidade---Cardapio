-- ============================================================================
-- replace_itens_ficha(p_ficha_id, p_itens)
-- Troca os ingredientes de uma ficha de forma ATÔMICA (tudo-ou-nada).
-- Antes, o app fazia DELETE de todos os itens e depois INSERT dos novos em
-- chamadas separadas: se o INSERT falhasse (rede/erro), a ficha ficava SEM
-- nenhum ingrediente (perda de dados). Aqui delete + insert rodam numa só
-- transação — ou troca tudo, ou não mexe em nada.
--
-- SECURITY INVOKER: roda como o usuário logado. Além disso valida que a ficha
-- é do tenant do usuário (get_my_tenant_id), então não dá pra mexer em ficha
-- de outro tenant mesmo que itens_ficha não tenha RLS própria.
--
-- p_itens: jsonb array [{ "insumo_id": uuid, "produto_id": uuid, "quantidade_g": num, "ordem": int }]
--          cada item tem insumo_id OU produto_id (produto = meia porção / combo).
-- Rodar este arquivo inteiro no Supabase -> SQL Editor.
-- ============================================================================

create or replace function public.replace_itens_ficha(p_ficha_id uuid, p_itens jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  -- só mexe se a ficha for do tenant do usuário logado
  if not exists (
    select 1 from public.fichas_tecnicas
    where id = p_ficha_id and tenant_id = get_my_tenant_id()
  ) then
    raise exception 'Ficha não encontrada para este tenant';
  end if;

  delete from public.itens_ficha where ficha_id = p_ficha_id;

  insert into public.itens_ficha (ficha_id, insumo_id, produto_id, quantidade_g, ordem)
  select p_ficha_id,
         nullif(e->>'insumo_id', '')::uuid,
         nullif(e->>'produto_id', '')::uuid,
         coalesce((e->>'quantidade_g')::numeric, 0),
         coalesce((e->>'ordem')::int, 0)
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as e
  where nullif(e->>'insumo_id', '') is not null
     or nullif(e->>'produto_id', '') is not null;
end;
$$;

grant execute on function public.replace_itens_ficha(uuid, jsonb) to anon, authenticated;
