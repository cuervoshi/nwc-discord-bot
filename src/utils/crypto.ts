import CryptoJS from "crypto-js";

export function encryptData(data: any, password: string): string {
  try {
    if (!data || !password) {
      throw new Error('Missing data or password for encryption');
    }

    return CryptoJS.AES.encrypt(JSON.stringify(data), password).toString();
  } catch (error) {
    console.error('encryptData: Error during encryption:', error);
    throw error;
  }
}

export function decryptData(cipher: string, password: string): any {
  try {
    if (!cipher || !password) {
      console.warn('decryptData: Missing cipher or password');
      return null;
    }

    const decrypted = CryptoJS.AES.decrypt(cipher, password);
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedString) {
      console.warn('decryptData: Decryption failed - empty result');
      return null;
    }

    return JSON.parse(decryptedString);
  } catch (error) {
    console.warn('decryptData: Error during decryption:', error);
    return null;
  }
}
