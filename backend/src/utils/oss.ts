import OSS from 'ali-oss';

export function hasOssConfig(): boolean {
  return Boolean(
    process.env.OSS_REGION &&
    process.env.OSS_BUCKET &&
    process.env.OSS_ACCESS_KEY_ID &&
    process.env.OSS_ACCESS_KEY_SECRET
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for OSS access`);
  }
  return value;
}

export function createOssClient() {
  return new OSS({
    region: requireEnv('OSS_REGION'),
    endpoint: process.env.OSS_ENDPOINT || undefined,
    accessKeyId: requireEnv('OSS_ACCESS_KEY_ID'),
    accessKeySecret: requireEnv('OSS_ACCESS_KEY_SECRET'),
    bucket: requireEnv('OSS_BUCKET'),
    secure: true,
  });
}

export function ossFileUrl(objectKey: string): string {
  const client = createOssClient();
  return client.signatureUrl(objectKey, { expires: 7 * 24 * 60 * 60 });
}
