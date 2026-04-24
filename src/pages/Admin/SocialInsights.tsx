import { Instagram, Layout, Timer, Bell } from "lucide-react";

export default function SocialInsights() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8 px-4 text-center">
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-10 animate-pulse" />
        <div className="relative p-6 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl">
          <Instagram className="w-16 h-16 text-indigo-500" />
        </div>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-900/30 rounded-full">
          <Timer className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Módulo em Desenvolvimento</span>
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 dark:text-white font-display">
          Insights Orgânicos
        </h1>
        
        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
          Estamos preparando uma análise completa do desempenho das suas redes sociais. Em breve você poderá acompanhar curtidas, alcance e engajamento do Instagram e Facebook em um só lugar.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="p-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm">
            <Layout className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Design da Interface</p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-4">
          <div className="p-2 bg-white dark:bg-slate-900 rounded-xl shadow-sm">
            <Bell className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Novidade</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Aviso por E-mail</p>
          </div>
        </div>
      </div>
    </div>
  );
}
