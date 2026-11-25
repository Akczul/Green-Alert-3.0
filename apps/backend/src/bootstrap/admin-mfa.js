import pool from '../config/database.js';
import { createAdminMfa } from '../modules/identidad/adapters/outbound/admin-mfa.js';
export const adminMfa = process.env.ADMIN_MFA_REQUIRED === 'true'
  ? createAdminMfa({ pool, keyHex: process.env.MFA_ENCRYPTION_KEY }) : null;
