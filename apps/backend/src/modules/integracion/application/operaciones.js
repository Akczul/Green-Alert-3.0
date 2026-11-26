// Puertos explícitos. El usuario/ámbito provienen de la sesión validada por Express.
export function createOperaciones({ snapshots, analytics, events, uuid, clock }) {
  const authorize = user => {
    if (!['admin', 'moderador'].includes(user?.rol)) {
      throw Object.assign(new Error('Rol no autorizado.'), { statusCode: 403 });
    }
  };
  return {
    async risk(user, input = {}) {
      authorize(user);
      const days = Number(input.dias ?? 30);
      if (!Number.isInteger(days) || days < 1 || days > 180) {
        throw Object.assign(new Error('dias debe ser entero entre 1 y 180.'), { statusCode: 400 });
      }
      const end = new Date(clock.now());
      const start = new Date(end.getTime() - days * 86400000);
      const reports = await snapshots.risk(new Date(start.getTime() - days * 86400000), end);
      if (reports.length > 20000) throw Object.assign(new Error('Acota el período analítico.'), { statusCode: 413 });
      return analytics.analyzeRisk({ run_id: uuid(), source_revision: end.toISOString(),
        source_kind: 'mysql', period: { start: start.toISOString(), end: end.toISOString() },
        min_score: 0, reports }, { scope: `user:${user.sub}` });
    },
    async history(user, id, range) {
      const report = await snapshots.authorizedReport(user, id);
      if (!report) throw Object.assign(new Error('Reporte no encontrado.'), { statusCode: 404 });
      return events.history(report.uuid, range);
    },
    async indicators(user, filters) { authorize(user); return events.indicators(filters); },
  };
}
