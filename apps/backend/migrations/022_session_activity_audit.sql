-- Aditiva. No ejecutar la cadena histórica sobre el bootstrap completo.
CREATE TABLE IF NOT EXISTS session_activity (
  session_id CHAR(36) PRIMARY KEY,
  id_usuario BIGINT UNSIGNED NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX user_sessions (id_usuario)
) ENGINE=InnoDB;
INSERT IGNORE INTO session_activity (session_id,id_usuario,started_at,last_seen_at)
  SELECT session_id, MIN(id_usuario), MIN(created_at), MAX(created_at)
  FROM refresh_tokens WHERE session_id IS NOT NULL GROUP BY session_id;
CREATE TABLE IF NOT EXISTS security_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor_id BIGINT UNSIGNED NULL,
  method VARCHAR(10) NOT NULL,
  resource VARCHAR(200) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  correlation_id CHAR(36) NOT NULL,
  INDEX actor_time (actor_id, occurred_at)
) ENGINE=InnoDB;
DELIMITER $$
CREATE TRIGGER ga_session_started AFTER INSERT ON refresh_tokens FOR EACH ROW
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    INSERT IGNORE INTO session_activity (session_id,id_usuario) VALUES (NEW.session_id,NEW.id_usuario);
  END IF;
END$$
DELIMITER ;
