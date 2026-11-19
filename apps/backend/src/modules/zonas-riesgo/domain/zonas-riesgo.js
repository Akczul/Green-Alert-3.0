// Reglas originales, sin I/O. El reloj se recibe como argumento.
export const DEFAULT_CELDA_GRADOS = 0.05;
const NIVEL_RANK = { bajo: 1, medio: 2, alto: 3, critico: 4 };
const SCORE_NIVEL = [
  { min: 80, nivel: 'critico' },
  { min: 60, nivel: 'alto' },
  { min: 35, nivel: 'medio' },
  { min: 0, nivel: 'bajo' },
];

const gridKeyFor = (lat, lng, cellSize = DEFAULT_CELDA_GRADOS) => {
  const latCell = Math.floor(Number(lat) / cellSize) * cellSize;
  const lngCell = Math.floor(Number(lng) / cellSize) * cellSize;
  return `${latCell.toFixed(4)}:${lngCell.toFixed(4)}`;
};

const scoreZona = (reportes, now) => {
  const severidadPromedio = reportes.reduce(
    (sum, reporte) => sum + (NIVEL_RANK[reporte.nivel_severidad] || 1),
    0
  ) / Math.max(1, reportes.length);
  const recencia = reportes.reduce((sum, reporte) => {
    const createdAt = new Date(reporte.created_at).getTime();
    const days = Number.isFinite(createdAt)
      ? Math.max(0, (now() - createdAt) / 86400000)
      : 365;
    return sum + Math.max(0, 30 - days);
  }, 0) / Math.max(1, reportes.length);
  const score = Math.min(100, Math.round((reportes.length * 16) + (severidadPromedio * 14) + recencia));
  const nivel = SCORE_NIVEL.find((item) => score >= item.min)?.nivel || 'bajo';

  return { score, nivel, severidadPromedio };
};

const calcularTendencia = (actual, previo) => {
  if (previo === 0) return actual > 0 ? 'subiendo' : 'estable';
  const ratio = actual / previo;
  if (ratio >= 1.2) return 'subiendo';
  if (ratio <= 0.8) return 'bajando';
  return 'estable';
};

// cutoffDate separa el período actual (>= cutoffDate) del período previo (< cutoffDate)
export const buildZonas = (reportes, { min_score, cutoffDate, now }) => {
  const grouped = new Map();     // reportes del período actual
  const groupedPrev = new Map(); // reportes del período previo para tendencia

  for (const reporte of reportes) {
    const lat = Number(reporte.latitud);
    const lng = Number(reporte.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const key = gridKeyFor(lat, lng);
    const isRecent = !cutoffDate || new Date(reporte.created_at) >= cutoffDate;
    const target = isRecent ? grouped : groupedPrev;
    target.set(key, [...(target.get(key) || []), reporte]);
  }

  return [...grouped.entries()]
    .map(([key, items]) => {
      const [latCell, lngCell] = key.split(':').map(Number);
      const { score, nivel, severidadPromedio } = scoreZona(items, now);
      const tipoCounts = new Map();
      const subcatCounts = new Map();
      const municipioCounts = new Map();
      const departamentoCounts = new Map();
      let latest = null;

      for (const item of items) {
        tipoCounts.set(item.tipo_contaminacion, (tipoCounts.get(item.tipo_contaminacion) || 0) + 1);
        if (item.subcategoria) subcatCounts.set(item.subcategoria, (subcatCounts.get(item.subcategoria) || 0) + 1);
        if (item.municipio) municipioCounts.set(item.municipio, (municipioCounts.get(item.municipio) || 0) + 1);
        if (item.departamento) departamentoCounts.set(item.departamento, (departamentoCounts.get(item.departamento) || 0) + 1);
        const itemDate = new Date(item.created_at).getTime();
        if (!latest || itemDate > new Date(latest).getTime()) latest = item.created_at;
      }

      const [tipoDominante] = [...tipoCounts.entries()].sort((a, b) => b[1] - a[1])[0] || ['otro'];
      const [subcategoriaDominante = null] = [...subcatCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const [municipio = null] = [...municipioCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const [departamento = null] = [...departamentoCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

      const prevItems = groupedPrev.get(key) || [];
      const tendencia = calcularTendencia(items.length, prevItems.length);

      return {
        id: key,
        zona_id: key,
        centro: {
          lat: Number((latCell + (DEFAULT_CELDA_GRADOS / 2)).toFixed(6)),
          lng: Number((lngCell + (DEFAULT_CELDA_GRADOS / 2)).toFixed(6)),
        },
        tipo_dominante: tipoDominante,
        subcategoria_dominante: subcategoriaDominante,
        municipio,
        departamento,
        n_reportes: items.length,
        n_reportes_previo: prevItems.length,
        tendencia,
        severidad_promedio: Number(severidadPromedio.toFixed(2)),
        ultimo_reporte: latest,
        score,
        nivel,
      };
    })
    .filter((zona) => zona.score >= min_score)
    .sort((a, b) => b.score - a.score || b.n_reportes - a.n_reportes);
};
