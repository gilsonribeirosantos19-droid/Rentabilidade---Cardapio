-- ============================================================
-- SCRIPT DE MIGRAÇÃO — NOVO TENANT
-- Sistema Aiko Gestão de Restaurante
-- ============================================================
-- INSTRUÇÕES:
-- 1. Substitua TENANT_ID_AQUI pelo UUID do novo tenant
-- 2. Substitua NOME_EMPRESA pelo nome da empresa
-- 3. Execute TODO o script de uma vez no SQL Editor do Supabase
-- ============================================================

-- ── 1. REGISTRAR O TENANT ────────────────────────────────────
INSERT INTO tenants (id, nome)
VALUES ('TENANT_ID_AQUI', 'NOME_EMPRESA')
ON CONFLICT (id) DO NOTHING;

-- ── 2. COLUNAS DA TABELA insumos ────────────────────────────
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

-- ── 3. COLUNAS DA TABELA fornecedores ───────────────────────
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

-- ── 4. COLUNAS DA TABELA insumo_fornecedores ────────────────
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

-- ── 5. COLUNAS DA TABELA fichas_tecnicas ────────────────────
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

-- ── 6. COLUNAS DA TABELA itens_ficha ────────────────────────
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS ficha_id uuid;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS quantidade_g numeric;
ALTER TABLE itens_ficha ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;

-- ── 7. COLUNAS DA TABELA entradas_estoque ───────────────────
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS custo_unitario numeric;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS custo_total numeric;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS documento_ref text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'manual';
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS fornecedor_nome text;
ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 8. COLUNAS DA TABELA saidas_estoque ─────────────────────
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS responsavel text;
ALTER TABLE saidas_estoque ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 9. COLUNAS DA TABELA saldo_estoque ──────────────────────
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS quantidade numeric DEFAULT 0;
ALTER TABLE saldo_estoque ADD COLUMN IF NOT EXISTS custo_medio numeric DEFAULT 0;

-- ── 10. COLUNAS DA TABELA item_classificacoes ───────────────
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE item_classificacoes ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 11. COLUNAS DA TABELA lojas ─────────────────────────────
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 12. COLUNAS DA TABELA grupos_compra ─────────────────────
ALTER TABLE grupos_compra ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_compra ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE grupos_compra ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 13. COLUNAS DA TABELA grupos_compra_itens ───────────────
ALTER TABLE grupos_compra_itens ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_compra_itens ADD COLUMN IF NOT EXISTS grupo_id uuid;
ALTER TABLE grupos_compra_itens ADD COLUMN IF NOT EXISTS insumo_id uuid;

-- ── 14. COLUNAS DA TABELA pedidos_compra ────────────────────
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS status text DEFAULT 'rascunho';
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE pedidos_compra ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 15. COLUNAS DA TABELA itens_pedido ──────────────────────
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS pedido_id uuid;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS quantidade numeric;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS preco_unitario numeric;
ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS observacao text;

-- ── 16. COLUNAS DA TABELA testes_rendimento ─────────────────
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS insumo_id uuid;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS peso_bruto numeric;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS peso_liquido numeric;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS rendimento_pct numeric;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE testes_rendimento ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 17. COLUNAS DA TABELA inventarios ───────────────────────
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS loja_id uuid;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS grupo_id uuid;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS status text DEFAULT 'ativo';
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'mensal';
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- ── 18. COLUNAS DA TABELA grupos_inventario ─────────────────
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'mensal';
ALTER TABLE grupos_inventario ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 19. COLUNAS DA TABELA grupos_inventario_itens ───────────
ALTER TABLE grupos_inventario_itens ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE grupos_inventario_itens ADD COLUMN IF NOT EXISTS grupo_id uuid;
ALTER TABLE grupos_inventario_itens ADD COLUMN IF NOT EXISTS insumo_id uuid;

-- ── 20. COLUNAS DA TABELA categorias ────────────────────────
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 21. COLUNAS DA TABELA unidades_medida ───────────────────
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS abreviacao text;
ALTER TABLE unidades_medida ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

-- ── 22. DADOS PADRÃO — unidades de medida ───────────────────
INSERT INTO unidades_medida (tenant_id, nome, abreviacao, ativo)
VALUES
  ('TENANT_ID_AQUI', 'Quilograma', 'kg', true),
  ('TENANT_ID_AQUI', 'Grama', 'g', true),
  ('TENANT_ID_AQUI', 'Litro', 'litro', true),
  ('TENANT_ID_AQUI', 'Mililitro', 'ml', true),
  ('TENANT_ID_AQUI', 'Unidade', 'un', true)
ON CONFLICT DO NOTHING;

-- ── 23. DADOS PADRÃO — categorias de insumo ─────────────────
INSERT INTO categorias (tenant_id, nome, tipo, ativo)
VALUES
  ('TENANT_ID_AQUI', 'Proteínas', 'insumo', true),
  ('TENANT_ID_AQUI', 'Hortifruti', 'insumo', true),
  ('TENANT_ID_AQUI', 'Bebidas', 'insumo', true),
  ('TENANT_ID_AQUI', 'Descartáveis', 'insumo', true),
  ('TENANT_ID_AQUI', 'Outros', 'insumo', true)
ON CONFLICT DO NOTHING;

-- ── 24. RECARREGAR CACHE DO POSTGREST ────────────────────────
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIM DO SCRIPT
-- Após executar, verifique se o tenant aparece em:
-- SELECT * FROM tenants WHERE id = 'TENANT_ID_AQUI';
-- ============================================================
