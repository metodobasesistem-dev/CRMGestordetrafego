import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Cliente } from "../../types";
import { LayoutDashboard, Users, ChevronRight, BarChart3, Sun, Moon, Shield, Settings, LogOut, Menu, X, Facebook, Globe, CheckSquare, Calendar, StickyNote, Activity } from "lucide-react";
import { cn, isFakeClient } from "../../lib/utils";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isDashboardOpen, setIsDashboardOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isClientListOpen, setIsClientListOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  useEffect(() => {
    if (!user) return;

    const fetchClientes = async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nome_cliente', { ascending: true });

      if (error) {
        console.error("Erro ao carregar clientes no layout:", error);
        return;
      }

      // Usa utilitário centralizado (elimina código duplicado)
      const realClients = (data || []).filter(c => {
        if (!c.nome_cliente || c.nome_cliente.trim() === "") return false;
        return !isFakeClient(c.nome_cliente);
      });
      
      setClientes(realClients);
    };

    fetchClientes();

    // Subscribe to changes
    const channel = supabase
      .channel('public:clientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, fetchClientes)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Close mobile menus when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsClientListOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Clientes", href: "/admin", icon: Users },
    { name: "Tarefas", href: "/admin/tarefas", icon: CheckSquare },
    { name: "Anotações", href: "/admin/anotacoes", icon: StickyNote },
    { name: "Agenda", href: "/admin/agenda", icon: Calendar },
    { name: "Atividades", href: "/admin/atividades", icon: Activity },
    { name: "Usuários", href: "/admin/usuarios", icon: Shield },
    { name: "Meta Ads", href: "/admin/meta-ads", icon: Facebook },
    { name: "Google Ads", href: "/admin/google-ads", icon: Globe },
    { name: "Config", href: "/admin/configuracoes", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 overflow-hidden flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 shrink-0 z-40">
        <Link to="/admin" className="text-lg font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5" />
          CRM Gestor
        </Link>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase">
            {user?.name?.[0] || user?.email?.[0] || 'U'}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar (Premium Glass) */}
      <aside className="hidden lg:flex w-72 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 flex-col shrink-0 z-20">
        <div className="p-8 flex items-center justify-between">
          <Link to="/admin" className="text-2xl font-black tracking-tighter text-indigo-600 dark:text-indigo-400 flex items-center gap-2 font-display">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            CRM<span className="text-slate-900 dark:text-white">Gestor</span>
          </Link>
        </div>

        <nav className="flex-1 px-6 space-y-8 overflow-y-auto pb-8 custom-scrollbar">
          {/* Main Navigation */}
          <div className="space-y-1.5">
            <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 opacity-70">Menu Principal</p>
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-2xl transition-all duration-300 group relative",
                    isActive
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 transition-transform duration-300 group-hover:scale-110", isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-indigo-500")} />
                  {item.name}
                  {isActive && (
                    <span className="absolute left-0 w-1 h-6 bg-white rounded-r-full transform -translate-x-4" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Dynamic Client Dashboards */}
          <div className="space-y-1">
            <button 
              onClick={() => setIsDashboardOpen(!isDashboardOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Dashboards
              <ChevronRight className={cn("w-3 h-3 transition-transform", isDashboardOpen && "rotate-90")} />
            </button>
            
            {isDashboardOpen && (
              <div className="space-y-1 mt-1">
                {clientes.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">Nenhum cliente cadastrado</p>
                ) : (
                  clientes.map((cliente) => {
                    const href = `/admin/dashboard/${cliente.id}`;
                    const isActive = location.pathname === href;
                    return (
                      <Link
                        key={cliente.id}
                        to={href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors group",
                          isActive
                            ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                        )}
                      >
                        <BarChart3 className={cn("w-4 h-4", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300")} />
                        <span className="truncate">{cliente.nome_cliente}</span>
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </nav>

        <div className="p-6 mt-auto space-y-4">
          <div className="flex items-center gap-4 p-4 bg-slate-100/50 dark:bg-slate-800/40 rounded-3xl border border-slate-200/50 dark:border-slate-700/30">
            <div className="relative group">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
                {user?.name?.[0] || user?.email?.[0] || 'U'}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user?.name || 'Gestor'}</p>
              <p className="text-[10px] uppercase tracking-wider font-black text-slate-400 dark:text-slate-500">{user?.role || 'Administrador'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center p-3 text-slate-600 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-2xl transition-all duration-300"
              title={theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center justify-center p-3 text-red-500 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-2xl transition-all duration-300"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation (Intuitive) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-1 z-50">
        {navItems.slice(0, 5).map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-lg transition-colors min-w-[60px]",
                isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-lg transition-colors min-w-[60px]",
            isMobileMenuOpen ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"
          )}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Mais</span>
        </button>
      </nav>

      {/* Mobile Client List Drawer */}
      {isClientListOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-bottom duration-300">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Dashboards de Clientes</h2>
            <button onClick={() => setIsClientListOpen(false)} className="p-2 text-slate-500"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {clientes.length === 0 ? (
              <p className="text-center text-slate-500 py-8">Nenhum cliente real encontrado.</p>
            ) : (
              clientes.map((cliente) => (
                <Link
                  key={cliente.id}
                  to={`/admin/dashboard/${cliente.id}`}
                  className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">{cliente.nome_cliente}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Mobile "Mais" Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Menu</h2>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-500"><X className="w-6 h-6" /></button>
          </div>
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            <div className="flex items-center gap-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xl uppercase">
                {user?.name?.[0] || user?.email?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{user?.name || 'Usuário'}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Outras Opções</p>
              
              {/* Remaining Nav Items */}
              {navItems.slice(5).map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full flex items-center gap-4 p-4 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <item.icon className="w-6 h-6" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsClientListOpen(true);
                }}
                className="w-full flex items-center gap-4 p-4 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <BarChart3 className="w-6 h-6" />
                <span className="font-medium">Dashboards de Clientes</span>
              </button>

              <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-4 p-4 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                {theme === 'light' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                <span className="font-medium">{theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}</span>
              </button>

              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-4 p-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors"
              >
                <LogOut className="w-6 h-6" />
                <span className="font-medium">Sair da Conta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 lg:p-8 pb-20 lg:pb-8">
        <Outlet />
      </main>
    </div>
  );
}
