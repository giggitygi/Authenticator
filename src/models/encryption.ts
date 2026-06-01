import * as CryptoJS from "crypto-js";

export class Encryption implements EncryptionInterface {
  private password: string;
  private keyId: string;
  private version: number;

  constructor(hash: string, keyId: string, version = 3) {
    this.password = hash;
    this.keyId = keyId;
    this.version = version;
  }

  getEncryptedString(data: string): string {
    if (!this.password) {
      return data;
    } else {
      if (this.version === 4) {
        const binaryKey = CryptoJS.enc.Base64.parse(this.password);
        const iv = CryptoJS.lib.WordArray.random(16);
        const encrypted = CryptoJS.AES.encrypt(
          CryptoJS.enc.Utf8.parse(data),
          binaryKey,
          {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
          }
        );
        const ivHex = iv.toString(CryptoJS.enc.Hex);
        const ciphertextBase64 = encrypted.ciphertext.toString(
          CryptoJS.enc.Base64
        );
        return `v4:${ivHex}:${ciphertextBase64}`;
      } else {
        return CryptoJS.AES.encrypt(data, this.password).toString();
      }
    }
  }

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
          padding: CryptoJS.pad.Pkcs7,
        }).toString(CryptoJS.enc.Utf8);
      } else {
        decryptedSecret = CryptoJS.AES.decrypt(secret, this.password).toString(
          CryptoJS.enc.Utf8
        );
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
          padding: CryptoJS.pad.Pkcs7,
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

  getEncryptionStatus(): boolean {
    return this.password ? true : false;
  }

  updateEncryptionPassword(password: string) {
    this.password = password;
  }

  setEncryptionKeyId(id: string): void {
    this.keyId = id;
  }

  getEncryptionKeyId(): string {
    return this.keyId;
  }
}
