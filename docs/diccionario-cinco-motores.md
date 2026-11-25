# Diccionario de los cinco motores

DDL y modelos de la versión integrada. Los bloques SQL describen tablas, no instrucciones para ejecutar el bootstrap sobre una base existente.

## MySQL

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS entidades (
  id_entidad INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  codigo VARCHAR(60) NOT NULL UNIQUE,
  descripcion TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_entidades_codigo (codigo),
  INDEX idx_entidades_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  google_id VARCHAR(255) UNIQUE NULL,
  facebook_id VARCHAR(255) UNIQUE NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  auth_version INT UNSIGNED NOT NULL DEFAULT 0,
  rol ENUM('ciudadano', 'moderador', 'admin', 'entidad') DEFAULT 'ciudadano',
  id_entidad INT NULL,
  activo BOOLEAN DEFAULT TRUE,
  email_verificado BOOLEAN DEFAULT FALSE,
  avatar_url VARCHAR(255) NULL,
  telefono VARCHAR(20) NULL,
  notification_preferences JSON NULL,
  ultimo_acceso DATETIME NULL,
  token_reset VARCHAR(64) NULL,
  token_reset_exp DATETIME NULL,
  email_verification_token VARCHAR(64) NULL,
  email_verification_exp DATETIME NULL,
  otp_code_hash VARCHAR(64) NULL,
  otp_exp DATETIME NULL,
  otp_attempts INT DEFAULT 0,
  otp_last_request DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,

  -- Indexes
  INDEX idx_email (email),
  INDEX idx_uuid (uuid),
  INDEX idx_google_id (google_id),
  INDEX idx_facebook_id (facebook_id),
  INDEX idx_email_verification_token (email_verification_token),
  INDEX idx_email_verification_exp (email_verification_exp),
  INDEX idx_otp_code_hash (otp_code_hash),
  INDEX idx_otp_exp (otp_exp),
  INDEX idx_deleted_at (deleted_at),
  INDEX idx_rol (rol),
  INDEX idx_usuarios_id_entidad (id_entidad),
  CONSTRAINT fk_usuarios_entidad FOREIGN KEY (id_entidad)
    REFERENCES entidades(id_entidad) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS categorias_riesgo (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT NULL,
  icono VARCHAR(255) NULL,
  color_hex VARCHAR(7) NULL,
  nivel_prioridad_default INT NULL,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,

  -- Indexes
  INDEX idx_codigo (codigo),
  INDEX idx_activo (activo),
  INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS reportes (
  id_reporte BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  tipo_contaminacion VARCHAR(50) NOT NULL,
  subcategoria VARCHAR(100) NULL,
  estado ENUM('pendiente', 'en_proceso', 'resuelto', 'rechazado') DEFAULT 'pendiente',
  nivel_severidad ENUM('bajo', 'medio', 'alto', 'critico') DEFAULT 'medio',
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT NULL,
  latitud DECIMAL(10, 8) NULL,
  longitud DECIMAL(11, 8) NULL,
  punto_geo POINT SRID 4326 NULL,
  direccion VARCHAR(255) NULL,
  municipio VARCHAR(100) NULL,
  departamento VARCHAR(100) NULL,
  votos_relevancia INT DEFAULT 0,
  vistas INT DEFAULT 0,
  ia_etiquetas JSON NULL,
  ia_confianza DECIMAL(5, 2) NULL,
  ia_procesado BOOLEAN DEFAULT FALSE,
  confianza_evidencia TINYINT UNSIGNED NULL DEFAULT NULL,
  comentario_moderacion TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,

  -- Foreign Keys
  CONSTRAINT fk_reportes_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE,

  -- Indexes
  INDEX idx_uuid (uuid),
  INDEX idx_usuario (id_usuario),
  INDEX idx_estado (estado),
  INDEX idx_tipo_contaminacion (tipo_contaminacion),
  INDEX idx_nivel_severidad (nivel_severidad),
  INDEX idx_municipio (municipio),
  INDEX idx_created_at (created_at),
  INDEX idx_comentario_moderacion (comentario_moderacion(100)),
  INDEX idx_deleted_at (deleted_at),
  INDEX idx_reportes_estado_created_at (estado, created_at),
  INDEX idx_reportes_tipo_created_at (tipo_contaminacion, created_at),
  INDEX idx_reportes_confianza_evidencia (confianza_evidencia),
  INDEX idx_reportes_latitud_longitud (latitud, longitud)
  -- MySQL exige NOT NULL para indices SPATIAL. La ubicacion es opcional;
  -- conservar punto_geo nullable y posponer ese indice hasta una migracion validada.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS reporte_entidades (
  id_reporte_entidad BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_reporte BIGINT UNSIGNED NOT NULL,
  id_entidad INT NOT NULL,
  tipo_asignacion ENUM('principal', 'apoyo') NOT NULL DEFAULT 'principal',
  prioridad ENUM('baja', 'media', 'alta', 'critica') NOT NULL DEFAULT 'media',
  estado_atencion ENUM('pendiente', 'en_atencion', 'atendido', 'cerrado') NOT NULL DEFAULT 'pendiente',
  comentario TEXT NULL,
  asignado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_reporte_entidades_reporte FOREIGN KEY (id_reporte)
    REFERENCES reportes(id_reporte) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reporte_entidades_entidad FOREIGN KEY (id_entidad)
    REFERENCES entidades(id_entidad) ON DELETE CASCADE ON UPDATE CASCADE,

  UNIQUE KEY unique_reporte_entidad (id_reporte, id_entidad),
  INDEX idx_reporte_entidades_reporte (id_reporte),
  INDEX idx_reporte_entidades_entidad (id_entidad),
  INDEX idx_reporte_entidades_tipo (tipo_asignacion),
  INDEX idx_reporte_entidades_prioridad (prioridad),
  INDEX idx_reporte_entidades_estado_atencion (estado_atencion),
  INDEX idx_reporte_entidades_asignado_at (asignado_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS alertas_entidad (
  id_alerta_entidad BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL DEFAULT (UUID()),
  id_reporte_entidad BIGINT UNSIGNED NOT NULL,
  id_reporte BIGINT UNSIGNED NOT NULL,
  id_entidad INT NOT NULL,
  tipo_alerta ENUM('reporte_critico_asignado', 'reporte_prioritario_asignado', 'reporte_asignado') NOT NULL,
  prioridad ENUM('baja', 'media', 'alta', 'critica') NOT NULL DEFAULT 'media',
  titulo VARCHAR(180) NOT NULL,
  mensaje TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  leida_at DATETIME NULL,
  leida_por BIGINT UNSIGNED NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_alertas_entidad_reporte_entidad FOREIGN KEY (id_reporte_entidad)
    REFERENCES reporte_entidades(id_reporte_entidad) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_alertas_entidad_reporte FOREIGN KEY (id_reporte)
    REFERENCES reportes(id_reporte) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_alertas_entidad_entidad FOREIGN KEY (id_entidad)
    REFERENCES entidades(id_entidad) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_alertas_entidad_leida_por FOREIGN KEY (leida_por)
    REFERENCES usuarios(id_usuario) ON DELETE SET NULL ON UPDATE CASCADE,

  UNIQUE KEY uq_alertas_entidad_uuid (uuid),
  UNIQUE KEY uq_alerta_reporte_entidad_tipo (id_reporte_entidad, tipo_alerta),
  INDEX idx_alertas_entidad (id_entidad),
  INDEX idx_alertas_reporte (id_reporte),
  INDEX idx_alertas_reporte_entidad (id_reporte_entidad),
  INDEX idx_alertas_entidad_leida (id_entidad, leida, created_at),
  INDEX idx_alertas_entidad_prioridad (id_entidad, prioridad, created_at),
  INDEX idx_alertas_leida_por (leida_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS evidencias (
  id_evidencia BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  id_reporte BIGINT UNSIGNED NOT NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  tipo_archivo VARCHAR(50) NULL,
  url_archivo VARCHAR(512) NOT NULL,
  nombre_original VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  tamano_bytes BIGINT NULL,
  hash_sha256 VARCHAR(64) NULL,
  storage_provider ENUM('local', 'cloudinary') NOT NULL DEFAULT 'cloudinary',
  cloudinary_public_id VARCHAR(255) NULL,
  cloudinary_asset_id VARCHAR(255) NULL,
  cloudinary_resource_type VARCHAR(50) NULL,
  cloudinary_metadata JSON NULL,
  metadatos_exif JSON NULL,
  ia_analisis TEXT NULL,
  ia_procesado BOOLEAN DEFAULT FALSE,
  verificado BOOLEAN DEFAULT FALSE,
  orden INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,

  -- Foreign Keys
  CONSTRAINT fk_evidencias_reporte FOREIGN KEY (id_reporte)
    REFERENCES reportes(id_reporte) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_evidencias_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE,

  -- Indexes
  INDEX idx_uuid (uuid),
  INDEX idx_reporte (id_reporte),
  INDEX idx_usuario (id_usuario),
  INDEX idx_hash_sha256 (hash_sha256),
  INDEX idx_storage_provider (storage_provider),
  INDEX idx_cloudinary_public_id (cloudinary_public_id),
  INDEX idx_created_at (created_at),
  INDEX idx_orden (orden),
  INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id_refresh_token BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  session_id CHAR(36) NULL,
  auth_version INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_refresh_tokens_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_refresh_session (session_id, revoked_at),
  INDEX idx_refresh_token_hash (token_hash),
  INDEX idx_refresh_usuario (id_usuario),
  INDEX idx_refresh_expires_at (expires_at),
  INDEX idx_refresh_revoked_at (revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS reporte_likes (
  id_like BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_reporte BIGINT UNSIGNED NOT NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_reporte_likes_reporte FOREIGN KEY (id_reporte)
    REFERENCES reportes(id_reporte) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reporte_likes_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,

  UNIQUE KEY uk_reporte_likes_reporte_usuario (id_reporte, id_usuario),
  INDEX idx_reporte_likes_usuario (id_usuario),
  INDEX idx_reporte_likes_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS reporte_vistas (
  id_vista BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_reporte BIGINT UNSIGNED NOT NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_reporte_vistas_reporte FOREIGN KEY (id_reporte)
    REFERENCES reportes(id_reporte) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reporte_vistas_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,

  UNIQUE KEY uk_reporte_vistas_reporte_usuario (id_reporte, id_usuario),
  INDEX idx_reporte_vistas_usuario (id_usuario),
  INDEX idx_reporte_vistas_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS notificaciones (
  id_notificacion BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  tipo ENUM('reporte_estado', 'reporte_comentario', 'reporte_creado', 'reporte_asignado_entidad', 'alerta_zona', 'sistema') NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  referencia_tipo VARCHAR(30) NULL,
  referencia_uuid VARCHAR(36) NULL,
  link VARCHAR(255) NULL,
  leida BOOLEAN DEFAULT FALSE,
  leida_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_notificaciones_usuario_leida (id_usuario, leida, created_at),
  INDEX idx_notificaciones_uuid (uuid),
  INDEX idx_notificaciones_referencia (referencia_tipo, referencia_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/DATABASE_SCHEMA_COMPLETE.sql

```sql
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id_fcm_token BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario BIGINT UNSIGNED NOT NULL,
  token TEXT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  user_agent VARCHAR(255) NULL,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_fcm_tokens_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,

  UNIQUE KEY uk_fcm_tokens_hash (token_hash),
  INDEX idx_fcm_tokens_usuario_activo (id_usuario, activo),
  INDEX idx_fcm_tokens_last_seen_at (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Origen: apps/backend/migrations/021_integration_outbox_cache.sql

```sql
CREATE TABLE IF NOT EXISTS cache_generation (
  id TINYINT PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
```

Origen: apps/backend/migrations/021_integration_outbox_cache.sql

```sql
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
```

Origen: apps/backend/migrations/022_session_activity_audit.sql

```sql
CREATE TABLE IF NOT EXISTS session_activity (
  session_id CHAR(36) PRIMARY KEY,
  id_usuario BIGINT UNSIGNED NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX user_sessions (id_usuario)
) ENGINE=InnoDB;
```

Origen: apps/backend/migrations/022_session_activity_audit.sql

```sql
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
```

Origen: apps/backend/migrations/023_admin_mfa.sql

```sql
CREATE TABLE IF NOT EXISTS admin_mfa (
  id_usuario BIGINT UNSIGNED PRIMARY KEY,
  encrypted_secret VARBINARY(200) NOT NULL,
  last_counter BIGINT NOT NULL DEFAULT -1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
```

## MongoDB

Colección analytics_runs. Campos requeridos: run_id string UUID, schema_version entero, scope string, kind enum risk/training/forecast, algorithm_version string, period objeto, parameters objeto, results objeto, executed_at date e input_hash string. source_revision/source_kind relacionan el snapshot MySQL o sintético. run_id UNIQUE; índices scope/kind/executed_at/run_id y scope/source_revision. La validación efectiva está en repository.py y schemas.py. Ejemplo sintético: kind=risk, scope=user:7, source_kind=mysql; no se persiste el lote de información personal.

## Cassandra

```cql
-- Solo el keyspace exclusivo de este servicio; no se ejecuta en bases del usuario.
CREATE KEYSPACE IF NOT EXISTS greenalert_events WITH replication = {'class':'NetworkTopologyStrategy','datacenter1':1};
CREATE TABLE IF NOT EXISTS greenalert_events.events_by_id (
  event_id uuid PRIMARY KEY, payload text
);
CREATE TABLE IF NOT EXISTS greenalert_events.events_by_report (
  report_id uuid, month text, occurred_at timestamp, event_id uuid, payload text,
  PRIMARY KEY ((report_id,month),occurred_at,event_id)
) WITH CLUSTERING ORDER BY (occurred_at ASC,event_id ASC);
CREATE TABLE IF NOT EXISTS greenalert_events.events_by_day (
  day date, shard int, occurred_at timestamp, event_id uuid, payload text,
  PRIMARY KEY ((day,shard),occurred_at,event_id)
) WITH CLUSTERING ORDER BY (occurred_at ASC,event_id ASC);

```

eventId UUID identifica un hecho; reportId UUID refiere a reportes.uuid. type enum validado en API, occurredAt timestamp UTC de milisegundos, sourceRevision long no negativo, category código ASCII, severity entero 0..5 y zone código opcional. La unicidad global se decide por LWT antes de las proyecciones logged batch.

## Redis

Clave greenalert:zonas:public:v1:<revision>:<sha256>. Valor JSON de zonas o alertas agregadas; TTL obligatorio 300 segundos. revision BIGINT proviene de MySQL cache_generation. No hay claves con PII, tokens ni fuente de verdad exclusiva. Redis tiene AOF y volumen propio. Las claves antiguas expiran.

## Apache Druid

Datasource greenalert_events_v1. Origen: snapshot diario Cassandra enviado por Spring como JSON inline. Timestamp timestamp → __time ISO UTC. Dimensiones string: type, category, severity, zone. Medidas: events (count) y reportsCreated (longSum de created, 1 para REPORT_CREATED). QueryGranularity HOUR; segmentGranularity DAY; rollup true; reemplazo de intervalo diario, no append en replay. Índices/segmentos son administrados por Druid; el metastore MySQL auxiliar no sustituye la fuente Cassandra. Ejemplo: categoría agua, severidad 3, reportsCreated=1.
