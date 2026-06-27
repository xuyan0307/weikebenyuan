import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initDatabase } from './config/database';
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
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// 健康检查
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

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

    const server = createServer(app);
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // 优雅关闭
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
