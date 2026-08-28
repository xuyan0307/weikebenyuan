import tls from 'tls';
import { getDb } from '../config/database';
import { createOssClient, hasOssConfig } from '../utils/oss';
import { parseJson } from '../utils/serialization';

const CACHE_KEY = 'system-parameters-cache-v1';
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAILY_REFRESH_MINUTE = 5;

export type ResourceStatus = 'healthy' | 'warning' | 'unavailable';

export interface StorageParameter {
  status: ResourceStatus;
  usedBytes: number | null;
  totalBytes: number | null;
  freeBytes: number | null;
  usagePercent: number | null;
  message: string;
}

export interface SystemParametersSnapshot {
  rds: StorageParameter & { database: string };
  oss: StorageParameter & { bucket: string; region: string; objectCount: number | null };
  ssl: {
    status: ResourceStatus;
    domain: string;
    validFrom: string | null;
    validTo: string | null;
    daysRemaining: number | null;
    issuer: string;
    message: string;
  };
  refreshedAt: string;
  nextAutoRefreshAt: string;
}

let refreshTimer: NodeJS.Timeout | null = null;
let refreshInFlight: Promise<SystemParametersSnapshot> | null = null;

function positiveNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function storageProjection(usedBytes: number, totalBytes: number | null) {
  if (!totalBytes) return { freeBytes: null, usagePercent: null };
  const freeBytes = Math.max(totalBytes - usedBytes, 0);
  const usagePercent = Math.min((usedBytes / totalBytes) * 100, 100);
  return { freeBytes, usagePercent };
}

export function nextShanghaiDailyRefresh(now = new Date()): Date {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const nextUtcLike = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
    0,
    DAILY_REFRESH_MINUTE,
  );
  return new Date(nextUtcLike - SHANGHAI_OFFSET_MS);
}

