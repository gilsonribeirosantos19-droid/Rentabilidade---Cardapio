-- ============================================================
-- SCRIPT DE MIGRAÇÃO — NOVO TENANT
-- Sistema Aiko Gestão de Restaurante
-- Versão 2.0 — atualizado em 2026-05-30
-- ============================================================
-- INSTRUÇÕES:
-- 1. Substitua TENANT_ID_AQUI pelo UUID do novo tenant
-- 2. Substitua NOME_EMPRESA pelo nome da empresa
-- 3. Execute TODO o script de uma vez no SQL Editor do Supabase
-- 4. Após executar, verifique: SELECT * FROM tenants WHERE id = 'TENANT_ID_AQUI';
-- ============================================================

-- ── 1. REGISTRAR O TENANT ────────────────────────────────────
INSERT INTO tenants (id, nome)
VALUES ('TENANT_ID_AQUI', 'NOME_EMPRESA')
ON CONFLICT (id) DO NOTHING;

-- ── 2. TABELA: insumos ───────────────────────────────────────
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS unidade_compra text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS unidade_medida text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS preco_compra numeric DEFAULT 0;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS rendimento_pct numeric DEFAULT 100;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS tipo_item text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS tipo_baixa text DEFAULT 'consumo';
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS familia text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS subgrupo text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS participa_cmv text DEFAULT 'sim';
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS ncm text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS local_deposito text;
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 3. TABELA: fornecedores ──────────────────────────────────
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS nome_fantasia text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS contato text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS estado text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo';
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 4. TABELA: insumo_fornecedores ──────────────────────────
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS descricao_fornecedor text;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS codigo_fornecedor text;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS ean text;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS embalagem_descricao text;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS qtd_por_embalagem numeric;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS preco_unitario numeric;
ALTER TABLE insumo_fornecedores ADD COLUMN IF NOT EXISTS ultima_entrada date;

-- ── 5. TABELA: fichas_tecnicas ───────────────────────────────
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS rendimento_porcoes integer DEFAULT 1;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS preco_venda numeric;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS modo_preparo text;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS observacoes text;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativa';
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS insumo_vinculado_id uuid;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS rendimento_receita_g numeric;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS atualizado_em timestamptz;
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 6. TABELA: itens_ficha ───────────────────────────────────
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS ficha_id uuid;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS quantidade_g numeric;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;

-- ── 7. TABELA: entradas_estoque ──────────────────────────────
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS quantidade_fornecedor numeric;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS responsavel text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS custo_unitario numeric;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS custo_total numeric;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS fator_conversao numeric DEFAULT 1;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS unidade_compra text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS lote text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS validade date;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS documento_ref text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'manual';
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS fornecedor_nome text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 8. TABELA: saidas_estoque ────────────────────────────────
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS custo_unitario numeric;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS motivo_id uuid;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS responsavel text;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 9. TABELA: saldo_estoque ─────────────────────────────────
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS quantidade numeric DEFAULT 0;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS custo_medio numeric DEFAULT 0;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS atualizado_em timestamptz DEFAULT now();

-- ── 10. TABELA: historico_custo ──────────────────────────────
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS saldo_anterior numeric;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS custo_medio_anterior numeric;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS qtd_entrada numeric;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS custo_entrada numeric;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS novo_custo_medio numeric;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS impacto_pct numeric;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS documento_ref text;
ALTER TABLE historico_custo ADD COLUMN IF NOT EXISTS data timestamptz DEFAULT now();

-- ── 11. TABELA: item_classificacoes ─────────────────────────
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 12. TABELA: lojas ────────────────────────────────────────
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 13. TABELA: grupos_compra ────────────────────────────────
ALTER TABLE grupos_compra ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_compra ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE grupos_compra ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 14. TABELA: grupos_compra_itens ─────────────────────────
ALTER TABLE grupos_compra_itens ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_compra_itens ADD COLUMN IF NOT EXISTS grupo_id uuid;
ALTER TABLE grupos_compra_itens ADD COLUMN IF NOT EXISTS insumo_id uuid;

-- ── 15. TABELA: pedidos_compra ───────────────────────────────
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS status text DEFAULT 'rascunho';
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 16. TABELA: itens_pedido ─────────────────────────────────
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS pedido_id uuid;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS preco_unitario numeric;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS observacao text;

-- ── 17. TABELA: testes_rendimento ───────────────────────────
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS peso_bruto numeric;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS peso_liquido numeric;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS rendimento_pct numeric;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 18. TABELA: inventarios ──────────────────────────────────
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS grupo_id uuid;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo';
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'mensal';
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 19. TABELA: inventario_itens ────────────────────────────
ALTER TABLE inventario_itens ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE inventario_itens ADD COLUMN IF NOT EXISTS inventario_id uuid;
ALTER TABLE inventario_itens ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE inventario_itens ADD COLUMN IF NOT EXISTS qtd_contada numeric DEFAULT 0;
ALTER TABLE inventario_itens ADD COLUMN IF NOT EXISTS custo_medio numeric;

-- ── 20. TABELA: grupos_inventario ───────────────────────────
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'mensal';
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 21. TABELA: grupos_inventario_itens ─────────────────────
ALTER TABLE grupos_inventario_itens ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_inventario_itens ADD COLUMN IF NOT EXISTS grupo_id uuid;
ALTER TABLE grupos_inventario_itens ADD COLUMN IF NOT EXISTS insumo_id uuid;

