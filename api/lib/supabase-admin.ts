import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) console.error('❌ SUPABASE_URL não encontrada!');
if (!supabaseServiceKey) console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada!');

if (supabaseServiceKey) {
  console.log(`🔑 Service Key carregada (Inicia com: ${supabaseServiceKey.substring(0, 10)}...)`);
}

export const supabaseAdmin = createClient(
  supabaseUrl || '',
  supabaseServiceKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

console.log('⚡ Supabase Admin inicializado');
