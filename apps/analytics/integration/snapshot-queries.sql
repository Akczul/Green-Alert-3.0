-- Referencia para el futuro reader Express; no ejecutar automáticamente.
-- Conexión de SOLO LECTURA, sesión UTC. Parámetros definidos por el principal.
-- El principal añade restricciones de ámbito antes de entregar filas.
-- Riesgo: inicio del período previo, fin inclusivo de instantánea.
SELECT uuid AS report_uuid, tipo_contaminacion, subcategoria,
       nivel_severidad, latitud, longitud, municipio, departamento, created_at
FROM reportes
WHERE deleted_at IS NULL AND estado IN ('en_proceso', 'resuelto')
  AND latitud IS NOT NULL AND longitud IS NOT NULL
  AND created_at >= ? AND created_at <= ?
ORDER BY created_at DESC, id_reporte DESC;

-- Volumen semanal: altas no borradas, todos los estados, sin datos de autores.
-- Intervalo de semanas completas [lunes UTC, lunes UTC).
-- Agrupar por la MISMA cuadrícula floor(eje / 0.05), no por municipio ni redondeo.
-- El lector debe densificar semanas sin reportes con count=0 y rechazar >100 zonas.
SELECT uuid AS report_uuid, latitud, longitud, created_at
FROM reportes
WHERE deleted_at IS NULL AND latitud IS NOT NULL AND longitud IS NOT NULL
  AND created_at >= ? AND created_at < ?
ORDER BY created_at ASC, id_reporte ASC;
