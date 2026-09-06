import { Router } from 'express';
import { auditLog } from '../middleware/auditLog';
import { authenticateToken, authorizeRoles, type AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import {
  getJuguangOverview,
  getLatestSuccessfulJuguangSnapshot,
  getJuguangSyncStatus,
  isJuguangSyncRunning,
  juguangDataStatusForRange,
  listJuguangRows,
  queryJuguangKeywords,
  triggerJuguangSync,
  validateDateRange,
  yesterdayShanghai,
  type JuguangReportType,
} from '../services/juguangService';

const router: Router = Router();
const REPORT_TYPES = new Set<JuguangReportType>([
  'account', 'campaign', 'unit', 'creative', 'note', 'search_word', 'geo', 'audience',
  'easy_campaign', 'easy_note', 'easy_group',
]);

const REPORT_ROLES: Record<JuguangReportType, string[]> = {
  account: ['superadmin', 'admin', 'service', 'finance'],
  campaign: ['superadmin', 'admin', 'service', 'finance'],
  unit: ['superadmin', 'admin', 'finance'],
  creative: ['superadmin', 'admin', 'finance'],
  note: ['superadmin', 'admin', 'service'],
  search_word: ['superadmin', 'admin', 'service'],
  geo: ['superadmin', 'admin'],
  audience: ['superadmin', 'admin'],
  easy_campaign: ['superadmin', 'admin', 'finance'],
  easy_note: ['superadmin', 'admin', 'finance'],
  easy_group: ['superadmin', 'admin', 'finance'],
};

function dateRange(req: AuthRequest): { startDate: string; endDate: string } {
  const fallback = yesterdayShanghai();
  const startDate = String(req.query.startDate || fallback);
  const endDate = String(req.query.endDate || startDate);
  validateDateRange(startDate, endDate);
  return { startDate, endDate };
}

router.use(authenticateToken);
router.use(authorizeRoles('superadmin', 'admin', 'service', 'finance'));

router.get('/overview', async (req: AuthRequest, res, next) => {
  try {
    const { startDate, endDate } = dateRange(req);
    res.json({ data: await getJuguangOverview(startDate, endDate) });
  } catch (error) {
    next(createError(error instanceof Error ? error.message : '聚光总览查询失败', 400));
  }
});

router.get('/reports/:type', async (req: AuthRequest, res, next) => {
  try {
    const type = String(req.params.type) as JuguangReportType;
    if (!REPORT_TYPES.has(type)) throw new Error('不支持的聚光报表类型');
    if (!REPORT_ROLES[type].includes(String(req.userRole || ''))) {
      next(createError('无权限访问', 403));
      return;
    }
    const { startDate, endDate } = dateRange(req);
    const limit = Number(req.query.limit || 5000);
    const rows = await listJuguangRows(type, startDate, endDate, limit);
    res.json({ data: rows, total: rows.length });
  } catch (error) {
    next(createError(error instanceof Error ? error.message : '聚光报表查询失败', 400));
  }
});

router.get('/sync/status', authorizeRoles('superadmin', 'admin'), async (_req, res, next) => {
  try {
    res.json({ data: await getJuguangSyncStatus() });
  } catch (error) {
    next(error);
  }
});

router.post('/sync/on-open', auditLog('juguang'), async (req: AuthRequest, res, next) => {
  try {
    const startDate = String(req.body?.startDate || yesterdayShanghai());
    const endDate = String(req.body?.endDate || startDate);
    validateDateRange(startDate, endDate);
    const cachedSnapshot = await getLatestSuccessfulJuguangSnapshot(startDate, endDate);
    const lastFinishedAt = cachedSnapshot?.finishedAt;
    const fresh = lastFinishedAt
      ? Date.now() - Date.parse(lastFinishedAt) < 5 * 60 * 1000
      : false;
    if (fresh || isJuguangSyncRunning()) {
      res.json({
        accepted: false,
        reason: fresh ? 'fresh' : 'running',
        hasCachedSnapshot: Boolean(cachedSnapshot),
      });
      return;
    }
    void triggerJuguangSync(
      startDate,
      endDate,
      'page_open',
      juguangDataStatusForRange(endDate),
      req.userId,
    )
      .catch(error => console.error('Juguang page-open sync failed:', error));
    res.status(202).json({ accepted: true, hasCachedSnapshot: Boolean(cachedSnapshot) });
  } catch (error) {
    next(createError(error instanceof Error ? error.message : '聚光页面刷新失败', 400));
  }
});

router.post(
  '/sync/manual',
  authorizeRoles('superadmin', 'admin'),
  auditLog('juguang'),
  async (req: AuthRequest, res, next) => {
    try {
      const startDate = String(req.body?.startDate || yesterdayShanghai());
      const endDate = String(req.body?.endDate || startDate);
      validateDateRange(startDate, endDate);
      if (isJuguangSyncRunning()) {
        next(createError('已有聚光同步任务正在执行，请稍后重试', 409));
        return;
      }
      const dataStatus = juguangDataStatusForRange(endDate);
      void triggerJuguangSync(startDate, endDate, 'manual', dataStatus, req.userId)
        .catch(error => console.error('Juguang manual sync failed:', error));
      res.status(202).json({ message: '聚光数据同步任务已开始', accepted: true });
    } catch (error) {
      next(createError(error instanceof Error ? error.message : '聚光手动同步失败', 400));
    }
  }
);

router.post(
  '/keywords/recommend',
  authorizeRoles('superadmin', 'admin', 'service'),
  auditLog('juguang'),
  async (req: AuthRequest, res, next) => {
  try {
    const keyword = String(req.body?.keyword || '');
    const limit = Number(req.body?.limit || 50);
    res.json({ data: await queryJuguangKeywords(keyword, limit) });
  } catch (error) {
    next(createError(error instanceof Error ? error.message : '聚光关键词查询失败', 400));
  }
  },
);

export { router as juguangRouter };
