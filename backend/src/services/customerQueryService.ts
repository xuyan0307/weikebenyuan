import type { Pool, RowDataPacket } from 'mysql2/promise';
import { formatDateOnly, parseJson } from '../utils/serialization';

export type CustomerDateRange = 'all' | 'today' | 'week' | 'month';

export interface CustomerListFilters {
  keyword?: string;
  dateRange?: CustomerDateRange;
  areas?: string[];
  sources?: string[];
  statuses?: string[];
  tags?: string[];
  advisors?: string[];
  includeOrdered?: boolean;
}

export interface CustomerListInput extends CustomerListFilters {
  page: number;
  pageSize: number;
}

export interface CustomerDto {
  id: string;
  _id: string;
  name: string;
  wechat: string;
  phone: string;
  area: string;
  source: string;
  acquiredAt: string;
  tag: string;
  followStatus: string;
  followDate: string;
  advisor: string;
  advisorId: string;
  totalOrders: number;
  lastFollow: string;
  profile: Record<string, unknown> | null;
  situation: string;
  intendedProduct: string;
  remark: string;
}

const DISPLAY_STATUS_SQL = `CASE
  WHEN JSON_UNQUOTE(JSON_EXTRACT(c.profile, '$.followDisplayStatus')) IN ('跟进中','待跟进','已完成','延迟')
    THEN JSON_UNQUOTE(JSON_EXTRACT(c.profile, '$.followDisplayStatus'))
  WHEN c.follow_status IN ('跟进中','待跟进','已完成','延迟') THEN c.follow_status
  WHEN c.follow_date IS NULL THEN CASE WHEN c.follow_status = '跟进中' THEN '跟进中' ELSE '待跟进' END
  WHEN c.follow_status IN ('已成交','已预约','已流失') THEN '已完成'
  WHEN DATE(c.follow_date) < CURDATE() THEN '延迟'
  WHEN c.follow_status = '跟进中' THEN '跟进中'
  ELSE '待跟进'
END`;

const CUSTOMER_SELECT_SQL = `SELECT c.*,
  DATE_FORMAT(c.acquired_at, '%Y-%m-%d') AS acquired_at_date,
  DATE_FORMAT(c.follow_date, '%Y-%m-%d') AS follow_date_date,
  DATE_FORMAT(c.last_follow, '%Y-%m-%d') AS last_follow_date,
  u.name AS advisor_name
FROM customers c
LEFT JOIN users u ON u.id = c.advisor_id`;

function addInFilter(
  where: string[],
  params: unknown[],
  column: string,
  values: string[] | undefined
) {
  const normalized = values?.map(value => value.trim()).filter(Boolean) ?? [];
  if (normalized.length === 0) return;
  where.push(`${column} IN (${normalized.map(() => '?').join(',')})`);
  params.push(...normalized);
}

export function buildCustomerWhere(filters: CustomerListFilters) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeOrdered) {
    where.push("c.tag IN ('D1','D2','D3') AND COALESCE(c.total_orders, 0) = 0");
  }

  const keyword = filters.keyword?.trim();
  if (keyword) {
    const pattern = `%${keyword}%`;
    where.push('(c.name LIKE ? OR c.wechat LIKE ? OR c.phone LIKE ? OR c.customer_code LIKE ?)');
    params.push(pattern, pattern, pattern, pattern);
  }

  if (filters.dateRange === 'today') {
    where.push('DATE(c.acquired_at) = CURDATE()');
  } else if (filters.dateRange === 'week') {
    where.push('YEARWEEK(c.acquired_at, 1) = YEARWEEK(CURDATE(), 1)');
  } else if (filters.dateRange === 'month') {
    where.push("DATE_FORMAT(c.acquired_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')");
  }

  const areas = filters.areas?.map(value => value.trim()).filter(Boolean) ?? [];
  if (areas.length > 0) {
    where.push(`(${areas.map(() => 'c.area LIKE ?').join(' OR ')})`);
    params.push(...areas.map(area => `%${area}%`));
  }

  addInFilter(where, params, 'c.source', filters.sources);
  addInFilter(where, params, 'c.tag', filters.tags);
  addInFilter(where, params, "COALESCE(u.name, '')", filters.advisors);

  const statuses = filters.statuses?.map(value => value.trim()).filter(Boolean) ?? [];
  if (statuses.length > 0) {
    where.push(`(${DISPLAY_STATUS_SQL}) IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

export function mapCustomerRow(row: RowDataPacket): CustomerDto {
  return {
    id: row.customer_code || row.id,
    _id: row.id,
    name: row.name,
    wechat: row.wechat || '',
    phone: row.phone || '',
    area: row.area || '',
    source: row.source || '',
    acquiredAt: row.acquired_at_date || formatDateOnly(row.acquired_at),
    tag: row.tag || '',
    followStatus: row.follow_status || '待跟进',
    followDate: row.follow_date_date || formatDateOnly(row.follow_date),
    advisor: row.advisor_name || '',
    advisorId: row.advisor_id || '',
    totalOrders: Number(row.total_orders) || 0,
    lastFollow: row.last_follow_date || formatDateOnly(row.last_follow),
    profile: parseJson<Record<string, unknown> | null>(row.profile, null),
    situation: row.situation || '',
    intendedProduct: row.intended_product || '',
    remark: row.remark || '',
  };
}

export async function listCustomers(db: Pool, input: CustomerListInput) {
  const { whereSql, params } = buildCustomerWhere(input);
  const offset = (input.page - 1) * input.pageSize;
  const [countRows] = await db.query<Array<RowDataPacket & { cnt: number }>>(
    `SELECT COUNT(*) AS cnt
     FROM customers c
     LEFT JOIN users u ON u.id = c.advisor_id
     ${whereSql}`,
    params
  );
  const [rows] = await db.query<RowDataPacket[]>(
    `${CUSTOMER_SELECT_SQL}
     ${whereSql}
     ORDER BY c.acquired_at DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, input.pageSize, offset]
  );
  return {
    total: Number(countRows[0]?.cnt) || 0,
    page: input.page,
    pageSize: input.pageSize,
    data: rows.map(mapCustomerRow),
  };
}

export async function exportCustomers(db: Pool, filters: CustomerListFilters) {
  const { whereSql, params } = buildCustomerWhere(filters);
  const [rows] = await db.query<RowDataPacket[]>(
    `${CUSTOMER_SELECT_SQL}
     ${whereSql}
     ORDER BY c.acquired_at DESC, c.created_at DESC`,
    params
  );
  return rows.map(mapCustomerRow);
}

export async function getCustomerFilterOptions(db: Pool) {
  const [rows] = await db.query<Array<RowDataPacket & { advisor: string }>>(
    `SELECT DISTINCT u.name AS advisor
     FROM customers c
     JOIN users u ON u.id = c.advisor_id
     WHERE c.tag IN ('D1','D2','D3')
       AND COALESCE(c.total_orders, 0) = 0
       AND u.name IS NOT NULL
       AND u.name <> ''
     ORDER BY u.name`
  );
  return { advisors: rows.map(row => row.advisor).filter(Boolean) };
}
