// Mantiene el payload y la compensación del almacenamiento existentes.
export const createEvidenceStorage = ({ uploadFileBuffer, deleteFileByPublicId, validateUploadedFilesContent }) => {
  const getEvidenceTypeFromFile = (file) => (
    file.mimetype?.startsWith('video/') ? 'video' : 'imagen'
  );

  const getCloudinaryResourceType = (file, uploadResult) => (
    uploadResult.resource_type || (file.mimetype?.startsWith('video/') ? 'video' : 'image')
  );

  const buildCloudinaryMetadata = (uploadResult) => ({
    asset_id: uploadResult.asset_id ?? null,
    public_id: uploadResult.public_id ?? null,
    resource_type: uploadResult.resource_type ?? null,
    format: uploadResult.format ?? null,
    bytes: uploadResult.bytes ?? null,
    width: uploadResult.width ?? null,
    height: uploadResult.height ?? null,
    duration: uploadResult.duration ?? null,
    version: uploadResult.version ?? null,
    created_at: uploadResult.created_at ?? null,
  });

  const uploadEvidenceToCloudinary = async (file, {
    idReporte,
    idUsuario,
    orden,
    hashSha256 = null,
  }) => {
    const uploadResult = await uploadFileBuffer({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    return {
      uploadResult,
      evidencia: {
        id_reporte: idReporte,
        id_usuario: idUsuario,
        tipo_archivo: getEvidenceTypeFromFile(file),
        url_archivo: uploadResult.secure_url,
        nombre_original: file.originalname,
        mime_type: file.mimetype,
        tamano_bytes: file.size,
        hash_sha256: hashSha256,
        storage_provider: 'cloudinary',
        cloudinary_public_id: uploadResult.public_id,
        cloudinary_asset_id: uploadResult.asset_id ?? null,
        cloudinary_resource_type: getCloudinaryResourceType(file, uploadResult),
        cloudinary_metadata: buildCloudinaryMetadata(uploadResult),
        orden,
      },
    };
  };

  const cleanupCloudinaryUploads = async (uploads) => {
    await Promise.allSettled(
      uploads
        .filter((upload) => upload?.public_id)
        .map((upload) => deleteFileByPublicId(upload.public_id, {
          resourceType: upload.resource_type || 'image',
        }))
    );
  };

  return { upload: uploadEvidenceToCloudinary, cleanup: cleanupCloudinaryUploads, validateContent: validateUploadedFilesContent };
};
