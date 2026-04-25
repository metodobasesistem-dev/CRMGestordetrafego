import { supabaseAdmin } from './supabase-admin';

export async function auditLog({
  action,
  entityType,
  entityId,
  details,
  req,
  userId
}: {
  action: string;
  entityType?: string;
  entityId?: string;
  details?: any;
  req?: any;
  userId?: string;
}) {
  try {
    // Captura metadados da requisição se disponível
    const ip = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress;
    const userAgent = req?.headers?.['user-agent'];

    // Tenta inserir o log, mas não usa 'await' para não travar a resposta principal
    // Além disso, usamos um bloco try/catch isolado
    supabaseAdmin.from('audit_logs').insert([{
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      user_id: userId || 'system',
      ip_address: typeof ip === 'string' ? ip : JSON.stringify(ip),
      user_agent: userAgent,
      timestamp: new Date().toISOString()
    }]).then(({ error }) => {
      if (error) {
        // Apenas logamos no console do servidor, sem interromper nada para o usuário
        console.warn(`[Audit] Falha silenciosa ao registrar log: ${error.message}`);
      }
    });

  } catch (err) {
    // Se até a tentativa de logar falhar, o sistema principal NUNCA deve saber disso
    console.error('[Audit] Erro crítico no sistema de auditoria (ignorado):', err);
  }
}
