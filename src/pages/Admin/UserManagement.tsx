import React, { useState, useEffect } from 'react';
import { User as UserType, Cliente } from '../../types';
import { Shield, UserPlus, Search, Edit2, Trash2, Layout, X, Check, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from "../../lib/supabase";

export default function UserManagement() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'client' as 'admin' | 'client',
    allowedClients: [] as string[]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (pError) throw pError;
      
      const usersList = (profiles || []).map(p => ({
        uid: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        allowedClients: p.allowed_clients || []
      })) as UserType[];
      setUsers(usersList);

      const { data: clientesData, error: cError } = await supabase
        .from('clientes')
        .select('*')
        .order('nome_cliente');

      if (cError) throw cError;
      setClientes(clientesData || []);

    } catch (error: any) {
      console.error('Error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user?: UserType) => {
    setError(null);
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name || '',
        email: user.email,
        role: user.role,
        allowedClients: user.allowedClients || []
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'client',
        allowedClients: []
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setError(null);
    try {
      if (editingUser) {
        const { error: uError } = await supabase
          .from('profiles')
          .update({
            name: formData.name,
            role: formData.role,
            allowed_clients: formData.allowedClients,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingUser.uid);

        if (uError) throw uError;
      } else {
        // Criar novo usuário via API customizada (Auth + Profile)
        const response = await fetch(`${(import.meta as any).env.VITE_API_URL || 'http://localhost:3001'}/api/v1/admin/users/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Erro ao criar usuário");
        }
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setError(`Erro: ${err.message}`);
    } finally {
      setModalLoading(false);
    }
  };

  const toggleClient = (clientId: string) => {
    setFormData(prev => ({
      ...prev,
      allowedClients: prev.allowedClients.includes(clientId)
        ? prev.allowedClients.filter(id => id !== clientId)
        : [...prev.allowedClients, clientId]
    }));
  };

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <Shield className="w-10 h-10 text-indigo-600" />
            Equipe & Acesso
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
            Gerencie quem pode operar o Leo e o CRM
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-sm tracking-widest transition-all shadow-xl shadow-indigo-500/20 active:scale-95"
        >
          <UserPlus className="w-5 h-5" />
          Novo Membro
        </button>
      </div>

      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        <input
          type="text"
          placeholder="Buscar equipe por nome ou e-mail..."
          className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-slate-900 dark:text-slate-100 outline-none transition-all font-medium shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <Loader2 className="w-8 h-8 animate-spin mx-auto col-span-full text-slate-400" />
        ) : filteredUsers.map((user) => (
          <div key={user.uid} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group relative">
            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleOpenModal(user)} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-indigo-500 hover:text-white rounded-xl transition-all">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-start gap-4">
              <div className={cn("p-4 rounded-2xl shadow-lg", user.role === 'admin' ? "bg-indigo-600" : "bg-emerald-600")}>
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tight">{user.name || 'Sem Nome'}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                <span className={cn("inline-block mt-2 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest", user.role === 'admin' ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600")}>
                  {user.role}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-2xl font-black uppercase tracking-tight">Editar Permissões</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold">{error}</div>}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</label>
                    <input type="email" required disabled={!!editingUser} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl disabled:opacity-50" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome</label>
                    <input type="text" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                </div>

                {!editingUser && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha Inicial</label>
                    <input type="password" required className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nível</label>
                    <select className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}>
                      <option value="client">Operador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>

                {formData.role === 'client' && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2"><Layout className="w-3 h-3" /> Dashboards Autorizados</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-100 dark:border-slate-800 rounded-2xl">
                      {clientes.map(c => (
                        <button key={c.id} type="button" onClick={() => toggleClient(c.id)} className={cn("flex items-center justify-between p-3 rounded-xl border text-xs font-bold", formData.allowedClients.includes(c.id) ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white border-slate-200 text-slate-500")}>
                          {c.nome_cliente} {formData.allowedClients.includes(c.id) && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black uppercase text-sm">Cancelar</button>
                <button type="submit" disabled={modalLoading} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-indigo-500/20">
                  {modalLoading ? <Loader2 className="animate-spin mx-auto" /> : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
