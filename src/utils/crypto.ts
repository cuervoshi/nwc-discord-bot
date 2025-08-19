import CryptoJS from "crypto-js";

export function encryptData(data: any, password: string): string {
  return CryptoJS.AES.encrypt(JSON.stringify(data), password).toString();
}

export function decryptData(cipher: string, password: string): any {
  const decrypted = CryptoJS.AES.decrypt(cipher, password);
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}
