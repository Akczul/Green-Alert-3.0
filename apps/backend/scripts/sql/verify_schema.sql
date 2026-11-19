-- Ejecutar despues de DATABASE_SCHEMA_COMPLETE.sql o de las migraciones.
-- Devuelve las tablas y columnas criticas esperadas por el backend.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'usuarios',
    'entidades',
    'categorias_riesgo',
    'reportes',
    'evidencias',
    'refresh_tokens',
    'reporte_likes',
    'reporte_vistas',
    'notificaciones',
    'reporte_entidades',
    'alertas_entidad',
    'fcm_tokens'
  )
ORDER BY table_name;

SELECT table_name, column_name, column_type, is_nullable
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND (
    (table_name = 'usuarios' AND column_name IN (
      'google_id',
      'id_entidad',
      'facebook_id',
      'notification_preferences',
      'avatar_url',
      'email_verificado',
      'email_verification_token',
      'otp_code_hash'
    ))
    OR (table_name = 'reportes' AND column_name IN (
      'subcategoria',
      'estado',
      'comentario_moderacion',
      'ia_etiquetas',
      'ia_confianza',
      'ia_procesado'
    ))
  )
ORDER BY table_name, column_name;

SELECT table_name, index_name
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'reportes'
  AND index_name IN (
    'idx_reportes_estado_created_at',
    'idx_reportes_tipo_created_at',
    'idx_reportes_latitud_longitud'
  )
ORDER BY table_name, index_name;

-- Relaciones efectivamente instaladas (esperadas: 17 en el esquema completo).
SELECT table_name, column_name, referenced_table_name, referenced_column_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
ORDER BY table_name, column_name;

-- Debe devolver cero filas para geometria creada con el contrato actual.
-- Solo lectura: no repara ni transforma ubicaciones historicas.
SELECT id_reporte
FROM reportes
WHERE punto_geo IS NOT NULL AND (
  ABS(ST_Latitude(punto_geo) - latitud) > 0.000001 OR
  ABS(ST_Longitude(punto_geo) - longitud) > 0.000001
);
