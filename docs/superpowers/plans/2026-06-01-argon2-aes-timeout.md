# 密码学密钥派生升级与沙箱通信超时控制设计（v4）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升级加密为 WordArray 派生和每条目随机 IV（v4 版），集成 10 秒通信超时保护并静默迁移 v3 数据库。

**Architecture:** 
抽离并集中化 postMessage 通信逻辑到 `sendMessageToSandbox` 并支持超时 Reject；重新改造 `Encryption` 对二进制密码进行 AES CBC 加密并自定义 IV 混合排布；并在解锁时启动从 v3 转化到 v4 格式的瞬时静默转换。

**Tech Stack:** TypeScript, Vue 2, Vuex, CryptoJS, Webpack

---

### Task 1: 更新类型声明定义

**Files:**
- Modify: `src/definitions/otp.d.ts:67`

- [ ] **Step 1: 修改 `Key` 接口支持版本 4**

在 `src/definitions/otp.d.ts` 中查找 `interface Key`：
```typescript
interface Key {
  dataType: "Key";
  id: string;
  salt: string;
  hash: string;
  version: 3;
}
```
替换为支持 3 和 4：
```typescript
interface Key {
  dataType: "Key";
  id: string;
  salt: string;
  hash: string;
  version: 3 | 4;
}
```

- [ ] **Step 2: 验证编译通过**

运行：`npm run firefox`
预期：Webpack 成功编译通过没有类型报错。

- [ ] **Step 3: 提交更改**

```bash
git add src/definitions/otp.d.ts
git commit -m "refactor: update Key definitions supporting version 4"
```

---

### Task 2: 实现沙箱通信与超时保护机制

**Files:**
- Modify: `src/models/password.ts:1`

- [ ] **Step 1: 在 `src/models/password.ts` 中定义 `sendMessageToSandbox` 通用通信工具**

```typescript
export function sendMessageToSandbox(message: any, timeoutMs = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const iframe = document.getElementById("argon-sandbox") as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) {
      return reject(new Error("argon-sandbox missing!"));
    }

    let timer: number | undefined;

    const listener = (response: MessageEvent) => {
      if (response.source !== iframe.contentWindow) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      window.removeEventListener("message", listener);
      resolve(response.data.response);
    };

    timer = window.setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("Sandbox timeout"));
    }, timeoutMs);

    window.addEventListener("message", listener);
    iframe.contentWindow.postMessage(message, "*");
  });
}
```

- [ ] **Step 2: 在 `src/models/password.ts` 重构 `argonHash` 与 `argonVerify` 以调用 `sendMessageToSandbox`**

```typescript
export async function argonHash(
  value: string,
  salt: string
): Promise<string | undefined> {
  const message = {
    action: "hash",
    value,
    salt,
  };
  return sendMessageToSandbox(message);
}

export async function argonVerify(
  value: string,
  hash: string
): Promise<boolean> {
  const message = {
    action: "verify",
    value,
    hash,
  };
  return sendMessageToSandbox(message);
}
```

- [ ] **Step 3: 验证编译通过**

运行：`npm run firefox`
预期：编译无误。

- [ ] **Step 4: 提交**

```bash
git add src/models/password.ts
git commit -m "feat: implement sendMessageToSandbox unified messaging helper with 10s timeout"
```

---

### Task 3: 升级其他组件中的沙箱消息调用

**Files:**
- Modify: `src/import.ts`

- [ ] **Step 1: 引入 `sendMessageToSandbox` 替代 `src/import.ts` 里的手动 Message 监护**

修改 `src/import.ts`：
```typescript
import { sendMessageToSandbox } from "./models/password"; // 确认是否有该导入，无则添加
```
修改 `findAndUnlockKey` 中旧代码：
```typescript
  const rawHash = await new Promise((resolve: (value: string) => void) => {
    // ... 原事件绑定与 postMessage ...
  });
```
更改为：
```typescript
  const rawHash = await sendMessageToSandbox({
    action: "hash",
    value: password,
    salt: key.salt,
  }).catch(() => "");
```
对 `isCorrectPassword` 调用的 Promise 改造：
```typescript
  const isCorrectPassword = await sendMessageToSandbox({
    action: "verify",
    value: possibleHash,
    hash: key.hash,
  }).catch(() => "");
```

- [ ] **Step 2: 验证编译通过**

运行：`npm run firefox`
预期：编译成功。

- [ ] **Step 3: 提交**

```bash
git add src/import.ts
git commit -m "refactor: simplify sandbox messaging in src/import.ts utilizing unified helper"
```

---

### Task 4: 在 vuex 状态管理器中接入新通信及超时控制

**Files:**
- Modify: `src/store/Accounts.ts`

- [ ] **Step 1: 优化密码验证与临时哈希生成的调用逻辑**

