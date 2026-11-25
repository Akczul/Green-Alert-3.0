// Entrega al menos una vez. Cassandra deduplica el eventId con contenido inmutable.
// El bloqueo MySQL serializa workers. Nunca se borra una entrega fallida.
export function createOutbox({ pool, publish }) {
  return {
    async drain(limit = 32) {
      const connection = await pool.getConnection();
      let locked = false;
      try {
        const [lock] = await connection.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':outbox'), 0) AS acquired");
        locked = Number(lock[0].acquired) === 1;
        if (!locked) return { delivered: 0, pending: true };
        const [rows] = await connection.execute(`SELECT * FROM integration_outbox
          WHERE delivered_at IS NULL AND available_at <= UTC_TIMESTAMP(3) ORDER BY id LIMIT ?`, [limit]);
        let delivered = 0;
        // Paralelismo acotado sobre eventos independientes; cada publicación conserva su ID.
        for (let offset = 0; offset < rows.length; offset += 4) {
          const outcomes = await Promise.allSettled(rows.slice(offset, offset + 4).map(async row => {
            const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
            const event = { ...payload, eventId: row.event_id, reportId: row.report_uuid,
              schemaVersion: 1, sourceRevision: Number(row.id), zone: null };
            // MySQL emite microsegundos; el contrato admite precisión de milisegundos.
            event.occurredAt = new Date(event.occurredAt).toISOString();
            try {
              await publish(event, row.event_id);
              await connection.execute('UPDATE integration_outbox SET delivered_at=UTC_TIMESTAMP(3), last_error=NULL WHERE id=?', [row.id]);
              delivered++;
            } catch {
              const delay = Math.min(300, 2 ** Math.min(row.attempts + 1, 8));
              await connection.execute(`UPDATE integration_outbox SET attempts=attempts+1,
                last_error='DEPENDENCY_UNAVAILABLE', available_at=TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)) WHERE id=?`, [delay, row.id]);
            }
          }));
          const failure = outcomes.find(item => item.status === 'rejected');
          if (failure) throw failure.reason;
        }
        return { delivered, selected: rows.length };
      } finally {
        if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':outbox'))");
        connection.release();
      }
    },
  };
}
