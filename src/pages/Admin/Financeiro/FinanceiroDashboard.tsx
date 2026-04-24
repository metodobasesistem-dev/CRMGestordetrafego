import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { formatCurrency } from "../../../lib/utils";
import { TrendingUp, TrendingDown, DollarSign, Clock, AlertTriangle, CheckCircle2, Plus, ArrowRight, Wallet, BarChart3 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subMonths, parseISO, isValid, isBefore, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "../../../components/ui/Skeleton";

export default function FinanceiroDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const mesAtual = format(new Date(), "yyyy-MM");
  const hoje = new Date();

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      setLoading(true);
      const sixAgo = subMonths(new Date(), 5);
      const [p, d, c] = await Promise.all([
        supabase.from("pagamentos").select("*").gte("mes_referencia", sixAgo.toISOString()),
        supabase.from("despesas").select("*").gte("mes_referencia", sixAgo.toISOString()),
        supabase.from("clientes").select("id, nome_cliente"),
      ]);
      setPagamentos(p.data || []);
      setDespesas(d.data || []);
      setClientes(c.data || []);
      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const clienteMap = useMemo(() => {
    const m: Record<string, string> = {};
    clientes.forEach(c => { m[c.id] = c.nome_cliente; });
    return m;
  }, [clientes]);

  const pagMes = pagamentos.filter(p => p.mes_referencia?.startsWith(mesAtual));
  const despMes = despesas.filter(d => d.mes_referencia?.startsWith(mesAtual));
  const receitaMensal = pagMes.reduce((s, p) => s + Number(p.valor), 0);
  const recebido = pagMes.filter(p => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const pendente = pagMes.filter(p => p.status === "pendente").reduce((s, p) => s + Number(p.valor), 0);
  const atrasadoVal = pagMes.filter(p => p.status === "atrasado").reduce((s, p) => s + Number(p.valor), 0);
  const totalDesp = despMes.reduce((s, d) => s + Number(d.valor), 0);
  const lucro = recebido - totalDesp;

  const chartData = useMemo(() => Array.from({ length: 6 }).map((_, i) => {
    const date = subMonths(new Date(), 5 - i);
    const m = format(date, "yyyy-MM");
    const label = format(date, "MMM/yy", { locale: ptBR });
    const rec = pagamentos.filter(p => p.mes_referencia?.startsWith(m) && p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
    const desp = despesas.filter(d => d.mes_referencia?.startsWith(m)).reduce((s, d) => s + Number(d.valor), 0);
    return { label, recebido: rec, despesas: desp };
  }), [pagamentos, despesas]);

  const pendentes = pagamentos
    .filter(p => p.status === "pendente" || p.status === "atrasado")
    .sort((a, b) => a.data_vencimento?.localeCompare(b.data_vencimento))
    .slice(0, 8);

  const kpis = [
    { label: "Receita Mensal", value: formatCurrency(receitaMensal), icon: Wallet, c: "indigo" },
    { label: "Recebido", value: formatCurrency(recebido), icon: CheckCircle2, c: "emerald" },
    { label: "Pendente", value: formatCurrency(pendente), icon: Clock, c: "amber" },
    { label: "Em Atraso", value: formatCurrency(atrasadoVal), icon: AlertTriangle, c: "red" },
    { label: "Despesas", value: formatCurrency(totalDesp), icon: TrendingDown, c: "rose" },
    { label: "Lucro Líquido", value: formatCurrency(lucro), icon: TrendingUp, c: lucro >= 0 ? "emerald" : "red" },
  ];

  const cls: Record<string, string> = {
    indigo: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    red: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    rose: "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400",
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl"><DollarSign className="w-6 h-6 text-emerald-600" /></div>
            Financeiro
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{format(new Date(), "MMMM 'de' yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase())}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/admin/financeiro/pagamentos" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-200 dark:shadow-none">
            <Plus className="w-4 h-4" /> Novo Pagamento
          </Link>
          <Link to="/admin/financeiro/despesas" className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:border-rose-400 hover:text-rose-600 transition-all">
            <TrendingDown className="w-4 h-4" /> Nova Despesa
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map(({ label, value, icon: Icon, c }) => (
            <div key={label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-start gap-4">
              <div className={cn("p-2.5 rounded-xl shrink-0", cls[c])}><Icon className="w-5 h-5" /></div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5 truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div><h2 className="font-bold text-slate-900 dark:text-white">Receita vs Despesas</h2><p className="text-xs text-slate-400 mt-0.5">Últimos 6 meses</p></div>
          <BarChart3 className="w-5 h-5 text-slate-400" />
        </div>
        {loading ? <Skeleton className="h-64 rounded-xl" /> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                <linearGradient id="gradDesp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5}/>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={(v: any, n: string) => [formatCurrency(v), n === "recebido" ? "Recebido" : "Despesas"]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }}/>
              <Legend formatter={(v) => v === "recebido" ? "Recebido" : "Despesas"}/>
              <Area type="monotone" dataKey="recebido" stroke="#10b981" strokeWidth={2} fill="url(#gradRec)"/>
              <Area type="monotone" dataKey="despesas" stroke="#f43f5e" strokeWidth={2} fill="url(#gradDesp)"/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-white">Pendentes e Em Atraso</h2>
          <Link to="/admin/financeiro/pagamentos" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:gap-2 transition-all">Ver todos <ArrowRight className="w-3.5 h-3.5"/></Link>
        </div>
        {loading ? <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-xl"/>)}</div>
        : pendentes.length === 0 ? (
          <div className="p-10 text-center"><CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3"/><p className="font-bold text-slate-900 dark:text-white">Tudo em dia!</p></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendentes.map(p => {
              const venc = p.data_vencimento ? parseISO(p.data_vencimento) : null;
              const atrasado = venc && isValid(venc) && isBefore(venc, hoje);
              return (
                <div key={p.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", atrasado ? "bg-red-500" : "bg-amber-500")}/>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{clienteMap[p.cliente_id] || "—"}</p>
                      <p className="text-[11px] text-slate-400">Venc. {venc && isValid(venc) ? format(venc, "dd/MM/yyyy") : "—"}{atrasado && <span className="ml-2 text-red-500 font-bold">• Em atraso</span>}</p>
                    </div>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{formatCurrency(Number(p.valor))}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
