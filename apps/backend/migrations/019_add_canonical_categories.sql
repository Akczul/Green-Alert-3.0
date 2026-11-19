-- Añade los codigos usados por React y el fallback del backend.
-- No renombra, desactiva ni elimina categorias o reportes existentes.
-- Sin IDs fijos: se respeta la identidad de cualquier catalogo previo.
INSERT IGNORE INTO categorias_riesgo
  (codigo, nombre, descripcion, icono, color_hex, nivel_prioridad_default, activo)
VALUES
  ('agua', 'Contaminacion de Agua', 'Contaminacion del recurso hidrico', 'droplet', '#3B82F6', 3, TRUE),
  ('aire', 'Contaminacion del Aire', 'Presencia de contaminantes atmosfericos', 'wind', '#6B7280', 2, TRUE),
  ('suelo', 'Contaminacion del Suelo', 'Degradacion o contaminacion del suelo', 'leaf', '#84CC16', 2, TRUE),
  ('ruido', 'Contaminacion por Ruido', 'Exceso de ruido ambiental', 'volume2', '#A855F7', 2, TRUE),
  ('residuos', 'Residuos y Desechos', 'Disposicion incorrecta de residuos', 'trash2', '#EF4444', 2, TRUE),
  ('luminica', 'Contaminacion Luminica', 'Exceso de iluminacion artificial', 'lightbulb', '#F59E0B', 1, TRUE),
  ('deforestacion', 'Deforestacion', 'Tala o perdida de cobertura forestal', 'trees', '#22C55E', 3, TRUE),
  ('incendios_forestales', 'Incendios Forestales', 'Fuegos en bosques o vegetacion', 'flame', '#DC2626', 4, TRUE),
  ('deslizamientos', 'Deslizamientos', 'Movimientos de masa en laderas', 'mountain', '#92400E', 4, TRUE),
  ('avalanchas_fluviotorrenciales', 'Avalanchas Fluviotorrenciales', 'Crecidas subitas de rios y quebradas', 'waves', '#0EA5E9', 4, TRUE),
  ('otro', 'Otro', 'Otros tipos de riesgo ambiental', 'helpCircle', '#6B7280', 1, TRUE);
