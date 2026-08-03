const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  createWecomSignature,
  extractXmlValue,
  verifyAndDecryptWecomEcho,
  verifyAndDecryptWecomMessage,
} = require('../dist/services/wecomCallbackService');

const token = 'callback-token';
const encodingAesKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const corpId = 'ww-test-corp';

function pad(buffer) {
  const blockSize = 32;
  const paddingLength = blockSize - (buffer.length % blockSize);
  return Buffer.concat([buffer, Buffer.alloc(paddingLength, paddingLength)]);
}

function encrypt(plainText) {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  const content = Buffer.from(plainText);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(content.length, 0);
  const payload = Buffer.concat([
    Buffer.from('0123456789abcdef'),
    length,
    content,
    Buffer.from(corpId),
  ]);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(pad(payload)), cipher.final()]).toString('base64');
}

function withEnvironment(fn) {
  const previous = {
    token: process.env.WECOM_CALLBACK_TOKEN,
    key: process.env.WECOM_ENCODING_AES_KEY,
    corpId: process.env.WECOM_CORP_ID,
  };
  process.env.WECOM_CALLBACK_TOKEN = token;
  process.env.WECOM_ENCODING_AES_KEY = encodingAesKey;
  process.env.WECOM_CORP_ID = corpId;
  try {
    return fn();
  } finally {
    if (previous.token === undefined) delete process.env.WECOM_CALLBACK_TOKEN;
    else process.env.WECOM_CALLBACK_TOKEN = previous.token;
    if (previous.key === undefined) delete process.env.WECOM_ENCODING_AES_KEY;
    else process.env.WECOM_ENCODING_AES_KEY = previous.key;
    if (previous.corpId === undefined) delete process.env.WECOM_CORP_ID;
    else process.env.WECOM_CORP_ID = previous.corpId;
  }
}

test('extractXmlValue reads CDATA and plain XML values', () => {
  assert.equal(extractXmlValue('<xml><A><![CDATA[value]]></A></xml>', 'A'), 'value');
  assert.equal(extractXmlValue('<xml><A>plain</A></xml>', 'A'), 'plain');
});

test('verifies and decrypts the WeCom URL verification echo', () => {
  withEnvironment(() => {
    const timestamp = '1720000000';
    const nonce = 'nonce-1';
    const encrypted = encrypt('verified-echo');
    const msgSignature = createWecomSignature(token, timestamp, nonce, encrypted);
    assert.equal(
      verifyAndDecryptWecomEcho({ msgSignature, timestamp, nonce }, encrypted),
      'verified-echo',
    );
  });
});

test('verifies and decrypts a WeCom text reply', () => {
  withEnvironment(() => {
    const timestamp = '1720000001';
    const nonce = 'nonce-2';
    const innerXml =
      '<xml><FromUserName><![CDATA[XuYan]]></FromUserName>' +
      '<MsgType><![CDATA[text]]></MsgType>' +
      '<Content><![CDATA[已通知 AP-1001]]></Content></xml>';
    const encrypted = encrypt(innerXml);
    const msgSignature = createWecomSignature(token, timestamp, nonce, encrypted);
    const outerXml = `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;
    const message = verifyAndDecryptWecomMessage(
      { msgSignature, timestamp, nonce },
      outerXml,
    );
    assert.equal(message.fromUserId, 'XuYan');
    assert.equal(message.msgType, 'text');
    assert.equal(message.content, '已通知 AP-1001');
  });
});

test('rejects a callback with an invalid signature', () => {
  withEnvironment(() => {
    const encrypted = encrypt('verified-echo');
    assert.throws(
      () =>
        verifyAndDecryptWecomEcho(
          { msgSignature: 'invalid', timestamp: '1720000002', nonce: 'nonce-3' },
          encrypted,
        ),
      /signature/i,
    );
  });
});
