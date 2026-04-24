import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { 
  CheckSquare, StickyNote, Users, Clock, 
  Activity, Filter, RefreshCw, Trash2, Edit2, Plus
} from "lucide-react";
import { cn } from "../../lib/utils";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { Skeleton } from "../../components/ui/Skeleton";

export interface ActivityLog {
  id: string;
  user_id: string;
  user_name?: string;
  action: 'create' | 'update' | 'delete';
  entity: 'task' | 'note' | 'client';
  entity_id: string;
  entity_name: string;
  metadata?: Record<string, any>;
  created_at: string;
}

const ENTITY_ICONS = {
  task: CheckSquare,
  note: StickyNote,
  client: Users,
};

const ENTITY_LABELS = {
  task: 'Tarefa',
  note: 'Anotação',
  client: 'Cliente',
};

const ACTION_CONFIGS = {
  create: { label: 'criou', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: Plus },
  update: { label: 'editou', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Edit2 },
  delete: { label: 'excluiu', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', icon: Trash2 },
};

export default function ActivityLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState<'all' | ActivityLog['entity']>('all');
  const [filterAction, setFilterAction] = useState<'all' | ActivityLog['action']>('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*, profiles(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error } = await query;
      if (error) throw error;

      const logsWithName = (data || []).map((log: any) => ({
        ...log,
        user_name: log.profiles?.name || 'Sistema',
      }));

      setLogs(logsWithName);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    const subscription = supabase
      .channel('activity-logs-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const filteredLogs = logs.filter(log => {
    const matchesEntity = filterEntity === 'all' || log.entity === filterEntity;
    const matchesAction = filterAction === 'all' || log.action === filterAction;
    return matchesEntity && matchesAction;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
              <Activity className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            Histórico de Atividades
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe todas as ações realizadas no sistema em tempo real.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-600 transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
          <Filter className="w-3.5 h-3.5" />
          Filtrar:
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'task', 'note', 'client'] as const).map(entity => (
            <button
              key={entity}
              onClick={() => setFilterEntity(entity)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                filterEntity === entity
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {entity === 'all' ? 'Todos' : ENTITY_LABELS[entity] + 's'}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 self-center hidden sm:block" />
        <div className="flex flex-wrap gap-2">
          {(['all', 'create', 'update', 'delete'] as const).map(action => (
            <button
              key={action}
              onClick={() => setFilterAction(action)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                filterAction === action
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {action === 'all' ? 'Todas ações' : action === 'create' ? 'Criação' : action === 'update' ? 'Edição' : 'Exclusão'}
            </button>
          ))}
        </div>
      </div>

      {/* Log Feed */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-start gap-4">
                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-full mb-4">
              <Activity className="w-10 h-10 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-base font-bold text-slate-900 dark:text-white">Nenhuma atividade encontrada</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              As ações realizadas no sistema aparecerão aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <AnimatePresence initial={false}>
              {filteredLogs.map((log, idx) => {
                const EntityIcon = ENTITY_ICONS[log.entity] || Activity;
                const actionConfig = ACTION_CONFIGS[log.action];
                const ActionIcon = actionConfig?.icon || Activity;

                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Entity Icon */}
                    <div className={cn("p-2.5 rounded-xl shrink-0 mt-0.5", actionConfig?.bg || 'bg-slate-50 dark:bg-slate-800')}>
                      <EntityIcon className={cn("w-4 h-4", actionConfig?.color || 'text-slate-500')} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {log.user_name}
                        </span>
                        {' '}
                        <span className={cn("font-semibold", actionConfig?.color)}>
                          {actionConfig?.label}
                        </span>
                        {' '}
                        <span className="text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wide">
                          {ENTITY_LABELS[log.entity]}
                        </span>
                        {': '}
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {log.entity_name}
                        </span>
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <time
                          className="text-xs text-slate-400 dark:text-slate-500"
                          title={format(parseISO(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        >
                          {formatDistanceToNow(parseISO(log.created_at), { addSuffix: true, locale: ptBR })}
                        </time>
                      </div>
                    </div>

                    {/* Action Badge */}
                    <div className={cn("px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0", actionConfig?.bg, actionConfig?.color)}>
                      {log.action === 'create' ? 'Novo' : log.action === 'update' ? 'Edit.' : 'Del.'}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
