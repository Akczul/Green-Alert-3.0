-- Integración opt-in. Aplicar solo esta migración a bases existentes, con respaldo.
-- DATABASE() es el esquema de la conexión. No se modifica geometría histórica.
CREATE TABLE IF NOT EXISTS cache_generation (
  id TINYINT PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT IGNORE INTO cache_generation (id, revision) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS integration_outbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) NOT NULL UNIQUE,
  report_uuid CHAR(36) NOT NULL,
  payload JSON NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  delivered_at DATETIME(3) NULL,
  last_error VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX pending (delivered_at, available_at, id)
) ENGINE=InnoDB;
DELIMITER $$
CREATE TRIGGER ga_report_insert AFTER INSERT ON reportes FOR EACH ROW
BEGIN
  UPDATE cache_generation SET revision = revision + 1 WHERE id = 1;
  INSERT INTO integration_outbox (event_id, report_uuid, payload)
  VALUES (UUID(), NEW.uuid, JSON_OBJECT('type','REPORT_CREATED','category',NEW.tipo_contaminacion,
    'severity',FIELD(NEW.nivel_severidad,'bajo','medio','alto','critico'),
    'occurredAt',DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ')));
END$$
CREATE TRIGGER ga_report_update AFTER UPDATE ON reportes FOR EACH ROW
BEGIN
  UPDATE cache_generation SET revision = revision + 1 WHERE id = 1;
  IF NOT (OLD.estado <=> NEW.estado) OR NOT (OLD.deleted_at <=> NEW.deleted_at) THEN
    INSERT INTO integration_outbox (event_id, report_uuid, payload)
    VALUES (UUID(), NEW.uuid, JSON_OBJECT('type','REPORT_STATUS_CHANGED','category',NEW.tipo_contaminacion,
      'severity',FIELD(NEW.nivel_severidad,'bajo','medio','alto','critico'),
      'occurredAt',DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ')));
  END IF;
END$$
CREATE TRIGGER ga_report_delete AFTER DELETE ON reportes FOR EACH ROW
BEGIN
  UPDATE cache_generation SET revision = revision + 1 WHERE id = 1;
END$$
DELIMITER ;
