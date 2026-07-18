import { Injectable } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

@Injectable()
export class OrgSecretsCryptoService {
  private getKey(): Buffer {
    const hexKey = process.env.ORG_SECRETS_ENCRYPTION_KEY;
    if (!hexKey) {
      throw new Error('ORG_SECRETS_ENCRYPTION_KEY is not set');
    }
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      throw new Error('ORG_SECRETS_ENCRYPTION_KEY must be a 32-byte (64 hex character) key');
    }
    return key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
  }

  decrypt(blob: string): string {
    const [ivB64, authTagB64, ciphertextB64] = blob.split('.');
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new Error('Malformed encrypted blob');
    }
    const decipher = createDecipheriv(ALGORITHM, this.getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
