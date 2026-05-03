import React, { useState, useEffect } from 'react';
import { Lead, LeadStatus, LeadOrigem } from '../../types';
import { Zap, UserPlus, Search, Edit2, Trash2, Filter, MessageSquare, Instagram, ExternalLink, Loader2, X, Check, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from "../../lib/supabase";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function LeadsManagement() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    instagram_username: '',
    origem: 'outro' as LeadOrigem,
    plataforma: 'instagram' as 'instagram' | 'whatsapp',
    status: 'novo' as LeadStatus,
    score_qualificacao: 0,
    interesse: '',
    orcamento: ''
  });

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data, error: lError } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (lError) throw lError;
      setLeads(data || []);
    } catch (error: any) {
      console.error('Error fetching leads:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (lead?: Lead) => {
    setError(null);
    if (lead) {
      setEditingLead(lead);
      setFormData({
        nome: lead.nome,
        email: lead.email || '',
        telefone: lead.telefone || '',
        instagram_username: lead.instagram_username || '',
        origem: lead.origem,
        plataforma: lead.plataforma,
        status: lead.status,
        score_qualificacao: lead.score_qualificacao,
        interesse: lead.interesse || '',
        orcamento: lead.orcamento || ''
      });
    } else {
      setEditingLead(null);
      setFormData({
        nome: '',
        email: '',
        telefone: '',
        instagram_username: '',
        origem: 'outro',
        plataforma: 'instagram',
        status: 'novo',
        score_qualificacao: 0,
        interesse: '',
        orcamento: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        updated_at: new Date().toISOString()
      };

      if (editingLead) {
        const { error: uError } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', editingLead.id);

        if (uError) throw uError;
      } else {
        const { error: iError } = await supabase
          .from('leads')
          .insert([{ ...payload, created_at: new Date().toISOString() }]);

        if (iError) throw iError;
      }
      setIsModalOpen(false);
      fetchLeads();
    } catch (err: any) {
      console.error('Error saving lead:', err);
      setError(`Erro ao salvar lead: ${err.message}`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteClick = (lead: Lead) => {
    setError(null);
    setLeadToDelete(lead);
  };

  const confirmDelete = async () => {
    if (!leadToDelete) return;
    setModalLoading(true);
    try {
      const { error: dError } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadToDelete.id);

      if (dError) throw dError;
      
      setLeadToDelete(null);
      fetchLeads();
    } catch (err: any) {
      console.error('Error deleting lead:', err);
      setError(`Erro ao excluir lead: ${err.message}`);
    } finally {
      setModalLoading(false);
    }
  };

  const filteredLeads = leads.filter(lead => 
    lead.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.instagram_username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case 'novo': return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
      case 'em_qualificacao': return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
      case 'qualificado': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'passado_sofia': return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'convertido': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
      case 'perdido': return 'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-rose-500';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/20">
              <Zap className="w-8 h-8 text-white" />
            </div>
            Leo - Leads
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
            Geração de demanda e qualificação inteligente (Zyreo Eco)
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-amber-500/20 uppercase tracking-widest"
        >
          <UserPlus className="w-5 h-5" />
          Novo Lead
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
          <input
            type="text"
            placeholder="Buscar leads por nome, e-mail ou instagram..."
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center justify-center gap-2 px-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-600 dark:text-slate-400 font-bold hover:border-amber-500 transition-all shadow-sm">
          <Filter className="w-5 h-5" />
          Filtros
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lead / Contato</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Origem / Plataforma</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Leo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Score IA</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Última Interação</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full w-full" /></td>
                  </tr>
                ))
              ) : filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-slate-500 uppercase">
                          {lead.nome.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-tight">{lead.nome}</p>
                          <p className="text-[10px] text-slate-500 font-medium">{lead.email || lead.telefone || 'Sem contato'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                          {lead.plataforma === 'instagram' ? <Instagram className="w-3 h-3 text-pink-500" /> : <MessageSquare className="w-3 h-3 text-emerald-500" />}
                          {lead.plataforma}
                        </span>
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-medium">{lead.origem.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest", getStatusColor(lead.status))}>
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={cn("text-lg font-black", getScoreColor(lead.score_qualificacao))}>
                          {lead.score_qualificacao}
                        </span>
                        <div className="w-12 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div className={cn("h-full rounded-full", lead.score_qualificacao >= 70 ? "bg-emerald-500" : lead.score_qualificacao >= 40 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${lead.score_qualificacao}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {format(new Date(lead.updated_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {lead.status === 'qualificado' && (
                          <button className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all shadow-sm border border-indigo-100 dark:border-indigo-900/30" title="Passar para Sofia">
                            <TrendingUp className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleOpenModal(lead)} className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteClick(lead)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <Zap className="w-16 h-16 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                    <h3 className="text-xl font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Nenhum lead encontrado</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                <Zap className="w-6 h-6 text-amber-500" />
                {editingLead ? 'Editar Lead' : 'Novo Lead'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {error && <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 dark:text-red-400 text-sm font-bold text-center">{error}</div>}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Nome Completo</label>
                  <input type="text" required className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">E-mail</label>
                  <input type="email" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Telefone / WhatsApp</label>
                  <input type="text" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Username Instagram</label>
                  <div className="relative">
                    <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium" value={formData.instagram_username} onChange={(e) => setFormData({ ...formData, instagram_username: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status de Qualificação</label>
                  <select className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadStatus })}>
                    <option value="novo">Novo</option>
                    <option value="em_qualificacao">Em Qualificação</option>
                    <option value="qualificado">Qualificado</option>
                    <option value="passado_sofia">Passado para Sofia</option>
                    <option value="convertido">Convertido</option>
                    <option value="perdido">Perdido</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Score de Qualificação (0-100)</label>
                  <input type="number" min="0" max="100" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium" value={formData.score_qualificacao} onChange={(e) => setFormData({ ...formData, score_qualificacao: parseInt(e.target.value) })} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Interesse / Necessidade</label>
                <textarea rows={2} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-medium resize-none" value={formData.interesse} onChange={(e) => setFormData({ ...formData, interesse: e.target.value })} placeholder="O que o lead busca?" />
              </div>

              <div className="flex gap-4 pt-4 bg-white dark:bg-slate-900 sticky bottom-0 border-t border-slate-100 dark:border-slate-800 py-4 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                <button type="submit" disabled={modalLoading} className="flex-1 px-6 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                  {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {leadToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-rose-600" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Excluir Lead?</h2>
              <p className="text-slate-500 dark:text-slate-400 font-medium mb-8">Tem certeza que deseja excluir o lead <span className="font-bold text-slate-900 dark:text-white">{leadToDelete.nome}</span>?</p>
              <div className="flex gap-4">
                <button onClick={() => setLeadToDelete(null)} className="flex-1 px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                <button onClick={confirmDelete} disabled={modalLoading} className="flex-1 px-6 py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-rose-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                  {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
