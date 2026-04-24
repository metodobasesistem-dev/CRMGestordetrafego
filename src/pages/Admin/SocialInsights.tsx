import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import {
  Instagram, Facebook, Users, Eye, Heart, MessageCircle,
  Share2, TrendingUp, RefreshCw, AlertCircle, ExternalLink,
  Image as ImageIcon, BarChart3, Globe
} from "lucide-react";
import { cn } from "../../lib/utils";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "../../components/ui/Skeleton";

interface IgPost {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  like_count: number;
  comments_count: number;
  timestamp: string;
}

interface FbPost {
  id: string;
  message: string;
  image?: string;
  url?: string;
  created_time: string;
  likes: number;
  comments: number;
  shares: number;
}

interface InstagramData {
  id: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  insights: Record<string, number>;
  recent_posts: IgPost[];
}

interface SocialPage {
  id: string;
  name: string;
  category?: string;
  picture?: string;
  fan_count: number;
  followers_count: number;
  insights: Record<string, number>;
  recent_posts: FbPost[];
  instagram?: InstagramData;
}

function numberFormat(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-start gap-3">
      <div className={cn("p-2 rounded-xl shrink-0", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-lg font-black text-slate-900 dark:text-white">{typeof value === 'number' ? numberFormat(value) : value}</p>
      </div>
    </div>
  );
}

function IgPostGrid({ posts }: { posts: IgPost[] }) {
  if (!posts.length) return <p className="text-sm text-slate-400 py-4 text-center">Nenhum post recente.</p>;
  return (
    <div className="grid grid-cols-3 gap-2">
      {posts.slice(0, 9).map(post => {
        const img = post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url;
        return (
          <a key={post.id} href={post.permalink} target="_blank" rel="noopener noreferrer"
            className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
            {img ? (
              <img src={img} alt={post.caption?.slice(0, 30) || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-slate-400" /></div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
              <div className="flex items-center gap-1 text-white text-xs font-bold"><Heart className="w-3.5 h-3.5" />{numberFormat(post.like_count)}</div>
              <div className="flex items-center gap-1 text-white text-xs font-bold"><MessageCircle className="w-3.5 h-3.5" />{numberFormat(post.comments_count)}</div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function FbPostList({ posts }: { posts: FbPost[] }) {
  if (!posts.length) return <p className="text-sm text-slate-400 py-4 text-center">Nenhum post recente.</p>;
  return (
    <div className="space-y-3">
      {posts.map(post => {
        const dt = post.created_time ? parseISO(post.created_time) : null;
        return (
          <div key={post.id} className="flex gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            {post.image && (
              <img src={post.image} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{post.message || '(sem texto)'}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-[10px] text-slate-400"><Heart className="w-3 h-3" />{numberFormat(post.likes)}</span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400"><MessageCircle className="w-3 h-3" />{numberFormat(post.comments)}</span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400"><Share2 className="w-3 h-3" />{numberFormat(post.shares)}</span>
                {dt && isValid(dt) && <span className="text-[10px] text-slate-400 ml-auto">{format(dt, "dd/MM/yy", { locale: ptBR })}</span>}
              </div>
            </div>
            {post.url && (
              <a href={post.url} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-blue-500 shrink-0">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SocialInsights() {
  const { user } = useAuth();
  const [pages, setPages] = useState<SocialPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

  const fetchSocialData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Pega o token de uma conta Meta conectada
      const { data: accounts } = await supabase.from('meta_ads_accounts').select('access_token').limit(1).single();
      if (!accounts?.access_token) {
        setError('Nenhuma conta Meta conectada. Conecte sua conta em Meta Ads primeiro.');
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/social/pages?access_token=${encodeURIComponent(accounts.access_token)}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);
      setPages(data.pages || []);
      if (data.pages?.length > 0) setSelectedPage(data.pages[0].id);
    } catch (err: any) {
      console.error('[SocialInsights]', err);
      setError(err.message || 'Erro ao carregar dados sociais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSocialData(); }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSocialData();
    setRefreshing(false);
  };

  const currentPage = pages.find(p => p.id === selectedPage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            Redes Sociais
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Insights orgânicos — Facebook Pages e Instagram</p>
          <div className="inline-flex items-center gap-2 px-3 py-1 mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Módulo em Desenvolvimento</span>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-600 transition-all">
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 dark:text-red-400">Erro ao carregar</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-48 rounded-2xl" />)}</div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : pages.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
            <Globe className="w-10 h-10 text-slate-400" />
          </div>
          <p className="font-bold text-slate-900 dark:text-white">Nenhuma página encontrada</p>
          <p className="text-sm text-slate-500 mt-1">Certifique-se de que você é administrador das páginas e reconecte a conta Meta com as novas permissões.</p>
        </div>
      ) : (
        <>
          {/* Page Selector */}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pages.map(page => (
              <button key={page.id} onClick={() => setSelectedPage(page.id)}
                className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl border whitespace-nowrap transition-all",
                  selectedPage === page.id
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400"
                )}>
                {page.picture ? (
                  <img src={page.picture} alt={page.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                    <Facebook className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div className="text-left">
                  <p className="text-sm font-bold">{page.name}</p>
                  <p className={cn("text-[10px]", selectedPage === page.id ? "text-white/70" : "text-slate-400")}>
                    {numberFormat(page.fan_count || page.followers_count)} seguidores
                  </p>
                </div>
              </button>
            ))}
          </div>

          {currentPage && (
            <div className="space-y-6">
              {/* ========== FACEBOOK SECTION ========== */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <Facebook className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">{currentPage.name}</h2>
                    <p className="text-xs text-slate-400">{currentPage.category} · Últimos 28 dias</p>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="Seguidores" value={currentPage.fan_count || currentPage.followers_count} icon={Users} color="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" />
                    <MetricCard label="Novos Fãs" value={currentPage.insights['page_fan_adds_unique'] || 0} icon={TrendingUp} color="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" />
                    <MetricCard label="Alcance Orgânico" value={currentPage.insights['page_impressions_organic_unique'] || 0} icon={Eye} color="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" />
                    <MetricCard label="Pessoas Engajadas" value={currentPage.insights['page_engaged_users'] || 0} icon={Heart} color="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400" />
                    <MetricCard label="Interações em Posts" value={currentPage.insights['page_post_engagements'] || 0} icon={BarChart3} color="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" />
                    <MetricCard label="Visualizações" value={currentPage.insights['page_views_total'] || 0} icon={Globe} color="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Posts Recentes</h3>
                    <FbPostList posts={currentPage.recent_posts} />
                  </div>
                </div>
              </div>

              {/* ========== INSTAGRAM SECTION ========== */}
              {currentPage.instagram ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                      <Instagram className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className="font-bold text-slate-900 dark:text-white">
                        @{currentPage.instagram.username || currentPage.instagram.name}
                      </h2>
                      <p className="text-xs text-slate-400">Instagram Business · Últimos 28 dias</p>
                    </div>
                    {currentPage.instagram.profile_picture_url && (
                      <img src={currentPage.instagram.profile_picture_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-purple-200 dark:border-purple-800" />
                    )}
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricCard label="Seguidores" value={currentPage.instagram.followers_count || 0} icon={Users} color="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" />
                      <MetricCard label="Impressões" value={currentPage.instagram.insights['impressions'] || 0} icon={Eye} color="bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400" />
                      <MetricCard label="Alcance" value={currentPage.instagram.insights['reach'] || 0} icon={TrendingUp} color="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" />
                      <MetricCard label="Visitas ao Perfil" value={currentPage.instagram.insights['profile_views'] || 0} icon={BarChart3} color="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">Posts Recentes</h3>
                      <IgPostGrid posts={currentPage.instagram.recent_posts} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
                  <Instagram className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="font-bold text-slate-500 dark:text-slate-400">Nenhuma conta Instagram vinculada</p>
                  <p className="text-xs text-slate-400 mt-1">Vincule uma conta Instagram Business/Creator a esta página no Facebook Business Manager.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
