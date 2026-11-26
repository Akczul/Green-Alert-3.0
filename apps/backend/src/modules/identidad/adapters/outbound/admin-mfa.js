import { createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
// RFC 6238, SHA-1, 6 dígitos, 30 segundos. La clave por administrador se cifra con AES-256-GCM.
export function totp(secret, seconds, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / 30)));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function base32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value << (5 - bits)) & 31];
  return result;
}
export function createAdminMfa({ pool, keyHex, required = true, now = Date.now }) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex ?? '')) throw new Error('MFA_ENCRYPTION_KEY debe ser una clave hexadecimal de 32 bytes');
  const key = Buffer.from(keyHex, 'hex');
  const decrypt = encrypted => {
    const bytes = Buffer.from(encrypted);
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12));
    cipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]);
  };
  return {
    async verify(user, code) {
      if (!required || user.rol !== 'admin') return;
      const reject = () => { throw Object.assign(new Error('MFA administrativa requerida: introduce un código vigente del autenticador. Si no tienes enrolamiento, contacta al operador.'), { statusCode: 403 }); };
      if (!/^\d{6}$/.test(code ?? '')) return reject();
      const [rows] = await pool.execute('SELECT encrypted_secret,last_counter FROM admin_mfa WHERE id_usuario=?', [user.id_usuario]);
      if (!rows.length) return reject();
      const secret = decrypt(rows[0].encrypted_secret);
      const seconds = Math.floor(now()/1000);
      let matched = -1;
      for (const shift of [-30,0,30]) {
        const counter = Math.floor((seconds+shift)/30);
        if (timingSafeEqual(Buffer.from(totp(secret, seconds+shift)),Buffer.from(code)) && counter > Number(rows[0].last_counter)) matched = counter;
      }
      if (matched < 0) return reject();
      const [result] = await pool.execute('UPDATE admin_mfa SET last_counter=? WHERE id_usuario=? AND last_counter<?', [matched,user.id_usuario,matched]);
      if (result.affectedRows !== 1) return reject();
    },
    // Solo CLI local de operador. No existe ruta pública para enrolar o sustituir factores.
    async provision(userId) {
      const [users] = await pool.execute("SELECT id_usuario FROM usuarios WHERE id_usuario=? AND rol='admin' AND activo=1 AND deleted_at IS NULL", [userId]);
      if (!users.length) throw new Error('Administrador activo no encontrado');
      const secret = randomBytes(20), iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm',key,iv);
      const ciphertext = Buffer.concat([cipher.update(secret),cipher.final()]);
      const encrypted = Buffer.concat([iv,cipher.getAuthTag(),ciphertext]);
      // INSERT deliberado: nunca reemplaza un factor existente silenciosamente.
      await pool.execute('INSERT INTO admin_mfa (id_usuario,encrypted_secret) VALUES (?,?)',[userId,encrypted]);
      await pool.execute('UPDATE usuarios SET auth_version=auth_version+1 WHERE id_usuario=?',[userId]);
      return { secret: base32(secret), uri: `otpauth://totp/GreenAlert:${userId}?secret=${base32(secret)}&issuer=GreenAlert&algorithm=SHA1&digits=6&period=30`,
        initialCode: totp(secret,Math.floor(now()/1000)) };
    },
  };
}
