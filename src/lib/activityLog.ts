import { supabase } from '../lib/supabase';

/**
 * Registra uma ação no log de atividades do sistema.
 * Chamado silenciosamente após operações de CRUD.
 */
export async function logActivity(params: {
  userId: string;
  action: 'create' | 'update' | 'delete';
  entity: 'task' | 'note' | 'client';
  entityId: string;
  entityName: string;
  metadata?: Record<string, any>;
}) {
  try {
    await supabase.from('activity_logs').insert([{
      user_id: params.userId,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId,
      entity_name: params.entityName,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    }]);
  } catch (err) {
    // Falha silenciosa — log não deve impedir a operação principal
    console.warn('[ActivityLog] Failed to log activity:', err);
  }
}
