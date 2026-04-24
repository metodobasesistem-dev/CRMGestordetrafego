import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { Cliente, DadosCampanha } from "../../types";
import { TrendingUp, Target, DollarSign, MousePointer2, BarChart3, Filter, ChevronDown, X, Wallet, Users, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import { cn, isFakeClient, formatCurrency } from "../../lib/utils";
import { useTheme } from "../../context/ThemeContext";
import { format, subDays, isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "../../components/ui/Skeleton";

// Hook para largura da janela sem usar window diretamente no JSX
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export default function AdminDashboard() {
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [dados, setDados] = useState<DadosCampanha[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedClienteId, setSelectedClienteId] = useState<string>("todos");
  const [periodo, setPeriodo] = useState("30");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [clientesRes, dadosRes, pagamentosRes, despesasRes] = await Promise.all([
          supabase.from('clientes').select('*'),
          supabase.from('dados_campanhas').select('*'),
          supabase.from('pagamentos').select('*'),
          supabase.from('despesas').select('*')
        ]);

        if (clientesRes.error) throw clientesRes.error;
        if (dadosRes.error) throw dadosRes.error;
        if (pagamentosRes.error) throw pagamentosRes.error;
        if (despesasRes.error) throw despesasRes.error;

        setClientes(clientesRes.data || []);
        setDados(dadosRes.data || []);
        setPagamentos(pagamentosRes.data || []);
        setDespesas(despesasRes.data || []);
        setError(null);
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
        setError("Não foi possível carregar os dados do dashboard.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to changes
    const channel = supabase
      .channel('dashboard_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dados_campanhas' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamentos' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despesas' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Usa utilitário centralizado (elimina código duplicado)
  const realClientes = useMemo(() => 
    clientes.filter(c => !isFakeClient(c.nome_cliente)),
  [clientes]);

  const realClientIds = useMemo(() => realClientes.map(c => c.id), [realClientes]);
  
  const filteredDados = useMemo(() => {
    let filtered = dados.filter(d => realClientIds.includes(d.cliente_id) && d.plataforma === 'meta_ads');

    // Filter by Client
    if (selectedClienteId !== "todos") {
      filtered = filtered.filter(d => d.cliente_id === selectedClienteId);
    }

    // Filter by Period
    const now = new Date();
    let start = startOfDay(subDays(now, parseInt(periodo)));
    let end = endOfDay(now);

    if (periodo === "custom" && dataInicio && dataFim) {
      start = startOfDay(parseISO(dataInicio));
      end = endOfDay(parseISO(dataFim));
    } else if (periodo === "max") {
      return filtered;
    }

    return filtered.filter(d => {
      const itemDate = parseISO(d.data);
      return isWithinInterval(itemDate, { start, end });
    });
  }, [dados, realClientIds, selectedClienteId, periodo, dataInicio, dataFim]);
  
  const totalClientesAtivos = realClientes.length;
  
  // Business Finance Metrics
  const faturamentoPeriodo = pagamentos
    .filter(p => p.status === "pago")
    .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);
    
  const despesasPeriodo = despesas
    .reduce((acc, curr) => acc + Number(curr.valor || 0), 0);
    
  const lucroLiquido = faturamentoPeriodo - despesasPeriodo;
  const ticketMedio = totalClientesAtivos > 0 ? faturamentoPeriodo / totalClientesAtivos : 0;

  // Ads Metrics (for reference)
  const totalInvestido = filteredDados.reduce((acc, curr) => acc + curr.investimento, 0);
  const totalCliques = filteredDados.reduce((acc, curr) => acc + curr.cliques, 0);
  const totalImpressoes = filteredDados.reduce((acc, curr) => acc + curr.impressoes, 0);
  const avgCTR = totalImpressoes > 0 ? (totalCliques / totalImpressoes) * 100 : 0;

  // Business Stats (KPIs Principais)
  const stats = [
    { name: "Faturamento Total", value: formatCurrency(faturamentoPeriodo), icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
    { name: "Clientes Ativos", value: totalClientesAtivos.toString(), icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { name: "Ticket Médio", value: formatCurrency(ticketMedio), icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
    { name: "Lucro Líquido", value: formatCurrency(lucroLiquido), icon: DollarSign, color: lucroLiquido >= 0 ? "text-emerald-600" : "text-rose-600", bg: lucroLiquido >= 0 ? "bg-emerald-50" : "bg-rose-50" },
  ];

  // Chart Data: Fluxo de Caixa Diário (Últimos 30 dias)
  const dailyFinanceData = useMemo(() => {
    const last30Days = Array.from({ length: 30 }).map((_, i) => {
      const d = subDays(new Date(), 29 - i);
      return format(d, "yyyy-MM-dd");
    });

    return last30Days.map(date => {
      const rec = pagamentos
        .filter(p => p.status === "pago" && p.data_pagamento === date)
        .reduce((s, p) => s + Number(p.valor || 0), 0);
      const desp = despesas
        .filter(d => d.data_despesa === date)
        .reduce((s, d) => s + Number(d.valor || 0), 0);
      return { date, faturamento: rec, despesas: desp };
    });
  }, [pagamentos, despesas]);

  // Client List by Revenue
  const clientRevenue = realClientes.map(c => {
    const total = pagamentos
      .filter(p => p.cliente_id === c.id && p.status === "pago")
      .reduce((s, p) => s + p.valor, 0);
    return { name: c.nome_cliente, total };
  }).sort((a, b) => b.total - a.total);
  if (error) return (
    <div className="flex flex-col items-center justify-center p-20 text-center space-y-4">
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-full">
        <BarChart3 className="w-10 h-10 text-red-400" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Erro ao carregar o Dashboard</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">{error}</p>
      <button 
        onClick={() => { setError(null); setLoading(true); }}
        className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  );

  if (loading) return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/2 rounded-lg" />
            <Skeleton className="h-3 w-1/3 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
              <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-2 w-1/2 rounded-full" />
                <Skeleton className="h-4 w-3/4 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Skeleton className="lg:col-span-2 h-[450px] rounded-3xl" />
        <Skeleton className="h-[450px] rounded-3xl" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 lg:space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">Dashboard Geral</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Visão consolidada de performance de todos os clientes.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-bold uppercase tracking-wider",
              showFilters 
                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-500"
            )}
          >
            <Filter className="w-4 h-4" />
            Filtros
            {showFilters ? <X className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Cliente</label>
              <select 
                value={selectedClienteId}
                onChange={(e) => setSelectedClienteId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
              >
                <option value="todos">Todos os Clientes</option>
                {realClientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome_cliente}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Período</label>
              <select 
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
              >
                <option value="7">Últimos 7 dias</option>
                <option value="15">Últimos 15 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="max">Todo o período</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>

            {periodo === "custom" && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Início</label>
                  <input 
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Fim</label>
                  <input 
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(filteredDados.length === 0 && pagamentos.length === 0 && despesas.length === 0) ? (
        <div className="flex flex-col items-center justify-center p-8 lg:p-20 text-center space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-3 lg:p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-full">
            <BarChart3 className="w-6 h-6 lg:w-8 lg:h-8 text-indigo-500" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base lg:text-lg font-bold text-slate-900 dark:text-white">Nenhum dado encontrado</h3>
            <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 max-w-xs lg:max-w-md mx-auto">
              Não há dados para os filtros selecionados. Tente ajustar o período ou o cliente.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {stats.map((stat) => (
              <div key={stat.name} className="glass-card p-6 group">
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("p-3 rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3", stat.bg, "dark:bg-slate-800")}>
                    <stat.icon className={cn("w-6 h-6", stat.color, "dark:text-indigo-400")} />
                  </div>
                  <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{stat.name}</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-2 font-display">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Business Cash Flow Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
              <div className="flex items-center justify-between mb-6 lg:mb-8">
                <div>
                  <h3 className="text-sm lg:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500" />
                    Saúde do Negócio: Faturamento vs Despesas
                  </h3>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Últimos 30 dias</p>
                </div>
              </div>
              <div className="h-[250px] lg:h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyFinanceData}>
                    <defs>
                      <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorDesp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickFormatter={(val) => format(parseISO(val), "dd/MM")}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10 }} 
                      tickFormatter={(val) => `R$${val}`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', 
                        borderColor: theme === 'dark' ? '#1e293b' : '#e2e8f0',
                        borderRadius: '12px', 
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Area type="monotone" dataKey="faturamento" name="Faturamento" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorFat)" />
                    <Area type="monotone" dataKey="despesas" name="Despesas" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorDesp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Clients by Revenue */}
            <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
              <h3 className="text-sm lg:text-base font-bold text-slate-900 dark:text-white mb-6">
                Ranking de Faturamento (R$)
              </h3>
              <div className="space-y-4 lg:space-y-6">
                {clientRevenue.slice(0, 8).map((client, idx) => (
                  <div key={client.name} className="flex items-center justify-between p-2 lg:p-0 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-[10px] lg:text-xs font-bold text-emerald-600">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-xs lg:text-sm font-bold text-slate-900 dark:text-white truncate max-w-[120px] lg:max-w-none">{client.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs lg:text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(client.total)}</p>
                      <div className="w-16 lg:w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full" 
                          style={{ width: `${clientRevenue[0].total > 0 ? (client.total / clientRevenue[0].total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {clientRevenue.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-10 italic">Nenhum faturamento registrado ainda.</p>
                )}
              </div>
            </div>
          </div>
          {/* Ads Performance Summary (O Trabalho do Gestor) */}
          <div className="bg-slate-50 dark:bg-slate-800/30 rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-500" />
                  Performance das Campanhas
                </h3>
                <p className="text-xs text-slate-500">Dados consolidados do Meta Ads dos seus clientes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Investido (Clientes)</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{formatCurrency(totalInvestido)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
                  <MousePointer2 className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cliques Gerados</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{totalCliques.toLocaleString("pt-BR")}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
                  <BarChart3 className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CTR Médio</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{avgCTR.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
