import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = process.env.HBCLI_DB_KEY;

if (!SECRET_KEY || SECRET_KEY.length !== 32) {
    throw new Error('A 32-character HBCLI_DB_KEY must be set as an environment variable.');
}

const key = Buffer.from(SECRET_KEY, 'utf8');

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(hash: string): string {
    try {
        const [ivHex, encryptedHex] = hash.split(':');
        if (!ivHex || !encryptedHex) {
            throw new Error('Invalid hash format');
        }
        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Failed to decrypt data. Was it encrypted with the correct key?');
        return ''; 
    }
}
