# 密码学密钥派生升级与沙箱通信超时控制设计设计说明书 (v4)

* **文档路径**：`docs/superpowers/specs/2026-06-01-argon2-aes-timeout-design.md`
* **日期**：2026年6月1日
* **升级描述**：从 v3 密码哈希方案无缝透明升级至支持 WordArray 强派生、每条目随机 IV 的 v4 加密模式；并在跨文档异步通信中集成 10 秒超时校验机制。

---

## 1. 架构与流程设计 (Architecture & Data Flow)

### 1.1 加解密模型 (Crypto Design)
* **对称加密机制**：AES-256-CBC。
* **v3 模式（旧）**：将 Argon2 派生的 `possibleHash`（Base64 字符串）直接传递给 `CryptoJS.AES`。加解密底层依赖并隐式调用基于 MD5 单次迭代的 `EVP_BytesToKey` 进行派生，每次保存会隐式使用 OpenSSL 特有的格式 `Salted__...` 进行落库。
* **v4 模式（新）**：
  * **密钥 (Key)**：通过沙箱计算出 Argon2 哈希 `possibleHash` (Base64) 字符串，并调用 `CryptoJS.enc.Base64.parse(possibleHash)` 解码为原始二进制 **`WordArray`** 对象，确保其包含完整的 256 位强密钥内容。
  * **初始化向量 (IV)**：加密每个条目时，调用 `CryptoJS.lib.WordArray.random(16)` 实时生成专属的 128 位强随机 `IV`。
  * **密文存储格式 (V4 Payload)**：统一保存为 `v4:[IV的16进制转储]:[Base64密文]` 格式。解密时解析前缀并拆分提取密文与自定义 IV 完成对称重构。

### 1.2 动态沙箱通信与超时控制
* 建立中心化的通信助手 `sendMessageToSandbox(message, timeoutMs)`，并在其中集成 `setTimeout(reject, timeoutMs)` 的 Promise 封装，超时上限为 10000 毫秒（10秒）。
* 通信结束后，通过 `window.removeEventListener("message", listener)` 立刻关闭底层事件通道，释放系统资源。

---

## 2. 数据库向下兼容与迁移 (Migration Plan)

以用户在 Popup 界面输入正确主密码解锁数据库为触发时机，启动静默无感数据迁移：

1. **密文多版本解密支持**：
   在 `Encryption` 中重构 `decryptSecretString` 和 `decryptEncSecret` 方法。若解密条目的 ciphertext 包含 `v4:` 前缀，采取 v4 方式进行随机 IV 的 AES-CBC 解密；否则，回退到 v3 密钥兼容解密。

2. **自动升级升级链**：
   在 `src/store/Accounts.ts:open` 中：
   * 输入主密码解锁成功后，判断对应 `Key` 对象的 `version` 标志。
   * 若 `key.version === 3` 或不存在，则在后台动态生成全新 `salt` 并呼叫沙箱派生新 v4 密钥哈希，同时保存 `version: 4` 的 Key 记录并存至 `BrowserStorage`。
   * 新实例化包含版本信息 4 的 `newEncryption` 进行注入，调用各条目 `entry.changeEncryption(newEncryption)` 热更换。
   * 调用 `EntryStorage.set(state.state.entries)` 统一全盘转换密文格式为 `v4:iv:ciphertext`，并用新 Key 覆盖存储，最后清理原 v3 Key。

---

## 3. 错误处理与用户提示 (Error Handling)

* 捕获 `Sandbox timeout` 异常，并在主框架捕获时：
  * 重置当前加载中的输入框状态（通过 `wrongPassword` mutation 终止正在转圈的解锁锁定效果）。
  * 调用 `notification/alert` 在扩展弹窗界面直接提醒：“密码验证超时，请重试（Argon2 Sandbox Timeout）”。

---

## 4. 影响的模块范围

* `src/definitions/otp.d.ts`：更新 Key 及 Encryption 接口版本信息。
* `src/models/encryption.ts`：对 `Encryption` 类进行 v4 加解密（二进制密钥加 IV）、向下兼容以及构造方法增加版本判断等优化。
* `src/models/password.ts`：封装 `sendMessageToSandbox`，并针对 `argonHash` 与 `argonVerify` 配合该通信方法改造。
* `src/import.ts`：配合通信和超时函数替换老版 iframe 的 postMessage 事件部分。
* `src/store/Accounts.ts`：将解锁账户过程中的 argon2 交互改用新通信器，同时在正常登陆后实现向 v4 格式的瞬时升级，并在密码验证超时导致拒接时妥善还原 UI 提示。
