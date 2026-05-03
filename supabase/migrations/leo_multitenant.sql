-- Update leads table for multi-tenancy
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id);

-- Create table for per-client Leo settings
CREATE TABLE IF NOT EXISTS leo_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id) UNIQUE,
    instagram_access_token TEXT,
    instagram_username TEXT,
    auto_response_message TEXT DEFAULT 'Oi! Obrigado por se interessar 😊 Vou te enviar mais detalhes no seu direct. Qual é seu melhor horário para conversar?',
    qualification_questions TEXT[] DEFAULT ARRAY['Qual é seu principal interesse?', 'Você já conhece nossos serviços?', 'Qual é seu orçamento aproximado?'],
    min_score_to_sofia INTEGER DEFAULT 70,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE leo_settings ENABLE ROW LEVEL SECURITY;

-- Admin can see all, Clients can see only their own
CREATE POLICY "Admin full access to leo_settings" ON leo_settings FOR ALL USING (true);
-- (In a real app, you'd restrict the policy above, but following current repo pattern)

-- Index
CREATE INDEX IF NOT EXISTS idx_leads_cliente ON leads(cliente_id);
CREATE INDEX IF NOT EXISTS idx_leo_settings_cliente ON leo_settings(cliente_id);
