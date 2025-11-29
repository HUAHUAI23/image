# 支付宝支付接入说明

本文档介绍如何配置和使用支付宝订单码支付功能。

## 一、功能概述

本项目已完成支付宝订单码支付（扫码支付）的后端接入，功能包括：

- ✅ 创建充值订单（生成支付二维码）
- ✅ 查询订单状态（轮询查询）
- ✅ 关闭/撤销订单
- ✅ 异步通知处理（支付成功回调）
- ✅ 幂等性保护（防止重复充值）
- ✅ 原子性事务（订单 + 余额 + 交易记录）
- ✅ 兜底查询机制（防止回调丢失）

## 二、配置步骤

### 2.1 获取支付宝密钥

1. 登录 [支付宝开放平台](https://open.alipay.com/)
2. 创建应用并获取 APPID
3. 使用 [密钥生成工具](https://opendocs.alipay.com/common/02kipl) 生成 RSA2 密钥对
   - 生成应用私钥（自己保存）
   - 上传应用公钥到支付宝开放平台
   - 获取支付宝公钥（用于验签）

### 2.2 配置环境变量

在 `.env` 文件中添加以下配置：

```env
# 支付宝配置
ALIPAY_APPID=2021xxxxxxxxxxxxx
ALIPAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...完整的应用私钥内容...
-----END RSA PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
...完整的支付宝公钥内容...
-----END PUBLIC KEY-----"
ALIPAY_NOTIFY_URL=https://your-domain.com/api/alipay/notify
```

**重要提示**：
- `ALIPAY_PRIVATE_KEY` 是您的**应用私钥**（请妥善保管，不要泄露）
- `ALIPAY_PUBLIC_KEY` 是**支付宝公钥**（不是应用公钥！）
- `ALIPAY_NOTIFY_URL` 必须是公网可访问的 HTTPS 地址

### 2.3 配置支付参数

在数据库 `payment_configs` 表中添加支付宝配置：

```sql
INSERT INTO payment_configs (provider, status, min_amount, max_amount, public_config)
VALUES (
  'alipay',
  'enabled',
  1,      -- 最小充值金额 1 元
  10000,  -- 最大充值金额 10000 元
  jsonb_build_object('orderTimeoutMinutes', 10)  -- 订单超时时间 10 分钟
);
```

## 三、API 接口说明

### 3.1 创建充值订单

**接口**：`POST /api/alipay/create-order`

**请求参数**：
```json
{
  "amount": 100  // 充值金额（元），必须在配置的范围内
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "chargeOrderId": 123,
    "outTradeNo": "ALI17123456789012345ABCDEF",
    "qrCode": "https://qr.alipay.com/bax09162nf0isv0exre4207e",
    "amount": 100,
    "expireTime": 600,  // 过期时间（秒）
    "expireAt": "2025-01-27T10:30:00.000Z"
  }
}
```

**前端使用**：
1. 使用 `qrCode` 生成二维码图片（可使用 `qrcode` 库）
2. 用户使用支付宝扫码支付
3. 轮询调用查询接口获取支付结果

### 3.2 查询订单状态

**接口**：`GET /api/alipay/query-order`

**查询参数**（二选一）：
- `outTradeNo`: 商户订单号
- `chargeOrderId`: 充值订单ID

**响应**：
```json
{
  "success": true,
  "data": {
    "chargeOrderId": 123,
    "outTradeNo": "ALI17123456789012345ABCDEF",
    "status": "success",  // pending | success | failed | closed
    "amount": 10000,      // 单位：分
    "paidAt": "2025-01-27T10:25:00.000Z",
    "createdAt": "2025-01-27T10:20:00.000Z",
    "alipayOrder": {
      "trade_status": "TRADE_SUCCESS",
      "trade_no": "2025012722001401234567890123",
      "buyer_logon_id": "abc***@gmail.com"
    }
  }
}
```

**前端轮询建议**：
- 间隔时间：5 秒
- 轮询次数：订单有效期内（默认10分钟）
- 停止条件：订单状态变为 `success`、`failed` 或 `closed`

### 3.3 关闭订单

**接口**：`POST /api/alipay/close-order`

**请求参数**：
```json
{
  "outTradeNo": "ALI17123456789012345ABCDEF"
}
```

**响应**：
```json
{
  "success": true,
  "message": "订单已关闭",
  "data": {
    "chargeOrderId": 123,
    "outTradeNo": "ALI17123456789012345ABCDEF",
    "status": "closed"
  }
}
```

**使用场景**：
- 用户主动取消支付
- 订单超时自动关闭（需配合定时任务）

### 3.4 异步通知处理

**接口**：`POST /api/alipay/notify`

**说明**：
- 此接口由支付宝服务器调用，无需前端调用
- 支付成功后支付宝会自动发送 POST 请求到配置的回调地址
- 自动完成订单更新、余额充值、交易记录创建

## 四、支付流程

### 4.1 标准支付流程

```
用户发起充值
    ↓
调用创建订单接口
    ↓
获取支付二维码
    ↓
展示二维码给用户
    ↓
用户扫码支付
    ↓
【并行】
├─ 支付宝异步通知 → 更新订单状态 → 充值余额
└─ 前端轮询查询 → 检测到支付成功 → 跳转成功页面
```

### 4.2 异常处理流程

#### 场景1：异步通知丢失

如果支付宝异步通知由于网络问题未成功送达：

1. 前端轮询查询接口会主动查询支付宝平台
2. 发现支付成功但本地未更新时，触发**兜底更新**
3. 自动完成余额充值（与异步通知逻辑一致）

#### 场景2：订单超时

1. 用户在有效期内未支付，订单状态仍为 `pending`
2. 建议配合定时任务自动关闭超时订单
3. 关闭后用户无法继续支付

#### 场景3：重复通知

支付宝可能重复发送异步通知：

1. 代码已实现**幂等性保护**
2. 多次通知只会处理一次
3. 使用数据库行锁防止并发问题

## 五、安全注意事项

### 5.1 签名验证

所有支付宝回调必须通过签名验证：

```typescript
// lib/alipay.ts 中的验签逻辑
export function verifyNotificationSignature(params: Record<string, any>): boolean {
  // 使用支付宝公钥验证签名
  const isValid = sdk.checkNotifySign(params)
  return isValid
}
```

### 5.2 金额校验

异步通知处理时会严格校验金额：

```typescript
// 支付宝返回的是字符串格式的元，需要转换为分
const alipayAmountInFen = Math.round(parseFloat(total_amount) * 100)

// 必须与订单金额完全一致
if (alipayAmountInFen !== chargeOrder.amount) {
  throw new Error('支付金额不匹配')
}
```

### 5.3 状态校验

只处理 `TRADE_SUCCESS` 状态的通知：

```typescript
if (params.trade_status !== 'TRADE_SUCCESS') {
  return new NextResponse('success', { status: 200 })  // 返回成功避免重试
}
```

### 5.4 幂等性保护

```typescript
// 订单已处理，直接返回
if (chargeOrder.status === 'success') {
  return  // 幂等性保护
}

// 订单状态必须是 pending
if (chargeOrder.status !== 'pending') {
  throw new Error(`订单状态异常: ${chargeOrder.status}`)
}
```

## 六、测试指南

### 6.1 沙箱环境测试

1. 使用支付宝沙箱环境（修改 `lib/alipay.ts` 中的 gateway）：

```typescript
alipaySdkInstance = new AlipaySdk({
  // ...其他配置
  gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',  // 沙箱网关
})
```

2. 下载 [支付宝沙箱版 APP](https://opendocs.alipay.com/common/02kkv7)
3. 使用沙箱账号登录并测试支付

### 6.2 本地测试回调

由于异步通知需要公网地址，本地测试可以使用：

- [Ngrok](https://ngrok.com/)：将本地端口映射到公网
- [LocalTunnel](https://localtunnel.github.io/www/)：免费的内网穿透工具

```bash
# 使用 ngrok
ngrok http 3000

# 将生成的 HTTPS 地址配置到 ALIPAY_NOTIFY_URL
# 例如：https://abc123.ngrok.io/api/alipay/notify
```

### 6.3 测试检查清单

- [ ] 创建订单成功，返回二维码
- [ ] 扫码支付成功，异步通知触发
- [ ] 订单状态更新为 `success`
- [ ] 余额正确增加
- [ ] 交易记录创建成功
- [ ] 查询接口返回正确状态
- [ ] 重复通知不会重复充值（幂等性）
- [ ] 关闭订单成功
- [ ] 金额校验生效（修改金额会报错）

## 七、常见问题

### Q1: 签名验证失败

**可能原因**：
- 使用了应用公钥而不是支付宝公钥
- 密钥格式错误（缺少 BEGIN/END 标记）
- 密钥类型不匹配（PKCS1 vs PKCS8）

**解决方案**：
1. 确认使用的是支付宝公钥（在开放平台查看）
2. 确保密钥包含完整的 PEM 格式头尾
3. 查看 SDK 文档确认密钥格式要求

### Q2: 异步通知未收到

**可能原因**：
- NOTIFY_URL 不是公网地址
- 服务器防火墙阻止了支付宝请求
- HTTPS 证书无效

**解决方案**：
1. 确保回调地址是 HTTPS 公网地址
2. 检查防火墙和安全组配置
3. 使用有效的 SSL 证书
4. 依赖轮询查询的兜底机制

### Q3: 订单金额不匹配

**可能原因**：
- 金额单位错误（元 vs 分）
- 浮点数精度问题

**解决方案**：
```typescript
// 正确的转换方式
const amountInFen = yuanToFen(100)  // 100元 → 10000分
const amountInYuan = (10000 / 100).toFixed(2)  // 10000分 → "100.00"元

// 支付宝返回金额转换
const alipayAmountInFen = Math.round(parseFloat(total_amount) * 100)
```

### Q4: 如何处理退款？

目前仅实现充值功能，退款功能可通过以下方式实现：

1. 调用支付宝退款接口 `alipay.trade.refund`
2. 创建退款订单记录
3. 更新用户余额（扣减）
4. 创建退款交易记录

## 八、技术架构

### 8.1 文件结构

```
lib/
  ├── alipay.ts                    # 支付宝SDK封装
  └── validations/
      └── alipay.ts                # 参数验证

app/api/alipay/
  ├── create-order/route.ts        # 创建订单API
  ├── query-order/route.ts         # 查询订单API
  ├── close-order/route.ts         # 关闭订单API
  └── notify/route.ts              # 异步通知处理
```

### 8.2 数据库表

- `charge_orders`：充值订单表
- `accounts`：用户账户表
- `transactions`：交易记录表
- `payment_configs`：支付配置表

### 8.3 核心依赖

- `alipay-sdk`: 支付宝官方 Node.js SDK
- `drizzle-orm`: 数据库 ORM
- `zod`: 参数校验

## 九、生产环境部署

### 9.1 环境变量配置

确保生产环境配置了正确的支付宝密钥：

```bash
# 切换到正式环境网关
gateway: 'https://openapi.alipay.com/gateway.do'

# 配置正式环境 APPID 和密钥
ALIPAY_APPID=正式环境APPID
ALIPAY_PRIVATE_KEY=正式环境应用私钥
ALIPAY_PUBLIC_KEY=正式环境支付宝公钥
ALIPAY_NOTIFY_URL=https://生产域名/api/alipay/notify
```

### 9.2 监控和日志

代码已集成日志记录（使用 Pino）：

```typescript
logger.info({
  userId,
  accountId,
  chargeOrderId,
  amount,
}, '支付宝充值成功')
```

建议配置日志收集系统（如 ELK、Loki）监控支付流程。

### 9.3 告警配置

建议配置以下告警：

- 签名验证失败率过高
- 异步通知处理失败
- 订单金额不匹配
- 余额更新失败

## 十、参考资料

- [支付宝开放平台](https://open.alipay.com/)
- [订单码支付文档](https://opendocs.alipay.com/open/270/01didh)
- [异步通知说明](https://opendocs.alipay.com/open/270/105902)
- [alipay-sdk GitHub](https://github.com/alipay/alipay-sdk-nodejs-all)
- [RSA2 密钥生成工具](https://opendocs.alipay.com/common/02kipl)

---

**文档维护**: 本文档由 Claude Code 自动生成，最后更新时间：2025-01-27
