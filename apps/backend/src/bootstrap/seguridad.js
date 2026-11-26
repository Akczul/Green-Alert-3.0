import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { createSeguridad } from '../modules/identidad/application/seguridad.js';
import { createMysqlSessionReader } from '../modules/identidad/adapters/outbound/mysql-session-reader.js';
import { passwordBlocklist } from '../modules/identidad/adapters/outbound/passwords.js';
import { createAuthMiddleware } from '../modules/identidad/adapters/inbound/auth-middleware.js';
import { createSessionLimits } from '../modules/identidad/adapters/outbound/session-limits.js';
import { createWebSession } from '../modules/identidad/adapters/inbound/web-session.js';
export const sessionLimits = process.env.SESSION_LIMITS_ENABLED === 'true' ? createSessionLimits({
  pool, idleSeconds: Number(process.env.SESSION_IDLE_SECONDS ?? 1800), maxSeconds: Number(process.env.SESSION_MAX_SECONDS ?? 604800),
}) : null;
const reader = createMysqlSessionReader({ pool });
export const seguridad = createSeguridad({
  tokens: { verify: (token) => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }) },
  sesiones: {
    findActive: async (sid, userId) => {
      const state = await reader.findActive(sid, userId);
      if (state && sessionLimits && !await sessionLimits.check(sid, userId)) return null;
      return state;
    },
    create: (data) => RefreshTokenModel.create(data),
    revokeByHash: (hash) => RefreshTokenModel.revokeByHash(hash),
    revokeAllForUser: (id) => RefreshTokenModel.revokeAllForUser(id),
  },
  usuarios: reader, identificadores: { next: randomUUID }, passwords: passwordBlocklist,
});
export const { verifyToken, optionalAuth } = createAuthMiddleware({ verificarAcceso: (token) => seguridad.verificarAcceso(token) });
export const webSession = createWebSession({ refreshSeconds: Number(process.env.SESSION_MAX_SECONDS ?? 604800) });
