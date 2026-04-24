import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { formatCurrency } from "../../../lib/utils";
import { Plus, X, Trash2, Edit2, Filter, Download, FileText, Tag } from "lucide-react";
import { cn } from "../../../lib/utils";
import { format, parseISO, isValid, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { Toast } from "../../../components/ui/Toast";

const CATEGORIAS = [
  { value: "ferramentas", label: "🛠 Ferramentas", color: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" },
  { value: "marketing", label: "📣 Marketing", color: "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300" },
  { value: "freelancer", label: "👤 Freelancer", color: "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300" },
  { value: "infraestrutura", label: "🖥 Infraestrutura", color: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300" },
  { value: "impostos", label: "📋 Impostos", color: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300" },
  { value: "outros", label: "📦 Outros", color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
];

const mesOptions = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
  return { value: format(d, "yyyy-MM"), label: format(d, "MMMM/yyyy", { locale: ptBR }) };
});

export default function Despesas() {
  const { user } = useAuth();
  const [despesas, setDespesas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMes, setFilterMes] = useState(format(new Date(), "yyyy-MM"));
  const [filterCat, setFilterCat] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const emptyForm = {
    descricao: "", valor: "", categoria: "outros",
    data_despesa: format(new Date(), "yyyy-MM-dd"),
    mes_referencia: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    recorrente: false
  };
  const [form, setForm] = useState<any>(emptyForm);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("despesas").select("*").order("data_despesa", { ascending: false });
    setDespesas(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const payload = { ...form, valor: parseFloat(form.valor), user_id: user.uid };
      if (editingId) {
        const { error } = await supabase.from("despesas").update(payload).eq("id", editingId);
        if (error) throw error;
        setToast({ message: "Despesa atualizada!", type: "success" });
      } else {
        const { error } = await supabase.from("despesas").insert([payload]);
        if (error) throw error;
        setToast({ message: "Despesa lançada!", type: "success" });
      }
      setIsModalOpen(false); setForm(emptyForm); setEditingId(null);
      fetchData();
    } catch { setToast({ message: "Erro ao salvar", type: "error" }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta despesa?")) return;
    await supabase.from("despesas").delete().eq("id", id);
    setToast({ message: "Despesa excluída.", type: "success" });
    fetchData();
  };

  const handleEdit = (d: any) => {
    setForm({ ...d, valor: String(d.valor) });
    setEditingId(d.id); setIsModalOpen(true);
  };

  const filtered = despesas.filter(d => {
    const matchMes = !filterMes || d.mes_referencia?.startsWith(filterMes);
    const matchCat = filterCat === "all" || d.categoria === filterCat;
    return matchMes && matchCat;
  });

  const totalMes = filtered.reduce((s, d) => s + Number(d.valor), 0);

  // Totais por categoria
  const porCategoria = CATEGORIAS.map(cat => ({
    ...cat,
    total: filtered.filter(d => d.categoria === cat.value).reduce((s, d) => s + Number(d.valor), 0)
  })).filter(c => c.total > 0);

  const exportCSV = () => {
    const rows = [["Descrição","Valor","Categoria","Data","Mês Ref.","Recorrente"],
      ...filtered.map(d => [d.descricao, d.valor, d.categoria, d.data_despesa||"", d.mes_referencia?.slice(0,7)||"", d.recorrente?"Sim":"Não"])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `despesas_${filterMes||"todos"}.csv`; a.click();
  };

  const exportPDF = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const catLabel = (c: string) => CATEGORIAS.find(x => x.value === c)?.label || c;
    const rows = filtered.map(d => `<tr><td>${d.descricao}</td><td>R$ ${Number(d.valor).toFixed(2).replace(".",",")}</td><td>${catLabel(d.categoria)}</td><td>${d.data_despesa||""}</td><td>${d.recorrente?"Sim":"Não"}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Despesas</title>
    <style>body{font-family:sans-serif;padding:2rem}h1{color:#f43f5e;margin-bottom:1rem}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-size:13px}
    th{background:#f8fafc;font-weight:700;color:#475569}tr:nth-child(even){background:#f8fafc}
    .total{margin-top:1rem;font-weight:bold;color:#f43f5e}@media print{body{padding:0}}</style></head><body>
    <h1>Relatório de Despesas</h1>
    <p style="color:#64748b;margin-bottom:1rem">Período: ${filterMes||"Todos"} · Gerado em: ${format(new Date(),"dd/MM/yyyy HH:mm")}</p>
    <table><thead><tr><th>Descrição</th><th>Valor</th><th>Categoria</th><th>Data</th><th>Recorrente</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="total">Total: R$ ${totalMes.toFixed(2).replace(".",",")}</p></body></html>`);
    w.document.close(); w.print();
  };

  const getCatConfig = (cat: string) => CATEGORIAS.find(c => c.value === cat) || CATEGORIAS[5];

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Despesas</h1>
          <p className="text-slate-500 dark:text-slate-400">Custos e gastos operacionais</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-all shrink-0", showFilters ? "bg-rose-600 text-white border-rose-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400")}>
            <Filter className="w-4 h-4"/> <span className="hidden sm:inline">Filtros</span>
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-sm font-bold hover:border-emerald-500 hover:text-emerald-600 transition-all shrink-0">
            <Download className="w-4 h-4"/> <span className="hidden sm:inline">CSV</span>
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-sm font-bold hover:border-rose-500 hover:text-rose-600 transition-all shrink-0">
            <FileText className="w-4 h-4"/> <span className="hidden sm:inline">PDF</span>
          </button>
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-rose-200 dark:shadow-none shrink-0">
            <Plus className="w-4 h-4"/> <span>Nova Despesa</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mês</label>
              <select value={filterMes} onChange={e => setFilterMes(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Todos</option>
                {mesOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</label>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="all">Todas</option>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resumo por categoria */}
      {porCategoria.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {porCategoria.map(c => (
            <div key={c.value} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold", c.color)}>
              <Tag className="w-3.5 h-3.5"/>{c.label}: {formatCurrency(c.total)}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {/* Desktop View (Table) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {["Descrição","Valor","Categoria","Data","Mês Ref.","Recorrente","Ações"].map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                [1,2,3].map(i => <tr key={i}>{[1,2,3,4,5,6,7].map(j => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"/></td>)}</tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">Nenhuma despesa encontrada.</td></tr>
              ) : filtered.map(d => {
                const cat = getCatConfig(d.categoria);
                const dt = d.data_despesa ? parseISO(d.data_despesa) : null;
                return (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-5 py-3.5 text-sm font-medium text-slate-900 dark:text-white">{d.descricao}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-rose-600 dark:text-rose-400">{formatCurrency(Number(d.valor))}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold", cat.color)}>{cat.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{dt && isValid(dt) ? format(dt, "dd/MM/yyyy") : "—"}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{d.mes_referencia?.slice(0,7)||"—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", d.recorrente ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400" : "bg-slate-100 text-slate-400 dark:bg-slate-800")}>
                        {d.recorrente ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(d)} className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5"/></button>
                        <button onClick={() => handleDelete(d.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
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
            <div className="p-12 text-center text-slate-400 text-sm">Nenhuma despesa encontrada.</div>
          ) : (
            filtered.map(d => {
              const cat = getCatConfig(d.categoria);
              const dt = d.data_despesa ? parseISO(d.data_despesa) : null;
              return (
                <div key={d.id} className="p-4 flex flex-col gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white leading-tight truncate">{d.descricao}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-bold", cat.color)}>{cat.label}</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">{dt && isValid(dt) ? format(dt, "dd/MM/yyyy") : "—"}</p>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-black text-rose-600 dark:text-rose-400">{formatCurrency(Number(d.valor))}</p>
                      {d.recorrente && <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">Recorrente</span>}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-50 dark:border-slate-800/50">
                    <button onClick={() => handleEdit(d)} className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl flex items-center gap-2 text-xs font-bold">
                      <Edit2 className="w-3.5 h-3.5"/> Editar
                    </button>
                    <button onClick={() => handleDelete(d.id)} className="p-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-xs font-bold">
                      <Trash2 className="w-3.5 h-3.5"/> Excluir
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="px-5 py-4 bg-rose-50/30 dark:bg-rose-900/10 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">{filtered.length} Despesas</p>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total do Período</span>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(totalMes)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-xl text-slate-900 dark:text-white">{editingId ? "Editar Despesa" : "Nova Despesa"}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"><X className="w-5 h-5 text-slate-400"/></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição *</label>
                  <input required type="text" placeholder="Ex: Assinatura do Notion" value={form.descricao} onChange={e => setForm((f: any) => ({...f, descricao: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valor (R$) *</label>
                    <input required type="number" step="0.01" min="0" placeholder="0,00" value={form.valor} onChange={e => setForm((f: any) => ({...f, valor: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria</label>
                    <select value={form.categoria} onChange={e => setForm((f: any) => ({...f, categoria: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                      {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data *</label>
                    <input required type="date" value={form.data_despesa} onChange={e => setForm((f: any) => ({...f, data_despesa: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mês de Ref. *</label>
                    <input required type="date" value={form.mes_referencia} onChange={e => setForm((f: any) => ({...f, mes_referencia: e.target.value}))} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"/>
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className={cn("w-10 h-5 rounded-full transition-colors relative", form.recorrente ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700")} onClick={() => setForm((f: any) => ({...f, recorrente: !f.recorrente}))}>
                    <div className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", form.recorrente ? "translate-x-5" : "translate-x-0.5")}/>
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Despesa recorrente (mensal)</span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                  <button type="submit" className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm transition-colors">{editingId ? "Salvar" : "Lançar"}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
