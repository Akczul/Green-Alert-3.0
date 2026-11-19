// Delega las escrituras existentes; no cambia sus SQL ni transacciones.
export const createLegacyViewRecorder = ({ reportes, clock }) => {
  const throttle = new Map();
  return {
    async record({ reportId, userId, skip, anonymousKey }) {
      if (skip) return;
      if (userId) { await reportes.registrarVistaUsuario(reportId, userId); return; }
      const now = clock.now();
      const last = throttle.get(anonymousKey) || 0;
      if (now - last < 5 * 60 * 1000) return;
      throttle.set(anonymousKey, now);
      await reportes.incrementarVistas(reportId);
    },
  };
};
