-- ================================================================
-- Módulo Fiscal — Migração de tabelas
-- Aplicar no Supabase Dashboard > SQL Editor
-- ================================================================

-- 1. MAPEAMENTO FORNECEDOR → INSUMO (persistente por fornecedor)
-- ⚠️ LEGADO / NÃO USADA. O vínculo item↔insumo por fornecedor em produção vive em
-- `insumo_fornecedores` (é pra lá que nfe_itens.vinculacao_id aponta). Esta tabela
-- ficou de uma versão anterior; mantida só por compatibilidade histórica.
CREATE TABLE IF NOT EXISTS fornecedor_produto_vinculado (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL,
  cnpj_fornecedor         text NOT NULL,
  descricao_nfe           text NOT NULL,           -- descrição exata como vem na NF-e
  codigo_item_fornecedor  text,                    -- SKU/código do fornecedor (opcional, melhora o auto-match)
  insumo_id               uuid REFERENCES insumos(id) ON DELETE SET NULL,
  descricao_embalagem     text,                    -- ex: "CAIXA 20x900ml"
  fator_conversao         numeric(12,6) NOT NULL DEFAULT 1,  -- 1 embalagem NF = X unidades estoque
  unidade_estoque         text NOT NULL DEFAULT 'kg',        -- kg, litro, un, ml, g
  atualizar_preco_auto    boolean NOT NULL DEFAULT true,     -- atualizar preco_compra do insumo ao processar
  embalagem_padrao        boolean NOT NULL DEFAULT true,
  ativo                   boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Garante unicidade: mesmo fornecedor + mesma descrição NF-e = um único mapeamento por tenant
CREATE UNIQUE INDEX IF NOT EXISTS fornecedor_produto_vinculado_unique
  ON fornecedor_produto_vinculado(tenant_id, cnpj_fornecedor, descricao_nfe);

-- 2. NF-E RECEBIDAS (cabeçalho da nota)
CREATE TABLE IF NOT EXISTS nfe_recebidas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  numero           text NOT NULL,
  serie            text NOT NULL DEFAULT '1',
  chave_acesso     text,
  cnpj_emitente    text NOT NULL,
  nome_emitente    text NOT NULL,
  data_emissao     timestamptz NOT NULL,
  data_integracao  timestamptz NOT NULL DEFAULT now(),
  valor_total      numeric(12,2) NOT NULL DEFAULT 0,
  valor_titulo     numeric(12,2),
  data_vencimento  date,
  portador         text,
  status           text NOT NULL DEFAULT 'pendente'
                   CHECK (status IN (
                     'pendente',
                     'em_transito',
                     'aguard_vinculacao',
                     'pronta',
                     'processada',
                     'com_erro',
                     'recusada',
                     'cancelada'
                   )),
  fonte            text NOT NULL DEFAULT 'upload'
                   CHECK (fonte IN ('upload', 'webhook', 'manual')),
  xml_content      text,
  processada_por   uuid,
  processada_em    timestamptz,
  observacoes      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nfe_recebidas_chave_acesso_unique
  ON nfe_recebidas(chave_acesso) WHERE chave_acesso IS NOT NULL;

-- 3. ITENS DA NF-E
CREATE TABLE IF NOT EXISTS nfe_itens (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nfe_id                  uuid NOT NULL REFERENCES nfe_recebidas(id) ON DELETE CASCADE,
  tenant_id               uuid NOT NULL,
  descricao_nfe           text NOT NULL,
  codigo_item_fornecedor  text,
  quantidade              numeric(12,4) NOT NULL,
  unidade_nfe             text NOT NULL,
  valor_unitario          numeric(12,4) NOT NULL DEFAULT 0,
  valor_total             numeric(12,2) NOT NULL DEFAULT 0,
  -- vinculacao_id aponta pra insumo_fornecedores(id) (vínculo item↔insumo por fornecedor).
  -- Coluna uuid SEM FK rígida de propósito: em produção referencia insumo_fornecedores;
  -- não colocamos constraint pra não travar pela ordem de criação das tabelas no
  -- provisionamento de um tenant novo. Integridade garantida pelo app + RLS.
  vinculacao_id           uuid,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- 4. LOG DE AUDITORIA FISCAL
CREATE TABLE IF NOT EXISTS nfe_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  nfe_id      uuid REFERENCES nfe_recebidas(id) ON DELETE SET NULL,
  usuario_id  uuid,
  acao        text NOT NULL
              CHECK (acao IN ('importacao','vinculacao','alt_conversao','processamento','erro','rejeicao')),
  descricao   text NOT NULL,
  dados_ant   jsonb,
  dados_novo  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ÍNDICES DE PERFORMANCE ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_nfe_recebidas_tenant_status  ON nfe_recebidas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_nfe_recebidas_cnpj           ON nfe_recebidas(tenant_id, cnpj_emitente);
CREATE INDEX IF NOT EXISTS idx_nfe_recebidas_data           ON nfe_recebidas(tenant_id, data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_nfe_itens_nfe_id             ON nfe_itens(nfe_id);
CREATE INDEX IF NOT EXISTS idx_nfe_itens_vinculacao         ON nfe_itens(vinculacao_id);
CREATE INDEX IF NOT EXISTS idx_nfe_log_nfe_id               ON nfe_log(nfe_id);
CREATE INDEX IF NOT EXISTS idx_fornec_vinc_tenant_cnpj      ON fornecedor_produto_vinculado(tenant_id, cnpj_fornecedor);
