import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { closeDatabase, initDatabase, isDatabaseReady } from './config/database';
import { authRouter } from './routes/auth';
import { customersRouter } from './routes/customers';
import { ordersRouter } from './routes/orders';
import { appointmentsRouter } from './routes/appointments';
import { therapistsRouter } from './routes/therapists';
import { serviceRecordsRouter } from './routes/service-records';
import { financeRouter } from './routes/finance';
import { contractsRouter } from './routes/contracts';
import { dashboardRouter } from './routes/dashboard';
import { operationLogsRouter } from './routes/operation-logs';
import { usersRouter } from './routes/users';
import { uploadsRouter } from './routes/uploads';
import { settingsRouter } from './routes/settings';
import { assistantRouter } from './routes/assistant';
import { xiaohongshuOAuthRouter } from './routes/xiaohongshuOAuth';
import { errorHandler } from './middleware/errorHandler';
import {
  startAppointmentNotificationScheduler,
  stopAppointmentNotificationScheduler,
} from './services/appointmentNotificationService';
import {
  startAppointmentAutoCompletionScheduler,
  stopAppointmentAutoCompletionScheduler,
} from './services/appointmentAutoCompletionService';
import {
  startSystemParametersScheduler,
  stopSystemParametersScheduler,
} from './services/systemParametersService';

// Local development keeps shared secrets in the repository root `.env.local`.
// Support starting the API from either the repository root or `backend/`.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env.local') });
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use(morgan('combined', {
  // OAuth authorization codes are short-lived credentials and must not enter logs.
  skip: req => req.path === '/api/oauth/xiaohongshu/callback',
}));

// 健康检查
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

async function readinessHandler(_req: Request, res: Response) {
  const databaseReady = await isDatabaseReady();
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ready' : 'unavailable',
    database: databaseReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
}

app.get('/ready', readinessHandler);
app.get('/api/ready', readinessHandler);

// API路由
app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/therapists', therapistsRouter);
app.use('/api/service-records', serviceRecordsRouter);
app.use('/api/finance', financeRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/operation-logs', operationLogsRouter);
app.use('/api/users', usersRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/oauth', xiaohongshuOAuthRouter);

// 404处理
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// 错误处理
app.use(errorHandler);

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库连接
    await initDatabase();
    startAppointmentNotificationScheduler();
    startAppointmentAutoCompletionScheduler();
    startSystemParametersScheduler();

    const server = createServer(app);
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // 优雅关闭
    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal} received, shutting down gracefully...`);
      stopAppointmentNotificationScheduler();
      stopAppointmentAutoCompletionScheduler();
      stopSystemParametersScheduler();
      server.close(async () => {
        await closeDatabase();
        console.log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
