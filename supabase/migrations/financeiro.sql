-- ============================================================
-- MÓDULO FINANCEIRO — Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Contratos por cliente (valor base mensal)
CREATE TABLE IF NOT EXISTS contratos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES profiles(id),
  valor_mensal    NUMERIC(10,2) NOT NULL DEFAULT 0,
  dia_vencimento  INT NOT NULL DEFAULT 10,
  data_inicio     DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim        DATE,
  status          TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'encerrado')),
  descricao       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Pagamentos recebidos (receitas de cada cliente)
CREATE TABLE IF NOT EXISTS pagamentos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id       UUID REFERENCES contratos(id) ON DELETE SET NULL,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES profiles(id),
  valor             NUMERIC(10,2) NOT NULL,
  mes_referencia    DATE NOT NULL,          -- Primeiro dia do mês: 2025-04-01
  data_vencimento   DATE NOT NULL,
  data_pagamento    DATE,                   -- NULL = não pago ainda
  status            TEXT DEFAULT 'pendente'
    CHECK (status IN ('pago', 'pendente', 'atrasado', 'cancelado')),
  metodo_pagamento  TEXT DEFAULT 'pix',
  observacao        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Despesas / Custos operacionais
CREATE TABLE IF NOT EXISTS despesas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id),
  descricao       TEXT NOT NULL,
  valor           NUMERIC(10,2) NOT NULL,
  categoria       TEXT DEFAULT 'outros'
    CHECK (categoria IN ('ferramentas', 'marketing', 'freelancer', 'infraestrutura', 'impostos', 'outros')),
  data_despesa    DATE NOT NULL DEFAULT CURRENT_DATE,
  mes_referencia  DATE NOT NULL,
  recorrente      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS (Segurança: cada usuário vê só seus dados)
-- ============================================================
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contratos"  ON contratos  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users manage own pagamentos" ON pagamentos FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users manage own despesas"   ON despesas   FOR ALL USING (user_id = auth.uid());
