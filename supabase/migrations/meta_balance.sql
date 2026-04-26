-- Adicionar colunas de saldo e limite à tabela meta_ads_accounts
ALTER TABLE meta_ads_accounts 
ADD COLUMN IF NOT EXISTS balance NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL',
ADD COLUMN IF NOT EXISTS balance_threshold NUMERIC(15,2) DEFAULT 100;

-- Comentário para documentação
COMMENT ON COLUMN meta_ads_accounts.balance IS 'Saldo atual da conta de anúncios (obtido via API)';
COMMENT ON COLUMN meta_ads_accounts.balance_threshold IS 'Limite mínimo para disparar alerta de saldo baixo';
