import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
const scrypt = promisify(crypto.scrypt);
const common = new Set(JSON.parse(readFileSync(new URL('./data/common-passwords.json', import.meta.url), 'utf8')));
const knownLong = new Set(['passwordpassword', 'passwordpasswordpassword', 'password123456789', '12345678901234567890', 'correcthorsebatterystaple', 'administrador123456']);
export const passwordBlocklist = {
  isBlocked: (value) => common.has(value) || knownLong.has(value) || /^(.)\1+$/u.test(value),
};

// Mismo formato salt:key y parámetros históricos; no invalida hashes existentes.
export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
};
export const verifyPassword = async (password, storedHash) => {
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(storedHash)) return false;
  const [salt, key] = storedHash.split(':');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), await scrypt(password, salt, 64));
};
