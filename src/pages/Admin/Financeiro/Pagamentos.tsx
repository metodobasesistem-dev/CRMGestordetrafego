import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { formatCurrency } from "../../../lib/utils";
import { Plus, Search, X, CheckCircle2, Clock, AlertTriangle, Download, Filter, Trash2, Edit2, FileText } from "lucide-react";
import { cn } from "../../../lib/utils";
import { format, parseISO, isValid, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { Toast } from "../../../components/ui/Toast";

const STATUS_CONFIG = {
  pago:      { label: "Pago",     color: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
  pendente:  { label: "Pendente", color: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300", icon: Clock },
  atrasado:  { label: "Atrasado", color: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300", icon: AlertTriangle },
  cancelado: { label: "Cancelado", color: "bg-slate-100 dark:bg-slate-800 text-slate-500", icon: X },
};

const mesOptions = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
  return { value: format(d, "yyyy-MM"), label: format(d, "MMMM/yyyy", { locale: ptBR }) };
});

export default function Pagamentos() {
  const { user } = useAuth();
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMes, setFilterMes] = useState(format(new Date(), "yyyy-MM"));
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCliente, setFilterCliente] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const emptyForm = {
    cliente_id: "", valor: "", mes_referencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    data_vencimento: "", status: "pendente", metodo_pagamento: "pix", observacao: ""
  };
  const [form, setForm] = useState(emptyForm);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [p, c] = await Promise.all([
      supabase.from("pagamentos").select("*").order("data_vencimento", { ascending: false }),
      supabase.from("clientes").select("id, nome_cliente").order("nome_cliente"),
    ]);
    setPagamentos(p.data || []);
    setClientes(c.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const payload = {
        ...form,
        valor: parseFloat(form.valor),
        user_id: user.uid,
        mes_referencia: form.mes_referencia || format(startOfMonth(new Date()), "yyyy-MM-dd"),
        data_pagamento: form.status === "pago" ? (new Date().toISOString().split("T")[0]) : null,
      };
      if (editingId) {
        const { error } = await supabase.from("pagamentos").update(payload).eq("id", editingId);
        if (error) throw error;
        setToast({ message: "Pagamento atualizado!", type: "success" });
      } else {
        const { error } = await supabase.from("pagamentos").insert([payload]);
        if (error) throw error;
        setToast({ message: "Pagamento lançado!", type: "success" });
      }
      setIsModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      fetchData();
    } catch (err: any) {
      setToast({ message: "Erro ao salvar", type: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este pagamento?")) return;
    await supabase.from("pagamentos").delete().eq("id", id);
    setToast({ message: "Pagamento excluído.", type: "success" });
    fetchData();
  };

  const handleMarcarPago = async (p: any) => {
    await supabase.from("pagamentos").update({ status: "pago", data_pagamento: new Date().toISOString().split("T")[0] }).eq("id", p.id);
    setToast({ message: "Marcado como pago! ✓", type: "success" });
    fetchData();
  };

  const handleEdit = (p: any) => {
    setForm({ ...p, valor: String(p.valor), mes_referencia: p.mes_referencia?.split("T")[0] || "" });
    setEditingId(p.id);
    setIsModalOpen(true);
  };

  const filtered = pagamentos.filter(p => {
    const matchMes = !filterMes || p.mes_referencia?.startsWith(filterMes);
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchCliente = !filterCliente || p.cliente_id === filterCliente;
    return matchMes && matchStatus && matchCliente;
  });

  const nomeCliente = (id: string) => clientes.find(c => c.id === id)?.nome_cliente || "—";

  // CSV Export
  const exportCSV = () => {
    const rows = [["Cliente","Mês","Valor","Vencimento","Pagamento","Status","Método","Observação"],
      ...filtered.map(p => [
        nomeCliente(p.cliente_id), p.mes_referencia?.slice(0,7) || "", p.valor,
        p.data_vencimento || "", p.data_pagamento || "", p.status, p.metodo_pagamento || "", p.observacao || ""
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `pagamentos_${filterMes || "todos"}.csv`;
    a.click();
  };

  const exportPDF = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = filtered.map(p => `
      <tr>
        <td>${nomeCliente(p.cliente_id)}</td><td>${p.mes_referencia?.slice(0,7)||""}</td>
        <td>R$ ${Number(p.valor).toFixed(2).replace(".",",")}</td>
        <td>${p.data_vencimento||""}</td><td>${p.data_pagamento||"—"}</td>
        <td>${STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG]?.label||p.status}</td>
        <td>${p.metodo_pagamento||""}</td>
      </tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pagamentos</title>
    <style>body{font-family:sans-serif;padding:2rem}h1{color:#4f46e5;margin-bottom:1rem}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-size:13px}
    th{background:#f8fafc;font-weight:700;color:#475569}tr:nth-child(even){background:#f8fafc}
    @media print{body{padding:0}}</style></head><body>
    <h1>Relatório de Pagamentos</h1>
    <p style="color:#64748b;margin-bottom:1rem">Período: ${filterMes || "Todos"} · Gerado em: ${format(new Date(),"dd/MM/yyyy HH:mm")}</p>
    <table><thead><tr><th>Cliente</th><th>Mês</th><th>Valor</th><th>Vencimento</th><th>Pagamento</th><th>Status</th><th>Método</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pagamentos</h1>
          <p className="text-slate-500 dark:text-slate-400">Receitas dos clientes</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-all shrink-0", showFilters ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400")}>
            <Filter className="w-4 h-4"/> <span className="hidden sm:inline">Filtros</span>
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-sm font-bold hover:border-emerald-500 hover:text-emerald-600 transition-all shrink-0">
            <Download className="w-4 h-4"/> <span className="hidden sm:inline">CSV</span>
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-sm font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all shrink-0">
            <FileText className="w-4 h-4"/> <span className="hidden sm:inline">PDF</span>
          </button>
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-200 dark:shadow-none shrink-0">
            <Plus className="w-4 h-4"/> <span>Novo</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mês</label>
              <select value={filterMes} onChange={e => setFilterMes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Todos</option>
                {mesOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliente</label>
              <select value={filterCliente} onChange={e => setFilterCliente(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Todos</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome_cliente}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="all">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {/* Desktop View (Table) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {["Cliente","Mês Ref.","Valor","Vencimento","Pagamento","Status","Método","Ações"].map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                [1,2,3,4].map(i => <tr key={i}>{[1,2,3,4,5,6,7,8].map(j => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"/></td>)}</tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">Nenhum pagamento encontrado.</td></tr>
              ) : filtered.map(p => {
                const sc = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente;
                const StatusIcon = sc.icon;
                const venc = p.data_vencimento ? parseISO(p.data_vencimento) : null;
                const pag = p.data_pagamento ? parseISO(p.data_pagamento) : null;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs inline-flex mr-2">
                        {nomeCliente(p.cliente_id).charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{nomeCliente(p.cliente_id)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{p.mes_referencia?.slice(0,7) || "—"}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(Number(p.valor))}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{venc && isValid(venc) ? format(venc, "dd/MM/yyyy") : "—"}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{pag && isValid(pag) ? format(pag, "dd/MM/yyyy") : "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold", sc.color)}>
                        <StatusIcon className="w-3 h-3"/>{sc.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400 capitalize">{p.metodo_pagamento || "—"}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {p.status !== "pago" && (
                          <button onClick={() => handleMarcarPago(p)} className="px-2 py-1 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg hover:bg-emerald-100 transition-colors" title="Marcar como pago">
                            ✓ PAGO
                          </button>
                        )}
                        <button onClick={() => handleEdit(p)} className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5"/></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex justify-between"><Skeleton className="h-4 w-32"/><Skeleton className="h-4 w-20"/></div>
                <Skeleton className="h-3 w-full"/>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">Nenhum registro encontrado.</div>
          ) : (
            filtered.map(p => {
              const sc = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente;
              const StatusIcon = sc.icon;
              const venc = p.data_vencimento ? parseISO(p.data_vencimento) : null;
              return (
                <div key={p.id} className="p-4 flex flex-col gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                        {nomeCliente(p.cliente_id).charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white leading-tight">{nomeCliente(p.cliente_id)}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Venc. {venc && isValid(venc) ? format(venc, "dd/MM/yyyy") : "—"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900 dark:text-white">{formatCurrency(Number(p.valor))}</p>
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold mt-1", sc.color)}>
                        <StatusIcon className="w-2.5 h-2.5"/>{sc.label}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-slate-800/50">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(p)} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg"><Edit2 className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(p.id)} className="p-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                    </div>
                    {p.status !== "pago" && (
                      <button 
                        onClick={() => handleMarcarPago(p)} 
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-200 dark:shadow-none"
                      >
                        ✓ MARCAR PAGO
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="px-5 py-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs text-slate-400">{filtered.length} lançamentos</p>
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total do Período</span>
                <p className="text-base font-black text-slate-900 dark:text-white">
                  {formatCurrency(filtered.reduce((s, p) => s + Number(p.valor), 0))}
                </p>
                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Recebido: {formatCurrency(filtered.filter(p => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Novo/Editar */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-xl text-slate-900 dark:text-white">{editingId ? "Editar Pagamento" : "Novo Pagamento"}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"><X className="w-5 h-5 text-slate-400"/></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente *</label>
                    <select required value={form.cliente_id} onChange={e => setForm(f => ({...f, cliente_id: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="">Selecionar cliente...</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome_cliente}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valor (R$) *</label>
                    <input required type="number" step="0.01" min="0" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({...f, valor: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mês de Referência *</label>
                    <input required type="date" value={form.mes_referencia} onChange={e => setForm(f => ({...f, mes_referencia: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vencimento *</label>
                    <input required type="date" value={form.data_vencimento} onChange={e => setForm(f => ({...f, data_vencimento: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="pendente">Pendente</option>
                      <option value="pago">Pago</option>
                      <option value="atrasado">Atrasado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Método</label>
                    <select value={form.metodo_pagamento} onChange={e => setForm(f => ({...f, metodo_pagamento: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="pix">PIX</option>
                      <option value="transferencia">Transferência</option>
                      <option value="boleto">Boleto</option>
                      <option value="cartao">Cartão</option>
                      <option value="dinheiro">Dinheiro</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Observação</label>
                    <textarea value={form.observacao} onChange={e => setForm(f => ({...f, observacao: e.target.value}))} rows={2} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="Opcional..."/>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                  <button type="submit" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors">{editingId ? "Salvar" : "Lançar"}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
