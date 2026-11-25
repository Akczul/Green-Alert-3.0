export const NIVELES_SEVERIDAD_PERMITIDOS = [
  'bajo',
  'medio',
  'alto',
  'critico',
];

export const ESTADO_INICIAL_REPORTE = 'pendiente';
export class CrearReporteError extends Error {}

export const parseCoordinate = (value, { field, min, max }) => {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return {
      error: `${field} debe ser un numero valido.`,
    };
  }

  if (parsed < min || parsed > max) {
    return {
      error: `${field} debe estar entre ${min} y ${max}.`,
    };
  }

  return { value: parsed };
};

export const normalizeEnumValue = (value) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

export const buildAllowedValuesMessage = (field, allowedValues) => (
  `${field} debe ser uno de: ${allowedValues.join(', ')}.`
);

const parseBooleanLike = (value) => (
  value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true'
);

export const parseAcceptedIaPayload = ({ ia_etiquetas, ia_confianza, ia_procesado }) => {
  if (!parseBooleanLike(ia_procesado)) {
    return { procesado: false };
  }

  let etiquetas = [];
  if (typeof ia_etiquetas === 'string') {
    try {
      etiquetas = JSON.parse(ia_etiquetas);
    } catch {
      return { error: 'ia_etiquetas debe ser un arreglo JSON valido.' };
    }
  } else {
    etiquetas = ia_etiquetas ?? [];
  }

  if (!Array.isArray(etiquetas)) {
    return { error: 'ia_etiquetas debe ser un arreglo.' };
  }

  const confianza = Number(ia_confianza);
  if (!Number.isFinite(confianza) || confianza < 0 || confianza > 100) {
    return { error: 'ia_confianza debe ser un numero entre 0 y 100.' };
  }

  return {
    procesado: true,
    analysis: {
      etiquetas,
      confianza,
      procesado: true,
    },
  };
};

export const validarCamposRequeridos = ({ tipo_contaminacion, nivel_severidad, titulo, direccion }) => {
    if (!tipo_contaminacion?.trim()) {
      throw new CrearReporteError('El tipo de contaminación es requerido.');
    }
    if (!nivel_severidad?.trim()) {
      throw new CrearReporteError('El nivel de severidad es requerido.');
    }
    if (!titulo?.trim() || titulo.trim().length < 5) {
      throw new CrearReporteError('El título debe tener al menos 5 caracteres.');
    }
    if (!direccion?.trim() || direccion.trim().length < 3) {
      throw new CrearReporteError('La dirección es requerida.');
    }

 };

export const validarCantidadEvidencias = (files) => {
  if (files.length > 10) return 'Solo puedes adjuntar hasta 10 evidencias por reporte.';
  if (files.filter((file) => file.mimetype?.startsWith('video/')).length > 1) return 'Solo puedes adjuntar un video por reporte.';
  return null;
};
