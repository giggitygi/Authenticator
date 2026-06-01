import { BrowserStorage, isOldKey } from "./storage";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function sendMessageToSandbox(
  message: any,
  timeoutMs = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const iframe = document.getElementById(
      "argon-sandbox"
    ) as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) {
      return reject(new Error("argon-sandbox missing!"));
    }

    let timer = 0;

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
/* eslint-enable @typescript-eslint/no-explicit-any */

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

// Verify a password using keys in BrowserStorage
export async function verifyPasswordUsingKeyID(
  keyId: string,
  password: string
): Promise<boolean> {
  // Get key for current encryption
  const keys = await BrowserStorage.getKeys();
  if (isOldKey(keys)) {
    throw new Error(
      "v3 encryption not being used with verifyPassword. This should never happen!"
    );
  }

  const key = keys.find((key) => key.id === keyId);
  if (!key) {
    throw new Error(`Key ${keyId} not in BrowserStorage`);
  }

  return verifyPasswordUsingKey(key, password);
}

export async function verifyPasswordUsingKey(
  key: Key,
  password: string
): Promise<boolean> {
  // Hash password with argon
  const rawHash = await argonHash(password, key.salt);
  if (!rawHash) {
    throw new Error("argon2 did not return a hash!");
  }
  // https://passlib.readthedocs.io/en/stable/lib/passlib.hash.argon2.html#format-algorithm
  const possibleHash = rawHash.split("$")[5];

  // verify user password by comparing their password hash with the
  // hash of their password's hash
  return await argonVerify(possibleHash, key.hash);
}
