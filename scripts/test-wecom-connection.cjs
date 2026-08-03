require('dotenv').config({ path: '.env.local' });

const required = name => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

async function main() {
  const corpId = required('WECOM_CORP_ID');
  const secret = required('WECOM_APP_SECRET');
  const agentId = Number(required('WECOM_AGENT_ID'));
  const userId = String(process.argv[2] || '').trim();
  if (!userId) throw new Error('Usage: node scripts/test-wecom-connection.cjs <UserID>');

  const tokenResponse = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`,
  );
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || Number(tokenPayload.errcode || 0) !== 0 || !tokenPayload.access_token) {
    throw new Error(`Token request failed: ${tokenPayload.errcode ?? tokenResponse.status} ${tokenPayload.errmsg || ''}`.trim());
  }

  const sendResponse = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(tokenPayload.access_token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: userId,
        msgtype: 'text',
        agentid: agentId,
        text: { content: '【产康管理系统联调】企业微信预约通知通道测试，收到后请回复“收到”。' },
        safe: 0,
      }),
    },
  );
  const sendPayload = await sendResponse.json();
  console.log(JSON.stringify({
    token: 'ok',
    send: {
      status: sendResponse.status,
      errcode: sendPayload.errcode,
      errmsg: sendPayload.errmsg,
      msgid: sendPayload.msgid || null,
      invaliduser: sendPayload.invaliduser || '',
    },
  }, null, 2));
  if (!sendResponse.ok || Number(sendPayload.errcode || 0) !== 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
