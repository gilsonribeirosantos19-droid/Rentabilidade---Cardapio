-- ============================================================================
-- CENTRAL DE AJUDA in-app (ícone ? no topo)
-- Tabela GLOBAL (igual pra todos). Leitura liberada; escrita só SQL/admin.
-- Idempotente. Edite/inclua artigos à vontade (conteudo aceita quebras de linha).
-- ============================================================================
create table if not exists public.ajuda_artigos (
  id          uuid primary key default gen_random_uuid(),
  modulo      text not null default 'Geral',   -- agrupa (Estoque, DRE, Fiscal...)
  titulo      text not null,
  conteudo    text not null,                    -- passo a passo (quebras de linha preservadas)
  ordem       int  default 0,
  created_at  timestamptz not null default now()
);

alter table public.ajuda_artigos enable row level security;
drop policy if exists ajuda_read on public.ajuda_artigos;
create policy ajuda_read on public.ajuda_artigos for select using (true);
grant select on public.ajuda_artigos to anon, authenticated;

-- ------- guias iniciais -------
insert into public.ajuda_artigos (modulo, ordem, titulo, conteudo) values
  ('Estoque', 1, 'Como dar entrada de uma nota fiscal',
   E'1. Vá em Fiscal › Monitor NF-e.\n2. Confira a nota na situação "Para processar".\n3. Se algum item estiver com erro, clique no ponto vermelho e corrija o vínculo (aba Erros).\n4. Selecione a(s) nota(s) e clique em "Processar selecionadas".\n5. A entrada cai no estoque e recalcula o custo médio.'),
  ('Estoque', 2, 'Como fazer o inventário',
   E'1. Vá em Estoque › Inventário.\n2. Lance a quantidade CONTADA de cada insumo.\n3. Ao fechar, o sistema ajusta o saldo para a contagem (mantém o custo médio).\n4. O inventário fecha o período para o CMV. Conte TUDO, inclusive o que ainda não entrou formalmente.'),
  ('Estoque', 3, 'Como lançar uma saída ou perda',
   E'1. Vá em Estoque › Saídas.\n2. Escolha o insumo, a loja e a quantidade.\n3. No tipo, use "consumo", "perda", "vencimento" ou "descarte".\n4. Perdas e descartes entram no cálculo do CMV do período.'),
  ('DRE', 1, 'Como classificar um insumo na conta do DRE',
   E'A conta gerencial do DRE fica no cadastro do insumo.\n1. Vá em Cadastros › Insumos.\n2. Na coluna "Conta (DRE)", clique no chip do insumo e escolha a conta.\n3. Pronto: toda compra futura daquele insumo já entra nessa conta, automaticamente.\nDica: o botão "Auto classificar" tenta casar os insumos pela semelhança do nome.'),
  ('DRE', 2, 'Trocar a conta só numa nota (Apropriação)',
   E'Quando um item vai pra outra conta só naquela compra (ex.: carne para alimentação de funcionário):\n1. Abra a nota em Fiscal › Monitor NF-e › aba Apropriação.\n2. Troque a conta do item — fica marcado "nesta nota".\n3. Se for virar o padrão desse insumo, clique em "tornar padrão" (grava no cadastro).'),
  ('DRE', 3, 'Como definir o orçamento (teto) por conta',
   E'1. Vá em Gestão › DRE de Compras › Orçamento.\n2. Escolha a LOJA (o teto é por loja).\n3. Digite o teto mensal de cada conta (salva ao sair do campo).\n4. Em "Todas as lojas" você vê o consolidado (soma das lojas).\nO "ritmo" compara o quanto já comprou com o esperado proporcional aos dias do período.'),
  ('Fiscal', 1, 'O que fazer quando a NF-e dá erro',
   E'Ponto vermelho = algum item não está vinculado a um insumo.\n1. Clique no ponto vermelho (ou abra a aba Erros).\n2. Clique em "Corrigir" no item.\n3. Escolha o insumo interno e a embalagem (quantas unidades vêm na caixa).\n4. Ao salvar, o vínculo vale para as próximas notas do mesmo fornecedor + código.'),
  ('Geral', 1, 'Como trocar de loja',
   E'No topo da tela há o seletor "Todas as lojas". Troque ali para filtrar as telas por uma loja específica. Algumas telas (DRE, Fiscal) têm o próprio filtro de loja dentro delas.'),
  ('Geral', 2, 'Novidades do sistema',
   E'Clique no sininho 🔔 no topo para ver o que mudou no Aiko (novidades, melhorias e correções). O número vermelho indica quantas novidades você ainda não viu.');