在 `src/store/Accounts.ts` 中导入 `sendMessageToSandbox` 并修改 action `open`：
把 `const isCorrectPassword = await new Promise(...)` (第 334-358 行) 和 `const rawHash = await new Promise(...)` (第 291-325 行) 分别替换为：
```typescript
              const rawHash = await sendMessageToSandbox({
                action: "hash",
                value: password,
                salt: key.salt,
              });

              // https://passlib.readthedocs.io/en/stable/lib/passlib.hash.argon2.html#format-algorithm
              const possibleHash = rawHash.split("$")[5];
              if (!possibleHash) {
                throw new Error("argon2 did not return a hash!");
              }

              // verify user password
              const isCorrectPassword = await sendMessageToSandbox({
                action: "verify",
                value: possibleHash,
                hash: key.hash,
              });
```
将 `genHash` 函数（约第 715 行起）里的 postMessage 监听修改为：
```typescript
async function genHash(value: string) {
  const salt = window.crypto.subtle
    ? window.crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).substring(2, 15);
  const message = {
    action: "hash",
    value,
    salt,
  };
  return sendMessageToSandbox(message);
}
```

- [ ] **Step 2: 接入超时阻断拦截**

在 `Accounts.ts` 的 action `open`（约第 210 行起）包裹整个解锁主流程为：
```typescript
      try {
        // ... 原解密登录和校验逻辑 ...
      } catch (error: any) {
        if (error?.message === "Sandbox timeout") {
          state.commit("wrongPassword");
          state.commit("notification/alert", "密码验证超时，请重试 (Argon2 Sandbox Timeout)", { root: true });
          return;
        }
        throw error;
      }
```

- [ ] **Step 3: 验证编译通过**

运行：`npm run firefox`
预期：编译成功。

- [ ] **Step 4: 提交**

```bash
git add src/store/Accounts.ts
git commit -m "feat: implement error catcher and timeout listener in Accounts store"
```

---

### Task 5: 重构 `Encryption` 模块以支持 v4（IV + Binary Key Mode）及解密向下兼容

**Files:**
- Modify: `src/models/encryption.ts`

- [ ] **Step 1: 重写 `Encryption` 构造器并支持多版本管理**

在 `src/models/encryption.ts`：
```typescript
export class Encryption implements EncryptionInterface {
  private password: string;
  private keyId: string;
  private version: number; // 声明 version 属性

  constructor(hash: string, keyId: string, version = 3) {
    this.password = hash;
    this.keyId = keyId;
    this.version = version;
  }
  
  // 用于外部在迁移时读取版本
  getVersion() {
    return this.version;
  }
  // ...
```

- [ ] **Step 2: 改写 `getEncryptedString` 支持生成随机 IV 的 v4 协议加密**

```typescript
  getEncryptedString(data: string): string {
    if (!this.password) {
      return data;
    } else {
      if (this.version === 4) {
        // v4 二进制二进制 Key 配合独立随机 IV 模式
        const binaryKey = CryptoJS.enc.Base64.parse(this.password);
        const iv = CryptoJS.lib.WordArray.random(16);
        const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(data), binaryKey, {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        });
        const ivHex = iv.toString(CryptoJS.enc.Hex);
        const ciphertextBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
        return `v4:${ivHex}:${ciphertextBase64}`;
      } else {
        // v3/v2 经典密码学隐式派生加密
        return CryptoJS.AES.encrypt(data, this.password).toString();
      }
    }
  }
```

- [ ] **Step 3: 重写 `decryptSecretString` 和 `decryptEncSecret` 支持向下兼容解密**

```typescript
  decryptSecretString(secret: string) {
    try {
      let decryptedSecret = "";
      if (secret.startsWith("v4:")) {
        const parts = secret.split(":");
        const ivHex = parts[1];
        const ciphertextBase64 = parts[2];
        const iv = CryptoJS.enc.Hex.parse(ivHex);
        const binaryKey = CryptoJS.enc.Base64.parse(this.password);
        
        decryptedSecret = CryptoJS.AES.decrypt(ciphertextBase64, binaryKey, {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8);
      } else {
        decryptedSecret = CryptoJS.AES.decrypt(
          secret,
          this.password
        ).toString(CryptoJS.enc.Utf8);
      }

      if (!decryptedSecret) {
        return null;
      }

      if (decryptedSecret.length < 8) {
        return null;
      }

      if (
        !/^[a-z2-7]+=*$/i.test(decryptedSecret) &&
        !/^[0-9a-f]+$/i.test(decryptedSecret) &&
        !/^blz-/.test(decryptedSecret) &&
        !/^bliz-/.test(decryptedSecret) &&
        !/^stm-/.test(decryptedSecret)
      ) {
        return null;
      }

      return decryptedSecret;
    } catch (error) {
      return null;
    }
  }

  decryptEncSecret(entry: OTPEntryInterface) {
    try {
      if (!entry.encData) {
        return null;
      }

      let decryptedData = "";
      if (entry.encData.startsWith("v4:")) {
        const parts = entry.encData.split(":");
        const ivHex = parts[1];
        const ciphertextBase64 = parts[2];
        const iv = CryptoJS.enc.Hex.parse(ivHex);
        const binaryKey = CryptoJS.enc.Base64.parse(this.password);

        decryptedData = CryptoJS.AES.decrypt(ciphertextBase64, binaryKey, {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8);
      } else {
        decryptedData = CryptoJS.AES.decrypt(
          entry.encData,
          this.password
        ).toString(CryptoJS.enc.Utf8);
      }

      if (!decryptedData) {
        return null;
      }

      return JSON.parse(decryptedData);
    } catch (error) {
      return null;
    }
  }
```

