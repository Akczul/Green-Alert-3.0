-- Vínculos de identidad federada OIDC (Microsoft Entra ID y otros). Aditiva; usa DATABASE().
-- La identidad externa se identifica por (provider, subject); el rol se asigna en GreenAlert.
CREATE TABLE IF NOT EXISTS federated_identities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  email VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_federated_provider_subject (provider, subject),
  UNIQUE KEY uq_federated_provider_user (provider, id_usuario),
  CONSTRAINT fk_federated_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
