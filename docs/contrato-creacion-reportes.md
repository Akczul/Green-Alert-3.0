# Contrato previo de creación de reportes

Referencia **2a4946b**, documentada antes de modificar fuentes del backend. Endpoint `POST /reportes`, con `API_PREFIX` vigente (`/api` local). `verifyToken` precede a `uploadMultiple` y al controlador. Cualquier rol con JWT válido puede crear; no hay requireRoles. Sin token: 401; token inválido: 403. El autor procede exclusivamente de `user.sub`, no del body.

## Entrada y validaciones en orden

JSON o multipart. Archivos en memoria: `file` (máximo uno) y `files` (máximo diez); máximo conjunto diez y un video. Multer conserva MIME, tamaño máximo configurado y comprobación de firmas, antes del controlador. No se requieren evidencias. Se conservan errores originales de Multer y del middleware.

1. tipo_contaminacion y nivel_severidad requeridos mediante trim. Título mínimo cinco caracteres tras trim; dirección mínima tres. Descripción, subcategoría, municipio y departamento opcionales, trim o null.
2. Categoría a minúsculas; severidad trim/minúsculas. Validación de cantidad/videos/contenido de archivos; parseo de IA; errores de evidencias tienen precedencia sobre errores devueltos por el parseo IA.
3. IA aceptada solo con ia_procesado boolean-like true/1/'1'/'true'; etiquetas deben ser arreglo o JSON de arreglo y confianza Number finito 0..100. Sin bandera se ignoran etiquetas/confianza y se ejecuta el análisis heurístico existente. No se añade ML.
4. Severidad debe ser bajo/medio/alto/critico. Categoría debe estar activa en el catálogo existente (incluido su fallback). Luego latitud Number finito -90..90 y longitud -180..180; ausencia/null/'' → null. Se mantienen coerciones y errores de tipos inesperados, sin validaciones nuevas.
5. Score/hash de evidencias existente, antes de escribir. Su acción de moderación no se utiliza para cambiar el estado: siempre pendiente.

## Persistencia y efectos

Secuencia original: INSERT reporte → SELECT reporte → análisis aceptado o heurístico → UPDATE IA → SELECT reporte → por cada archivo upload Cloudinary y INSERT evidencia en orden → asignación automática heredada → invalidación de caché compartida de zonas/alertas → HTTP 201.

El INSERT genera UUID, estado pendiente y confianza_evidencia. Si hay ambas coordenadas crea POINT(longitud latitud), SRID 4326 con `axis-order=long-lat`. Con una coordenada ausente persiste ambas a null y no crea punto, igual que antes. El SELECT reutiliza la lectura hexagonal y sus normalizaciones. La respuesta contiene el snapshot anterior a las asignaciones y no incluye evidencias.

Archivos: URL segura, hash, tipo imagen/video, tamaño, nombre, orden, storage_provider cloudinary e identificadores/metadatos del proveedor. Se registra cada upload **antes** del INSERT de evidencia para poder limpiarlo si falla SQL.

La asignación sigue en su servicio original: puede escribir asignaciones y notificaciones, generar alertas y emitir Socket.IO. Su fallo se registra y no impide 201 ni invalida la creación. Estadísticas no tienen escritura adicional: consultan las tablas actuales. La invalidación sucede después del intento de asignación, solo en el camino de éxito.

## Atomicidad y compensación existentes

No hay beginTransaction/commit/rollback en este flujo. Cada sentencia SQL tiene autocommit. El bloque de compensación abarca INSERT/lecturas/análisis/IA/uploads/evidencias. Ante error intenta en paralelo limpieza de uploads conocidos (Promise.allSettled) y ReporteModel.remove (borrado lógico). Propaga el error original; no borra físicamente reportes ni evidencias. Un fallo antes de obtener insertId no ejecuta remove.

Límites que la extracción debe conservar y documentar: evidencias ya insertadas pueden quedar asociadas a un reporte borrado; fallos de cleanup Cloudinary se absorben; un fallo de remove se registra; una asignación puede quedar parcial. No existe garantía atómica global ni garantía de limpieza remota ante indisponibilidad. Los lectores normales excluyen el reporte compensado. No introducir una transacción alrededor de HTTP remoto ni anunciar atomicidad inexistente. Una transacción SQL de reporte/IA/evidencias y cambios de política de compensación requieren otra decisión de compatibilidad; no modificar silenciosamente esos resultados persistidos.

## Salidas, cliente y caracterización

201 `{status:'success',message:'Reporte creado correctamente.',data:{reporte}}`. Errores de validación: 400 `{status:'error',message}` con texto original; errores de infraestructura a next/errorHandler (statusCode o 500). Sin cambio de envoltorios, proyecciones o estado inicial.

Cliente activo: `components/FormularioReporte.jsx` construye FormData (files e IA aceptada); `services/api.js#createReporte` hace POST /reportes con timeout 60000. Sin cambios de React.

La captura previa se guarda en `tests/fixtures/reportes-creacion/contrato.json`, usando Express/middleware y MySQL aislado, reloj SQL fijo, usuarios/filas sintéticos y un doble explícito del cliente Cloudinary. Se comparan status/JSON, filas persistidas, geografía, caché y uploads/limpiezas. Solo se canonizan UUID y el nombre aleatorio de la base temporal en errores; se preservan valores, estructura, orden, fechas y contadores. Los fallos de SQL se inyectan en el pool sobre las sentencias correspondientes. Los proveedores externos reales no se acreditan con esta captura.
