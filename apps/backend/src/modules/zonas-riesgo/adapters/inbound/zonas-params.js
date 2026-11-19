// Conversión del query HTTP; preserva coerciones, límites y errores existentes.
export const parseZonasParams = (query = {}, clock = { now: () => Date.now() }) => {
  let dias = 30;
  if (query.dias !== undefined && query.dias !== null && query.dias !== '') {
    const parsed = parseInt(query.dias, 10);
    if (!Number.isFinite(parsed)) {
      const error = new Error('El parametro debe ser un entero entre 1 y 365.');
      error.statusCode = 400;
      throw error;
    }
    dias = Math.max(1, Math.min(365, parsed));
  }
  const desde = new Date(clock.now());
  desde.setDate(desde.getDate() - dias);
  const minScore = query.min_score === undefined || query.min_score === '' ? 30 : Number(query.min_score);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
    const error = new Error('min_score debe ser un numero entre 0 y 100.');
    error.statusCode = 400;
    throw error;
  }
  return {
    dias, desde,
    tipo: typeof query.tipo === 'string' && query.tipo.trim() ? query.tipo.trim().toLowerCase() : null,
    min_score: minScore,
  };
};
