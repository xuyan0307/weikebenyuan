import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { createOssClient, ossFileUrl } from '../utils/oss';

const router: Router = Router();

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

router.post('/', authenticateToken, upload.array('files', 10), async (req, res, next) => {
  try {
    const files = (req.files || []) as Express.Multer.File[];
    if (files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const scope = typeof req.body.scope === 'string' && req.body.scope.trim()
      ? req.body.scope.trim().replace(/[^a-zA-Z0-9_-]/g, '-')
      : 'general';

    const invalid = files.find(file => !allowedTypes.has(file.mimetype));
    if (invalid) {
      res.status(400).json({ error: 'Only PDF and image files are supported' });
      return;
    }

    const client = createOssClient();
    const today = new Date().toISOString().slice(0, 10);
    const uploadedAt = new Date().toISOString();
    const data = [];

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
      });
    }

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

export { router as uploadsRouter };
