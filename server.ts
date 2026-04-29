import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import { supabaseAdmin } from "./api/lib/supabase-admin";
import crypto from "crypto";
import { auditLog } from "./api/lib/audit";
import { 
  format, 
  subDays, 
  addDays, 
  isBefore, 
  parseISO, 
  differenceInDays, 
  startOfDay, 
  endOfDay,
  min as minDate,
  max as maxDate
} from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// --- META ADS ROBUST SERVICE ---
class MetaAdsService {
  private static MAX_RETRIES = 3;
  private static INITIAL_BACKOFF = 2000; // 2s
  private static CHUNK_SIZE_DAYS = 15; // 15 days per window
  private static MAX_PAGES = 50;

  static async fetchWithRetry(url: string, config: any, retries = MetaAdsService.MAX_RETRIES): Promise<any> {
    try {
      return await axios.get(url, config);
    } catch (error: any) {
      const status = error?.response?.status;
      const errorData = error?.response?.data;
      const isRetryable = status === 429 || (status >= 500 && status <= 599) || error.code === 'ECONNABORTED';
      
      // Handle Meta specific rate limiting
      if (errorData?.error?.code === 17 || errorData?.error?.code === 80004) {
        const backoff = 10000; // 10s for rate limit
        console.warn(`[MetaAdsService] Rate limit atingindo. Aguardando ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return this.fetchWithRetry(url, config, retries); // Don't decrement retries for rate limit
      }

      if (isRetryable && retries > 0) {
        const backoff = MetaAdsService.INITIAL_BACKOFF * (MetaAdsService.MAX_RETRIES - retries + 1);
        console.warn(`[MetaAdsService] Erro ${status || error.code}. Retentando em ${backoff}ms... (${retries} restantes)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return this.fetchWithRetry(url, config, retries - 1);
      }
      throw error;
    }
  }

  static async fetchAllPages(url: string, config: any, maxPages = MetaAdsService.MAX_PAGES): Promise<any[]> {
    let allData: any[] = [];
    let nextUrl = url;
    let pageCount = 0;
    let currentConfig = { ...config };

    while (nextUrl && pageCount < maxPages) {
      const response = await this.fetchWithRetry(nextUrl, currentConfig);
      const data = response.data.data || [];
      allData = [...allData, ...data];
      
      if (response.data.paging?.next && data.length > 0) {
        nextUrl = response.data.paging.next;
        // After the first page, the nextUrl already contains the params
        currentConfig = { 
          headers: config.headers,
          timeout: config.timeout
        }; 
        pageCount++;
      } else {
        nextUrl = null;
      }
    }
    return allData;
  }

  static generateCacheKey(adAccountId: string, level: string, since: string, until: string, params: any): string {
    const CACHE_VERSION = "v6_aggressive_messaging_match";
    const cleanParams = { ...params };
    delete cleanParams.access_token;
    delete cleanParams.time_range;
    delete cleanParams.date_preset;
    
    const paramStr = JSON.stringify(cleanParams);
    const hash = crypto.createHash('md5').update(`${CACHE_VERSION}_${adAccountId}_${level}_${since}_${until}_${paramStr}`).digest('hex');
    return hash;
  }

  static deduplicate(data: any[], level: string): any[] {
    const map = new Map();
    data.forEach(item => {
      let key = '';
      if (level === 'ad') {
        key = `${item.ad_id}_${item.date_start}`;
      } else if (level === 'campaign') {
        key = `${item.campaign_id}_${item.date_start}`;
      } else {
        key = `${item.account_id || 'total'}_${item.date_start}`;
      }
      
      // Include breakdowns in the key to avoid merging different platform/device data
      if (item.publisher_platform) key += `_${item.publisher_platform}`;
      if (item.platform_position) key += `_${item.platform_position}`;
      if (item.impression_device) key += `_${item.impression_device}`;

      if (!map.has(key)) {
        // Clone to avoid modifying original objects in memory (important for cache)
        map.set(key, JSON.parse(JSON.stringify(item)));
      } else {
        const existing = map.get(key);
        
        // Merge actions array
        if (item.actions) {
          const existingActions = Array.isArray(existing.actions) ? existing.actions : [];
          const newActions = Array.isArray(item.actions) ? item.actions : [item.actions];
          
          // Deduplicate actions within the merged array by action_type
          const actionMap = new Map();
          [...existingActions, ...newActions].forEach(a => {
            if (!a.action_type) return;
            const val = parseFloat(String(a.value || '0').replace(',', '.'));
            if (actionMap.has(a.action_type)) {
              actionMap.set(a.action_type, actionMap.get(a.action_type) + val);
            } else {
              actionMap.set(a.action_type, val);
            }
          });
          existing.actions = Array.from(actionMap.entries()).map(([type, value]) => ({
            action_type: type,
            value: value.toString()
          }));
        }

        // Sum numeric metrics
        const numericFields = ['spend', 'impressions', 'clicks', 'reach'];
        numericFields.forEach(field => {
          if (item[field] !== undefined) {
            const currentVal = parseFloat(String(existing[field] || '0'));
            const newVal = parseFloat(String(item[field] || '0'));
            existing[field] = (currentVal + newVal).toString();
          }
        });
      }
    });
    return Array.from(map.values());
  }

  static async getInsightsInChunks(
    accessToken: string, 
    adAccountId: string, 
    level: string, 
    since: string, 
    until: string, 
    baseParams: any,
    useCache = true
  ) {
    const startDate = parseISO(since);
    const endDate = parseISO(until);
    let currentStart = startDate;
    let allResults: any[] = [];
    const chunks: { since: string, until: string }[] = [];

    while (isBefore(currentStart, endDate) || format(currentStart, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
      let currentEnd = addDays(currentStart, MetaAdsService.CHUNK_SIZE_DAYS - 1);
      if (!isBefore(currentEnd, endDate)) {
        currentEnd = endDate;
      }
      chunks.push({
        since: format(currentStart, 'yyyy-MM-dd'),
        until: format(currentEnd, 'yyyy-MM-dd')
      });
      currentStart = addDays(currentEnd, 1);
    }

    console.log(`[MetaAdsService] Processando ${chunks.length} janelas para ${adAccountId} (${level})`);

    const debugChunks: any[] = [];
    for (const chunk of chunks) {
      const cacheKey = this.generateCacheKey(adAccountId, level, chunk.since, chunk.until, baseParams);
      let chunkData: any[] | null = null;
      let source = 'live';
      
      if (useCache && supabaseAdmin) {
        try {
          const { data: cacheData, error: cacheError } = await supabaseAdmin
            .from('meta_cache')
            .select('*')
            .eq('id', cacheKey)
            .single();

          if (!cacheError && cacheData) {
            const today = format(new Date(), 'yyyy-MM-dd');
            const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
            
            // Normal cache hit (not for today/yesterday)
            if (chunk.until !== today && chunk.until !== yesterday && cacheData?.status === 'success') {
              console.log(`[MetaAdsService] Cache hit para ${chunk.since} - ${chunk.until}`);
              allResults = [...allResults, ...(cacheData.data as any[])];
              debugChunks.push({ ...chunk, status: 'cache_hit', source: 'cache' });
              continue;
            }
          }
        } catch (cacheError) {
          console.warn(`[MetaAdsService] Erro ao ler cache:`, cacheError);
        }
      }

      try {
        const params = {
          ...baseParams,
          time_range: JSON.stringify(chunk)
        };
        
        const url = `https://graph.facebook.com/v19.0/${adAccountId}/insights`;
        chunkData = await this.fetchAllPages(url, { 
          params, 
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 60000 
        });
        
        allResults = [...allResults, ...chunkData];
        debugChunks.push({ ...chunk, status: 'success', source: 'live', count: chunkData.length });

        if (useCache && supabaseAdmin) {
          await supabaseAdmin.from('meta_cache').upsert({
            id: cacheKey,
            ad_account_id: adAccountId,
            level,
            since: chunk.since,
            until: chunk.until,
            params: baseParams,
            data: chunkData,
            status: 'success',
            fetched_at: new Date().toISOString(),
            records_count: chunkData.length
          });
        }
      } catch (error: any) {
        const errorMsg = error?.response?.data || error.message;
        console.error(`[MetaAdsService] Erro na janela ${chunk.since} - ${chunk.until}:`, errorMsg);
        
        // --- CACHE FALLBACK ON FAILURE ---
        if (useCache && supabaseAdmin) {
          try {
            console.log(`[MetaAdsService] Tentando fallback para cache na janela ${chunk.since} - ${chunk.until}`);
            const { data: cacheData } = await supabaseAdmin
              .from('meta_cache')
              .select('*')
              .eq('id', cacheKey)
              .single();

            if (cacheData && cacheData.status === 'success' && Array.isArray(cacheData.data)) {
              console.log(`[MetaAdsService] Fallback de cache SUCESSO para ${chunk.since} - ${chunk.until}`);
              allResults = [...allResults, ...(cacheData.data as any[])];
              debugChunks.push({ ...chunk, status: 'fallback_cache', source: 'cache', error: error.message });
              continue;
            }
          } catch (fallbackError) {
            console.error(`[MetaAdsService] Falha no fallback de cache:`, fallbackError);
          }
        }
        
        debugChunks.push({ ...chunk, status: 'failed', error: error.message });
      }
    }

    const finalResults = this.deduplicate(allResults, level);
    return { data: finalResults, debug: debugChunks };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // --- GLOBAL REQUEST LOGGER ---
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[Request] ${req.method} ${req.path}`);
      // Log silencioso de toda requisição API
      auditLog({
        action: `API_REQUEST_${req.method}`,
        details: { path: req.path, query: req.query },
        req
      });
    }
    next();
  });

  // --- API KEY AUTH MIDDLEWARE ---
  const apiKeyAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing API Key" });
    }
    const apiKey = authHeader.split(" ")[1];
    
    try {
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('key_hash', apiKey)
        .eq('status', 'ativa')
        .single();

      if (error || !data) {
        return res.status(401).json({ error: "Unauthorized: Invalid or Revoked API Key" });
      }
      next();
    } catch (error) {
      console.error("Erro na autenticação API Key:", error);
      res.status(500).json({ error: "Erro interno na autenticação" });
    }
  };

  // --- OAUTH ROUTES ---

  // Helper: Exchange short-lived token for long-lived token
  async function getLongLivedToken(shortLivedToken: string) {
    try {
      const response = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
        params: {
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          fb_exchange_token: shortLivedToken
        }
      });
      return response.data.access_token;
    } catch (error) {
      console.error("Erro ao obter long-lived token:", error);
      return shortLivedToken; // Fallback to short-lived
    }
  }

  // Meta Ads OAuth (Facebook)
  app.get("/api/auth/meta/url", (req, res) => {
    const { cliente_id, origin } = req.query;
    const appId = process.env.META_APP_ID;
    const baseUrl = (origin as string) || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = process.env.META_REDIRECT_URI || `${baseUrl}/api/auth/facebook/callback`;
    const scopes = ["ads_read", "business_management"].join(",");
    
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${cliente_id}`;
    res.json({ url });
  });

  app.get("/api/auth/facebook/callback", async (req, res) => {
    const { code, state: clienteId } = req.query;

    if (!code) {
      return res.status(400).send("Código de autorização ausente.");
    }

    const redirectUri = process.env.META_REDIRECT_URI || `${process.env.APP_URL}/api/auth/facebook/callback`;

    try {
      
      console.log("--- DEBUG AUTH ---");
      console.log("META_APP_ID:", process.env.META_APP_ID?.substring(0, 5) + "...");
      console.log("META_APP_SECRET:", process.env.META_APP_SECRET?.substring(0, 5) + "...");
      console.log("REDIRECT_URI:", redirectUri);
      console.log("------------------");

      // 1. Exchange code for short-lived access token
      const tokenResponse = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: redirectUri,
          code
        }
      });

      let accessToken = tokenResponse.data.access_token;

      // 2. Exchange for long-lived token
      accessToken = await getLongLivedToken(accessToken);

      // 3. Save to Supabase if clienteId is provided
      if (clienteId && clienteId !== "undefined") {
        await supabaseAdmin
          .from('clientes')
          .update({
            meta_ads_access_token: accessToken,
            meta_ads_conectado: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', clienteId as string);
      }

      // 4. Fetch Ad Accounts
      const adAccountsResponse = await axios.get("https://graph.facebook.com/v19.0/me/adaccounts", {
        params: {
          access_token: accessToken,
          fields: "name,account_id,currency,timezone_name,balance,amount_spent"
        }
      });

      const adAccounts = adAccountsResponse.data.data.map((acc: any) => {
        const rawBalance = parseFloat(acc.balance || 0) / 100;
        const spendCap = parseFloat(acc.spend_cap || 0) / 100;
        const amountSpent = parseFloat(acc.amount_spent || 0) / 100;

        let calculatedBalance = 0;
        
        // Prioridade: Fundos Disponíveis (Pré-pago)
        const fundingAmount = acc.funding_source_details?.display_amount;
        if (fundingAmount) {
          const numericValue = parseFloat(fundingAmount.replace(/[^\d,.-]/g, '').replace(',', '.'));
          if (!isNaN(numericValue)) calculatedBalance = numericValue;
        }

        if (calculatedBalance === 0) {
          if (spendCap > 0) {
            calculatedBalance = spendCap - amountSpent;
          } else {
            calculatedBalance = Math.abs(rawBalance);
          }
        }

        return {
          ...acc,
          balance: calculatedBalance
        };
      });

      // 5. Return success and close popup
      res.send(`
        <html>
          <body>
            <script>
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'OAUTH_AUTH_SUCCESS', 
                    platform: 'meta',
                    accessToken: '${accessToken}',
                    adAccounts: ${JSON.stringify(adAccounts)},
                    expiresIn: 5184000 // 60 days for long-lived token
                  }, '*');
                  setTimeout(() => window.close(), 1000);
                } else {
                  window.location.href = '/admin/dashboard';
                }
              </script>
              <p>Autenticação Meta Ads concluída. Redirecionando...</p>
            </div>
          </body>
        </html>
      `);

    } catch (error: any) {
      console.error("❌ ERRO NO CALLBACK FACEBOOK:");
      console.error("Mensagem:", error.message);
      if (error.response?.data) {
        console.error("Detalhes do Facebook:", JSON.stringify(error.response.data, null, 2));
      }
      console.error("Redirect URI usada:", redirectUri);
      res.status(500).send("Erro na autenticação com Meta Ads");
    }
  });

