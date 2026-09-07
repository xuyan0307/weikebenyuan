import fs from 'fs';
import path from 'path';
import crypto, { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getDb } from '../config/database';

const DEFAULT_ADVERTISER_ID = '7890257';
const DEFAULT_API_BASE = 'https://adapi.xiaohongshu.com/api/open';
const DEFAULT_REFRESH_ENDPOINT = `${DEFAULT_API_BASE}/oauth2/refresh_token`;
const PAGE_SIZE = 500;
const MAX_PAGES = 100;

export type JuguangReportType =
  | 'account'
  | 'campaign'
  | 'unit'
  | 'creative'
  | 'note'
  | 'search_word'
  | 'geo'
  | 'audience'
  | 'easy_campaign'
  | 'easy_note'
  | 'easy_group';

export type JuguangDataStatus = 'provisional' | 'settled';
export type JuguangTriggerType = 'schedule_midnight' | 'schedule_settlement' | 'page_open' | 'manual';

interface ReportDefinition {
  type: JuguangReportType;
  apiPath: string;
  realtimePath?: string;
  extras?: Record<string, unknown>;
  optional?: boolean;
}

const REPORT_DEFINITIONS: ReportDefinition[] = [
  { type: 'account', apiPath: '/jg/data/report/offline/account', realtimePath: '/jg/data/report/realtime/account' },
  { type: 'campaign', apiPath: '/jg/data/report/offline/campaign', realtimePath: '/jg/data/report/realtime/campaign' },
  { type: 'unit', apiPath: '/jg/data/report/offline/unit', realtimePath: '/jg/data/report/realtime/unit' },
  { type: 'creative', apiPath: '/jg/data/report/offline/creative', realtimePath: '/jg/data/report/realtime/creativity' },
  { type: 'note', apiPath: '/jg/data/report/offline/note' },
  { type: 'search_word', apiPath: '/jg/data/report/offline/search/word' },
  {
    type: 'geo',
    apiPath: '/jg/data/report/offline/account',
    extras: { split_columns: ['province', 'city'] },
  },
  {
    type: 'audience',
    apiPath: '/jg/data/report/offline/account',
    extras: { split_columns: ['gender', 'age', 'device'] },
  },
  { type: 'easy_campaign', apiPath: '/jg/data/report/offline/easy/promotion/base', optional: true },
  { type: 'easy_note', apiPath: '/jg/data/report/offline/easy/promotion/note', optional: true },
  { type: 'easy_group', apiPath: '/jg/data/report/offline/easy/promotion/group', optional: true },
];

const IDENTITY_FIELDS = [
  'time', 'campaign_id', 'campaign_name', 'unit_id', 'unit_name', 'creativity_id',
  'creativity_name', 'note_id', 'note_title', 'search_word', 'promotion_id',
  'promotion_name', 'promotion_group_id', 'promotion_group_name', 'province', 'city',
  'country_name', 'gender', 'age', 'device', 'target_detail', 'placement',
  'optimize_target', 'promotion_target', 'bidding_strategy', 'build_type',
  'marketing_target', 'delivery_mode', 'jump_type', 'item_id', 'page_id', 'live_red_id',
];

const METRIC_KEYS = [
  'fee', 'impression', 'click', 'ctr', 'acp', 'cpm', 'like', 'comment', 'collect',
  'follow', 'share', 'interaction', 'cpi', 'action_button_click', 'screenshot', 'pic_save',
  'message_user', 'message', 'message_consult', 'message_consult_cpl',
  'initiative_message', 'initiative_message_cpl', 'msg_leads_num', 'msg_leads_cost',
  'message_fst_reply_time_avg', 'message_reply_in_30s_rate', 'fst_message_reply_in_45s_rate',
  'message_reply_in_1min_rate', 'message_reply_in_3min_rate', 'leads', 'leads_cpl',
  'valid_leads', 'valid_leads_cpl', 'external_leads', 'external_leads_cpl',
  'landing_page_visit', 'leads_button_impression', 'phone_call_cnt', 'phone_call_succ_cnt',
  'wechat_copy_cnt', 'wechat_copy_succ_cnt', 'add_wechat_count', 'add_wechat_suc_count',
  'wechat_talk_count', 'search_cmt_click', 'search_cmt_after_read', 'i_user_num', 'ti_user_num',
] as const;

