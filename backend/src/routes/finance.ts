import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import { getDb } from '../config/database';
import {
  recalculateSalaryRecord,
  syncCompletedServicesToSalary,
} from '../services/salarySettlementService';
import { parseJson } from '../utils/serialization';
import { randomUUID } from 'crypto';
import { buildSalaryCustomerLedger } from '../services/salaryCustomerLedgerService';

const router: Router = Router();
const ADMIN_ROLES = ['superadmin', 'admin'] as const;

function validMonth(value: unknown): string {
  const month = String(value || new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw Object.assign(new Error('月份格式应为 YYYY-MM'), { statusCode: 400 });
  }
  return month;
}

function validDate(value: unknown, fallback: string): string {
  const date = String(value || fallback);
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    throw Object.assign(new Error('日期格式应为 YYYY-MM-DD'), { statusCode: 400 });
  }
  return date;
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function mapEntry(row: any) {
  return {
    id: row.id,
    serviceRecordId: row.service_record_id,
    appointmentId: row.appointment_id,
    appointmentNo: row.appointment_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    therapistId: row.therapist_id,
    therapistName: row.therapist_name,
    serviceDate: row.service_date_text || (row.service_date ? new Date(row.service_date).toISOString() : ''),
    serviceItems: row.service_items || '',
    serviceType: row.service_type,
    itemCount: Number(row.item_count) || 0,
    experienceFee: money(row.experience_fee),
    laborFee: money(row.labor_fee),
    commission: money(row.commission),
    couponFee: money(row.coupon_fee),
    otherFee: money(row.other_fee),
    deduction: money(row.deduction),
    payableAmount: money(row.payable_amount),
    sourceType: row.source_type,
    evidence: parseJson(row.evidence_snapshot, {}),
    settlementStatus: row.settlement_status,
    settlementNote: row.settlement_note || '',
    manualAdjusted: Boolean(row.manual_adjusted),
    adjustedByName: row.adjusted_by_name || '',
    adjustedAt: row.adjusted_at ? new Date(row.adjusted_at).toISOString() : null,
    confirmedByName: row.confirmed_by_name || '',
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
  };
}

function mapSalary(row: any, entries: ReturnType<typeof mapEntry>[]) {
  return {
    id: row.id,
    therapistId: row.therapist_id,
    therapistName: row.therapist_name || '',
    month: row.month,
    serviceCount: Number(row.service_count) || 0,
    experienceFee: money(row.experience_fee),
    laborFee: money(row.labor_fee),
    commission: money(row.commission),
    couponFee: money(row.coupon_fee),
    otherFee: money(row.other_fee),
    deduction: money(row.deduction),
    total: money(row.total),
    status: row.status || '待结算',
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    confirmedByName: row.confirmed_by_name || '',
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    settlementNote: row.settlement_note || '',
    entries,
  };
}

