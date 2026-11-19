-- Migracion: Agregar soporte para Facebook OAuth
-- Descripcion: Agrega columna facebook_id a usuarios para vincular cuentas de Facebook.

SET @ga_has_column = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'facebook_id'
);
SET @ga_sql = IF(@ga_has_column = 0,
  'ALTER TABLE usuarios ADD COLUMN facebook_id VARCHAR(255) UNIQUE NULL AFTER google_id',
  'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;

SET @ga_has_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND index_name = 'idx_facebook_id'
);
SET @ga_sql = IF(@ga_has_index = 0,
  'CREATE INDEX idx_facebook_id ON usuarios(facebook_id)',
  'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;