  // Meta Ads Insights
  app.get("/api/meta/insights", async (req, res) => {
    const { access_token, ad_account_id, date_preset, since, until, debug, backfill, nocache } = req.query;
    const isDebug = debug === '1' || debug === 'true';
    const isBackfill = backfill === '1' || backfill === 'true';
    const useCache = !(nocache === '1' || nocache === 'true');

    if (!access_token || !ad_account_id) {
      return res.status(400).json({ 
        error: "Parâmetros 'access_token' e 'ad_account_id' são obrigatórios." 
      });
    }

    try {
      const accountId = (ad_account_id as string).startsWith('act_') ? ad_account_id : `act_${ad_account_id}`;
      
      // Log de Auditoria: Início da busca
      auditLog({
        action: 'META_INSIGHTS_FETCH',
        entityType: 'ad_account',
        entityId: accountId,
        details: { date_preset, since, until },
        req
      });
      
      // 1. Determinar Período Final
      let finalSince = since as string;
      let finalUntil = until as string;
      let usePreset = (date_preset as string) || 'last_30d';

      if (!finalSince || !finalUntil) {
        const today = new Date();
        finalUntil = format(today, 'yyyy-MM-dd');
        
        if (usePreset === 'maximum') {
          finalSince = process.env.META_BACKFILL_START_DATE || '2023-01-01';
        } else if (usePreset === 'last_30d') {
          finalSince = format(subDays(today, 30), 'yyyy-MM-dd');
        } else if (usePreset === 'last_90d') {
          finalSince = format(subDays(today, 90), 'yyyy-MM-dd');
        } else if (usePreset === 'this_month') {
          finalSince = format(startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), 'yyyy-MM-dd');
        } else if (usePreset === 'last_month') {
          const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          const lastDayLastMonth = subDays(firstDayThisMonth, 1);
          finalSince = format(startOfDay(new Date(lastDayLastMonth.getFullYear(), lastDayLastMonth.getMonth(), 1)), 'yyyy-MM-dd');
          finalUntil = format(lastDayLastMonth, 'yyyy-MM-dd');
        } else {
          finalSince = format(subDays(today, 30), 'yyyy-MM-dd');
        }
      }

      console.log(`[MetaAds] Iniciando coleta robusta para ${accountId} de ${finalSince} até ${finalUntil} (Backfill: ${isBackfill})`);

      // 2. Definir Parâmetros Base
      const baseDetailedParams = {
        fields: 'campaign_name,adset_name,ad_name,campaign_id,adset_id,ad_id,impressions,clicks,spend,reach,frequency,actions,cost_per_action_type,cpm,cpp,ctr,cpc,date_start,date_stop',
        level: 'ad',
        time_increment: 1,
        action_breakdowns: 'action_type',
        limit: 1000
      };
      const baseCampaignParams = {
        fields: 'campaign_id,campaign_name,impressions,clicks,spend,reach,frequency,actions,objective,optimization_goal,date_start,date_stop',
        level: 'campaign',
        time_increment: 1,
        action_breakdowns: 'action_type',
        limit: 1000
      };

      const basePlatformParams = {
        fields: 'campaign_id,actions,date_start',
        level: 'campaign',
        time_increment: 1,
        breakdowns: 'publisher_platform',
        action_breakdowns: 'action_type',
        limit: 1000
      };

      // 3. Executar Coleta em Chunks (Dados Diários para Gráficos)
      const [detailedRes, campaignRes, platformRes] = await Promise.all([
        MetaAdsService.getInsightsInChunks(access_token as string, accountId as string, 'ad', finalSince, finalUntil, baseDetailedParams, useCache),
        MetaAdsService.getInsightsInChunks(access_token as string, accountId as string, 'campaign', finalSince, finalUntil, baseCampaignParams, useCache),
        MetaAdsService.getInsightsInChunks(access_token as string, accountId as string, 'campaign', finalSince, finalUntil, basePlatformParams, useCache)
      ]);

      const rawDetailedData = detailedRes.data;
      const rawCampaignData = campaignRes.data;
      const rawPlatformData = platformRes.data;

      // 4. Buscar Totais do Período (sem time_increment) para Rankings Precisos (Frequência/Alcance)
      const campaignTotalsParams = { ...baseCampaignParams };
      delete (campaignTotalsParams as any).time_increment;
      (campaignTotalsParams as any).time_range = JSON.stringify({ since: finalSince, until: finalUntil });

      const adTotalsParams = { ...baseDetailedParams };
      delete (adTotalsParams as any).time_increment;
      (adTotalsParams as any).time_range = JSON.stringify({ since: finalSince, until: finalUntil });

      const [campaignTotals, adTotals] = await Promise.all([
        MetaAdsService.fetchAllPages(`https://graph.facebook.com/v19.0/${accountId}/insights`, {
          headers: { Authorization: `Bearer ${access_token}` },
          params: campaignTotalsParams,
          timeout: 45000
        }),
        MetaAdsService.fetchAllPages(`https://graph.facebook.com/v19.0/${accountId}/insights`, {
          headers: { Authorization: `Bearer ${access_token}` },
          params: adTotalsParams,
          timeout: 45000
        })
      ]).catch(err => {
        console.warn(`[MetaAds] Erro ao buscar totais detalhados:`, err.message);
        return [[], []];
      });

      // 5. Buscar Resumo da Conta
      let summaryData: any = {};
      try {
        const summaryParams: any = {
          fields: 'reach,frequency,impressions,clicks,spend,actions',
          level: 'account',
          action_breakdowns: 'action_type',
          time_range: JSON.stringify({ since: finalSince, until: finalUntil })
        };
        const summaryRes = await MetaAdsService.fetchWithRetry(`https://graph.facebook.com/v19.0/${accountId}/insights`, {
          headers: { Authorization: `Bearer ${access_token}` },
          params: summaryParams,
          timeout: 45000
        });
        summaryData = summaryRes.data.data?.[0] || {};
      } catch (summaryError: any) {
        console.warn(`[MetaAds] Falha ao buscar resumo da conta (usando agregação manual):`, summaryError.message);
        summaryData = {
          impressions: rawCampaignData.reduce((acc, curr) => acc + parseInt(curr.impressions || 0), 0),
          clicks: rawCampaignData.reduce((acc, curr) => acc + parseInt(curr.clicks || 0), 0),
          spend: rawCampaignData.reduce((acc, curr) => acc + parseFloat(curr.spend || 0), 0),
          actions: []
        };
      }

      // 5. Buscar Metadados das Campanhas
      let campaignMetadata: any[] = [];
      try {
        const metaRes = await MetaAdsService.fetchWithRetry(`https://graph.facebook.com/v19.0/${accountId}/campaigns`, {
          headers: { Authorization: `Bearer ${access_token}` },
          params: {
            fields: 'id,name,objective,optimization_goal,promoted_object,smart_promotion_type,adsets{id,name,promoted_object,ads{id,name,creative{id,name,object_story_spec{link_data{link,call_to_action{value{link}}}}}}}',
            limit: 250
          },
          timeout: 45000
        });
        campaignMetadata = metaRes.data.data || [];
      } catch (metaError: any) {
        console.warn(`[MetaAds] Falha ao buscar metadados das campanhas:`, metaError.message);
      }

      const normalizeActions = (actionsInput: any): any[] => {
        if (!actionsInput) return [];
        
        let actions: any[] = [];
        if (typeof actionsInput === 'string') {
          try {
            actionsInput = JSON.parse(actionsInput);
          } catch (e) {
            // If it's not JSON, it might be a raw string value or something else
            return [];
          }
        }

        if (Array.isArray(actionsInput)) {
          actions = actionsInput;
        } else if (typeof actionsInput === 'object' && actionsInput !== null) {
          if (actionsInput.data && Array.isArray(actionsInput.data)) {
            actions = actionsInput.data;
          } else if (actionsInput.action_type && (actionsInput.value !== undefined)) {
            actions = [actionsInput];
          } else {
            // Handle as a map of { action_type: value }
            actions = Object.entries(actionsInput).map(([key, val]) => ({
              action_type: key,
              value: val
            }));
          }
        }
        return Array.isArray(actions) ? actions : [];
      };

      const getMessagingConversationsStarted = (actionsInput: any): number => {
        const actions = normalizeActions(actionsInput);
        if (!actions || !Array.isArray(actions)) return 0;
        return actions.reduce((acc: number, a: any) => {
          if (!a || typeof a !== 'object') return acc;
          const actionType = String(a.action_type || "").toLowerCase();
          if (actionType.startsWith("onsite_conversion.messaging_conversation_started")) {
            const val = parseFloat(String(a.value || '0').replace(',', '.'));
            return acc + (isNaN(val) ? 0 : val);
          }
          return acc;
        }, 0);
      };

      const debugInfo: any = isDebug ? {
        audit_logs: [
          { event: 'collection_start', since: finalSince, until: finalUntil, accountId },
          { 
            event: 'chunks_processed', 
            detailed_chunks: detailedRes.debug,
            campaign_chunks: campaignRes.debug,
            platform_chunks: platformRes.debug
          },
          { 
            event: 'record_counts', 
            rawDetailedData: rawDetailedData.length, 
            rawCampaignData: rawCampaignData.length,
            rawPlatformData: rawPlatformData.length,
            campaignTotals: campaignTotals.length,
            adTotals: adTotals.length
          }
        ],
        destination_inference: {},
        campaign_results_preview: [],
        request_params_used: { baseDetailedParams, baseCampaignParams, basePlatformParams, useCache }
      } : null;

      // Sample action types for debugging (safe)
      if (isDebug && rawCampaignData.length > 0) {
        const sampleActions = new Set<string>();
        rawCampaignData.slice(0, 30).forEach(item => {
          const actions = normalizeActions(item.actions);
          actions.forEach((a: any) => {
            if (a.action_type) sampleActions.add(a.action_type);
          });
        });
        debugInfo.sample_action_types = Array.from(sampleActions).slice(0, 30);
      }

      // --- PROCESSAMENTO DE DADOS ---
      const waUrlMatches = (process.env.META_WHATSAPP_URL_MATCH || 'wa.me,api.whatsapp.com,whatsapp').split(',').map(s => s.trim().toLowerCase());
      const waResultActionTypes = (process.env.META_RESULTS_WHATSAPP_ACTION_TYPE || 'onsite_conversion.messaging_conversation_started_7d')
        .split(',')
        .map(s => s.trim());

      // Add common fallbacks if not already present to ensure robustness across different accounts/API versions
      const waFallbacks = [
        'onsite_conversion.messaging_conversation_started_7d',
        'onsite_conversion.messaging_conversation_started',
        'messaging_conversation_started_7d',
        'messaging_conversation_started',
        'onsite_conversion.messaging_conversation_started_28d',
        'messaging_conversation_started_28d'
      ];
      waFallbacks.forEach(f => {
        if (!waResultActionTypes.some(t => t.toLowerCase() === f.toLowerCase())) {
          waResultActionTypes.push(f);
        }
      });

      const leadActionTypes = [
        'lead', 
        'contact', 
        'submit_form', 
        'complete_registration', 
        'offsite_conversion.fb_pixel_lead',
        'offsite_conversion.fb_pixel_complete_registration', 
        'app_custom_event.fb_mobile_complete_registration'
      ];

      const extractActions = (actionsInput: any, types: string[]) => {
        const actions = normalizeActions(actionsInput);
        return actions.reduce((acc: number, a: any) => {
          if (!a || typeof a !== 'object') return acc;
          const actionType = String(a.action_type || '').toLowerCase();
          const isMatch = types.some(type => actionType === type.toLowerCase());
          if (isMatch) {
            const val = parseFloat(String(a.value || '0').replace(',', '.'));
            return acc + (isNaN(val) ? 0 : val);
          }
          return acc;
        }, 0);
      };

      const getWaConversations = (actionsInput: any) => {
        return getMessagingConversationsStarted(actionsInput);
      };

      const metaMap = new Map();
      campaignMetadata.forEach(m => metaMap.set(m.id, m));

      const getCampaignContext = (campaignId: string, campaignName: string, item: any) => {
        const metadata = metaMap.get(campaignId);
        const name = String(campaignName || '').toLowerCase();
        const objective = String(item.objective || metadata?.objective || '').toUpperCase();
        const actions = item.actions || [];
        const waConvs = getWaConversations(actions);
        
        let destination = "outro";
        let inferenceSignal = "C (Nome)";

        let hasWaUrl = false;
        if (metadata) {
          const checkUrl = (url: string) => url && waUrlMatches.some(match => url.toLowerCase().includes(match));
          if (metadata.promoted_object?.object_store_url && checkUrl(metadata.promoted_object.object_store_url)) hasWaUrl = true;
          metadata.adsets?.data?.forEach((as: any) => {
            if (as.promoted_object?.object_store_url && checkUrl(as.promoted_object.object_store_url)) hasWaUrl = true;
            as.ads?.data?.forEach((ad: any) => {
              const link = ad.creative?.object_story_spec?.link_data?.link;
              const ctaLink = ad.creative?.object_story_spec?.link_data?.call_to_action?.value?.link;
              if (checkUrl(link) || checkUrl(ctaLink)) hasWaUrl = true;
            });
          });
        }

        if (waConvs > 0) { destination = "whatsapp"; inferenceSignal = "0 (Conversas Ativas)"; }
        else if (hasWaUrl) { destination = "whatsapp"; inferenceSignal = "A (Metadados - URL)"; }
        else if (objective === 'MESSAGES' || objective === 'OUTCOME_MESSAGES') { destination = "whatsapp"; inferenceSignal = "B (Objetivo)"; }
        else if (actions.some((a: any) => String(a.action_type || '').toLowerCase().includes('messaging'))) { destination = "whatsapp"; inferenceSignal = "B (Ações de Mensagem)"; }
        else if (name.includes('whatsapp') || name.includes('wa.me')) { destination = "whatsapp"; inferenceSignal = "C (Nome)"; }

        if (isDebug) debugInfo.destination_inference[campaignId] = { destination, signal: inferenceSignal, waConvs };
        return { destination };
      };

      const calculateResults = (item: any, context: any, dateStart: string) => {
        const { destination } = context;
        const actions = item.actions || [];
        const waConvs = getWaConversations(actions);
        const leads = extractActions(actions, leadActionTypes);
        
        let label = "Resultados";
        let value = 0;
        let sourceUsed = "N/A";

        // If we have WhatsApp conversations, we prioritize them as the main result
        // even if the destination detection was uncertain.
        if (destination === "whatsapp" || waConvs > 0) {
          label = "Conversas WA";
          value = waConvs;
          sourceUsed = "WhatsApp Actions";
          
          // If waConvs is 0 but we are sure it's a WhatsApp campaign, 
          // we still keep the label but value is 0.
        } else {
          value = leads;
          label = "Conversões";
          sourceUsed = "Lead Action Types";
        }

        if (isDebug && (destination === "whatsapp" || waConvs > 0)) {
          debugInfo.campaign_results_preview.push({ 
            campaign_name: item.campaign_name || item.ad_name, 
            destination, 
            label, 
            value, 
            source: sourceUsed, 
            date: dateStart, 
            waConvs, 
            leads,
            raw_actions_sample: normalizeActions(actions).slice(0, 10)
          });
        } else if (isDebug) {
          debugInfo.campaign_results_preview.push({ campaign_name: item.campaign_name || item.ad_name, destination, label, value, source: sourceUsed, date: dateStart, waConvs, leads });
        }
        return { value, label, sourceUsed };
      };

      const formattedData = rawDetailedData.map(item => {
        const context = getCampaignContext(item.campaign_id, item.campaign_name, item);
        const results = calculateResults(item, context, item.date_start);
        const waConvs = getWaConversations(item.actions);
        const leads = extractActions(item.actions, leadActionTypes);

        return {
          ...item,
          results_value: results.value,
          results_label: results.label,
          whatsapp_conversations: waConvs,
          wa_conversations: waConvs,
          leads: leads,
          spend: parseFloat(item.spend || 0),
          impressions: parseInt(item.impressions || 0),
          clicks: parseInt(item.clicks || 0),
          reach: parseInt(item.reach || 0),
          frequency: parseFloat(item.frequency || 0),
          cpm: parseFloat(item.cpm || 0),
          ctr: parseFloat(item.ctr || 0)
        };
      });

      const totalWaConvsFromSummary = getWaConversations(summaryData.actions || []);
      const totalLeadsFromSummary = extractActions(summaryData.actions || [], leadActionTypes);

      const totalWaConvs = totalWaConvsFromSummary > 0 
        ? totalWaConvsFromSummary 
        : rawCampaignData.reduce((acc, item) => acc + getWaConversations(item.actions), 0);
        
      const totalLeads = totalLeadsFromSummary > 0
        ? totalLeadsFromSummary
        : rawCampaignData.reduce((acc, item) => acc + extractActions(item.actions, leadActionTypes), 0);

      // 7. Processar Campanhas (Usando Totais para Alcance/Frequência se disponível)
      const campaignInsightsMap = new Map();
      
      // Primeiro, inicializar com os totais precisos do período
      campaignTotals.forEach(item => {
        const id = item.campaign_id;
        const context = getCampaignContext(id, item.campaign_name, item);
        const results = calculateResults(item, context, item.date_start);
        const waConvs = getWaConversations(item.actions);
        const leads = extractActions(item.actions, leadActionTypes);
        
        campaignInsightsMap.set(id, {
          campanha_id_externo: id,
          campanha_nome: item.campaign_name,
          investimento: parseFloat(item.spend || 0),
          cliques: parseInt(item.clicks || 0),
          conversoes: leads,
          impressoes: parseInt(item.impressions || 0),
          reach: parseInt(item.reach || 0),
          frequency: parseFloat(item.frequency || 0),
          whatsapp_conversations: waConvs,
          wa_conversations: waConvs,
          resultados: results.value,
          resultados_label: results.label,
          plataforma: 'meta'
        });
      });

      // Se não houver totais (erro ou vazio), usar agregação dos dados diários (menos preciso para reach/frequency)
      if (campaignInsightsMap.size === 0) {
        rawCampaignData.forEach(item => {
          const id = item.campaign_id;
          const context = getCampaignContext(id, item.campaign_name, item);
          const results = calculateResults(item, context, item.date_start);
          const waConvs = getWaConversations(item.actions);
          const leads = extractActions(item.actions, leadActionTypes);

          if (!campaignInsightsMap.has(id)) {
            campaignInsightsMap.set(id, {
              campanha_id_externo: id,
              campanha_nome: item.campaign_name,
              investimento: 0,
              cliques: 0,
              conversoes: 0,
              impressoes: 0,
              reach: 0,
              frequency: 0,
              whatsapp_conversations: 0,
              resultados: 0,
              resultados_label: results.label,
              plataforma: 'meta'
            });
          }

          const entry = campaignInsightsMap.get(id);
          entry.investimento += parseFloat(item.spend || 0);
          entry.cliques += parseInt(item.clicks || 0);
          entry.conversoes += leads;
          entry.impressoes += parseInt(item.impressions || 0);
          entry.reach += parseInt(item.reach || 0);
          entry.whatsapp_conversations += waConvs;
          entry.resultados += results.value;
        });
      }

      // 8. Formatar Dados de Anúncios (Usando Totais para Rankings se disponível)
      const adTotalsMap = new Map();
      adTotals.forEach(item => {
        const context = getCampaignContext(item.campaign_id, item.campaign_name, item);
        const results = calculateResults(item, context, item.date_start);
        const waConvs = getWaConversations(item.actions);
        adTotalsMap.set(item.ad_id, {
          ...item,
          conversoes: extractActions(item.actions, leadActionTypes),
          whatsapp_conversations: waConvs,
          wa_conversations: waConvs,
          resultados: results.value,
          resultados_label: results.label,
          frequency: parseFloat(item.frequency || 0),
          reach: parseInt(item.reach || 0),
          investimento: parseFloat(item.spend || 0),
          cliques: parseInt(item.clicks || 0),
          impressoes: parseInt(item.impressions || 0)
        });
      });

      const response = {
        summary: {
          reach: parseInt(summaryData.reach || 0),
          frequency: parseFloat(summaryData.frequency || 0),
          impressions: parseInt(summaryData.impressions || 0),
          clicks: parseInt(summaryData.clicks || 0),
          spend: parseFloat(summaryData.spend || 0),
          leads: totalLeads,
          whatsapp_conversations: totalWaConvs,
          wa_conversations: totalWaConvs
        },
        data: formattedData,
        ad_totals: Array.from(adTotalsMap.values()),
        campaigns: Array.from(campaignInsightsMap.values()),
        debug: debugInfo
      };

      res.json(response);
    } catch (error: any) {
      console.error("[MetaAds] Erro crítico na API de Insights:", error?.response?.data || error.message);
      res.status(500).json({ 
        error: "Erro ao buscar dados do Meta Ads",
        details: error?.response?.data || error.message
      });
    }
  });

  // Meta Ads Sync Account Details (Balance, etc)
  app.get("/api/meta/sync-accounts", async (req, res) => {
    const { access_token, account_ids } = req.query;

    if (!access_token || !account_ids) {
      return res.status(400).json({ error: "Parâmetros 'access_token' e 'account_ids' são obrigatórios." });
    }

    try {
      const ids = (account_ids as string).split(',');
      const results = [];

      for (const id of ids) {
        const accountId = id.startsWith('act_') ? id : `act_${id}`;
        try {
          const response = await axios.get(`https://graph.facebook.com/v19.0/${accountId}`, {
            headers: { Authorization: `Bearer ${access_token}` },
            params: { fields: 'name,balance,currency,amount_spent,spend_cap,account_status,funding_source_details' }
          });

          const data = response.data;
          
          // Lógica de Saldo para Meta Ads:
          // 1. Priorizamos o 'display_amount' do funding_source_details (Saldo real em caixa para pré-pago)
          // 2. Se não houver, tentamos (spend_cap - amount_spent)
          // 3. Por fim, usamos o Math.abs(balance)
          
          let calculatedBalance = 0;
          
          const rawBalance = parseFloat(data.balance || 0) / 100;
          const spendCap = parseFloat(data.spend_cap || 0) / 100;
          const amountSpent = parseFloat(data.amount_spent || 0) / 100;

          // Tenta pegar o saldo direto dos detalhes da fonte de pagamento (mais preciso para pré-pago)
          const fundingAmount = data.funding_source_details?.display_amount;
          
          if (fundingAmount) {
            // O display_amount vem formatado como string, ex: "R$ 283,05"
            // Vamos extrair apenas os números
            const numericValue = parseFloat(fundingAmount.replace(/[^\d,.-]/g, '').replace(',', '.'));
            if (!isNaN(numericValue)) {
              calculatedBalance = numericValue;
            }
          } 
          
          if (calculatedBalance === 0) {
            if (spendCap > 0) {
              calculatedBalance = spendCap - amountSpent;
            } else {
              calculatedBalance = Math.abs(rawBalance);
            }
          }

          const formatted = {
            id: id,
            balance: calculatedBalance,
            currency: data.currency,
            updated_at: new Date().toISOString()
          };

          // Update in Supabase
          if (supabaseAdmin) {
            const { error: updateError } = await supabaseAdmin.from('meta_ads_accounts').update(formatted).eq('id', id);
            if (updateError) {
              console.error(`[MetaAds] Erro ao salvar saldo no DB para conta ${id}:`, updateError.message);
              // Mesmo com erro no DB, vamos retornar os dados para o frontend mostrar
            }
          }

          results.push(formatted);
        } catch (err: any) {
          const metaError = err.response?.data?.error?.message || err.message;
          console.error(`[MetaAds] Erro na API da Meta para conta ${id}:`, metaError);
          return res.status(400).json({ error: `Erro na Meta: ${metaError}` });
        }
      }

      res.json({ success: true, accounts: results });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao sincronizar contas", details: error.message });
    }
  });

  // Meta Ads OAuth (Legacy/Internal - Keeping for compatibility if needed)

  // Google Ads OAuth
  app.get("/api/auth/google/url", (req, res) => {
    try {
      const { cliente_id, origin } = req.query;
      console.log("[GoogleAds] Generating Auth URL for:", cliente_id);

      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error("[GoogleAds] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
        return res.status(500).json({ error: "Configuração do Google Ads incompleta no servidor." });
      }

      // Use a fixed redirect URI if provided, otherwise fallback to dynamic
      let redirectUri = process.env.GOOGLE_REDIRECT_URI;
      
      if (!redirectUri) {
        const rawBaseUrl = (origin as string) || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        // Clean up: remove trailing slash and ensure https
        let cleanBaseUrl = rawBaseUrl.replace(/\/$/, "");
        if (!cleanBaseUrl.startsWith("http")) {
          cleanBaseUrl = `https://${cleanBaseUrl}`;
        } else if (cleanBaseUrl.startsWith("http://") && !cleanBaseUrl.includes("localhost")) {
          cleanBaseUrl = cleanBaseUrl.replace("http://", "https://");
        }
        redirectUri = `${cleanBaseUrl}/api/auth/google/callback`;
      }

      console.log("[GoogleAds] Final Redirect URI:", redirectUri);

      const client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const url = client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/adwords"],
        prompt: "consent",
        state: cliente_id as string
      });
      
      res.json({ url });
    } catch (error: any) {
      console.error("[GoogleAds] Erro ao gerar URL:", error);
      res.status(500).json({ error: "Erro ao gerar URL de autenticação." });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
    const clienteId = state as string;
    console.log("[GoogleAds] Callback received for state:", state);

    try {
      if (!code) throw new Error("Código de autorização ausente.");

      let redirectUri = process.env.GOOGLE_REDIRECT_URI;
      if (!redirectUri) {
        const rawBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        let cleanBaseUrl = rawBaseUrl.replace(/\/$/, "");
        if (!cleanBaseUrl.startsWith("http")) {
          cleanBaseUrl = `https://${cleanBaseUrl}`;
        } else if (cleanBaseUrl.startsWith("http://") && !cleanBaseUrl.includes("localhost")) {
          cleanBaseUrl = cleanBaseUrl.replace("http://", "https://");
        }
        redirectUri = `${cleanBaseUrl}/api/auth/google/callback`;
      }

      console.log("[GoogleAds] Callback Redirect URI:", redirectUri);

      const client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const { tokens } = await client.getToken(code as string);
      console.log("[GoogleAds] Tokens received successfully");
      
      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token;
      const adAccounts: any[] = [];

      // Fetch accounts using v18
      try {
        const devToken = process.env.GOOGLE_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
        if (devToken && accessToken) {
          const apiVersion = "v17";
          const listUrl = `https://googleads.googleapis.com/${apiVersion}/customers:listAccessibleCustomers`;
          
          console.log(`[GoogleAds] Buscando contas acessíveis (${apiVersion})...`);
          
          const headers = {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': devToken
          };

          let customersResponse;
          try {
            customersResponse = await axios.get(listUrl, { headers });
          } catch (err: any) {
            console.error("[GoogleAds] Erro na requisição listAccessibleCustomers:");
            console.error(`[GoogleAds] URL tentada: ${listUrl}`);
            console.error(`[GoogleAds] Headers enviados: ${JSON.stringify({
              ...headers,
              Authorization: "Bearer [REDACTED]",
              'developer-token': devToken.substring(0, 4) + "..."
            })}`);
            
            if (err.response) {
              console.error(`[GoogleAds] Status do erro: ${err.response.status}`);
              console.error(`[GoogleAds] Dados do erro: ${JSON.stringify(err.response.data)}`);
            }
            throw err;
          }

          const resourceNames = customersResponse.data.resourceNames || [];
          console.log(`[GoogleAds] ${resourceNames.length} contas encontradas.`);

          for (const resourceName of resourceNames) {
            const customerId = resourceName.split('/')[1];
            try {
              const searchUrl = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`;
              const searchHeaders = {
                Authorization: `Bearer ${accessToken}`,
                'developer-token': devToken,
                'login-customer-id': customerId
              };

              const queryResponse = await axios.post(
                searchUrl,
                { query: "SELECT customer.descriptive_name, customer.id, customer.currency_code FROM customer" },
                { headers: searchHeaders }
              );

              const customer = queryResponse.data.results?.[0]?.customer;
              if (customer) {
                const accountData = {
                  id: customer.id,
                  name: customer.descriptive_name || `Conta ${customer.id}`,
                  currency: customer.currency_code,
                  platform: 'google',
                  updated_at: new Date().toISOString()
                };
                adAccounts.push(accountData);
                await supabaseAdmin.from('google_ads_accounts').upsert(accountData);
              }
            } catch (err: any) {
              console.error(`[GoogleAds] Erro na conta ${customerId}:`, err.response?.data || err.message);
            }
          }
        }
      } catch (fetchError) {
        console.error("[GoogleAds] Falha na busca de contas.");
      }
      
      // Save refresh token
      if (clienteId && clienteId !== "undefined" && refreshToken) {
        await supabaseAdmin
          .from('clientes')
          .update({
            google_ads_refresh_token: refreshToken,
            google_ads_conectado: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', clienteId);
      }

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 1rem; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
              <h2 style="color: #0f172a; margin-bottom: 0.5rem;">Conexão Bem-sucedida!</h2>
              <p style="color: #64748b;">Aguarde, estamos finalizando a configuração...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'OAUTH_AUTH_SUCCESS', 
                    platform: 'google',
                    adAccounts: ${JSON.stringify(adAccounts)}
                  }, '*');
                  setTimeout(() => window.close(), 1000);
                } else {
                  window.location.href = '/admin/dashboard';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("[GoogleAds] Erro no callback:", error);
      res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef2f2;">
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 1rem; border: 1px solid #fee2e2;">
              <h2 style="color: #991b1b; margin-bottom: 0.5rem;">Erro na Autenticação</h2>
              <p style="color: #b91c1c;">${error.message || "Ocorreu um erro ao processar a conexão com o Google Ads."}</p>
              <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #ef4444; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Fechar Janela</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  // --- API V1 ENDPOINTS ---

  app.get("/api/v1/clientes", apiKeyAuth, async (req, res) => {
    try {
      const { data: items, error } = await supabaseAdmin.from('clientes').select('*');
      if (error) throw error;
      
      const safeItems = (items || []).map(item => {
        const { meta_ads_access_token, google_ads_refresh_token, ...safeData } = item;
        return safeData;
      });
      res.json({ meta: { total: safeItems.length }, items: safeItems });
    } catch (error) {
      res.status(500).json({ error: "Erro ao listar clientes" });
    }
  });

  app.get("/api/v1/clientes/:id/campanhas", apiKeyAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const { data: items, error } = await supabaseAdmin
        .from('dados_campanhas')
        .select('*')
        .eq('cliente_id', id);
      
      if (error) throw error;
      res.json({ meta: { total: items?.length || 0 }, items });
    } catch (error) {
      res.status(500).json({ error: "Erro ao listar campanhas" });
    }
  });

  app.post("/api/v1/busca-ia", apiKeyAuth, async (req, res) => {
    const { query: userQuery, cliente_id, modo = "enxuto" } = req.body;
    
    if (!userQuery) return res.status(400).json({ error: "Query é obrigatória" });

    try {
      const startTime = Date.now();

      // 1. Interpret query using Gemini
      const interpretationResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Interprete a seguinte busca de um gestor de tráfego sobre dados de campanhas: "${userQuery}". 
        Extraia filtros como: plataforma (meta, google), métrica alvo (investimento, cliques, ctr, roas), período (últimos 7 dias, este mês), e status.
        Responda APENAS em JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plataforma: { type: Type.STRING },
              metrica: { type: Type.STRING },
              periodo: { type: Type.STRING },
              status: { type: Type.STRING },
              intencao: { type: Type.STRING }
            }
          }
        }
      });

      const filtros = JSON.parse(interpretationResponse.text || "{}");

      // 2. Fetch data from Supabase based on filters
      let queryBuilder = supabaseAdmin.from("dados_campanhas").select("*");
      if (cliente_id) queryBuilder = queryBuilder.eq("cliente_id", cliente_id);
      if (filtros.plataforma) queryBuilder = queryBuilder.eq("plataforma", filtros.plataforma === "meta" ? "meta_ads" : "google_ads");
      
      const { data: dadosRelevantes, error: dbError } = await queryBuilder.limit(20);
      if (dbError) throw dbError;

      // 3. Generate final answer
      const finalResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Com base nos dados: ${JSON.stringify(dadosRelevantes)}, responda à pergunta do usuário: "${userQuery}". 
        Modo de resposta: ${modo}. Seja profissional e direto.`
      });

      const respostaIa = finalResponse.text || "Não foi possível gerar uma resposta.";

      // 4. Log the search
      await supabaseAdmin.from("logs_busca_ia").insert([{
        query_original: userQuery,
        filtros_interpretados: filtros,
        resposta_ia: respostaIa,
        cliente_id: cliente_id || null,
        status: "sucesso",
        tempo_resposta_ms: Date.now() - startTime,
        quantidade_resultados: dadosRelevantes?.length || 0,
        provedor: "google_gemini",
        modelo: "gemini-1.5-flash",
        data_hora: new Date().toISOString()
      }]);

      res.json({
        meta: { filtros_interpretados: filtros, timestamp: new Date().toISOString() },
        resposta_ia: respostaIa,
        dados_relevantes: dadosRelevantes
      });
    } catch (error) {
      console.error("Erro na busca IA:", error);
      res.status(500).json({ error: "Erro interno ao processar busca com IA" });
    }
  });

  // --- GOOGLE ADS INSIGHTS ---
  app.get("/api/google/insights", async (req, res) => {
    const { customer_id, date_preset, since, until } = req.query;

    if (!customer_id) {
      return res.status(400).json({ error: "Parâmetro 'customer_id' é obrigatório." });
    }

    // Auditoria
    auditLog({
      action: 'GOOGLE_INSIGHTS_FETCH',
      entityType: 'google_customer',
      entityId: customer_id as string,
      details: { date_preset, since, until },
      req
    });

    try {
      const devToken = (process.env.GOOGLE_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim();
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!devToken || !clientId || !clientSecret) {
        return res.status(500).json({ error: "Configurações de API do Google Ads incompletas no servidor." });
      }

      // 1. Buscar o refresh_token na coleção centralizada
      const { data: googleAccData } = await supabaseAdmin
        .from("google_ads_accounts")
        .select("*")
        .eq("id", customer_id as string)
        .single();
      
      let refreshToken = googleAccData?.refresh_token || "";

      // Se não encontrou refresh_token na conta específica (ex: adicionada manualmente),
      // tenta buscar qualquer refresh_token disponível
      if (!refreshToken) {
        console.log(`[GoogleAds] Refresh token não encontrado para ${customer_id}. Buscando token global...`);
        const { data: allAccs } = await supabaseAdmin
          .from("google_ads_accounts")
          .select("refresh_token, id")
          .not("refresh_token", "is", null)
          .neq("refresh_token", "")
          .limit(1);
        
        if (allAccs && allAccs.length > 0) {
          refreshToken = allAccs[0].refresh_token;
          console.log(`[GoogleAds] Usando refresh token da conta: ${allAccs[0].id}`);
        }
      }

      if (!refreshToken) {
        return res.status(400).json({ 
          error: "Nenhum Refresh token encontrado no sistema.",
          details: "Você precisa conectar pelo menos uma conta via Google Ads (OAuth) antes de adicionar contas manuais."
        });
      }

      // 2. Obter novo access_token
      const oauth2Client = new OAuth2Client(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { token: accessToken } = await oauth2Client.getAccessToken();

      if (!accessToken) {
        return res.status(500).json({ error: "Falha ao gerar access token do Google Ads." });
      }

      // 3. Configurar período (GAQL)
      let dateFilter = "segments.date DURING LAST_30_DAYS";
      if (since && until) {
        const start = (since as string).replace(/-/g, "");
        const end = (until as string).replace(/-/g, "");
        dateFilter = `segments.date BETWEEN '${start}' AND '${end}'`;
      } else {
        const presetMap: Record<string, string> = {
          "7": "LAST_7_DAYS",
          "15": "LAST_14_DAYS",
          "30": "LAST_30_DAYS",
          "90": "LAST_90_DAYS",
          "this_month": "THIS_MONTH",
          "last_month": "LAST_MONTH"
        };
        dateFilter = `segments.date DURING ${presetMap[date_preset as string] || "LAST_30_DAYS"}`;
      }

      // 4. Chamada para a API (GAQL)
      // Buscamos métricas por campanha e dia
      const query = `
        SELECT 
          campaign.id, 
          campaign.name, 
          segments.date, 
          metrics.cost_micros, 
          metrics.impressions, 
          metrics.clicks, 
          metrics.conversions,
          metrics.conversions_value
        FROM campaign 
        WHERE ${dateFilter}
        ORDER BY segments.date DESC
      `;

      const apiVersion = "v17";
      const customerIdStr = customer_id as string;
      const searchUrl = `https://googleads.googleapis.com/${apiVersion}/customers/${customerIdStr}/googleAds:search`;

      console.log(`[GoogleAds] Buscando insights para ${customerIdStr} com query: ${query.trim().replace(/\s+/g, ' ')}`);

      const response = await axios.post(
        searchUrl,
        { query },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': devToken,
            'login-customer-id': customerIdStr
          },
          timeout: 30000
        }
      );

      const results = response.data.results || [];
      console.log(`[GoogleAds] ${results.length} registros recebidos.`);

      // 5. Formatar dados para o padrão DadosCampanha
      const mappedData = results.map((row: any) => {
        const spend = (parseFloat(row.metrics.costMicros || 0) / 1000000);
        const conversions = parseFloat(row.metrics.conversions || 0);
        
        return {
          campaign_id: row.campaign.id,
          campaign_name: row.campaign.name,
          date: row.segments.date,
          spend,
          impressions: parseInt(row.metrics.impressions || 0),
          clicks: parseInt(row.metrics.clicks || 0),
          conversions,
          cpc: parseInt(row.metrics.clicks) > 0 ? spend / parseInt(row.metrics.clicks) : 0,
          ctr: parseInt(row.metrics.impressions) > 0 ? (parseInt(row.metrics.clicks) / parseInt(row.metrics.impressions)) * 100 : 0,
          cpa: conversions > 0 ? spend / conversions : 0
        };
      });

      res.json({ data: mappedData });

    } catch (error: any) {
      console.error("[GoogleAds] Erro ao buscar insights:", error.response?.data || error.message);
      const details = error.response?.data?.[0]?.errors?.[0]?.message || error.message;
      res.status(error.response?.status || 500).json({ 
        error: "Erro ao buscar dados do Google Ads",
        details
      });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Verificação periódica de saldo Meta (a cada 4 horas)
    setInterval(async () => {
      console.log("[MetaAds] Iniciando verificação periódica de saldos...");
      try {
        const { data: accounts } = await supabaseAdmin
          .from('meta_ads_accounts')
          .select('id, name, access_token, balance, balance_threshold')
          .eq('status', 'connected');

        if (accounts) {
          for (const acc of accounts) {
            // Sincronizar via API
            try {
              const accountId = acc.id.startsWith('act_') ? acc.id : `act_${acc.id}`;
              const response = await axios.get(`https://graph.facebook.com/v19.0/${accountId}`, {
                headers: { Authorization: `Bearer ${acc.access_token}` },
                params: { fields: 'balance,spend_cap,amount_spent' }
              });
              
              const data = response.data;
              const rawBalance = parseFloat(data.balance || 0) / 100;
              const spendCap = parseFloat(data.spend_cap || 0) / 100;
              const amountSpent = parseFloat(data.amount_spent || 0) / 100;

              let newBalance = 0;
              if (spendCap > 0) {
                newBalance = spendCap - amountSpent;
              } else {
                newBalance = Math.abs(rawBalance);
              }

              const threshold = acc.balance_threshold || 100;

              // Atualizar no DB
              await supabaseAdmin.from('meta_ads_accounts').update({ balance: newBalance }).eq('id', acc.id);

              if (newBalance <= threshold) {
                console.warn(`[ALERTA] Conta ${acc.name} (${acc.id}) com saldo baixo: R$ ${newBalance.toFixed(2)}`);
                // Aqui poderia disparar um WhatsApp ou Email
                auditLog({
                  action: 'META_LOW_BALANCE_ALERT',
                  entityType: 'ad_account',
                  entityId: acc.id,
                  details: { balance: newBalance, threshold }
                } as any);
              }
            } catch (err: any) {
              console.error(`[MetaAds] Erro ao verificar saldo de ${acc.name}:`, err.message);
            }
          }
        }
      } catch (error: any) {
        console.error("[MetaAds] Erro na verificação periódica:", error.message);
      }
    }, 1000 * 60 * 60 * 4); // 4 horas
  });
}

startServer();