router.get('/salary', authenticateToken, async (req, res, next) => {
  try {
    const db = getDb();
    const month = validMonth(req.query.month);
    const scope = req.query.scope === 'all' ? 'all' : 'month';
    const weekStart = validDate(req.query.weekStart, `${month}-01`);
    const weekEnd = addDays(weekStart, 6);
    for (const syncMonth of new Set([month, weekEnd.slice(0, 7)])) {
      await syncCompletedServicesToSalary(db, syncMonth);
    }

    const [rows] = await db.query(
      `SELECT s.*, t.name AS therapist_name, confirmer.name AS confirmed_by_name
       FROM salary_records s
       LEFT JOIN therapists t ON t.id = s.therapist_id
       LEFT JOIN users confirmer ON confirmer.id = s.confirmed_by
       WHERE s.month = ?
       ORDER BY FIELD(s.status, '待结算', '审核中', '已结算'), t.name`,
      [month]
    );
    const entryWhere = scope === 'all' ? '' : `WHERE DATE_FORMAT(entry.service_date, '%Y-%m') = ?`;
    const [entryRows] = await db.query(
      `SELECT entry.*, DATE_FORMAT(entry.service_date, '%Y-%m-%d') AS service_date_text,
              adjuster.name AS adjusted_by_name,
              confirmer.name AS confirmed_by_name
       FROM salary_settlement_entries entry
       LEFT JOIN users adjuster ON adjuster.id = entry.adjusted_by
       LEFT JOIN users confirmer ON confirmer.id = entry.confirmed_by
       ${entryWhere}
       ORDER BY entry.service_date DESC, entry.appointment_no DESC`,
      scope === 'all' ? [] : [month]
    );

    const entries = (entryRows as any[]).map(mapEntry);
    const [cumulativeEntryRows] = await db.query(
      `SELECT entry.*, DATE_FORMAT(entry.service_date, '%Y-%m-%d') AS service_date_text,
              adjuster.name AS adjusted_by_name,
              confirmer.name AS confirmed_by_name
       FROM salary_settlement_entries entry
       LEFT JOIN users adjuster ON adjuster.id = entry.adjusted_by
       LEFT JOIN users confirmer ON confirmer.id = entry.confirmed_by
       WHERE entry.settlement_status IN ('已确认', '已结算')
       ORDER BY entry.service_date, entry.appointment_no`
    );
    const cumulativeEntries = (cumulativeEntryRows as any[]).map(mapEntry);
    const [displayEntryRows] = await db.query(
      `SELECT entry.*, DATE_FORMAT(entry.service_date, '%Y-%m-%d') AS service_date_text,
              adjuster.name AS adjusted_by_name,
              confirmer.name AS confirmed_by_name
       FROM salary_settlement_entries entry
       LEFT JOIN users adjuster ON adjuster.id = entry.adjusted_by
       LEFT JOIN users confirmer ON confirmer.id = entry.confirmed_by
       WHERE entry.service_date BETWEEN ? AND ?
       ORDER BY entry.service_date, entry.appointment_no`,
      [weekStart, weekEnd]
    );
    const displayEntries = (displayEntryRows as any[]).map(mapEntry);
    const byTherapist = new Map<string, ReturnType<typeof mapEntry>[]>();
    for (const entry of entries) {
      byTherapist.set(entry.therapistId, [
        ...(byTherapist.get(entry.therapistId) || []),
        entry,
      ]);
    }
    const [therapistRows] = await db.query(
      `SELECT id, name, therapist_type, upgrade_rate, commission_rate FROM therapists WHERE status <> '离职' ORDER BY name`
    );
    const [customerRows] = await db.query(
      `SELECT id, customer_code, name FROM customers ORDER BY customer_code`
    );
    const [orderRows] = await db.query(
      `SELECT o.customer_id,
              COALESCE(c.customer_code, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.customerCode'))) AS customer_code,
              COALESCE(c.name, JSON_UNQUOTE(JSON_EXTRACT(o.customer_snapshot, '$.name'))) AS customer_name,
              o.type, o.amount, o.pay_status,
              DATE_FORMAT(o.purchase_date, '%Y-%m-%d') AS purchase_date,
              DATE_FORMAT(o.created_at, '%Y-%m-%d') AS created_date,
              o.used_times, o.total_times, o.is_upgrade, o.service_item_count,
              o.service_items, o.service_people
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.pay_status <> '已退款'
       ORDER BY COALESCE(o.purchase_date, DATE(o.created_at)) DESC, o.created_at DESC`
    );
    const [appointmentRows] = await db.query(
      `SELECT customer_id, therapist_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, status
       FROM appointments WHERE status <> '已取消'`
    );
    const [adjustmentRows] = await db.query(
      `SELECT * FROM salary_customer_adjustments ${scope === 'all' ? '' : 'WHERE month = ?'}`,
      scope === 'all' ? [] : [month]
    );
    const ledger = buildSalaryCustomerLedger({
      month,
      scope,
      therapists: therapistRows as any[],
      customers: customerRows as any[],
      orders: orderRows as any[],
      appointments: appointmentRows as any[],
      entries: entries as any[],
      cumulativeEntries: cumulativeEntries as any[],
      displayEntries: displayEntries as any[],
      adjustments: adjustmentRows as any[],
    });
    const salaryByTherapist = new Map((rows as any[]).map(row => [row.therapist_id, row]));
    const data = ledger.therapists.map(therapist => {
      const salary = salaryByTherapist.get(therapist.id);
      return {
        ...(salary ? mapSalary(salary, byTherapist.get(therapist.id) || []) : {
          id: `ledger-${therapist.id}-${month}`,
          therapistId: therapist.id,
          therapistName: therapist.name,
          month,
          serviceCount: 0,
          experienceFee: 0,
          laborFee: 0,
          commission: 0,
          couponFee: 0,
          otherFee: 0,
          deduction: 0,
          total: 0,
          status: '待结算',
          confirmedAt: null,
          confirmedByName: '',
          settledAt: null,
          settlementNote: '',
          entries: byTherapist.get(therapist.id) || [],
        }),
        therapistType: therapist.therapistType,
        tier: therapist.tier,
        tierKey: therapist.tierKey,
        commissionRate: therapist.commissionRate,
        upgradeRate: therapist.upgradeRate,
        profileUpgradeRate: therapist.profileUpgradeRate,
        upgradedCustomerCount: therapist.upgradedCustomerCount,
        customers: therapist.customers,
      };
    });
    res.json({
      month,
      scope,
      weekStart,
      weekEnd,
      editable: ADMIN_ROLES.includes(req.userRole as typeof ADMIN_ROLES[number]),
      source: '客户与套餐数据来自订单；已服务次数、每天服务项目和费用凭证来自排期管理“已完成”服务；抵扣券默认300元；手工费按项目单价×订单总次数；提成按套餐金额×技师档案当前定档比例并随档案更新全局重算；其他费用默认0元；每周凭证确认后才累计到已付金额',
      weeks: ledger.weeks,
      summary: ledger.summary,
      data,
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/salary/customer-adjustments',
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  auditLog('finance'),
  async (req, res, next) => {
    try {
      const db = getDb();
      const month = validMonth(req.body?.month);
      const therapistId = String(req.body?.therapistId || '');
      const customerId = String(req.body?.customerId || '');
      if (!therapistId || !customerId) {
        throw Object.assign(new Error('技师和客户不能为空'), { statusCode: 400 });
      }
      const couponFee = money(req.body?.couponFee);
      const otherFee = money(req.body?.otherFee);
      const paidAmount = money(req.body?.paidAmount);
      const note = String(req.body?.adjustmentNote || '').slice(0, 500);
      await db.execute(
        `INSERT INTO salary_customer_adjustments (
           id, therapist_id, customer_id, month, coupon_fee, other_fee, paid_amount,
           adjustment_note, adjusted_by, adjusted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           coupon_fee = VALUES(coupon_fee), other_fee = VALUES(other_fee),
           paid_amount = VALUES(paid_amount),
           adjustment_note = VALUES(adjustment_note), adjusted_by = VALUES(adjusted_by),
           adjusted_at = NOW()`,
        [randomUUID(), therapistId, customerId, month, couponFee, otherFee, paidAmount, note, req.userId || null]
      );
      res.json({ message: '客户结算调整已保存' });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/salary/week-confirmation',
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  auditLog('finance'),
  async (req, res, next) => {
    const db = getDb();
    const connection = await db.getConnection();
    try {
      const therapistId = String(req.body?.therapistId || '');
      const customerId = String(req.body?.customerId || '');
      const weekStart = validDate(req.body?.weekStart, '');
      const weekEnd = addDays(weekStart, 6);
      const status = req.body?.confirmed === false ? '待确认' : '已确认';
      if (!therapistId || !customerId) {
        throw Object.assign(new Error('技师和客户不能为空'), { statusCode: 400 });
      }

      await connection.beginTransaction();
      const [monthRows] = await connection.query(
        `SELECT DATE_FORMAT(service_date, '%Y-%m') AS month
         FROM salary_settlement_entries
         WHERE therapist_id = ? AND customer_id = ? AND service_date BETWEEN ? AND ?
         FOR UPDATE`,
        [therapistId, customerId, weekStart, `${weekEnd} 23:59:59`]
      );
      const [result] = await connection.execute(
        `UPDATE salary_settlement_entries
         SET settlement_status = ?,
             confirmed_by = CASE WHEN ? = '已确认' THEN ? ELSE NULL END,
             confirmed_at = CASE WHEN ? = '已确认' THEN NOW() ELSE NULL END
         WHERE therapist_id = ? AND customer_id = ?
           AND service_date BETWEEN ? AND ?
           AND settlement_status <> '已结算'`,
        [
          status,
          status,
          req.userId || null,
          status,
          therapistId,
          customerId,
          weekStart,
          `${weekEnd} 23:59:59`,
        ]
      );
      for (const affectedMonth of new Set((monthRows as Array<{ month: string }>).map(row => row.month))) {
        await recalculateSalaryRecord(connection, therapistId, affectedMonth);
      }
      await connection.commit();
      res.json({
        message: status === '已确认' ? '本周费用已确认并计入已付金额' : '本周费用已撤销确认',
        updatedCount: Number((result as { affectedRows?: number }).affectedRows || 0),
      });
    } catch (err) {
      await connection.rollback();
      next(err);
    } finally {
      connection.release();
    }
  }
);

router.patch(
  '/salary/entries/:id',
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  auditLog('finance'),
  async (req, res, next) => {
    const db = getDb();
    const connection = await db.getConnection();
    try {
      const actorId = req.userId || '';
      const allowedStatuses = ['待确认', '已确认', '已结算'];
      const status = String(req.body?.settlementStatus || '待确认');
      if (!allowedStatuses.includes(status)) {
        throw Object.assign(new Error('结算明细状态无效'), { statusCode: 400 });
      }
      const experienceFee = money(req.body?.experienceFee);
      const laborFee = money(req.body?.laborFee);
      const commission = money(req.body?.commission);
      const couponFee = money(req.body?.couponFee);
      const otherFee = money(req.body?.otherFee);
      const deduction = money(req.body?.deduction);
      const payable = experienceFee + laborFee + otherFee - deduction;

      await connection.beginTransaction();
      const [existingRows] = await connection.query(
        `SELECT therapist_id, DATE_FORMAT(service_date, '%Y-%m') AS month
         FROM salary_settlement_entries WHERE id = ? FOR UPDATE`,
        [req.params.id]
      );
      const existing = (existingRows as Array<{ therapist_id: string; month: string }>)[0];
      if (!existing) {
        throw Object.assign(new Error('结算凭证不存在'), { statusCode: 404 });
      }

      await connection.execute(
        `UPDATE salary_settlement_entries
         SET experience_fee = ?, labor_fee = ?, commission = ?,
             coupon_fee = ?, other_fee = ?, deduction = ?, payable_amount = ?,
             settlement_status = ?, settlement_note = ?,
             manual_adjusted = 1, adjusted_by = ?, adjusted_at = NOW(),
             confirmed_by = CASE WHEN ? = '已确认' THEN ? ELSE confirmed_by END,
             confirmed_at = CASE WHEN ? = '已确认' THEN NOW() ELSE confirmed_at END
         WHERE id = ?`,
        [
          experienceFee,
          laborFee,
          commission,
          couponFee,
          otherFee,
          deduction,
          payable,
          status,
          String(req.body?.settlementNote || '').slice(0, 500),
          actorId,
          status,
          actorId,
          status,
          req.params.id,
        ]
      );
      await recalculateSalaryRecord(connection, existing.therapist_id, existing.month);
      await connection.commit();
      res.json({ message: '结算凭证已保存', payableAmount: payable });
    } catch (err) {
      await connection.rollback();
      next(err);
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/salary/:id/settle',
  authenticateToken,
  authorizeRoles(...ADMIN_ROLES),
  auditLog('finance'),
  async (req, res, next) => {
    const db = getDb();
    const connection = await db.getConnection();
    try {
      const actorId = req.userId || '';
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT therapist_id, month FROM salary_records WHERE id = ? FOR UPDATE',
        [req.params.id]
      );
      const salary = (rows as Array<{ therapist_id: string; month: string }>)[0];
      if (!salary) {
        throw Object.assign(new Error('工资结算记录不存在'), { statusCode: 404 });
      }
      const status = req.body?.status === '审核中' ? '审核中' : '已结算';
      await connection.execute(
        `UPDATE salary_records
         SET status = ?, confirmed_at = NOW(), confirmed_by = ?,
             settled_at = CASE WHEN ? = '已结算' THEN NOW() ELSE NULL END,
             settlement_note = ?
         WHERE id = ?`,
        [
          status,
          actorId,
          status,
          String(req.body?.settlementNote || '').slice(0, 500),
          req.params.id,
        ]
      );
      await connection.execute(
        `UPDATE salary_settlement_entries
         SET settlement_status = ?, confirmed_at = NOW(), confirmed_by = ?
         WHERE therapist_id = ? AND DATE_FORMAT(service_date, '%Y-%m') = ?`,
        [
          status === '已结算' ? '已结算' : '已确认',
          actorId,
          salary.therapist_id,
          salary.month,
        ]
      );
      await connection.commit();
      res.json({ message: status === '已结算' ? '已确认结算' : '已提交审核' });
    } catch (err) {
      await connection.rollback();
      next(err);
    } finally {
      connection.release();
    }
  }
);

router.get('/income', authenticateToken, async (_req, res, next) => {
  try {
    const db = getDb();
    const [monthRows] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              SUM(CASE WHEN pay_status='已付款' THEN amount ELSE 0 END) AS revenue,
              SUM(CASE WHEN pay_status='已退款' THEN amount ELSE 0 END) AS refund,
              COUNT(*) AS order_count
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month`
    );
    const [summary] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM customers) AS total_customers,
         (SELECT COUNT(*) FROM orders) AS total_orders,
         (SELECT COALESCE(SUM(amount),0) FROM orders WHERE pay_status='已付款') AS total_revenue,
         (SELECT COUNT(*) FROM appointments WHERE status='已完成') AS done_appointments`
    );
    res.json({ monthly: monthRows, summary: (summary as any[])[0] });
  } catch (err) {
    next(err);
  }
});

export { router as financeRouter };