const REALTIME_COLUMNS: Record<'account' | 'campaign' | 'unit' | 'creative', readonly string[]> = {
  account: [
    'fee', 'impression', 'click', 'ctr', 'acp', 'cpm', 'like', 'comment', 'collect',
    'follow', 'share', 'interaction', 'cpi', 'action_button_click', 'screenshot', 'pic_save',
    'message_user', 'message', 'message_consult', 'message_consult_cpl', 'initiative_message',
    'initiative_message_cpl', 'msg_leads_num', 'msg_leads_cost', 'message_fst_reply_time_avg',
    'message_reply_in_30s_rate', 'fst_message_reply_in_45s_rate', 'message_reply_in_1min_rate',
    'message_reply_in_3min_rate', 'leads', 'leads_cpl', 'valid_leads', 'valid_leads_cpl',
    'external_leads', 'external_leads_cpl', 'landing_page_visit', 'leads_button_impression',
    'phone_call_cnt', 'phone_call_succ_cnt', 'wechat_copy_cnt', 'wechat_copy_succ_cnt',
    'add_wechat_count', 'add_wechat_suc_count', 'wechat_talk_count',
    'search_cmt_click', 'search_cmt_after_read', 'i_user_num', 'ti_user_num',
  ],
  campaign: [
    'fee', 'impression', 'click', 'ctr', 'acp', 'cpm', 'like', 'comment', 'collect',
    'follow', 'share', 'interaction', 'cpi', 'action_button_click', 'screenshot', 'pic_save',
    'message_user', 'message', 'message_consult', 'message_consult_cpl', 'initiative_message',
    'initiative_message_cpl', 'msg_leads_num', 'msg_leads_cost', 'leads', 'leads_cpl',
    'valid_leads', 'valid_leads_cpl', 'external_leads', 'external_leads_cpl',
    'landing_page_visit', 'leads_button_impression', 'phone_call_cnt', 'phone_call_succ_cnt',
    'wechat_copy_cnt', 'wechat_copy_succ_cnt', 'search_cmt_click', 'search_cmt_after_read',
    'add_wechat_count', 'add_wechat_suc_count', 'wechat_talk_count', 'i_user_num', 'ti_user_num',
  ],
  unit: [
    'fee', 'impression', 'click', 'ctr', 'acp', 'cpm', 'like', 'comment', 'collect',
    'follow', 'share', 'interaction', 'cpi', 'action_button_click', 'screenshot', 'pic_save',
    'message_user', 'message', 'message_consult', 'message_consult_cpl', 'initiative_message',
    'initiative_message_cpl', 'msg_leads_num', 'msg_leads_cost', 'leads', 'leads_cpl',
    'valid_leads', 'valid_leads_cpl', 'external_leads', 'external_leads_cpl',
    'landing_page_visit', 'leads_button_impression', 'phone_call_cnt', 'phone_call_succ_cnt',
    'wechat_copy_cnt', 'wechat_copy_succ_cnt', 'search_cmt_click', 'search_cmt_after_read',
    'add_wechat_count', 'add_wechat_suc_count', 'wechat_talk_count', 'i_user_num', 'ti_user_num',
  ],
  // The real-time creativity endpoint rejects msg_leads_num. Lead/message totals are
  // therefore shown at account/campaign/unit level while creative keeps content metrics.
  creative: [
    'fee', 'impression', 'click', 'ctr', 'acp', 'cpm', 'like', 'comment', 'collect',
    'follow', 'share', 'interaction', 'cpi', 'screenshot', 'message', 'leads',
  ],
};

export interface JuguangRow {
  reportDate: string;
  entityId: string;
  entityName: string;
  dataStatus: JuguangDataStatus;
  syncedAt: string;
  data: Record<string, unknown>;
}

export interface JuguangOverview {
  advertiserId: string;
  startDate: string;
  endDate: string;
  metrics: Record<string, number>;
  trend: Array<Record<string, string | number>>;
  leadSources: Array<{ key: string; name: string; value: number; cost: number }>;
  platform: { customers: number; experienceCards: number; convertedOrders: number };
  lastSyncedAt: string | null;
  dataStatus: JuguangDataStatus | 'empty';
}

interface TokenAdvertiser {
  advertiser_id?: unknown;
  advertiser_name?: unknown;
}

