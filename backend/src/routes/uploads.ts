import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { authenticateToken } from '../middleware/auth';
import { createOssClient, hasOssConfig, ossFileUrl } from '../utils/oss';
import { createError } from '../middleware/errorHandler';

const router: Router = Router();
const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
});

const allowedTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function safeExt(file: Express.Multer.File): string {
  const original = file.originalname || '';
  const ext = original.includes('.') ? original.split('.').pop()?.toLowerCase() : '';
  if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  if (file.mimetype === 'application/pdf') return 'pdf';
  if (file.mimetype === 'image/png') return 'png';
  if (file.mimetype === 'image/webp') return 'webp';
  return 'jpg';
}

function safeScope(value: unknown): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/[^a-zA-Z0-9_-]/g, '-')
    : 'general';
}

function publicLocalUrl(objectKey: string): string {
  const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  const urlPath = `/api/uploads/files/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  return baseUrl ? `${baseUrl}${urlPath}` : urlPath;
}

async function saveLocalFile(file: Express.Multer.File, scope: string, today: string, uploadedAt: string) {
  const objectKey = `${scope}/${today}/${randomUUID()}.${safeExt(file)}`;
  const target = path.join(uploadDir, objectKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, file.buffer);
  return {
    id: `att-${randomUUID()}`,
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
    objectKey,
    url: publicLocalUrl(objectKey),
    uploadedAt,
    storage: 'local',
  };
}

router.get('/files/*', async (req, res, next) => {
  try {
    const relativeKey = (req.params as Record<string, string>)['0'] || '';
    const decodedKey = relativeKey.split('/').map(decodeURIComponent).join(path.sep);
    const root = path.resolve(uploadDir);
    const filePath = path.resolve(root, decodedKey);
    if (!filePath.startsWith(root + path.sep)) {
      res.status(400).json({ error: 'Invalid file path' });
      return;
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, upload.array('files', 10), async (req, res, next) => {
  try {
    const files = (req.files || []) as Express.Multer.File[];
    if (files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const scope = safeScope(req.body.scope);

    const invalid = files.find(file => !allowedTypes.has(file.mimetype));
    if (invalid) {
      res.status(400).json({ error: 'Only PDF and image files are supported' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const uploadedAt = new Date().toISOString();
    const data = [];

    const allowLocalFallback = process.env.ALLOW_LOCAL_UPLOAD_FALLBACK !== 'false';

    if (!hasOssConfig()) {
      if (!allowLocalFallback) {
        throw createError('文件存储服务暂不可用，请联系管理员检查 OSS 配置', 503);
      }
      console.warn('OSS is not configured. Uploaded files will be stored locally.');
      for (const file of files) {
        data.push(await saveLocalFile(file, scope, today, uploadedAt));
      }
    } else {
      try {
        const client = createOssClient();
        for (const file of files) {
          const objectKey = `${scope}/${today}/${randomUUID()}.${safeExt(file)}`;
          await client.put(objectKey, file.buffer, {
            headers: {
              'Content-Type': file.mimetype,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
          data.push({
            id: `att-${randomUUID()}`,
            name: file.originalname,
            type: file.mimetype,
            size: file.size,
            objectKey,
            url: ossFileUrl(objectKey),
            uploadedAt,
            storage: 'oss',
          });
        }
      } catch (uploadErr) {
        if (!allowLocalFallback) {
          throw uploadErr;
        }
        console.error('OSS upload failed. Uploaded files will be stored locally.', uploadErr);
        for (const file of files) {
          data.push(await saveLocalFile(file, scope, today, uploadedAt));
        }
      }
    }

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

export { router as uploadsRouter };