async function collectRds(): Promise<SystemParametersSnapshot['rds']> {
  const database = process.env.DB_NAME || 'chankang_platform';
  const totalGb = positiveNumber(process.env.RDS_STORAGE_TOTAL_GB);
  const totalBytes = totalGb ? Math.round(totalGb * 1024 ** 3) : null;
  try {
    const [rows] = await getDb().query(
      `SELECT COALESCE(SUM(data_length + index_length), 0) AS used_bytes
       FROM information_schema.tables WHERE table_schema = ?`,
      [database],
    );
    const usedBytes = Number((rows as Array<{ used_bytes: string | number }>)[0]?.used_bytes || 0);
    const projection = storageProjection(usedBytes, totalBytes);
    const status: ResourceStatus = projection.usagePercent !== null && projection.usagePercent >= 80
      ? 'warning'
      : totalBytes ? 'healthy' : 'warning';
    return {
      database,
      status,
      usedBytes,
      totalBytes,
      ...projection,
      message: totalBytes ? 'RDS 结构化数据容量统计正常' : '已统计数据库用量；请配置购买的 RDS 总容量',
    };
  } catch (error) {
    return {
      database,
      status: 'unavailable',
      usedBytes: null,
      totalBytes,
      freeBytes: null,
      usagePercent: null,
      message: `RDS 容量读取失败：${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

async function collectOss(): Promise<SystemParametersSnapshot['oss']> {
  const bucket = process.env.OSS_BUCKET || '';
  const region = process.env.OSS_REGION || '';
  const totalGb = positiveNumber(process.env.OSS_STORAGE_TOTAL_GB);
  const totalBytes = totalGb ? Math.round(totalGb * 1024 ** 3) : null;
  if (!hasOssConfig()) {
    return {
      bucket,
      region,
      status: 'unavailable',
      usedBytes: null,
      totalBytes,
      freeBytes: null,
      usagePercent: null,
      objectCount: null,
      message: 'OSS 尚未完成访问配置',
    };
  }

  try {
    const client = createOssClient();
    const result = await (client as unknown as {
      getBucketStat: (name: string, options: Record<string, never>) => Promise<{
        stat: { Storage?: string; ObjectCount?: string };
      }>;
    }).getBucketStat(bucket, {});
    const usedBytes = Number(result.stat.Storage || 0);
    const projection = storageProjection(usedBytes, totalBytes);
    const status: ResourceStatus = projection.usagePercent !== null && projection.usagePercent >= 80
      ? 'warning'
      : totalBytes ? 'healthy' : 'warning';
    return {
      bucket,
      region,
      status,
      usedBytes,
      totalBytes,
      ...projection,
      objectCount: Number(result.stat.ObjectCount || 0),
      message: totalBytes ? 'OSS 非结构化数据容量统计正常' : '已统计 OSS 用量；请配置当前已购买总容量',
    };
  } catch (error) {
    return {
      bucket,
      region,
      status: 'unavailable',
      usedBytes: null,
      totalBytes,
      freeBytes: null,
      usagePercent: null,
      objectCount: null,
      message: `OSS 容量读取失败：${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

async function collectSsl(): Promise<SystemParametersSnapshot['ssl']> {
  const domain = (process.env.MONITOR_SSL_DOMAIN || 'weikebenyuan.com').trim();
  return new Promise(resolve => {
    const socket = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false });
    const finish = (value: SystemParametersSnapshot['ssl']) => {
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(10_000, () => finish({
      status: 'unavailable', domain, validFrom: null, validTo: null,
      daysRemaining: null, issuer: '', message: 'SSL 证书读取超时',
    }));
    socket.once('error', error => finish({
      status: 'unavailable', domain, validFrom: null, validTo: null,
      daysRemaining: null, issuer: '', message: `SSL 证书读取失败：${error.message}`,
    }));
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const daysRemaining = validTo
        ? Math.max(Math.ceil((validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000)), 0)
        : null;
      const status: ResourceStatus = daysRemaining === null
        ? 'unavailable'
        : daysRemaining <= 30 ? 'warning' : 'healthy';
      finish({
        status,
        domain,
        validFrom: validFrom?.toISOString() || null,
        validTo: validTo?.toISOString() || null,
        daysRemaining,
        issuer: String(cert.issuer?.O || cert.issuer?.CN || ''),
        message: daysRemaining === null
          ? '未读取到 SSL 证书有效期'
          : daysRemaining <= 30 ? 'SSL 证书将在 30 天内到期' : 'SSL 证书有效',
      });
    });
  });
}

async function persistSnapshot(snapshot: SystemParametersSnapshot) {
  await getDb().execute(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_by)
     VALUES (?, ?, NULL)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
       updated_by = NULL, updated_at = CURRENT_TIMESTAMP`,
    [CACHE_KEY, JSON.stringify(snapshot)],
  );
}

export async function refreshSystemParameters(): Promise<SystemParametersSnapshot> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const [rds, oss, ssl] = await Promise.all([collectRds(), collectOss(), collectSsl()]);
    const snapshot: SystemParametersSnapshot = {
      rds,
      oss,
      ssl,
      refreshedAt: new Date().toISOString(),
      nextAutoRefreshAt: nextShanghaiDailyRefresh().toISOString(),
    };
    await persistSnapshot(snapshot);
    return snapshot;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getSystemParameters(): Promise<SystemParametersSnapshot> {
  const [rows] = await getDb().query(
    'SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1',
    [CACHE_KEY],
  );
  const row = (rows as Array<{ setting_value: unknown }>)[0];
  const cached = row ? parseJson<SystemParametersSnapshot | null>(row.setting_value, null) : null;
  return cached || refreshSystemParameters();
}

function scheduleNextRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(nextShanghaiDailyRefresh().getTime() - Date.now(), 1_000);
  refreshTimer = setTimeout(async () => {
    try {
      await refreshSystemParameters();
      console.log('System parameters refreshed automatically');
    } catch (error) {
      console.error('System parameters automatic refresh failed:', error);
    } finally {
      scheduleNextRefresh();
    }
  }, delay);
  refreshTimer.unref?.();
}

export function startSystemParametersScheduler() {
  scheduleNextRefresh();
  void getSystemParameters().catch(error => console.error('System parameters initial refresh failed:', error));
}

export function stopSystemParametersScheduler() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}