-- ── 22. TABELA: categorias ───────────────────────────────────
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 23. TABELA: unidades_medida ──────────────────────────────
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS abreviacao text;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 24. TABELA: motivos_perda ────────────────────────────────
ALTER TABLE motivos_perda ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE motivos_perda ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE motivos_perda ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 25. TABELA: perdas ───────────────────────────────────────
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS motivo_id uuid;
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS data_perda date;
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS solicitante_id uuid;
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente';
ALTER TABLE perdas ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 26. TABELA: perdas_itens ─────────────────────────────────
ALTER TABLE perdas_itens ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE perdas_itens ADD COLUMN IF NOT EXISTS perda_id uuid;
ALTER TABLE perdas_itens ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE perdas_itens ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE perdas_itens ADD COLUMN IF NOT EXISTS custo_unitario numeric;
ALTER TABLE perdas_itens ADD COLUMN IF NOT EXISTS observacao text;

-- ── 27. TABELA: usuarios ─────────────────────────────────────
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS role text DEFAULT 'operador';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil text DEFAULT 'operador';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 28. TABELA: grupos_acesso ────────────────────────────────
ALTER TABLE grupos_acesso ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_acesso ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE grupos_acesso ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 29. TABELA: permissoes ───────────────────────────────────
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS grupo_id uuid;
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS modulo text;
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS acao text;
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS permitido boolean DEFAULT false;

-- ── 30. TABELA: parametros ───────────────────────────────────
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS modulo text;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS chave text;
ALTER TABLE parametros ADD COLUMN IF NOT EXISTS valor text;

-- ── 31. TABELA: faturamento ──────────────────────────────────
ALTER TABLE faturamento ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE faturamento ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE faturamento ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE faturamento ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0;
ALTER TABLE faturamento ADD COLUMN IF NOT EXISTS valor_total numeric DEFAULT 0;

-- ── 32. TABELA: vendas_item ──────────────────────────────────
ALTER TABLE vendas_item ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE vendas_item ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE vendas_item ADD COLUMN IF NOT EXISTS ficha_id uuid;
ALTER TABLE vendas_item ADD COLUMN IF NOT EXISTS produto_id uuid;
ALTER TABLE vendas_item ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE vendas_item ADD COLUMN IF NOT EXISTS quantidade numeric DEFAULT 0;
ALTER TABLE vendas_item ADD COLUMN IF NOT EXISTS valor_total numeric DEFAULT 0;

-- ── 33. TABELA: pcp_producao ─────────────────────────────────
ALTER TABLE pcp_producao ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE pcp_producao ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE pcp_producao ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE pcp_producao ADD COLUMN IF NOT EXISTS turno text;
ALTER TABLE pcp_producao ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE pcp_producao ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE pcp_producao ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ── 34. TABELA: pcp_sobras ───────────────────────────────────
ALTER TABLE pcp_sobras ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE pcp_sobras ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE pcp_sobras ADD COLUMN IF NOT EXISTS data date;
ALTER TABLE pcp_sobras ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE pcp_sobras ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE pcp_sobras ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ── 35. TABELA: vinculos_nfe ─────────────────────────────────
ALTER TABLE vinculos_nfe ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE vinculos_nfe ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE vinculos_nfe ADD COLUMN IF NOT EXISTS descricao_nfe text;
ALTER TABLE vinculos_nfe ADD COLUMN IF NOT EXISTS cnpj_fornecedor text;
ALTER TABLE vinculos_nfe ADD COLUMN IF NOT EXISTS unidade_nfe text;
ALTER TABLE vinculos_nfe ADD COLUMN IF NOT EXISTS fator_conversao numeric DEFAULT 1;
ALTER TABLE vinculos_nfe ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 36. DADOS PADRÃO — unidades de medida ───────────────────
INSERT INTO unidades_medida (tenant_id, nome, abreviacao, ativo)
VALUES
  ('TENANT_ID_AQUI', 'Quilograma', 'kg', true),
  ('TENANT_ID_AQUI', 'Grama', 'g', true),
  ('TENANT_ID_AQUI', 'Litro', 'litro', true),
  ('TENANT_ID_AQUI', 'Mililitro', 'ml', true),
  ('TENANT_ID_AQUI', 'Unidade', 'un', true)
ON CONFLICT DO NOTHING;

-- ── 37. DADOS PADRÃO — categorias de insumo ─────────────────
INSERT INTO categorias (tenant_id, nome, tipo, ativo)
VALUES
  ('TENANT_ID_AQUI', 'Proteínas', 'insumo', true),
  ('TENANT_ID_AQUI', 'Hortifruti', 'insumo', true),
  ('TENANT_ID_AQUI', 'Bebidas', 'insumo', true),
  ('TENANT_ID_AQUI', 'Descartáveis', 'insumo', true),
  ('TENANT_ID_AQUI', 'Outros', 'insumo', true)
ON CONFLICT DO NOTHING;

-- ── 38. DADOS PADRÃO — loja principal ───────────────────────
INSERT INTO lojas (tenant_id, nome, ativo)
VALUES ('TENANT_ID_AQUI', 'NOME_EMPRESA', true)
ON CONFLICT DO NOTHING;

-- ── 39. RECARREGAR CACHE DO POSTGREST ────────────────────────
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIM DO SCRIPT v2.0
-- Tabelas cobertas: 35
-- Após executar, verifique:
--   SELECT * FROM tenants WHERE id = 'TENANT_ID_AQUI';
--   SELECT * FROM lojas WHERE tenant_id = 'TENANT_ID_AQUI';
-- ============================================================
