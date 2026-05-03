import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Cliente } from "../../types";
import { LayoutDashboard, BarChart3, Sun, Moon, LogOut, Brain, Menu, X, Zap, Settings, ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

export default function ClientLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const pathParts = location.pathname.split('/');
  const currentClientId = pathParts[2];
  const activeClient = clientes.find(c => c.id === currentClientId) || clientes[0];

  // STRICT FRONTEND VALIDATION
  useEffect(() => {
    if (currentClientId && user?.allowedClients && user.allowedClients.length > 0) {
      if (!user.allowedClients.includes(currentClientId)) {
        console.error('ALERTA DE SEGURANÇA: Tentativa de acesso a dashboard não autorizado.');
        navigate('/dashboard');
      }
    }
  }, [currentClientId, user, navigate]);

  useEffect(() => {
    console.log('[ClientLayout] User state:', user);
    if (!user || user.role !== 'client') return;

    // Only fetch clients allowed for this user
    if (!user.allowedClients || user.allowedClients.length === 0) {
      console.log('[ClientLayout] No allowed clients for user:', user.email);
      setClientes([]);
      return;
    }

    console.log('[ClientLayout] Fetching clients for IDs:', user.allowedClients);
    
    const fetchClients = async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .in('id', user.allowedClients);

      if (error) {
        console.error('[ClientLayout] Error fetching clients:', error);
        return;
      }

      // Strict filtering for real clients
      const fakeNames = [
        "exemplo", "teste", "mock", "fake", "ficticia", "fictícia", 
        "silva advogados", "clínica sorriso", "techworld", "imobiliária horizonte",
        "cliente 1", "cliente 2", "cliente 3", "cliente 4", "cliente 5",
        "empresa a", "empresa b", "empresa c", "dashboard exemplo",
        "demo", "amostra", "modelo", "padrão", "padrao"
      ];
      
      const allowedData = (data as Cliente[]).filter(c => {
        if (!c.nome_cliente || c.nome_cliente.trim() === "") return false;
        const nameLower = c.nome_cliente.toLowerCase();
        const isGeneric = /^(cliente|empresa|teste|exemplo)\s*\d*$/i.test(nameLower);
        return !isGeneric && !fakeNames.some(fake => nameLower.includes(fake));
      });
      
      console.log('[ClientLayout] Clients fetched:', allowedData.length);
      setClientes(allowedData);

      // If we're at /dashboard and there's only one client, redirect to it
      if (location.pathname === '/dashboard' && allowedData.length === 1) {
        navigate(`/dashboard/${allowedData[0].id}`);
      }
    };

    fetchClients();

    // Subscribe to changes
    const subscription = supabase
      .channel('clientes-changes-layout')
      .on('postgres_changes', { event: '*', table: 'clientes' }, () => {
        fetchClients();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user, location.pathname, navigate]);

  // Close mobile menus when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsClientListOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 overflow-hidden flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 shrink-0 z-40">
        <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Portal Cliente
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase">
            {user?.name?.[0] || user?.email?.[0] || 'C'}
          </div>
        </div>
      </header>

      {/* Desktop Sidebar (Original Style) */}
      <aside className="hidden lg:flex w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col shrink-0">
        <div className="p-6 flex items-center justify-between">
          <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
            <Brain className="w-6 h-6" />
            Portal Cliente
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-6 overflow-y-auto pb-8">
          
          {/* Seletor de Empresa */}
          <div className="space-y-1 relative">
            <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Empresa Ativa</p>
            {clientes.length === 0 ? (
              <div className="px-3 py-4 space-y-2">
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhuma empresa liberada</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline"
                >
                  Atualizar Acessos
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => clientes.length > 1 && setIsDropdownOpen(!isDropdownOpen)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-3 text-sm font-bold rounded-xl transition-all border",
                    clientes.length > 1 ? "hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" : "cursor-default",
                    "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shrink-0">
                      <span className="text-white font-black text-xs uppercase">{activeClient?.nome_cliente?.substring(0, 2)}</span>
                    </div>
                    <span className="truncate text-slate-900 dark:text-slate-100">{activeClient?.nome_cliente || 'Carregando...'}</span>
                  </div>
                  {clientes.length > 1 && <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isDropdownOpen && "rotate-180")} />}
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && clientes.length > 1 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                    {clientes.map((c) => (
                      <Link
                        key={c.id}
                        to={`/dashboard/${c.id}`}
                        onClick={() => setIsDropdownOpen(false)}
                        className={cn(
                          "flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors",
                          c.id === activeClient?.id ? "bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-600 dark:text-slate-400"
                        )}
                      >
                        <span className="truncate">{c.nome_cliente}</span>
                        {c.id === activeClient?.id && <CheckCircle2 className="w-4 h-4" />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Menu de Funcionalidades */}
          {activeClient && (
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 mt-6">Aplicativos</p>
              
              <Link
                to={`/dashboard/${activeClient.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg transition-all group",
                  location.pathname === `/dashboard/${activeClient.id}`
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <LayoutDashboard className={cn("w-5 h-5", location.pathname === `/dashboard/${activeClient.id}` ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300")} />
                Visão Geral
              </Link>

              <Link
                to={`/dashboard/${activeClient.id}/leads`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg transition-all group relative overflow-hidden",
                  location.pathname === `/dashboard/${activeClient.id}/leads`
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <Zap className={cn("w-5 h-5", location.pathname === `/dashboard/${activeClient.id}/leads` ? "text-amber-500" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300")} />
                Leo Leads
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </div>
              </Link>

              <Link
                to={`/dashboard/${activeClient.id}/configuracoes`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg transition-all group",
                  location.pathname === `/dashboard/${activeClient.id}/configuracoes`
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <Settings className={cn("w-5 h-5", location.pathname === `/dashboard/${activeClient.id}/configuracoes` ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300")} />
                Configurações
              </Link>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-5 h-5" />
                Modo Escuro
              </>
            ) : (
              <>
                <Sun className="w-5 h-5" />
                Modo Claro
              </>
            )}
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>

          <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold uppercase">
              {user?.name?.[0] || user?.email?.[0] || 'C'}
            </div>
            <div className="flex-1 truncate">
              <p className="text-slate-900 dark:text-slate-100 font-bold truncate">{user?.name || 'Cliente'}</p>
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Portal do Cliente</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation (Intuitive) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 z-50">
        <button
          onClick={() => setIsClientListOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-4 py-1 rounded-lg transition-colors",
            location.pathname.includes('/dashboard/') ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"
          )}
        >
          <BarChart3 className="w-6 h-6" />
          <span className="text-[10px] font-medium">Meus Dashs</span>
        </button>
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-1 px-4 py-1 text-slate-500 dark:text-slate-400"
        >
          <Menu className="w-6 h-6" />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </nav>

      {/* Mobile Client List Drawer */}
      {isClientListOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-bottom duration-300">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Seus Dashboards</h2>
            <button onClick={() => setIsClientListOpen(false)} className="p-2 text-slate-500"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {clientes.length === 0 ? (
              <p className="text-center text-slate-500 py-8 italic">Nenhum dashboard liberado.</p>
            ) : (
              clientes.map((cliente) => (
                <Link
                  key={cliente.id}
                  to={`/dashboard/${cliente.id}`}
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

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-900 animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Opções</h2>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-500"><X className="w-6 h-6" /></button>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xl uppercase">
                {user?.name?.[0] || user?.email?.[0] || 'C'}
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{user?.name || 'Cliente'}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2">
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
