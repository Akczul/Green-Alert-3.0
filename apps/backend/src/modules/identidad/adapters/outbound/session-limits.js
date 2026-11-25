// La familia persiste entre rotaciones de refresh. El reloj autoritativo es MySQL.
export function createSessionLimits({ pool, idleSeconds = 1800, maxSeconds = 604800 }) {
  if (![idleSeconds, maxSeconds].every(n => Number.isInteger(n) && n > 0)) throw new Error('Límites de sesión inválidos');
  return {
    async check(sid, userId, touch = true) {
      const [rows] = await pool.execute(`SELECT session_id FROM session_activity
        WHERE session_id=? AND id_usuario=?
        AND last_seen_at > TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3))
        AND started_at > TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3))`, [sid, userId, -idleSeconds, -maxSeconds]);
      if (!rows.length) return false;
      if (touch) {
        const [result] = await pool.execute(`UPDATE session_activity SET last_seen_at=UTC_TIMESTAMP(3)
          WHERE session_id=? AND id_usuario=?
          AND last_seen_at > TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3))
          AND started_at > TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3))`, [sid, userId, -idleSeconds, -maxSeconds]);
        return result.affectedRows > 0;
      }
      return true;
    },
  };
}
