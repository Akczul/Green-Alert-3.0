import { CrearReporteError, NIVELES_SEVERIDAD_PERMITIDOS, parseCoordinate, normalizeEnumValue, buildAllowedValuesMessage, parseAcceptedIaPayload, validarCamposRequeridos, validarCantidadEvidencias } from '../domain/validaciones.js';

/** @param {import('./ports.js').CrearReporteDependencies} dependencies */
export const createCrearReporte = ({ reportes, categorias, evidencias, archivos, analisis, efectos, logger }) => {
  const rollbackCreatedReporte = async (idReporte, cloudinaryUploads = []) => {
    const results = await Promise.allSettled([
      archivos.cleanup(cloudinaryUploads),
      idReporte ? reportes.remove(idReporte) : Promise.resolve(),
    ]);

    results
      .filter((result) => result.status === 'rejected')
      .forEach((result) => {
        logger.error('[reportes] rollback parcial fallido:', result.reason?.message || result.reason);
      });
  };

  return async ({ body, user, files = [] }) => {
    const {
      tipo_contaminacion,
      nivel_severidad,
      subcategoria,
      titulo,
      descripcion,
      direccion,
      municipio,
      departamento,
      ia_etiquetas,
      ia_confianza,
      ia_procesado,
      latitud,
      longitud,
    } = body ?? {};

    validarCamposRequeridos({ tipo_contaminacion, nivel_severidad, titulo, direccion });

    const tipoContaminacion = tipo_contaminacion.trim().toLowerCase();
    const nivelSeveridad = normalizeEnumValue(nivel_severidad);
    const uploadedFiles = files;
    const evidenceError = validarCantidadEvidencias(uploadedFiles) || archivos.validateContent(uploadedFiles);
    const iaPayload = parseAcceptedIaPayload({ ia_etiquetas, ia_confianza, ia_procesado });

    if (evidenceError) {
      throw new CrearReporteError(evidenceError);
    }

    if (iaPayload.error) {
      throw new CrearReporteError(iaPayload.error);
    }

    if (!NIVELES_SEVERIDAD_PERMITIDOS.includes(nivelSeveridad)) {
      throw new CrearReporteError(buildAllowedValuesMessage('El nivel de severidad', NIVELES_SEVERIDAD_PERMITIDOS));
    }

    const categoriaValida = await categorias.esValido(tipoContaminacion);

    if (!categoriaValida) {
      throw new CrearReporteError('La categoría de contaminación no existe o está inactiva.');
    }

    const parsedLatitud = parseCoordinate(latitud, {
      field: 'La latitud',
      min: -90,
      max: 90,
    });

    if (parsedLatitud.error) {
      throw new CrearReporteError(parsedLatitud.error);
    }

    const parsedLongitud = parseCoordinate(longitud, {
      field: 'La longitud',
      min: -180,
      max: 180,
    });

    if (parsedLongitud.error) {
      throw new CrearReporteError(parsedLongitud.error);
    }

    const scoreEvidencias = await analisis.score(uploadedFiles, nivelSeveridad);
    const hashesEvidencias = new Map(
      scoreEvidencias.evidencias.map((item, index) => [index, item.hash_sha256])
    );

    const cloudinaryUploads = [];
    let idReporte = null;
    let reporte = null;

    try {
      idReporte = await reportes.create({
        id_usuario:       user.sub,
        tipo_contaminacion: tipoContaminacion,
        subcategoria:        subcategoria?.trim() || null,
        nivel_severidad:    nivelSeveridad,
        titulo:             titulo.trim(),
        descripcion:        descripcion?.trim() || null,
        direccion:          direccion.trim(),
        municipio:          municipio?.trim() || null,
        departamento:       departamento?.trim() || null,
        latitud:            parsedLatitud.value,
        longitud:           parsedLongitud.value,
        confianza_evidencia: scoreEvidencias.score,
      });

      reporte = await reportes.findById(idReporte);

      let iaAnalysis;
      if (iaPayload.procesado) {
        iaAnalysis = iaPayload.analysis;
      } else {
        iaAnalysis = analisis.analizar({
          ...reporte,
          tipo_contaminacion: tipoContaminacion,
          nivel_severidad: nivelSeveridad,
          titulo: titulo.trim(),
          descripcion: descripcion?.trim() || null,
          direccion: direccion.trim(),
          municipio: municipio?.trim() || null,
          departamento: departamento?.trim() || null,
          latitud: parsedLatitud.value,
          longitud: parsedLongitud.value,
        });
      }

      await reportes.updateIaAnalysis(idReporte, iaAnalysis);
      reporte = await reportes.findById(idReporte);

      for (const [index, file] of uploadedFiles.entries()) {
        const { uploadResult, evidencia } = await archivos.upload(file, {
          idReporte,
          idUsuario: user.sub,
          hashSha256: hashesEvidencias.get(index) ?? null,
          orden: index,
        });

        cloudinaryUploads.push(uploadResult);
        await evidencias.create(evidencia);
      }
    } catch (error) {
      await rollbackCreatedReporte(idReporte, cloudinaryUploads);
      throw error;
    }

    try {
      await efectos.asignar(reporte);
    } catch (error) {
      logger.error('[asignacion-entidades] no se pudo asignar reporte:', error.message);
    }

    efectos.invalidateCache();
    return { reporte };
  };
};
