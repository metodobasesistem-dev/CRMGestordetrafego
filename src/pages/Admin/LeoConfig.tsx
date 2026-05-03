import React, { useState, useEffect } from 'react';
import { Zap, Instagram, MessageSquare, Target, Settings, Save, Power, RefreshCw, Send, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { Cliente } from "../../types";

export default function LeoConfig() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  
  const [config, setConfig] = useState({
    minScore: 70,
    autoResponse: "Oi! Obrigado por se interessar 😊 Vou te enviar mais detalhes no seu direct. Qual é seu melhor horário para conversar?",
    qualificationQuestions: [
      "Qual é seu principal interesse?",
      "Você já conhece nossos serviços?",
      "Qual é seu orçamento aproximado?"
    ]
  });

  useEffect(() => {
    if (user) {
      if (user.role === 'admin') {
        fetchClientes();
      } else {
        const client_id = user.allowedClients?.[0];
        if (client_id) {
          setSelectedClientId(client_id);
          fetchSettings(client_id);
        }
      }
    }
  }, [user]);

  const fetchClientes = async () => {
    const { data } = await supabase.from('clientes').select('id, nome_cliente');
    setClientes(data || []);
  };

  const fetchSettings = async (clientId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leo_settings')
        .select('*')
        .eq('cliente_id', clientId)
        .single();

      if (data) {
        setConfig({
          minScore: data.min_score_to_sofia,
          autoResponse: data.auto_response_message,
          qualificationQuestions: data.qualification_questions
        });
        setIsConnected(!!data.instagram_access_token);
      } else {
        // Default config if none exists
        setConfig({
          minScore: 70,
          autoResponse: "Oi! Obrigado por se interessar 😊 Vou te enviar mais detalhes no seu direct. Qual é seu melhor horário para conversar?",
          qualificationQuestions: ["Qual é seu principal interesse?", "Você já conhece nossos serviços?", "Qual é seu orçamento aproximado?"]
        });
        setIsConnected(false);
      }
    } catch (error) {
      console.error("Erro ao carregar settings do Leo:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedClientId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('leo_settings')
        .upsert({
          cliente_id: selectedClientId,
          min_score_to_sofia: config.minScore,
          auto_response_message: config.autoResponse,
          qualification_questions: config.qualificationQuestions,
          updated_at: new Date().toISOString()
        }, { onConflict: 'cliente_id' });

      if (error) throw error;
      alert("Configurações salvas com sucesso!");
    } catch (error: any) {
      alert("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !clientes.length && user?.role === 'admin') {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  }

  const handleConnect = () => {
    setLoading(true);
    // Simular abertura de popup OAuth
    setTimeout(() => {
      setIsConnected(true);
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/20">
          <Settings className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Painel do Leo</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Configure o agente de demanda do ecossistema Zyreo</p>
        </div>
      </div>

      {user?.role === 'admin' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm mb-8">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Gerenciar Configurações do Cliente:</label>
          <select 
            className="w-full md:w-1/3 px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 font-bold focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              if (e.target.value) fetchSettings(e.target.value);
            }}
          >
            <option value="">Selecione um cliente...</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nome_cliente}</option>
            ))}
          </select>
        </div>
      )}

      {(!selectedClientId && user?.role === 'admin') ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
          <Target className="w-16 h-16 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
          <h3 className="text-xl font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Selecione um cliente para configurar o Leo</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Instagram Connection */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-6">
              <Instagram className="w-5 h-5 text-pink-500" />
              Conexão Instagram
            </h3>
            
            {isConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold">
                    IG
                  </div>
                  <div>
                    <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">@zyreo_oficial</p>
                    <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-widest">Conectado</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsConnected(false)}
                  className="w-full py-3 text-rose-600 text-xs font-black uppercase tracking-widest hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-xl transition-all"
                >
                  Desconectar Conta
                </button>
              </div>
            ) : (
              <div className="text-center space-y-4 py-4">
                <p className="text-sm text-slate-500 font-medium">Conecte sua conta do Instagram para o Leo começar a monitorar comentários e DMs.</p>
                <button 
                  onClick={handleConnect}
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-tr from-purple-600 via-pink-600 to-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-pink-500/20 flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Instagram className="w-5 h-5" />}
                  Conectar Instagram
                </button>
              </div>
            )}
          </div>

          <div className="bg-amber-500 rounded-3xl p-6 text-white shadow-xl shadow-amber-500/20">
            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5" />
              Status do Leo
            </h3>
            <p className="text-amber-100 text-sm font-medium mb-6">O agente está operando normalmente e monitorando 15 campanhas ativas.</p>
            <div className="flex items-center justify-between p-3 bg-white/10 rounded-2xl backdrop-blur-sm">
              <span className="text-xs font-bold uppercase tracking-widest">Modo Autônomo</span>
              <div className="w-12 h-6 bg-emerald-400 rounded-full relative">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Messaging & Qualification Config */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3 mb-8">
              <MessageSquare className="w-6 h-6 text-indigo-500" />
              Automação de Conversas
            </h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Mensagem de Resposta Inicial (Direct)</label>
                <textarea 
                  rows={3}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 font-medium resize-none focus:ring-4 focus:ring-amber-500/10 transition-all"
                  value={config.autoResponse}
                  onChange={(e) => setConfig({ ...config, autoResponse: e.target.value })}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Fluxo de Qualificação</label>
                  <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">+ Adicionar Pergunta</button>
                </div>
                {config.qualificationQuestions.map((q, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-xs font-bold text-slate-500">
                      {i + 1}
                    </div>
                    <input 
                      type="text" 
                      className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium"
                      value={q}
                      onChange={(e) => {
                        const newQ = [...config.qualificationQuestions];
                        newQ[i] = e.target.value;
                        setConfig({ ...config, qualificationQuestions: newQ });
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-500" />
                    Regra de Passagem
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase">
                      <span>Score Mínimo para Sofia</span>
                      <span className="text-emerald-500">{config.minScore} pts</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="90" 
                      step="5"
                      className="w-full accent-emerald-500"
                      value={config.minScore}
                      onChange={(e) => setConfig({ ...config, minScore: parseInt(e.target.value) })}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 italic">Leads com score acima de {config.minScore} serão enviados automaticamente para o atendimento humano no WhatsApp (Sofia).</p>
                </div>

                <div className="flex items-end">
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Salvar Configurações
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <Zap className="w-32 h-32 text-amber-500" />
            </div>
            <div className="relative z-10 space-y-4">
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Status da Sofia (Atendimento)</h3>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-bold uppercase tracking-widest">Sofia está Online</span>
              </div>
              <p className="text-slate-400 text-sm max-w-md">Sofia recebeu 12 leads qualificados pelo Leo hoje. Taxa de conversão atual de 25%.</p>
              <button className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                Ver Métricas da Sofia
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
