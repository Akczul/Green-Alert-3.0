-- Jerarquía administrativa y auditoría de solo anexado. Aditiva sobre bootstrap + 021..023.
-- Usa DATABASE() de la conexión. No ejecutar la cadena histórica completa sobre el bootstrap.
--   nivel_admin = 'global'  → superadministrador (solo por inicialización controlada o por otro superadministrador).
--   nivel_admin = 'ambito'  → administrador de segundo nivel; ambito_entidad NULL = comunidad, N = organización N.
-- Los administradores existentes quedan en 'ambito' (mínimo privilegio) hasta que el operador ejecute
-- `npm --prefix apps/backend run admin:superadmin`.
ALTER TABLE usuarios
  ADD COLUMN nivel_admin ENUM('global', 'ambito') NULL AFTER rol,
  ADD COLUMN ambito_entidad INT NULL AFTER nivel_admin,
  ADD INDEX idx_usuarios_nivel_admin (rol, nivel_admin, activo),
  ADD CONSTRAINT fk_usuarios_ambito_entidad FOREIGN KEY (ambito_entidad)
    REFERENCES entidades(id_entidad) ON DELETE RESTRICT ON UPDATE RESTRICT;

UPDATE usuarios SET nivel_admin = 'ambito' WHERE rol = 'admin' AND nivel_admin IS NULL;

-- Coherencia en el motor: nivel y ámbito solo existen en administradores; un global no tiene ámbito.
ALTER TABLE usuarios
  ADD CONSTRAINT chk_usuarios_nivel_solo_admin CHECK (rol = 'admin' OR (nivel_admin IS NULL AND ambito_entidad IS NULL)),
  ADD CONSTRAINT chk_usuarios_global_sin_ambito CHECK (nivel_admin IS NULL OR nivel_admin = 'ambito' OR ambito_entidad IS NULL);

CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  target_id BIGINT UNSIGNED NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  correlation_id CHAR(36) NULL,
  INDEX admin_audit_actor (actor_id, occurred_at),
  INDEX admin_audit_target (target_id, occurred_at)
) ENGINE=InnoDB;

-- Ninguna cuenta de aplicación puede alterar o borrar rastros de auditoría.
DELIMITER $$
CREATE TRIGGER ga_admin_audit_no_update BEFORE UPDATE ON admin_audit FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'admin_audit es de solo anexado';
END$$
CREATE TRIGGER ga_admin_audit_no_delete BEFORE DELETE ON admin_audit FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'admin_audit es de solo anexado';
END$$
CREATE TRIGGER ga_security_audit_no_update BEFORE UPDATE ON security_audit FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_audit es de solo anexado';
END$$
CREATE TRIGGER ga_security_audit_no_delete BEFORE DELETE ON security_audit FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'security_audit es de solo anexado';
END$$
DELIMITER ;