- [ ] **Step 4: 编译校验**

运行：`npm run firefox`
预期：编译成功无警报。

- [ ] **Step 5: 提交**

```bash
git add src/models/encryption.ts
git commit -m "feat: implement v4 crypto AES-CBC with discrete random IV and binary Key plus backwards compat"
```

---

### Task 6: 在解锁通道实现 v3 -> v4 静默数据格式迁移升级

**Files:**
- Modify: `src/store/Accounts.ts`

- [ ] **Step 1: 重构 `src/store/Accounts.ts` 以从 storage 中读取版本信息创建 V3/V4 加解密实例**

修改 `Accounts.ts:open` 中查找：
```typescript
                  state.state.encryption.set(
                    key.id,
                    new Encryption(possibleHash, key.id)
                  );
```
重构为注入 key 的 version 信息（默认为 3）：
```typescript
                  const keyVersion = key.version || 3;
                  state.state.encryption.set(
                    key.id,
                    new Encryption(possibleHash, key.id, keyVersion)
                  );
```
并在解锁之后判断是否启动 v4 数据迁移。在 `await state.dispatch("updateEntries");`（约第 373 行起）之后插入判断：
```typescript
            // V3 to V4 dynamic migration triggering
            let migrationToV4Needed = false;
            for (const key of encKeys) {
              if (isCorrectPassword && (key.version === 3 || !key.version)) {
                migrationToV4Needed = true;
              }
            }

            if (migrationToV4Needed) {
              // 生成全新的盐值用来做 V4 密钥的 Argon2 二次计算
              const newSalt = window.crypto.subtle
                ? window.crypto.randomUUID().replace(/-/g, "")
                : Math.random().toString(36).substring(2, 15);
              const newHashRaw = await genHash(password); // 使用大函数生成新的哈希计算
              const rawHash = await sendMessageToSandbox({
                action: "hash",
                value: password,
                salt: newSalt,
              });
              const v4PossibleHash = rawHash.split("$")[5];
              const hashOfHash = await sendMessageToSandbox({
                action: "hash",
                value: v4PossibleHash,
                salt: newSalt,
              });
              const hashOfHashClean = hashOfHash.split("$")[5];

              // 生成新的 v4 key 定义
              const v4Key: Key = {
                dataType: DataType.Key,
                id: crypto.randomUUID(),
                salt: newSalt,
                hash: hashOfHashClean,
                version: 4,
              };

              const newEncryption = new Encryption(v4PossibleHash, v4Key.id, 4);
              state.state.encryption.set(v4Key.id, newEncryption);
              state.state.defaultEncryption = v4Key.id;

              const keysToRemove: string[] = [];
              for (const key of encKeys) {
                keysToRemove.push(key.id);
              }

              // 对在内存中已经通过 applyEncryption 恢复出来的明文条目热绑定新的 V4 加密实例
              for (const entry of state.state.entries) {
                await entry.changeEncryption(newEncryption);
              }

              // 写入新的 V4 Key 定义，清理所有的旧 V3 Key，并将带有 v4:[iv]:[ciphertext] 格式的新数据条目整体写回存储
              await BrowserStorage.set({
                [v4Key.id]: v4Key,
              });
              await EntryStorage.set(state.state.entries);
              await BrowserStorage.remove(keysToRemove);

              await state.dispatch("updateEntries");
            }
```

- [ ] **Step 2: 确认其他初始化加载点有传递版本字段**

检查所有创建 `new Encryption` 的各段代码：
* 在 `src/store/Accounts.ts` 初始化空加密及 v3 创建位置：
  如 `new Encryption(saltedHash, key.id)` 检查将其修改为传入 `key.version` 等信息。
* 项目中如果有其他位置创建 `new Encryption(..., ...)`，也确保传递最新版本或正确保留缺省参数 3 后续完成升级。

- [ ] **Step 3: 运行完整的大版本打包编译**

运行：`npm run prod`
预期：所有文件经过 Webpack 高度优化并构建编译成功，没有 TypeScript 的类型不匹配等异常。

- [ ] **Step 4: 提交最终升级**

```bash
git add src/store/Accounts.ts
git commit -m "feat: complete v3 to v4 database payload migration on login"
```
