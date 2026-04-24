import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const GRAPH = 'https://graph.facebook.com/v19.0';

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'X-Requested-With, Accept, Content-Type, Authorization',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { access_token } = req.query;
  if (!access_token) return res.status(400).json({ error: 'access_token é obrigatório' });

  try {
    // 1. Listar todas as páginas do Facebook gerenciadas pelo usuário
    const pagesRes = await axios.get(`${GRAPH}/me/accounts`, {
      params: {
        access_token,
        fields: 'id,name,category,fan_count,followers_count,picture{url},instagram_business_account{id,name,username,profile_picture_url,followers_count,media_count}',
        limit: 50
      }
    });

    const pages = pagesRes.data.data || [];

    // 2. Para cada página, busca o page token + insights orgânicos
    const enriched = await Promise.all(pages.map(async (page: any) => {
      const pageToken = page.access_token;

      // Insights da Página Facebook (últimos 28 dias)
      let pageInsights: Record<string, number> = {};
      try {
        const metricsRes = await axios.get(`${GRAPH}/${page.id}/insights`, {
          params: {
            metric: 'page_fans,page_fan_adds_unique,page_impressions_organic_unique,page_engaged_users,page_post_engagements,page_views_total',
            period: 'day',
            since: Math.floor(Date.now() / 1000) - 28 * 86400,
            until: Math.floor(Date.now() / 1000),
            access_token: pageToken || access_token,
          }
        });

        for (const metric of metricsRes.data.data || []) {
          const values = metric.values || [];
          const total = values.reduce((s: number, v: any) => s + (Number(v.value) || 0), 0);
          pageInsights[metric.name] = total;
        }
      } catch (e: any) {
        console.warn(`[Social] Aviso: Falha ao buscar insights da página ${page.id}:`, e?.response?.data?.error?.message || e.message);
      }

      // Posts recentes da Página
      let recentPosts: any[] = [];
      try {
        const postsRes = await axios.get(`${GRAPH}/${page.id}/feed`, {
          params: {
            fields: 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares',
            limit: 5,
            access_token: pageToken || access_token,
          }
        });
        recentPosts = (postsRes.data.data || []).map((post: any) => ({
          id: post.id,
          message: post.message || post.story || '',
          created_time: post.created_time,
          image: post.full_picture || null,
          url: post.permalink_url || null,
          likes: post.likes?.summary?.total_count || 0,
          comments: post.comments?.summary?.total_count || 0,
          shares: post.shares?.count || 0,
        }));
      } catch (e) {
        console.warn(`[Social] Aviso: Falha ao buscar posts da página ${page.id}`);
      }

      // Dados do Instagram vinculado
      let instagram: any = null;
      if (page.instagram_business_account?.id) {
        const igId = page.instagram_business_account.id;

        // Insights do Instagram (últimos 28 dias)
        let igInsights: Record<string, number> = {};
        try {
          const igMetricsRes = await axios.get(`${GRAPH}/${igId}/insights`, {
            params: {
              metric: 'impressions,reach,profile_views,website_clicks',
              period: 'day',
              since: Math.floor(Date.now() / 1000) - 28 * 86400,
              until: Math.floor(Date.now() / 1000),
              access_token: pageToken || access_token,
            }
          });

          for (const metric of igMetricsRes.data.data || []) {
            const values = metric.values || [];
            const total = values.reduce((s: number, v: any) => s + (Number(v.value) || 0), 0);
            igInsights[metric.name] = total;
          }
        } catch (e: any) {
          console.warn(`[Social] Aviso: Falha ao buscar insights do Instagram ${igId}:`, e?.response?.data?.error?.message || e.message);
        }

        // Posts recentes do Instagram
        let igPosts: any[] = [];
        try {
          const igPostsRes = await axios.get(`${GRAPH}/${igId}/media`, {
            params: {
              fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp,is_shared_to_feed',
              limit: 9,
              access_token: pageToken || access_token,
            }
          });
          igPosts = igPostsRes.data.data || [];
        } catch (e) {
          console.warn(`[Social] Aviso: Falha ao buscar posts do Instagram ${igId}`);
        }

        instagram = {
          ...page.instagram_business_account,
          insights: igInsights,
          recent_posts: igPosts,
        };
      }

      return {
        id: page.id,
        name: page.name,
        category: page.category,
        picture: page.picture?.data?.url || null,
        fan_count: page.fan_count || 0,
        followers_count: page.followers_count || 0,
        insights: pageInsights,
        recent_posts: recentPosts,
        instagram,
      };
    }));

    res.status(200).json({ pages: enriched });
  } catch (error: any) {
    console.error('[Social Pages] Erro:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao buscar páginas sociais', details: error?.response?.data || error.message });
  }
}
