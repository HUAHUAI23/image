# 微信支付集成文档

## 📋 目录

- [架构设计](#架构设计)
- [数据库设计](#数据库设计)
- [支付流程](#支付流程)
- [核心代码解析](#核心代码解析)
- [API 接口说明](#api-接口说明)
- [安全机制](#安全机制)
- [部署配置](#部署配置)
- [测试指南](#测试指南)

---

## 架构设计

### 整体架构

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   前端 UI   │ ───> │  Next.js API │ ───> │  微信支付   │
│  (React)    │ <─── │   (Server)   │ <─── │   平台      │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  PostgreSQL  │
                     │   Database   │
                     └──────────────┘
```

### 技术栈

- **前端**: React 19 + TypeScript + Tailwind CSS
- **后端**: Next.js 16 (App Router) + Server Actions
- **数据库**: PostgreSQL + Drizzle ORM
- **支付**: 微信支付 API v3 (Native 支付)
- **安全**: SHA256-RSA2048 签名 + AES-256-GCM 解密

### 设计原则

1. **原子性事务**: 订单状态、交易记录、账户余额三者同步更新
2. **幂等性保护**: 防止重复处理同一订单
3. **数据一致性**: 使用 `SELECT FOR UPDATE` 行级锁
4. **分离关注点**: `charge_orders` 管理订单生命周期，`transactions` 记录资金流水

---

## 数据库设计

### ER 图

```
┌─────────────────┐
│      users      │
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────┐     1:N     ┌──────────────────┐
│    accounts     │ ──────────> │ charge_orders    │
└────────┬────────┘             └────────┬─────────┘
         │ 1:N                           │ 1:1
         ▼                               ▼
┌─────────────────┐             ┌──────────────────┐
│  transactions   │ <─────────> │  transactions    │
└─────────────────┘     N:1     └──────────────────┘
```

### 核心表结构

#### 1. payment_configs (支付配置表)

```sql
CREATE TABLE payment_configs (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,           -- 'wechat' | 'alipay' | 'stripe'
  name VARCHAR(100) NOT NULL,              -- '微信支付'
  display_name VARCHAR(100),               -- '微信扫码支付'
  status VARCHAR(20) DEFAULT 'enabled',    -- 'enabled' | 'disabled'
  min_amount INTEGER NOT NULL,             -- 最小金额（分）
  max_amount INTEGER NOT NULL,             -- 最大金额（分）
  preset_amounts INTEGER[],                -- [10, 50, 100, 500]
  public_config JSONB,                     -- { orderTimeoutMinutes: 10 }
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**用途**: 存储支付方式的配置参数（金额限制、预设金额、超时时间等）

#### 2. charge_orders (充值订单表)

```sql
CREATE TABLE charge_orders (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount BIGINT NOT NULL,                  -- 充值金额（分）
  provider VARCHAR(50) NOT NULL,           -- 'wechat' | 'alipay' | 'stripe' | 'manual'
  out_trade_no VARCHAR(255) UNIQUE,        -- 商户订单号 WX{timestamp}{userId}{random}
  external_transaction_id VARCHAR(255),    -- 微信交易号

  -- 支付凭证（JSONB 通用设计）
  payment_credential JSONB,                -- { wechat: { codeUrl: 'weixin://...' } }

  status VARCHAR(20) NOT NULL,             -- 'pending' | 'success' | 'failed' | 'closed'
  expire_time TIMESTAMP,                   -- 订单过期时间
  paid_at TIMESTAMP,                       -- 支付完成时间
  transaction_id INTEGER,                  -- 关联的交易记录 ID
  operator_id INTEGER REFERENCES users(id),-- 操作员 ID（手动充值）
  metadata JSONB,                          -- 额外元数据
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**设计亮点**:
- **通用性**: `payment_credential` JSONB 字段支持所有支付方式
- **生命周期**: 订单从 `pending` → `success/failed/closed`
- **关联性**: `transaction_id` 在支付成功后关联到交易记录

#### 3. transactions (交易记录表)

```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  type VARCHAR(50) NOT NULL,               -- 'charge' | 'task_charge' | 'task_refund'
  category VARCHAR(50) NOT NULL,           -- 'recharge' | 'task_charge' | 'task_refund'
  amount BIGINT NOT NULL,                  -- 交易金额（分）
  balance_before BIGINT NOT NULL,          -- 交易前余额
  balance_after BIGINT NOT NULL,           -- 交易后余额

  -- 关联字段
  task_id INTEGER,                         -- 关联任务 ID
  charge_order_id INTEGER,                 -- 关联充值订单 ID
  external_order_id VARCHAR(255),          -- 外部订单号（快速查询）

  description TEXT,                        -- 交易描述
  metadata JSONB,                          -- 额外元数据
  created_at TIMESTAMP DEFAULT NOW()
);
```

**核心逻辑**:
- ✅ **只在支付成功后创建**: 所有 `category='recharge'` 的记录都是成功的
- ✅ **双向关联**: `charge_order_id` 关联到订单，`charge_orders.transaction_id` 反向关联
- ✅ **余额快照**: `balance_before` 和 `balance_after` 记录余额变化

---

## 支付流程

### 完整流程图

```
┌──────────┐
│ 1. 用户  │
│ 点击充值 │
└─────┬────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│ 2. 前端: 显示支付弹窗，选择金额             │
│    - 预设金额: [10, 50, 100, 500]           │
│    - 自定义金额: 1-100000 元                │
└─────┬───────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│ 3. POST /api/wechat-pay/create-order        │
│    - 验证用户登录                           │
│    - 验证金额范围                           │
│    - 生成订单号: WX{timestamp}{userId}{6位随机} │
│    - 调用微信下单接口                       │
│    - 获取二维码 URL (codeUrl)               │
│    - 创建 charge_orders 记录 (status=pending)│
└─────┬───────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│ 4. 前端: 显示二维码 + 倒计时 (10分钟)      │
│    - 每5秒轮询 GET /api/wechat-pay/query-order │
│    - 检查订单状态是否变为 success           │
└─────┬───────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│ 5. 用户扫码支付                             │
│    - 微信扫一扫                             │
│    - 确认支付                               │
└─────┬───────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│ 6. 微信支付回调                             │
│    POST /api/wechat-pay/notify              │
│    - 验证签名 (防伪造)                      │
│    - 解密数据 (AES-256-GCM)                 │
│    - 检查订单状态 (幂等性保护)              │
│    - 原子性更新:                            │
│      1. 锁定 charge_order (FOR UPDATE)      │
│      2. 锁定 account (FOR UPDATE)           │
│      3. 更新 charge_order.status = 'success'│
│      4. 创建 transaction 记录               │
│      5. 更新 account.balance += amount      │
│      6. 关联 charge_order.transaction_id    │
│    - 返回 200 OK (停止微信重试)             │
└─────┬───────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│ 7. 前端轮询检测到支付成功                   │
│    - 显示成功动画                           │
│    - 刷新余额数据                           │
│    - 自动关闭弹窗                           │
└─────────────────────────────────────────────┘
```

### 异常处理流程

#### 订单超时自动关闭

```
Cron Job (每5秒执行)
  │
  ▼
SELECT * FROM charge_orders
WHERE status = 'pending'
  AND expire_time < NOW()
FOR UPDATE SKIP LOCKED
  │
  ▼
关闭微信订单 (closeOrder API)
  │
  ▼
UPDATE charge_orders
SET status = 'closed'
```

#### 回调兜底查询

```
前端轮询 GET /api/wechat-pay/query-order
  │
  ▼
查询本地订单状态
  │
  ├─ 已成功/失败/关闭 → 返回状态
  │
  └─ 仍为 pending
       │
       ▼
     查询微信支付平台
       │
       ├─ 微信显示已支付，本地未更新
       │    → 执行原子更新 (兜底逻辑)
       │
       └─ 微信显示未支付
            → 返回 pending 状态
```

---

## 核心代码解析

### 1. 微信支付工具库 (`lib/wechat-pay.ts`)

#### 签名生成 (SHA256-RSA2048)

```typescript
function generateSignature(
  method: string,
  url: string,
  timestamp: number,
  nonce: string,
  body: string
): string {
  // 构建待签名字符串
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`

  // 使用商户私钥签名
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  const signature = sign.sign(env.WECHAT_PAY_PRIVATE_KEY, 'base64')

  return signature
}
```

**关键点**:
- 待签名串格式: `METHOD\nURL\nTIMESTAMP\nNONCE\nBODY\n`
- 使用商户私钥签名（RSA-SHA256）
- Base64 编码输出

#### 回调签名验证

```typescript
export function verifyNotificationSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  serialNo: string
): boolean {
  // 构建验签串
  const message = `${timestamp}\n${nonce}\n${body}\n`

  // 使用微信支付平台证书验签
  const verify = crypto.createVerify('RSA-SHA256')
  verify.update(message)
  const isValid = verify.verify(env.WECHAT_PAY_PLATFORM_CERT, signature, 'base64')

  return isValid
}
```

**安全防护**:
- 验证签名防止伪造回调
- 使用微信支付平台证书公钥
- 检测签名探测流量 (`WECHATPAY/SIGNTEST/`)

#### 数据解密 (AES-256-GCM)

```typescript
export function decryptNotificationResource(
  ciphertext: string,
  associatedData: string,
  nonce: string
): any {
  const key = Buffer.from(env.WECHAT_PAY_API_V3_KEY, 'utf8')
  const ciphertextBuffer = Buffer.from(ciphertext, 'base64')

  // 提取认证标签 (最后 16 字节)
  const authTag = ciphertextBuffer.slice(-16)
  const encrypted = ciphertextBuffer.slice(0, -16)

  // AES-256-GCM 解密
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'))
  decipher.setAAD(Buffer.from(associatedData, 'utf8'))
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return JSON.parse(decrypted.toString('utf8'))
}
```

**加密流程**:
1. Base64 解码密文
2. 分离认证标签 (最后 16 字节)
3. AES-256-GCM 解密
4. 返回 JSON 数据

### 2. 创建订单 API (`app/api/wechat-pay/create-order/route.ts`)

```typescript
export async function POST(request: NextRequest) {
  // 1. 验证用户登录
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // 2. 验证金额参数
  const { amount } = createRechargeOrderSchema.parse(await request.json())

  // 3. 查询微信支付配置
  const [wechatConfig] = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.provider, 'wechat'))
    .limit(1)

  if (!wechatConfig || wechatConfig.status === 'disabled') {
    return NextResponse.json({ error: '微信支付暂不可用' }, { status: 503 })
  }

  // 4. 验证金额范围
  if (amount < wechatConfig.minAmount || amount > wechatConfig.maxAmount) {
    return NextResponse.json({ error: '金额超出范围' }, { status: 400 })
  }

  // 5. 生成商户订单号
  const outTradeNo = `WX${Date.now()}${session.userId}${Math.random().toString(36).substring(2, 8).toUpperCase()}`

  // 6. 调用微信支付下单接口
  const { codeUrl } = await createNativePayOrder({
    outTradeNo,
    description: `账户充值-${amount}元`,
    totalAmount: amount * 100, // 转换为分
    timeExpire: expireTime.toISOString().replace(/\.\d{3}Z$/, '+08:00'),
  })

  // 7. 创建充值订单记录
  const [chargeOrder] = await db
    .insert(chargeOrders)
    .values({
      accountId: account.id,
      amount: amount * 100,
      provider: 'wechat',
      outTradeNo,
      paymentCredential: { wechat: { codeUrl } },
      status: 'pending',
      expireTime,
    })
    .returning()

  // 8. 返回订单信息
  return NextResponse.json({
    success: true,
    data: { chargeOrderId: chargeOrder.id, outTradeNo, codeUrl, amount, expireTime: 600 }
  })
}
```

**流程总结**:
1. 认证 → 2. 参数校验 → 3. 配置检查 → 4. 金额验证 → 5. 生成订单号 → 6. 微信下单 → 7. 数据库记录 → 8. 返回结果

### 3. 支付回调 API (`app/api/wechat-pay/notify/route.ts`)

```typescript
export async function POST(request: NextRequest) {
  // 1. 获取签名头部
  const timestamp = request.headers.get('wechatpay-timestamp')
  const nonce = request.headers.get('wechatpay-nonce')
  const signature = request.headers.get('wechatpay-signature')

  // 2. 验证签名
  const rawBody = await request.text()
  const isValid = verifyNotificationSignature(timestamp, nonce, rawBody, signature, serialNo)
  if (!isValid) return NextResponse.json({ code: 'FAIL' }, { status: 401 })

  // 3. 解密数据
  const { resource } = JSON.parse(rawBody)
  const decryptedData = decryptNotificationResource(
    resource.ciphertext,
    resource.associated_data,
    resource.nonce
  )

  // 4. 原子性更新 (核心逻辑)
  await db.transaction(async (tx) => {
    // 4.1 锁定订单
    const [chargeOrder] = await tx
      .select()
      .from(chargeOrders)
      .where(eq(chargeOrders.outTradeNo, decryptedData.out_trade_no))
      .for('update')

    // 4.2 幂等性检查
    if (chargeOrder.status === 'success') return

    // 4.3 锁定账户
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, chargeOrder.accountId))
      .for('update')

    // 4.4 更新订单状态
    await tx.update(chargeOrders).set({
      status: 'success',
      externalTransactionId: decryptedData.transaction_id,
      paidAt: new Date(decryptedData.success_time),
    })

    // 4.5 创建交易记录
    const [txn] = await tx.insert(transactions).values({
      accountId: account.id,
      type: 'charge',
      category: 'recharge',
      amount: chargeOrder.amount,
      balanceBefore: account.balance,
      balanceAfter: account.balance + chargeOrder.amount,
      chargeOrderId: chargeOrder.id,
    }).returning()

    // 4.6 更新账户余额
    await tx.update(accounts).set({
      balance: account.balance + chargeOrder.amount
    })

    // 4.7 关联交易 ID
    await tx.update(chargeOrders).set({ transactionId: txn.id })
  })

  // 5. 返回成功 (停止微信重试)
  return NextResponse.json({ code: 'SUCCESS' }, { status: 200 })
}
```

**原子性保证**:
- ✅ 使用数据库事务 (`db.transaction`)
- ✅ 行级锁 (`FOR UPDATE`) 防止并发问题
- ✅ 幂等性检查防止重复处理
- ✅ 6 步操作要么全成功，要么全失败

### 4. 前端支付弹窗 (`components/modals/wechat-pay-modal.tsx`)

```typescript
export function WeChatPayModal({ open, onOpenChange, onSuccess }: WeChatPayModalProps) {
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null)
  const [status, setStatus] = useState<PaymentStatus>('input')
  const [countdown, setCountdown] = useState(0)

  // 创建订单
  const handleCreateOrder = async () => {
    const response = await fetch('/api/wechat-pay/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: finalAmount }),
    })
    const result = await response.json()
    setOrderInfo(result.data)
    setStatus('paying')
  }

  // 轮询查询订单状态
  useEffect(() => {
    if (orderInfo && status === 'paying') {
      const pollOrder = async () => {
        const response = await fetch(`/api/wechat-pay/query-order?outTradeNo=${orderInfo.outTradeNo}`)
        const result = await response.json()
        if (result.data.status === 'success') {
          setStatus('success')
          onSuccess?.()
        }
      }
      const interval = setInterval(pollOrder, 5000)
      return () => clearInterval(interval)
    }
  }, [orderInfo, status])

  // 倒计时
  useEffect(() => {
    if (orderInfo && status === 'paying') {
      const expireAt = new Date(orderInfo.expireAt).getTime()
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expireAt - Date.now()) / 1000))
        setCountdown(remaining)
        if (remaining === 0) setStatus('expired')
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [orderInfo, status])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 输入金额 → 显示二维码 → 支付成功/失败/超时 */}
    </Dialog>
  )
}
```

**核心功能**:
- ✅ 预设金额 + 自定义输入
- ✅ QR 码显示 (qrcode 库)
- ✅ 10 分钟倒计时
- ✅ 每 5 秒轮询订单状态
- ✅ 状态机: `input → paying → success/failed/expired`

### 5. 定时任务关闭超时订单 (`lib/cron.ts`)

```typescript
async function closeExpiredOrders(): Promise<number> {
  // 查询超时订单
  const result = await db.transaction(async (tx) => {
    const { rows } = await tx.execute<ExpiredOrderRow>(sql`
      SELECT id, out_trade_no, amount, expire_time
      FROM charge_orders
      WHERE status = 'pending'
        AND expire_time IS NOT NULL
        AND expire_time < NOW()
      ORDER BY expire_time ASC
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    `)
    return rows || []
  })

  // 逐个关闭
  for (const order of result) {
    try {
      // 调用微信 API 关闭
      await closeWechatOrder(order.out_trade_no)

      // 更新本地状态
      await db.execute(sql`
        UPDATE charge_orders
        SET status = 'closed',
            metadata = jsonb_set(metadata, '{closedBy}', '"cron"')
        WHERE id = ${order.id}
      `)

      closedCount++
    } catch (error) {
      logger.error('Failed to close order', error)
    }
  }

  return closedCount
}

// Cron 任务每 5 秒执行一次
async function executeCronJob() {
  await resetTimedOutTasks()
  await closeExpiredOrders()  // 关闭超时订单
  await fetchAndMarkPendingTasks()
}
```

**三重超时保护**:
1. **微信平台**: `time_expire` 参数自动关闭
2. **前端轮询**: 倒计时结束显示超时
3. **后端 Cron**: 每 5 秒扫描并关闭超时订单

---

## API 接口说明

### 1. POST /api/wechat-pay/create-order

**创建充值订单**

**Request**:
```json
{
  "amount": 100  // 充值金额（元）
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "chargeOrderId": 123,
    "outTradeNo": "WX17123456789012345ABCDEF",
    "codeUrl": "weixin://wxpay/bizpayurl?pr=abc123",
    "amount": 100,
    "expireTime": 600,  // 秒
    "expireAt": "2025-11-27T12:00:00.000Z"
  }
}
```

**错误码**:
- `401`: 未登录
- `400`: 参数错误
- `503`: 微信支付暂不可用

### 2. POST /api/wechat-pay/notify

**微信支付回调通知**

**Request Headers**:
```
Wechatpay-Timestamp: 1606463024
Wechatpay-Nonce: b8g7afba7i4afb
Wechatpay-Signature: Base64(SHA256-RSA2048(签名串))
Wechatpay-Serial: 微信平台证书序列号
```

**Request Body**:
```json
{
  "id": "abc123",
  "create_time": "2025-11-27T12:00:00+08:00",
  "event_type": "TRANSACTION.SUCCESS",
  "resource_type": "encrypt-resource",
  "resource": {
    "algorithm": "AEAD_AES_256_GCM",
    "ciphertext": "encrypted_data",
    "associated_data": "transaction",
    "nonce": "random_nonce"
  }
}
```

**Response**:
```json
{ "code": "SUCCESS", "message": "成功" }
```

**重试机制**: 微信最多重试 15 次，间隔递增

### 3. GET /api/wechat-pay/query-order

**查询订单状态**

**Query Params**:
- `outTradeNo`: 商户订单号
- `chargeOrderId`: 充值订单 ID（二选一）

**Response**:
```json
{
  "success": true,
  "data": {
    "chargeOrderId": 123,
    "outTradeNo": "WX17123456789012345ABCDEF",
    "status": "success",  // pending | success | failed | closed
    "amount": 10000,      // 分
    "paidAt": "2025-11-27T12:00:00.000Z",
    "wechatOrder": {
      "trade_state": "SUCCESS",
      "transaction_id": "4200001234567890"
    }
  }
}
```

**兜底逻辑**: 如果本地 `pending` 但微信已支付，触发原子更新

### 4. POST /api/wechat-pay/close-order

**手动关闭订单**

**Request**:
```json
{
  "outTradeNo": "WX17123456789012345ABCDEF"
}
```

**Response**:
```json
{
  "success": true,
  "message": "订单已关闭",
  "data": {
    "chargeOrderId": 123,
    "outTradeNo": "WX17123456789012345ABCDEF",
    "status": "closed"
  }
}
```

**限制**: 只能关闭 `pending` 状态的订单

---

## 安全机制

### 1. 签名验证

```typescript
// 请求签名 (商户 → 微信)
Authorization: WECHATPAY2-SHA256-RSA2048
  mchid="1234567890",
  nonce_str="random",
  signature="Base64(SHA256-RSA2048(签名串))",
  timestamp="1606463024",
  serial_no="证书序列号"

// 回调签名 (微信 → 商户)
Wechatpay-Signature: Base64(SHA256-RSA2048(签名串))
```

**防护**:
- ✅ 防止请求被篡改
- ✅ 防止伪造回调通知
- ✅ 检测签名探测流量

### 2. 数据加密

```typescript
// AES-256-GCM 加密参数
- Key: WECHAT_PAY_API_V3_KEY (32 字节)
- Nonce: 随机数 (12 字节)
- AAD: associated_data (附加数据)
- Auth Tag: 认证标签 (16 字节)
```

**防护**:
- ✅ 保护敏感数据不被窃取
- ✅ 防止中间人攻击
- ✅ 数据完整性校验

### 3. 幂等性保护

```typescript
// 检查订单是否已处理
if (chargeOrder.status === 'success') {
  logger.info('订单已处理，跳过（幂等性保护）')
  return
}
```

**防护**:
- ✅ 防止重复扣款/充值
- ✅ 防止并发处理同一订单
- ✅ 支持微信多次重试

### 4. 行级锁

```typescript
// 锁定订单和账户
const [chargeOrder] = await tx
  .select()
  .from(chargeOrders)
  .where(eq(chargeOrders.outTradeNo, outTradeNo))
  .for('update')  // SELECT FOR UPDATE

const [account] = await tx
  .select()
  .from(accounts)
  .where(eq(accounts.id, chargeOrder.accountId))
  .for('update')  // SELECT FOR UPDATE
```

**防护**:
- ✅ 防止并发事务冲突
- ✅ 保证数据一致性
- ✅ 避免余额重复增加

### 5. 数据验证

```typescript
// 金额验证
if (amount?.total !== chargeOrder.amount) {
  logger.error('支付金额不匹配')
  throw new Error('支付金额不匹配')
}

// 状态验证
if (chargeOrder.status !== 'pending') {
  logger.error('订单状态异常')
  throw new Error('订单状态异常')
}
```

**防护**:
- ✅ 防止金额篡改
- ✅ 防止状态异常
- ✅ 防止非法操作

---

## 部署配置

### 1. 环境变量配置 (`.env`)

```bash
# 微信支付配置
WECHAT_PAY_APPID=wx1234567890abcdef           # 微信公众号/应用 APPID
WECHAT_PAY_MCHID=1234567890                   # 商户号
WECHAT_PAY_API_V3_KEY=your-32-character-key   # APIv3 密钥（32字节）
WECHAT_PAY_SERIAL_NO=1234567890ABCDEF         # 商户证书序列号
WECHAT_PAY_NOTIFY_URL=https://yourdomain.com/api/wechat-pay/notify  # 回调 URL
WECHAT_PAY_PLATFORM_CERT="-----BEGIN CERTIFICATE-----
MIIDxxx...
-----END CERTIFICATE-----"                    # 微信平台证书（可选）

# 商户私钥 (PEM 格式)
WECHAT_PAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...
-----END PRIVATE KEY-----"
```

### 2. 数据库迁移

```bash
# 推送 schema 变更
pnpm db:push

# 或生成迁移文件
pnpm db:generate
pnpm db:migrate
```

### 3. 初始化支付配置

```bash
# 运行初始化脚本
tsx --env-file=.env scripts/init-payment-configs.ts
```

**输出**:
```
✅ 微信支付配置初始化成功:
  - ID: 1
  - Provider: wechat
  - Min Amount: 1 元
  - Max Amount: 10000 元
  - Preset Amounts: [10, 50, 100, 500]
  - Order Timeout: 10 分钟
```

### 4. 微信商户平台配置

1. 登录 https://pay.weixin.qq.com
2. **产品中心** → **开发配置**
3. 设置**支付回调 URL**: `https://yourdomain.com/api/wechat-pay/notify`
4. **添加服务器 IP 白名单**
5. **下载平台证书** (可选)

### 5. 证书配置

#### 获取商户私钥

```bash
# 下载商户证书工具
https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay6_0.shtml

# 生成私钥
openssl genrsa -out private_key.pem 2048

# 查看证书序列号
openssl x509 -in cert.pem -noout -serial
```

#### 获取平台证书

```bash
# 方法 1: 使用微信官方工具下载
# 方法 2: 调用平台证书下载 API
GET https://api.mch.weixin.qq.com/v3/certificates
```

### 6. 验证部署

```bash
# 1. 测试创建订单
curl -X POST http://localhost:3000/api/wechat-pay/create-order \
  -H "Content-Type: application/json" \
  -d '{"amount": 10}'

# 2. 查看日志
tail -f logs/app.log | grep wechat-pay

# 3. 检查数据库
pnpm db:studio
```

---

## 测试指南

### 单元测试

```typescript
// 测试签名生成
describe('generateSignature', () => {
  it('should generate correct signature', () => {
    const signature = generateSignature('POST', '/v3/pay/transactions/native', 1606463024, 'nonce', '{}')
    expect(signature).toMatch(/^[A-Za-z0-9+/=]+$/)
  })
})

// 测试订单号生成
describe('outTradeNo', () => {
  it('should generate unique order number', () => {
    const no1 = generateOutTradeNo(123)
    const no2 = generateOutTradeNo(123)
    expect(no1).not.toBe(no2)
    expect(no1).toMatch(/^WX\d{13}123[A-Z0-9]{6}$/)
  })
})
```

### 集成测试

```typescript
// 测试创建订单流程
describe('POST /api/wechat-pay/create-order', () => {
  it('should create order successfully', async () => {
    const response = await fetch('/api/wechat-pay/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: 10 }),
    })
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.success).toBe(true)
    expect(result.data.codeUrl).toMatch(/^weixin:/)
  })
})
```

### 手动测试流程

1. **创建订单**:
   ```bash
   curl -X POST http://localhost:3000/api/wechat-pay/create-order \
     -H "Content-Type: application/json" \
     -d '{"amount": 1}'
   ```

2. **扫码支付**:
   - 使用微信扫描返回的二维码
   - 确认支付 1 元

3. **检查回调**:
   ```bash
   # 查看日志
   grep "微信支付回调" logs/app.log
   grep "微信支付充值成功" logs/app.log
   ```

4. **验证数据**:
   ```sql
   -- 查询订单
   SELECT * FROM charge_orders WHERE out_trade_no = 'WX...';

   -- 查询交易
   SELECT * FROM transactions WHERE charge_order_id = 123;

   -- 查询余额
   SELECT balance FROM accounts WHERE id = 1;
   ```

### 模拟回调测试

```typescript
// 使用微信官方 Mock 工具
// https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay6_1.shtml

const mockNotification = {
  id: 'mock-id',
  event_type: 'TRANSACTION.SUCCESS',
  resource: {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: encrypt({
      out_trade_no: 'WX...',
      transaction_id: '4200001234567890',
      trade_state: 'SUCCESS',
      amount: { total: 100 }
    })
  }
}
```

---

## 常见问题

### 1. 回调签名验证失败

**原因**:
- 平台证书未配置或已过期
- 签名验证逻辑错误

**解决**:
```bash
# 下载最新平台证书
# 检查环境变量 WECHAT_PAY_PLATFORM_CERT

# 查看日志
grep "签名验证失败" logs/app.log
```

### 2. 订单超时未关闭

**原因**: Cron 任务未启动

**解决**:
```typescript
// 检查 instrumentation.ts
export function register() {
  initCron()  // 确保调用
}

// 查看日志
grep "Initializing Cron Worker" logs/app.log
```

### 3. 余额未更新

**原因**:
- 回调未收到
- 数据库事务失败

**解决**:
```sql
-- 检查订单状态
SELECT status FROM charge_orders WHERE out_trade_no = 'WX...';

-- 手动查询微信平台
GET /api/wechat-pay/query-order?outTradeNo=WX...
```

### 4. 金额不匹配

**原因**: 单位混淆（元 vs 分）

**规范**:
- 前端显示: **元**
- 数据库存储: **分**
- 微信 API: **分**

```typescript
// 创建订单时转换
totalAmount: amount * 100  // 元 → 分

// 显示时转换
formatCurrency(balance)  // 分 → 元
```

---

## 性能优化

### 1. 数据库索引

```sql
-- 订单号索引
CREATE INDEX idx_charge_orders_out_trade_no ON charge_orders(out_trade_no);

-- 状态 + 过期时间索引
CREATE INDEX idx_charge_orders_status_expire ON charge_orders(status, expire_time);

-- 账户 ID 索引
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
```

### 2. 查询优化

```typescript
// 使用 LIMIT + SKIP LOCKED 避免锁等待
SELECT * FROM charge_orders
WHERE status = 'pending'
  AND expire_time < NOW()
ORDER BY expire_time ASC
LIMIT 50
FOR UPDATE SKIP LOCKED
```

### 3. 缓存策略

```typescript
// 缓存支付配置（5分钟）
const paymentConfigCache = new Map()

async function getWechatConfig() {
  const cached = paymentConfigCache.get('wechat')
  if (cached && Date.now() - cached.timestamp < 300000) {
    return cached.data
  }

  const config = await db.select()...
  paymentConfigCache.set('wechat', { data: config, timestamp: Date.now() })
  return config
}
```

---

## 监控与告警

### 关键指标

- **订单成功率**: `成功订单数 / 总订单数`
- **支付延迟**: 创建订单到支付成功的时间
- **超时订单率**: `超时订单数 / 总订单数`
- **回调成功率**: `回调成功次数 / 回调总次数`

### 日志监控

```typescript
// 关键日志
logger.info('创建微信支付充值订单成功', { outTradeNo, amount })
logger.info('微信支付充值成功', { transactionId, amount, balanceAfter })
logger.error('微信下单失败', { error, outTradeNo })
logger.error('处理微信支付回调失败', { error })
```

### 告警规则

- 订单成功率 < 95%
- 回调签名验证失败次数 > 10/小时
- 超时订单数 > 100/天
- 数据库事务失败次数 > 5/小时

---

## 总结

本文档详细介绍了微信支付 Native 支付的完整集成方案，包括：

✅ **数据库设计**: 通用 `charge_orders` 表支持多种支付方式
✅ **原子性事务**: 确保订单、交易、余额三者一致
✅ **安全机制**: 签名验证 + 加密 + 幂等性 + 行级锁
✅ **异常处理**: 超时关闭 + 回调兜底 + 重试机制
✅ **完整流程**: 从创建订单到支付成功的全链路

**核心优势**:
- 🔒 **高安全性**: 多重验证机制
- 💪 **高可靠性**: 原子性事务保证
- 🚀 **高性能**: 索引优化 + 缓存策略
- 🔧 **易扩展**: 通用设计支持多种支付方式

**下一步**:
1. 添加支付宝/Stripe 支付方式
2. 实现退款功能
3. 添加支付分析报表
4. 集成财务对账系统