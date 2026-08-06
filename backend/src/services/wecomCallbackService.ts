import crypto from 'crypto';

export interface WecomCallbackQuery {
  msgSignature: string;
  timestamp: string;
  nonce: string;
}

export interface WecomCallbackMessage {
  fromUserId: string;
  msgType: string;
  content: string;
  rawXml: string;
}

function requiredConfig(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    const error = new Error(`Missing ${name} configuration`);
    Object.assign(error, { statusCode: 503 });
    throw error;
  }
  return normalized;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function extractXmlValue(xml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<${escapedTag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${escapedTag}>`,
    'i',
  );
  const match = pattern.exec(xml);
  if (!match) return '';
  return decodeXmlEntities((match[1] ?? match[2] ?? '').trim());
}

export function createWecomSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypted: string,
): string {
  return crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypted].sort().join(''))
    .digest('hex');
}

export function verifyWecomSignature(
  query: WecomCallbackQuery,
  encrypted: string,
  token = requiredConfig(process.env.WECOM_CALLBACK_TOKEN, 'WECOM_CALLBACK_TOKEN'),
): boolean {
  const expected = createWecomSignature(
    token,
    query.timestamp,
    query.nonce,
    encrypted,
  );
  const actualBuffer = Buffer.from(query.msgSignature.toLowerCase());
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function decodeEncodingAesKey(encodingAesKey: string): Buffer {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) {
    const error = new Error('Invalid WECOM_ENCODING_AES_KEY configuration');
    Object.assign(error, { statusCode: 503 });
    throw error;
  }
  return key;
}

function removePkcs7Padding(payload: Buffer): Buffer {
  if (!payload.length) throw new Error('Empty WeCom encrypted payload');
  const paddingLength = payload[payload.length - 1];
  if (paddingLength < 1 || paddingLength > 32 || paddingLength > payload.length) {
    throw new Error('Invalid WeCom encrypted payload padding');
  }
  for (let index = payload.length - paddingLength; index < payload.length; index += 1) {
    if (payload[index] !== paddingLength) {
      throw new Error('Invalid WeCom encrypted payload padding');
    }
  }
  return payload.subarray(0, payload.length - paddingLength);
}

export function decryptWecomPayload(
  encrypted: string,
  encodingAesKey = requiredConfig(
    process.env.WECOM_ENCODING_AES_KEY,
    'WECOM_ENCODING_AES_KEY',
  ),
  expectedReceiveId = requiredConfig(process.env.WECOM_CORP_ID, 'WECOM_CORP_ID'),
): string {
  const key = decodeEncodingAesKey(encodingAesKey);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  decipher.setAutoPadding(false);

  const decrypted = removePkcs7Padding(
    Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]),
  );
  if (decrypted.length < 20) throw new Error('Invalid WeCom encrypted payload');

  const messageLength = decrypted.readUInt32BE(16);
  const messageStart = 20;
  const messageEnd = messageStart + messageLength;
  if (messageEnd > decrypted.length) throw new Error('Invalid WeCom message length');

  const message = decrypted.subarray(messageStart, messageEnd).toString('utf8');
  const receiveId = decrypted.subarray(messageEnd).toString('utf8');
  if (receiveId !== expectedReceiveId) {
    throw new Error('WeCom callback receive ID mismatch');
  }
  return message;
}

function assertSignature(query: WecomCallbackQuery, encrypted: string): void {
  if (!verifyWecomSignature(query, encrypted)) {
    const error = new Error('Invalid WeCom callback signature');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }
}

export function verifyAndDecryptWecomEcho(
  query: WecomCallbackQuery,
  encryptedEcho: string,
): string {
  assertSignature(query, encryptedEcho);
  return decryptWecomPayload(encryptedEcho);
}

export function verifyAndDecryptWecomMessage(
  query: WecomCallbackQuery,
  callbackXml: string,
): WecomCallbackMessage {
  const encrypted = extractXmlValue(callbackXml, 'Encrypt');
  if (!encrypted) {
    const error = new Error('Missing WeCom encrypted message');
    Object.assign(error, { statusCode: 400 });
    throw error;
  }
  assertSignature(query, encrypted);

  const rawXml = decryptWecomPayload(encrypted);
  return {
    fromUserId: extractXmlValue(rawXml, 'FromUserName'),
    msgType: extractXmlValue(rawXml, 'MsgType').toLowerCase(),
    content: extractXmlValue(rawXml, 'Content'),
    rawXml,
  };
}
