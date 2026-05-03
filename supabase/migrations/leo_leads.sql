-- Zyreo Ecosystem: Leo (Demand Generation Agent)
-- Table for managing leads and qualification status

CREATE TYPE lead_status AS ENUM (
    'novo', 
    'em_qualificacao', 
    'qualificado', 
    'passado_sofia', 
    'convertido', 
    'perdido'
);

CREATE TYPE lead_origem AS ENUM (
    'instagram_comentario', 
    'instagram_dm', 
    'meta_ads', 
    'direto_whatsapp', 
    'outro'
);

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    instagram_username TEXT,
    origem lead_origem DEFAULT 'outro',
    plataforma TEXT CHECK (plataforma IN ('instagram', 'whatsapp')),
    status lead_status DEFAULT 'novo',
    score_qualificacao INTEGER DEFAULT 0,
    interesse TEXT,
    orcamento TEXT,
    interacoes_instagram INTEGER DEFAULT 0,
    data_passagem_sofia TIMESTAMPTZ,
    feedback_sofia TEXT,
    campanha_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Simple policy for admin access
CREATE POLICY "Admin full access to leads" ON leads
    FOR ALL USING (true); -- In a production environment, this would check for admin role

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score_qualificacao);
