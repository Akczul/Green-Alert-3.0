-- Migracion: Agregar soporte para Google OAuth
-- Fecha: 2026-04-26
-- Descripcion: Agrega columna google_id a usuarios para vincular cuentas de Google.

-- MySQL 8 no admite ADD COLUMN/CREATE INDEX IF NOT EXISTS.
-- Consultar metadatos permite repetir esta migracion sin modificar datos.
SET @ga_has_column = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'google_id'
);
SET @ga_sql = IF(@ga_has_column = 0,
  'ALTER TABLE usuarios ADD COLUMN google_id VARCHAR(255) UNIQUE NULL AFTER uuid',
  'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;

SET @ga_has_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND index_name = 'idx_google_id'
);
SET @ga_sql = IF(@ga_has_index = 0,
  'CREATE INDEX idx_google_id ON usuarios(google_id)',
  'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;