interface TokenRecord {
  updatedAt?: string;
  data: {
    access_token: string;
    approval_advertisers?: TokenAdvertiser[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ApiPayload {
  code?: unknown;
  success?: boolean;
  msg?: unknown;
  request_id?: unknown;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function loadExternalConfig(): void {
  const configPath = String(process.env.XHS_JUGUANG_CONFIG_FILE || '').trim();
  if (configPath && fs.existsSync(configPath)) {
    dotenv.config({ path: configPath, override: false });
  }
}

function resolveTokenFile(rawPath: string): string {
  if (!rawPath) return '';
  if (path.isAbsolute(rawPath)) return rawPath;
  const configPath = String(process.env.XHS_JUGUANG_CONFIG_FILE || '').trim();
  return path.resolve(configPath ? path.dirname(configPath) : process.cwd(), rawPath);
}

function getConfig() {
  loadExternalConfig();
  return {
    advertiserId: String(process.env.XHS_JUGUANG_ADVERTISER_ID || DEFAULT_ADVERTISER_ID).trim(),
    apiBase: String(process.env.XHS_JUGUANG_API_BASE || DEFAULT_API_BASE).replace(/\/$/u, ''),
    appId: String(process.env.XHS_JUGUANG_APP_ID || '').trim(),
    secret: String(process.env.XHS_JUGUANG_SECRET || '').trim(),
    refreshEndpoint: String(process.env.XHS_JUGUANG_REFRESH_TOKEN_ENDPOINT || DEFAULT_REFRESH_ENDPOINT).trim(),
    tokenFile: resolveTokenFile(String(process.env.XHS_JUGUANG_TOKEN_FILE || '').trim()),
  };
}

function readTokenRecord(): TokenRecord {
  const config = getConfig();
  if (!config.tokenFile) throw new Error('聚光 Token 文件尚未配置');
  if (!fs.existsSync(config.tokenFile)) throw new Error('聚光 Token 文件不存在');
  const rawRecord = objectRecord(JSON.parse(fs.readFileSync(config.tokenFile, 'utf8')) as unknown);
  const data = objectRecord(rawRecord.data);
  const accessToken = String(data.access_token || '');
  if (!accessToken) throw new Error('聚光 Token 文件缺少 access_token');
  const advertisers = Array.isArray(data.approval_advertisers)
    ? data.approval_advertisers.map(item => objectRecord(item) as TokenAdvertiser)
    : [];
  const authorized = advertisers.length > 0
    ? advertisers.some(item => String(item.advertiser_id || '') === config.advertiserId)
    : false;
  if (!authorized) throw new Error(`聚光账户 ${config.advertiserId} 不在当前授权范围内`);
  return { ...rawRecord, updatedAt: String(rawRecord.updatedAt || ''), data: { ...data, access_token: accessToken, approval_advertisers: advertisers } };
}

function writeTokenRecord(tokenFile: string, record: TokenRecord): void {
  const tempFile = `${tokenFile}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(tempFile, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempFile, tokenFile);
  try { fs.chmodSync(tokenFile, 0o600); } catch { /* Best effort on Windows. */ }
}

export function shouldRefreshJuguangToken(
  updatedAt: string | undefined,
  expiresInSeconds: unknown,
  now = new Date(),
): boolean {
  const updated = Date.parse(String(updatedAt || ''));
  const expiresIn = metricNumber(expiresInSeconds);
  if (!Number.isFinite(updated) || expiresIn <= 0) return false;
  return updated + expiresIn * 1000 - now.getTime() <= 5 * 60 * 1000;
}

let tokenRefreshPromise: Promise<TokenRecord> | null = null;

async function refreshToken(record: TokenRecord): Promise<TokenRecord> {
  if (tokenRefreshPromise) return tokenRefreshPromise;
  const config = getConfig();
  if (!config.appId || !config.secret || !record.data.refresh_token) {
    throw new Error('聚光访问令牌已失效，且自动刷新配置不完整，请重新授权');
  }
  tokenRefreshPromise = (async () => {
    const response = await fetch(config.refreshEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: /^\d+$/u.test(config.appId) ? Number(config.appId) : config.appId,
        secret: config.secret,
        refresh_token: record.data.refresh_token,
      }),
    });
    const payload = parseApiPayload(await response.text());
    if (!response.ok || payload.success === false || Number(payload.code || 0) !== 0) {
      throw new Error('聚光访问令牌刷新失败，请重新授权');
    }
    const refreshed = mergeJuguangRefreshTokenRecord(
      record,
      payload.data,
      String(payload.request_id || ''),
    );
    const authorized = (refreshed.data.approval_advertisers || [])
      .some(item => String(item.advertiser_id || '') === config.advertiserId);
    if (!authorized) throw new Error('聚光访问令牌刷新失败，请重新授权');
    writeTokenRecord(config.tokenFile, refreshed);
    return refreshed;
  })().finally(() => { tokenRefreshPromise = null; });
  return tokenRefreshPromise;
}

async function usableTokenRecord(): Promise<TokenRecord> {
  const record = readTokenRecord();
  return shouldRefreshJuguangToken(record.updatedAt, record.data.access_token_expires_in)
    ? refreshToken(record)
    : record;
}

function parseApiPayload(text: string): ApiPayload {
  if (!text) return {};
  try {
    return objectRecord(JSON.parse(text) as unknown) as ApiPayload;
  } catch {
    throw new Error('聚光 OpenAPI 返回了无法解析的数据');
  }
}

export function mergeJuguangRefreshTokenRecord(
  record: TokenRecord,
  refreshData: unknown,
  requestId = '',
  updatedAt = new Date().toISOString(),
): TokenRecord {
  const data = objectRecord(refreshData);
  const accessToken = String(data.access_token || '');
  if (!accessToken) throw new Error('聚光访问令牌刷新失败，请重新授权');
  const previousAdvertisers = Array.isArray(record.data.approval_advertisers)
    ? record.data.approval_advertisers
    : [];
  const advertisers = Array.isArray(data.approval_advertisers)
    ? data.approval_advertisers.map(item => objectRecord(item) as TokenAdvertiser)
    : previousAdvertisers;
  return {
    ...record,
    platform: 'xhs_juguang',
    updatedAt,
    requestId,
    data: {
      ...record.data,
      ...data,
      access_token: accessToken,
      refresh_token: String(data.refresh_token || record.data.refresh_token || ''),
      approval_advertisers: advertisers,
    },
  };
}

export function isTransientJuguangFailure(httpStatus: number, code: unknown, message: unknown): boolean {
  return httpStatus === 429
    || httpStatus >= 500
    || Number(code) === 10005
    || /系统错误|请求频繁|稍后重试/iu.test(String(message || ''));
}

async function postOpenApi(apiPath: string, body: Record<string, unknown>): Promise<ApiPayload> {
  const config = getConfig();
  let tokenRecord = await usableTokenRecord();
  const request = () => fetch(`${config.apiBase}${apiPath}`, {
    method: 'POST',
    headers: { 'Access-Token': tokenRecord.data.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let tokenRetried = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await request();
    const payload = parseApiPayload(await response.text());
    const failed = !response.ok || payload.success === false || Number(payload.code || 0) !== 0;
    if (!failed) return payload;

    const tokenFailure = response.status === 401 || /token|授权|过期/iu.test(String(payload.msg || ''));
    if (tokenFailure && !tokenRetried) {
      tokenRecord = await refreshToken(tokenRecord);
      tokenRetried = true;
      continue;
    }

    const code = payload.code === undefined ? response.status : payload.code;
    const transient = isTransientJuguangFailure(response.status, code, payload.msg);
    if (transient && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      continue;
    }
    throw new Error(`聚光接口请求失败 (${code}): ${payload.msg || response.statusText}`);
  }
  throw new Error('聚光接口请求失败：超过最大重试次数');
}

export function metricNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const clean = value.trim().replace(/[%￥¥,]/gu, '');
  if (!clean || clean === '-') return 0;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

export function yesterdayShanghai(now = new Date()): string {
  return isoDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

export function validateDateRange(startDate: string, endDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(endDate)) {
    throw new Error('日期格式必须为 YYYY-MM-DD');
  }
  const start = Date.parse(`${startDate}T00:00:00+08:00`);
  const end = Date.parse(`${endDate}T00:00:00+08:00`);
  if (
    !Number.isFinite(start) || !Number.isFinite(end)
    || isoDate(new Date(start)) !== startDate || isoDate(new Date(end)) !== endDate
    || start > end
  ) throw new Error('日期范围无效');
  if ((end - start) / 86_400_000 > 370) throw new Error('单次查询日期范围不能超过371天');
}

function dateChunks(startDate: string, endDate: string, maxDays = 30): Array<{ startDate: string; endDate: string }> {
  validateDateRange(startDate, endDate);
  const chunks: Array<{ startDate: string; endDate: string }> = [];
  let cursor = new Date(`${startDate}T00:00:00+08:00`);
  const end = new Date(`${endDate}T00:00:00+08:00`);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(Math.min(end.getTime(), cursor.getTime() + (maxDays - 1) * 86_400_000));
    chunks.push({ startDate: isoDate(chunkStart), endDate: isoDate(chunkEnd) });
    cursor = new Date(chunkEnd.getTime() + 86_400_000);
  }
  return chunks;
}

export interface JuguangFetchWindow {
  startDate: string;
  endDate: string;
  realtime: boolean;
}

function previousDate(date: string): string {
  return isoDate(new Date(Date.parse(`${date}T00:00:00+08:00`) - 86_400_000));
}

function beforeShanghaiSettlement(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return hour * 60 + minute < 10 * 60 + 15;
}

export function juguangFetchWindows(
  startDate: string,
  endDate: string,
  supportsRealtime: boolean,
  now = new Date(),
): JuguangFetchWindow[] {
  validateDateRange(startDate, endDate);
  const today = isoDate(now);
  if (!supportsRealtime) {
    return dateChunks(startDate, endDate).map(chunk => ({ ...chunk, realtime: false }));
  }
  const yesterday = previousDate(today);
  const useRealtimeYesterday = beforeShanghaiSettlement(now);
  const firstRealtimeDate = useRealtimeYesterday ? yesterday : today;
  const windows: JuguangFetchWindow[] = [];
  if (startDate < firstRealtimeDate) {
    const offlineEnd = endDate < firstRealtimeDate ? endDate : previousDate(firstRealtimeDate);
    windows.push(...dateChunks(startDate, offlineEnd).map(chunk => ({ ...chunk, realtime: false })));
  }
  if (useRealtimeYesterday && startDate <= yesterday && endDate >= yesterday) {
    windows.push({ startDate: yesterday, endDate: yesterday, realtime: true });
  }
  if (startDate <= today && endDate >= today) {
    windows.push({ startDate: today, endDate: today, realtime: true });
  }
  return windows;
}

function dataRows(payload: ApiPayload): Record<string, unknown>[] {
  const rows = payload.data?.data_list;
  return Array.isArray(rows) ? rows.map(objectRecord) : [];
}

export function normalizeRealtimeReportRows(
  definition: ReportDefinition,
  payload: ApiPayload,
  reportDate: string,
): Record<string, unknown>[] {
  if (definition.type === 'account') {
    const row: Record<string, unknown> = { ...objectRecord(payload.data), time: reportDate };
    delete row.hourly_data;
    return Object.keys(row).length > 1 ? [row] : [];
  }
  const arrayKey = definition.type === 'campaign'
    ? 'campaign_dtos'
    : definition.type === 'unit'
      ? 'unit_dtos'
      : 'creativity_dtos';
  const dtoRows = payload[arrayKey];
  if (!Array.isArray(dtoRows)) return [];
  return dtoRows.map(value => {
    const dto = objectRecord(value);
    const row: Record<string, unknown> = {
      ...objectRecord(dto.base_campaign_dto),
      ...objectRecord(dto.base_unit_dto),
      ...objectRecord(dto.base_creativity_dto),
      ...objectRecord(dto.data),
      time: reportDate,
    };
    return row;
  });
}

function totalCount(payload: ApiPayload, fallbackRows: number): number {
  const dataPage = objectRecord(payload.data?.page);
  const rootPage = objectRecord(payload.page);
  return Number(
    payload.data?.total_count
    ?? payload.total_count
    ?? dataPage.total_count
    ?? rootPage.total_count
    ?? fallbackRows,
  ) || 0;
}

async function fetchReportChunk(
  definition: ReportDefinition,
  startDate: string,
  endDate: string,
  realtime = false,
): Promise<{ rows: Record<string, unknown>[]; requestIds: string[] }> {
  const config = getConfig();
  const rows: Record<string, unknown>[] = [];
  const requestIds: string[] = [];
  const pageSize = realtime ? 100 : PAGE_SIZE;
  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum += 1) {
    const payload = await postOpenApi(realtime ? String(definition.realtimePath) : definition.apiPath, realtime
      ? {
          advertiser_id: Number(config.advertiserId), start_date: startDate, end_date: endDate,
          page_num: pageNum, page_size: pageSize, data_caliber: 1,
          columns: REALTIME_COLUMNS[definition.type as keyof typeof REALTIME_COLUMNS],
          ...(definition.type === 'account' ? { need_hourly_data: false } : {}),
        }
      : {
          advertiser_id: Number(config.advertiserId), start_date: startDate, end_date: endDate,
          time_unit: 'DAY', page_num: pageNum, page_size: pageSize, data_caliber: 1,
          creation_type: [0, 1, 2, 4], ...definition.extras,
        });
    const pageRows = realtime
      ? normalizeRealtimeReportRows(definition, payload, startDate)
      : dataRows(payload);
    rows.push(...pageRows);
    if (payload.request_id) requestIds.push(String(payload.request_id));
    if (
      (realtime && definition.type === 'account')
      || pageRows.length === 0
      || rows.length >= totalCount(payload, rows.length)
      || pageRows.length < pageSize
    ) break;
  }
  return { rows, requestIds };
}

function dimensionsFor(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(IDENTITY_FIELDS.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

function entityFor(type: JuguangReportType, row: Record<string, unknown>) {
  const candidates: Record<JuguangReportType, Array<[string, string]>> = {
    account: [['advertiser_id', '广告账户']],
    campaign: [['campaign_id', 'campaign_name']],
    unit: [['unit_id', 'unit_name']],
    creative: [['creativity_id', 'creativity_name']],
    note: [['note_id', 'note_title']],
    search_word: [['search_word', 'search_word']],
    geo: [['city', 'city'], ['province', 'province']],
    audience: [['target_detail', 'target_detail'], ['age', 'age'], ['gender', 'gender'], ['device', 'device']],
    easy_campaign: [['promotion_id', 'promotion_name'], ['campaign_id', 'campaign_name']],
    easy_note: [['note_id', 'note_title']],
    easy_group: [['promotion_group_id', 'promotion_group_name'], ['item_id', 'item_id']],
  };
  for (const [idKey, nameKey] of candidates[type]) {
    if (row[idKey] !== undefined && String(row[idKey])) {
      return { id: String(row[idKey]), name: String(row[nameKey] ?? row[idKey]) };
    }
  }
  if (type === 'account') return { id: getConfig().advertiserId, name: '聚光账户' };
  const dimensions = dimensionsFor(row);
  const id = crypto.createHash('sha256').update(stableJson(dimensions)).digest('hex').slice(0, 32);
  return { id, name: Object.values(dimensions).filter(Boolean).slice(0, 3).join(' / ') || type };
}

function reportDateFor(row: Record<string, unknown>, fallback: string): string {
  const time = String(row.time || fallback).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(time) ? time : fallback;
}

async function writeRows(
  db: Pool | PoolConnection,
  definition: ReportDefinition,
  rows: Record<string, unknown>[],
  fallbackDate: string,
  dataStatus: JuguangDataStatus,
  requestId: string,
): Promise<number> {
  const config = getConfig();
  const prepared = rows.map(row => {
    const dimensions = dimensionsFor(row);
    const entity = entityFor(definition.type, row);
    return [
      randomUUID(), config.advertiserId, definition.type, reportDateFor(row, fallbackDate),
      entity.id.slice(0, 191), entity.name.slice(0, 500),
      crypto.createHash('sha256').update(stableJson(dimensions)).digest('hex'),
      dataStatus, JSON.stringify(dimensions), JSON.stringify(row), requestId || null,
    ];
  });
  for (let offset = 0; offset < prepared.length; offset += 25) {
    const batch = prepared.slice(offset, offset + 25);
    const values = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, 1, 'all', ?, ?, ?, ?, NOW())").join(',');
    await db.query(
      `INSERT INTO juguang_report_rows
         (id, advertiser_id, report_type, report_date, entity_id, entity_name,
          dimension_hash, data_caliber, creation_scope, data_status, dimensions,
          row_data, request_id, synced_at)
       VALUES ${values}
       ON DUPLICATE KEY UPDATE
         entity_name = VALUES(entity_name),
         data_status = IF(data_status = 'settled' AND VALUES(data_status) = 'provisional', 'settled', VALUES(data_status)),
         dimensions = VALUES(dimensions), row_data = VALUES(row_data),
         request_id = VALUES(request_id), synced_at = NOW()`,
      batch.flat(),
    );
  }
  return prepared.length;
}

let activeSync: Promise<JuguangSyncResult> | null = null;
let activeSyncKey = '';

export interface JuguangSyncResult {
  jobId: string;
  status: 'success' | 'partial' | 'failed';
  rowsWritten: number;
  reportsSucceeded: number;
  reportsTotal: number;
  details: Array<{ type: JuguangReportType; status: 'success' | 'failed'; rows: number; error?: string }>;
}

async function runSync(
  startDate: string,
  endDate: string,
  triggerType: JuguangTriggerType,
  dataStatus: JuguangDataStatus,
  requestedBy?: string,
): Promise<JuguangSyncResult> {
  validateDateRange(startDate, endDate);
  const db = getDb();
  const config = getConfig();
  const jobId = randomUUID();
  await db.execute(
    `INSERT INTO juguang_sync_jobs
       (id, advertiser_id, trigger_type, start_date, end_date, data_status,
        status, reports_total, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
    [jobId, config.advertiserId, triggerType, startDate, endDate, dataStatus, REPORT_DEFINITIONS.length, requestedBy || null]
  );

  const details: JuguangSyncResult['details'] = [];
  let rowsWritten = 0;
  for (const definition of REPORT_DEFINITIONS) {
    try {
      let reportRows = 0;
      for (const chunk of juguangFetchWindows(startDate, endDate, Boolean(definition.realtimePath))) {
        const result = await fetchReportChunk(definition, chunk.startDate, chunk.endDate, chunk.realtime);
        const chunkStatus: JuguangDataStatus = chunk.realtime
          ? 'provisional'
          : dataStatus === 'settled'
            ? 'settled'
            : juguangDataStatusForRange(chunk.endDate);
        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();
          await connection.execute(
            `DELETE FROM juguang_report_rows
             WHERE advertiser_id = ? AND report_type = ? AND report_date BETWEEN ? AND ?
               AND data_caliber = 1 AND creation_scope = 'all'`,
            [config.advertiserId, definition.type, chunk.startDate, chunk.endDate],
          );
          reportRows += await writeRows(
            connection,
            definition,
            result.rows,
            chunk.startDate,
            chunkStatus,
            result.requestIds.at(-1) || '',
          );
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      }
      rowsWritten += reportRows;
      details.push({ type: definition.type, status: 'success', rows: reportRows });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      details.push({ type: definition.type, status: 'failed', rows: 0, error: message.slice(0, 500) });
      if (!definition.optional) console.error(`Juguang ${definition.type} sync failed:`, message);
    }
  }

  const reportsSucceeded = details.filter(item => item.status === 'success').length;
  const status: JuguangSyncResult['status'] = reportsSucceeded === REPORT_DEFINITIONS.length
    ? 'success'
    : reportsSucceeded > 0
      ? 'partial'
      : 'failed';
  const result: JuguangSyncResult = {
    jobId, status, rowsWritten, reportsSucceeded, reportsTotal: REPORT_DEFINITIONS.length, details,
  };
  await db.execute(
    `UPDATE juguang_sync_jobs
     SET status = ?, reports_succeeded = ?, rows_written = ?, result_summary = ?,
         error_message = ?, finished_at = NOW()
     WHERE id = ?`,
    [
      status, reportsSucceeded, rowsWritten, JSON.stringify(details),
      details.filter(item => item.status === 'failed').map(item => `${item.type}: ${item.error}`).join('\n').slice(0, 5000) || null,
      jobId,
    ]
  );
  return result;
}

export function triggerJuguangSync(
  startDate: string,
  endDate: string,
  triggerType: JuguangTriggerType,
  dataStatus: JuguangDataStatus,
  requestedBy?: string,
): Promise<JuguangSyncResult> {
  const syncKey = `${startDate}:${endDate}:${dataStatus}`;
  if (activeSync) {
    if (activeSyncKey === syncKey) return activeSync;
    return Promise.reject(new Error('已有其他时间范围的聚光同步任务正在执行，请稍后重试'));
  }
  activeSyncKey = syncKey;
  activeSync = runSync(startDate, endDate, triggerType, dataStatus, requestedBy)
    .finally(() => { activeSync = null; activeSyncKey = ''; });
  return activeSync;
}

export function isJuguangSyncRunning(): boolean {
  return Boolean(activeSync);
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return {};
}

export async function listJuguangRows(
  reportType: JuguangReportType,
  startDate: string,
  endDate: string,
  limit = 5000,
): Promise<JuguangRow[]> {
  validateDateRange(startDate, endDate);
  const config = getConfig();
  const safeLimit = Math.max(1, Math.min(10_000, Math.floor(limit)));
  const [rows] = await getDb().query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date, entity_id, entity_name,
            data_status, DATE_FORMAT(synced_at, '%Y-%m-%dT%H:%i:%s+08:00') AS synced_at,
            row_data
     FROM juguang_report_rows
     WHERE advertiser_id = ? AND report_type = ? AND report_date BETWEEN ? AND ?
     ORDER BY report_date DESC, entity_name ASC
     LIMIT ?`,
    [config.advertiserId, reportType, startDate, endDate, safeLimit]
  );
  return rows.map(row => ({
    reportDate: String(row.report_date),
    entityId: String(row.entity_id),
    entityName: String(row.entity_name || ''),
    dataStatus: row.data_status === 'settled' ? 'settled' : 'provisional',
    syncedAt: String(row.synced_at || ''),
    data: parseJsonObject(row.row_data),
  }));
}

const AVERAGE_METRICS = [
  'message_fst_reply_time_avg', 'message_reply_in_30s_rate', 'fst_message_reply_in_45s_rate',
  'message_reply_in_1min_rate', 'message_reply_in_3min_rate',
] as const;

export function summarizeJuguangMetrics(rows: JuguangRow[]): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(METRIC_KEYS.map(key => [key, 0]));
  const derived = new Set([
    'ctr', 'acp', 'cpm', 'cpi', 'message_consult_cpl', 'initiative_message_cpl',
    'msg_leads_cost', 'leads_cpl', 'valid_leads_cpl', 'external_leads_cpl',
    ...AVERAGE_METRICS,
  ]);
  for (const row of rows) {
    for (const key of METRIC_KEYS) {
      if (!derived.has(key)) result[key] += metricNumber(row.data[key]);
    }
  }
  for (const key of AVERAGE_METRICS) {
    let weightedTotal = 0;
    let totalWeight = 0;
    let fallbackTotal = 0;
    let fallbackCount = 0;
    for (const row of rows) {
      const raw = row.data[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = metricNumber(raw);
      const weight = metricNumber(row.data.message_consult) || metricNumber(row.data.message_user);
      fallbackTotal += value;
      fallbackCount += 1;
      if (weight > 0) {
        weightedTotal += value * weight;
        totalWeight += weight;
      }
    }
    result[key] = totalWeight > 0 ? weightedTotal / totalWeight : fallbackCount > 0 ? fallbackTotal / fallbackCount : 0;
  }
  result.ctr = result.impression > 0 ? result.click / result.impression : 0;
  result.acp = cost(result.fee, result.click);
  result.cpm = result.impression > 0 ? Number((result.fee * 1000 / result.impression).toFixed(2)) : 0;
  result.cpi = cost(result.fee, result.interaction);
  result.message_consult_cpl = cost(result.fee, result.message_consult);
  result.initiative_message_cpl = cost(result.fee, result.initiative_message);
  result.msg_leads_cost = cost(result.fee, result.msg_leads_num);
  result.leads_cpl = cost(result.fee, result.leads);
  result.valid_leads_cpl = cost(result.fee, result.valid_leads);
  result.external_leads_cpl = cost(result.fee, result.external_leads);
  return result;
}

function cost(fee: number, count: number): number {
  return count > 0 ? Number((fee / count).toFixed(2)) : 0;
}

export async function getJuguangOverview(startDate: string, endDate: string): Promise<JuguangOverview> {
  const rows = await listJuguangRows('account', startDate, endDate, 1000);
  const metrics = summarizeJuguangMetrics(rows);
  const trendByDate = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const entry = trendByDate.get(row.reportDate) || { fee: 0, impression: 0, click: 0, messageConsult: 0, initiativeMessage: 0, leads: 0 };
    entry.fee += metricNumber(row.data.fee);
    entry.impression += metricNumber(row.data.impression);
    entry.click += metricNumber(row.data.click);
    entry.messageConsult += metricNumber(row.data.message_consult);
    entry.initiativeMessage += metricNumber(row.data.initiative_message);
    entry.leads += metricNumber(row.data.msg_leads_num) + metricNumber(row.data.valid_leads);
    trendByDate.set(row.reportDate, entry);
  }
  const leadSources = [
    { key: 'msg_leads_num', name: '私信留资', value: metrics.msg_leads_num, cost: cost(metrics.fee, metrics.msg_leads_num) },
    { key: 'leads', name: '原生表单', value: metrics.leads, cost: cost(metrics.fee, metrics.leads) },
    { key: 'external_leads', name: '落地页表单/外链', value: metrics.external_leads, cost: cost(metrics.fee, metrics.external_leads) },
    { key: 'add_wechat_suc_count', name: '成功添加企微', value: metrics.add_wechat_suc_count, cost: cost(metrics.fee, metrics.add_wechat_suc_count) },
    { key: 'wechat_copy_cnt', name: '微信复制', value: metrics.wechat_copy_cnt, cost: cost(metrics.fee, metrics.wechat_copy_cnt) },
    { key: 'phone_call_cnt', name: '电话拨打', value: metrics.phone_call_cnt, cost: cost(metrics.fee, metrics.phone_call_cnt) },
  ];
  const db = getDb();
  const [[platformRow]] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM customers WHERE acquired_at BETWEEN ? AND ?) AS customers,
       (SELECT COUNT(*) FROM orders
          WHERE purchase_date BETWEEN ? AND ? AND type = '体验卡'
            AND pay_status IN ('已付款', '已付定金')) AS experience_cards,
       (SELECT COUNT(*) FROM orders
          WHERE purchase_date BETWEEN ? AND ? AND type = '套餐'
            AND pay_status IN ('已付款', '已付定金')) AS converted_orders`,
    [startDate, endDate, startDate, endDate, startDate, endDate]
  );
  const lastSyncedAt = rows.map(row => row.syncedAt).filter(Boolean).sort().at(-1) || null;
  return {
    advertiserId: getConfig().advertiserId,
    startDate,
    endDate,
    metrics: {
      ...metrics,
      ctr: metrics.impression > 0 ? metrics.click / metrics.impression : 0,
      acp: cost(metrics.fee, metrics.click),
      effective_leads: metrics.msg_leads_num + metrics.valid_leads,
      effective_leads_cpl: cost(metrics.fee, metrics.msg_leads_num + metrics.valid_leads),
    },
    trend: Array.from(trendByDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values })),
    leadSources,
    platform: {
      customers: Number(platformRow?.customers || 0),
      experienceCards: Number(platformRow?.experience_cards || 0),
      convertedOrders: Number(platformRow?.converted_orders || 0),
    },
    lastSyncedAt,
    dataStatus: rows.length === 0 ? 'empty' : rows.every(row => row.dataStatus === 'settled') ? 'settled' : 'provisional',
  };
}

export async function getLatestSuccessfulJuguangSnapshot(startDate: string, endDate: string) {
  const config = getConfig();
  const [rows] = await getDb().query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(finished_at, '%Y-%m-%dT%H:%i:%s+08:00') AS finished_at
     FROM juguang_sync_jobs
     WHERE advertiser_id = ? AND start_date = ? AND end_date = ?
       AND status = 'success' AND finished_at IS NOT NULL
     ORDER BY finished_at DESC
     LIMIT 1`,
    [config.advertiserId, startDate, endDate]
  );
  return rows[0]?.finished_at ? { finishedAt: String(rows[0].finished_at) } : null;
}

export async function getJuguangSyncStatus() {
  const config = getConfig();
  let tokenConfigured = false;
  let authorized = false;
  let advertiserName = '';
  let tokenUpdatedAt: string | null = null;
  let tokenError = '';
  try {
    const record = readTokenRecord();
    tokenConfigured = true;
    const advertiser = (record.data.approval_advertisers || []).find(
      item => String(item.advertiser_id || '') === config.advertiserId,
    );
    authorized = Boolean(advertiser);
    advertiserName = String(advertiser?.advertiser_name || '');
    tokenUpdatedAt = record.updatedAt || null;
  } catch (error) {
    tokenError = error instanceof Error ? error.message : String(error);
  }
  const [jobs] = await getDb().query<RowDataPacket[]>(
    `SELECT id, trigger_type, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, data_status, status,
            reports_total, reports_succeeded, rows_written,
            DATE_FORMAT(started_at, '%Y-%m-%dT%H:%i:%s+08:00') AS started_at,
            DATE_FORMAT(finished_at, '%Y-%m-%dT%H:%i:%s+08:00') AS finished_at,
            error_message
     FROM juguang_sync_jobs WHERE advertiser_id = ?
     ORDER BY started_at DESC LIMIT 20`,
    [config.advertiserId]
  );
  return {
    advertiserId: config.advertiserId,
    advertiserName,
    tokenConfigured,
    authorized,
    tokenUpdatedAt,
    tokenError,
    running: isJuguangSyncRunning(),
    nextRuns: nextJuguangRuns(),
    jobs: jobs.map(row => ({
      id: String(row.id), triggerType: String(row.trigger_type), startDate: String(row.start_date),
      endDate: String(row.end_date), dataStatus: String(row.data_status), status: String(row.status),
      reportsTotal: Number(row.reports_total || 0), reportsSucceeded: Number(row.reports_succeeded || 0),
      rowsWritten: Number(row.rows_written || 0), startedAt: String(row.started_at || ''),
      finishedAt: row.finished_at ? String(row.finished_at) : null,
      errorMessage: row.error_message ? String(row.error_message) : '',
    })),
  };
}

export async function queryJuguangKeywords(keyword: string, limit = 50) {
  const trimmed = keyword.trim();
  if (!trimmed) throw new Error('请输入种子关键词');
  if (trimmed.length > 80) throw new Error('关键词不能超过80个字符');
  const config = getConfig();
  const payload = await postOpenApi('/jg/keyword/common/recommend', {
    advertiser_id: Number(config.advertiserId), request_type: 'search', keyword: trimmed, rank: 1,
  });
  const list = Array.isArray(payload.data?.word_list) ? payload.data.word_list : [];
  return {
    keyword: trimmed,
    bagMonthPv: metricNumber(payload?.data?.bag_month_pv),
    wordNum: metricNumber(payload?.data?.word_num),
    rows: list.slice(0, Math.max(1, Math.min(100, limit))).map(rawItem => {
      const item = objectRecord(rawItem);
      return {
        keyword: String(item.keyword || ''), monthPv: metricNumber(item.monthpv),
        competitionLevel: String(item.competition_level || ''), bid: metricNumber(item.bid),
        recommendReason: Array.isArray(item.recommend_reason) ? item.recommend_reason.map(String) : [],
      };
    }),
  };
}

function nextOccurrence(hour: number, minute: number, now = new Date()): Date {
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const targetAsUtc = Date.UTC(
    shanghaiNow.getUTCFullYear(), shanghaiNow.getUTCMonth(), shanghaiNow.getUTCDate(), hour - 8, minute,
  );
  let target = new Date(targetAsUtc);
  if (target <= now) target = new Date(target.getTime() + 86_400_000);
  return target;
}

export function nextJuguangRuns(now = new Date()) {
  return {
    provisionalAt: nextOccurrence(0, 10, now).toISOString(),
    settlementAt: nextOccurrence(10, 15, now).toISOString(),
  };
}

export function juguangDataStatusForRange(endDate: string, now = new Date()): JuguangDataStatus {
  validateDateRange(endDate, endDate);
  const today = isoDate(now);
  const yesterday = yesterdayShanghai(now);
  if (endDate < yesterday) return 'settled';
  if (endDate >= today) return 'provisional';
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const minutes = shanghaiNow.getUTCHours() * 60 + shanghaiNow.getUTCMinutes();
  return minutes >= 10 * 60 + 15 ? 'settled' : 'provisional';
}

const schedulerTimers = new Set<NodeJS.Timeout>();

function scheduleDaily(hour: number, minute: number, task: () => Promise<void>): void {
  const schedule = () => {
    const next = nextOccurrence(hour, minute);
    const timer = setTimeout(() => {
      schedulerTimers.delete(timer);
      void task()
        .catch(error => console.error('Juguang scheduled sync failed:', error))
        .finally(schedule);
    }, Math.max(1000, next.getTime() - Date.now()));
    timer.unref?.();
    schedulerTimers.add(timer);
  };
  schedule();
}

export function startJuguangScheduler(): void {
  if (schedulerTimers.size > 0 || process.env.JUGUANG_SCHEDULER_ENABLED === 'false') return;
  scheduleDaily(0, 10, async () => {
    const date = yesterdayShanghai();
    await triggerJuguangSync(date, date, 'schedule_midnight', 'provisional', 'system');
  });
  scheduleDaily(10, 15, async () => {
    const date = yesterdayShanghai();
    await triggerJuguangSync(date, date, 'schedule_settlement', 'settled', 'system');
  });
}

export function stopJuguangScheduler(): void {
  schedulerTimers.forEach(timer => clearTimeout(timer));
  schedulerTimers.clear();
}
