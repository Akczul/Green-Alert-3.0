import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { createSeguridad } from '../modules/identidad/application/seguridad.js';
import { createMysqlSessionReader } from '../modules/identidad/adapters/outbound/mysql-session-reader.js';
import { passwordBlocklist } from '../modules/identidad/adapters/outbound/passwords.js';
import { createAuthMiddleware } from '../modules/identidad/adapters/inbound/auth-middleware.js';
const reader = createMysqlSessionReader({ pool });
export const seguridad = createSeguridad({
  tokens: { verify: (token) => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }) },
  sesiones: {
    findActive: reader.findActive, create: (data) => RefreshTokenModel.create(data),
    revokeByHash: (hash) => RefreshTokenModel.revokeByHash(hash),
    revokeAllForUser: (id) => RefreshTokenModel.revokeAllForUser(id),
  },
  usuarios: reader, identificadores: { next: randomUUID }, passwords: passwordBlocklist,
});
export const { verifyToken, optionalAuth } = createAuthMiddleware({ verificarAcceso: (token) => seguridad.verificarAcceso(token) });
