import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { clearSchemaCompatCache, tableExists } from '../config/schema-compat.js';
import { UsuarioModel } from './usuario.model.js';

const memoryTokens = new Map();

const REFRESH_TOKEN_TABLE_REQUIRED_MESSAGE =
  'La tabla refresh_tokens es requerida para persistencia, revocacion y logout global de refresh tokens.';

const isTestEnvironment = () => process.env.NODE_ENV === 'test';

const buildRefreshTokenStorageError = (cause = null) => {
  const error = new Error(REFRESH_TOKEN_TABLE_REQUIRED_MESSAGE);
  error.statusCode = 500;
  if (cause) {
    error.cause = cause;
  }
  return error;
};

const refreshTokensTableExists = async () => tableExists('refresh_tokens');

const getRefreshTokenStorageMode = async () => {
  let hasTable = false;

  try {
    hasTable = await refreshTokensTableExists();
  } catch (error) {
    if (isTestEnvironment()) {
      return 'memory';
    }
    throw buildRefreshTokenStorageError(error);
  }

  if (hasTable) {
    return 'database';
  }

  if (isTestEnvironment()) {
    return 'memory';
  }

  clearSchemaCompatCache();
  hasTable = await refreshTokensTableExists();
  if (hasTable) {
    return 'database';
  }

  throw buildRefreshTokenStorageError();
};

const runRefreshTokenPersistence = async (operation) => {
  try {
    return await operation();
  } catch (error) {
    throw buildRefreshTokenStorageError(error);
  }
};

export const clearRefreshTokenMemoryStore = () => {
  memoryTokens.clear();
};

export const RefreshTokenModel = {
  create: async ({
    id_usuario,
    token_hash,
    session_id = randomUUID(),
    auth_version = 0,
    expires_at,
    user_agent = null,
    ip_address = null,
  }) => {
    if (await getRefreshTokenStorageMode() === 'memory') {
      const id_refresh_token = memoryTokens.size + 1;
      memoryTokens.set(token_hash, {
        id_refresh_token,
        id_usuario,
        token_hash,
        session_id,
        auth_version,
        expires_at,
        revoked_at: null,
        user_agent,
        ip_address,
      });
      return id_refresh_token;
    }

    const [result] = await runRefreshTokenPersistence(() =>
      pool.execute(
        `INSERT INTO refresh_tokens
           (id_usuario, token_hash, expires_at, user_agent, ip_address, session_id, auth_version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id_usuario, token_hash, expires_at, user_agent, ip_address, session_id, auth_version]
      )
    );

    return result.insertId;
  },

  findActiveByHash: async (token_hash) => {
    if (await getRefreshTokenStorageMode() === 'memory') {
      const token = memoryTokens.get(token_hash);
      if (!token || token.revoked_at || new Date(token.expires_at).getTime() <= Date.now()) {
        return null;
      }

      const user = await UsuarioModel.findById(token.id_usuario);
      if (!user) {
        return null;
      }

      return {
        ...token,
        ...user,
        session_auth_version: token.auth_version,
        auth_version: user.auth_version ?? 0,
      };
    }

    const [rows] = await runRefreshTokenPersistence(() =>
      pool.execute(
        `SELECT rt.id_refresh_token, rt.id_usuario, rt.token_hash, rt.expires_at, rt.session_id,
                rt.auth_version AS session_auth_version, u.auth_version, u.id_entidad,
                u.uuid, u.nombre, u.apellido, u.email, u.rol, u.activo,
                u.email_verificado, u.avatar_url, u.telefono, u.created_at
         FROM refresh_tokens rt
         INNER JOIN usuarios u ON u.id_usuario = rt.id_usuario
         WHERE rt.token_hash = ?
           AND rt.revoked_at IS NULL
           AND rt.expires_at > NOW()
           AND u.deleted_at IS NULL
         LIMIT 1`,
        [token_hash]
      )
    );

    return rows[0] ?? null;
  },

  revokeByHash: async (token_hash) => {
    if (await getRefreshTokenStorageMode() === 'memory') {
      const token = memoryTokens.get(token_hash);
      if (!token) return false;
      let changed = false;
      for (const entry of memoryTokens.values()) {
        if (entry.session_id === token.session_id && !entry.revoked_at) { entry.revoked_at = new Date(); changed = true; }
      }
      return changed;
    }

    const [result] = await runRefreshTokenPersistence(() =>
      pool.execute(
        `UPDATE refresh_tokens AS target
         INNER JOIN refresh_tokens AS source
           ON target.session_id = source.session_id OR target.token_hash = source.token_hash
         SET target.revoked_at = NOW()
         WHERE source.token_hash = ? AND target.revoked_at IS NULL`,
        [token_hash]
      )
    );

    return result.affectedRows > 0;
  },

  rotate: async ({
    current_hash,
    next_hash,
    expires_at,
    user_agent = null,
    ip_address = null,
  }) => {
    if (await getRefreshTokenStorageMode() === 'memory') {
      const current = memoryTokens.get(current_hash);
      if (!current || current.revoked_at || new Date(current.expires_at).getTime() <= Date.now()) {
        return null;
      }

      current.revoked_at = new Date();
      const id_refresh_token = memoryTokens.size + 1;
      memoryTokens.set(next_hash, {
        id_refresh_token,
        id_usuario: current.id_usuario,
        token_hash: next_hash,
        session_id: current.session_id,
        auth_version: current.auth_version,
        expires_at,
        revoked_at: null,
        user_agent,
        ip_address,
      });

      return {
        id_usuario: current.id_usuario,
        id_refresh_token,
        session_id: current.session_id,
        auth_version: current.auth_version,
      };
    }

    let connection = null;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [rows] = await connection.execute(
        `SELECT rt.id_refresh_token, rt.id_usuario, rt.session_id, rt.auth_version
         FROM refresh_tokens rt INNER JOIN usuarios u ON u.id_usuario = rt.id_usuario
         WHERE rt.token_hash = ? AND rt.revoked_at IS NULL
           AND rt.expires_at > NOW() AND rt.session_id IS NOT NULL
           AND u.activo = 1 AND u.deleted_at IS NULL AND u.auth_version = rt.auth_version
         LIMIT 1
         FOR UPDATE`,
        [current_hash]
      );

      const current = rows[0] ?? null;
      if (!current) {
        await connection.rollback();
        return null;
      }

      await connection.execute(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id_refresh_token = ?`,
        [current.id_refresh_token]
      );

      const [insertResult] = await connection.execute(
        `INSERT INTO refresh_tokens
           (id_usuario, token_hash, expires_at, user_agent, ip_address, session_id, auth_version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [current.id_usuario, next_hash, expires_at, user_agent, ip_address, current.session_id, current.auth_version]
      );

      await connection.commit();
      return {
        id_usuario: current.id_usuario,
        id_refresh_token: insertResult.insertId,
        session_id: current.session_id,
        auth_version: current.auth_version,
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      throw buildRefreshTokenStorageError(error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  revokeAllForUser: async (id_usuario) => {
    if (await getRefreshTokenStorageMode() === 'memory') {
      let revoked = 0;
      for (const token of memoryTokens.values()) {
        if (Number(token.id_usuario) === Number(id_usuario) && !token.revoked_at) {
          token.revoked_at = new Date();
          revoked += 1;
        }
      }
      return revoked;
    }

    const [result] = await runRefreshTokenPersistence(() =>
      pool.execute(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id_usuario = ? AND revoked_at IS NULL`,
        [id_usuario]
      )
    );

    return result.affectedRows;
  },
};

