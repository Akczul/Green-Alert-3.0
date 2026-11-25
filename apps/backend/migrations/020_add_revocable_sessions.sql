-- Aditiva: no elimina usuarios, hashes ni tokens. JWT/refresh anteriores sin sid requieren login.
-- Ejecutar solo tras respaldo/revisión en base existente; runners usan exclusivamente bases nuevas.
SET @ga_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'auth_version') = 0,
  'ALTER TABLE usuarios ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;
SET @ga_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'session_id') = 0,
  'ALTER TABLE refresh_tokens ADD COLUMN session_id CHAR(36) NULL', 'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;
SET @ga_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'auth_version') = 0,
  'ALTER TABLE refresh_tokens ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;
SET @ga_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND INDEX_NAME = 'idx_refresh_session') = 0,
  'ALTER TABLE refresh_tokens ADD INDEX idx_refresh_session (session_id, revoked_at)', 'SELECT 1');
PREPARE ga_stmt FROM @ga_sql;
EXECUTE ga_stmt;
DEALLOCATE PREPARE ga_stmt;
