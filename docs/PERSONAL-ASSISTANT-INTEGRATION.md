# 个人助理客户与预约接口

## 能力边界

个人助理只通过 `/api/assistant` 访问以下能力：

- 按姓名、手机号、微信号或客户编号查询客户；
- 创建客户，手机号或微信号重复时返回冲突，不自动覆盖；
- 查询在职技师；
- 查询指定日期各技师上午、下午、晚上的占用情况；
- 创建预约，复用现有的历史时间校验、技师时段冲突校验、订单绑定和服务次数规则。

接口不开放删除客户、取消预约、完成服务、订单修改或财务操作。

## 鉴权与审计

生产环境配置：

```dotenv
PERSONAL_ASSISTANT_API_KEYS=<至少 32 字节的随机密钥>
PERSONAL_ASSISTANT_USER_ID=personal-assistant
PERSONAL_ASSISTANT_USER_NAME=个人助理
```

可在 `PERSONAL_ASSISTANT_API_KEYS` 中用逗号同时配置新旧两个密钥，实现不停机轮换。客户端通过 `X-Assistant-Key` 发送密钥，不使用或暴露后台管理员账号密码。

所有写操作必须携带唯一的 `X-Request-Id`。客户 ID 和预约编号由该请求号确定性生成；同一请求号重试会返回原记录，避免网络重试造成重复。现有 `operation_logs` 会保存操作身份、请求号、业务载荷和响应状态。

## 插件配置

个人插件默认位于 `~/plugins/weikebenyuan-assistant`。部署后台接口后，将 `config.example.json` 复制为不纳入版本管理的 `config.local.json`，填入同一生产密钥：

```json
{
  "baseUrl": "https://weikebenyuan.com/api/assistant",
  "apiKey": "<与服务器一致的随机密钥>"
}
```

修改配置后在新 Codex 任务中验证：先查询客户和空档，再用专用测试客户创建一条未来预约。不要用真实客户做首次联调。
