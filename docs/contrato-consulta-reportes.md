# Contrato previo: lectura de reportes

Referencia: **6e6f5d1**, antes de extraer esta fase. Se migran exclusivamente `GET /reportes`, `/reportes/mis-reportes`, `/reportes/:id` y `/reportes/trending`, con el `API_PREFIX` vigente (/api). Las respuestas representativas se capturan contra MySQL aislado en `tests/fixtures/reportes-lectura/contrato.json` antes del refactor, con filas, reloj SQL y sujetos controlados.

## Listado general

`GET /reportes` usa optionalAuth: un JWT inválido se trata como anónimo. Para anónimo, ciudadano, admin y moderador: filtros exactos tipo_contaminacion, nivel_severidad y municipio; estado se normaliza (trim, minúsculas, espacios a `_`). Excluye deleted_at, **sin ocultar pendiente/rechazado**. Orden created_at DESC sin desempate adicional. No hay búsqueda de texto SQL, rango de fechas ni filtro geográfico en este endpoint: q/search/desconocidos se ignoran.

limit/offset por defecto 20/0. El controlador pasa Number al reader; SQL usa parseInt y clamp (limit 1..100, falsy/NaN→20; offset >=0, falsy/NaN→0). La metadata se calcula sobre el query original: `limit=1e2` puede leer 100 pero anunciar 1. No corregir esta diferencia en la extracción.

Para rol entidad: valida institución activa/dentro de alcance por id_entidad o entidad_id; sin institución válida: 403 `Usuario entidad sin entidad asignada.`. Delega a la consulta institucional y solo pasa categoría, severidad y paginación; estado/municipio no se aplican en esta rama. La forma de cada fila es institucional (asignacion y entidad anidadas), sin normalización IA ni liked_by_me añadida. Orden por prioridad critica/alta/media/baja y asignado_at DESC. La metadata proviene de esa consulta (limit=0 se limita a 1 allí).

200 `{status:'success',message:'ok',data:{reportes,total,limit,offset}}`. total corresponde a todos los resultados filtrados, no al tamaño de la página.

## Mis reportes

`GET /reportes/mis-reportes`: verifyToken; sin JWT 401, JWT inválido/expirado 403. Sin sub válido: 401 `No autorizado.`. Selecciona exclusivamente el autor sub, excluye borrado lógico y ordena created_at DESC. limit/offset Number y clamp SQL como listado. estado y nivel_severidad se recortan con trim, **sin** normalizar estado a guiones bajos. Parámetros de otros filtros se ignoran.

200 `{status:'success',message:'Reportes del usuario obtenidos correctamente.',data:{reportes,total}}`, sin metadata limit/offset. La proyección difiere del listado: no añade id_usuario, latitud/longitud ni liked_by_me; incorpora primera_imagen. Su subconsulta de primera imagen conserva el comportamiento heredado de no filtrar deleted_at de evidencia; el detalle sí excluye evidencias borradas. No corregirlo migrando el módulo de evidencias.

## Detalle

`GET /reportes/:id`: valida ID entero positivo y usa optionalAuth. Entidad debe tener institución activa/en alcance y asignación al reporte **antes** de consultar su existencia; sin asignación devuelve 403 `No tienes permiso para ver este reporte.`, incluso si el ID no existe. Con asignación, reporte inexistente/borrado devuelve 404 `Reporte no encontrado.`. Otros sujetos pueden leer cualquier reporte no borrado, como antes.

200 `{status:'success',message:'ok',data:{reporte,evidencias,autor}}`. Autor solo nombre, apellido, rol y avatar_url (null si falta); autor inexistente → null. Evidencias usan la lectura existente, orden por orden ASC/created_at ASC, excluyendo soft delete. El reporte añade comentario_moderacion y atención institucional derivada.

La lectura registra vista salvo `skip_view` exactamente `'true'`. Autenticado: usa registrarVistaUsuario existente (una por usuario/reporte si existe la tabla). Anónimo: throttle en memoria de cinco minutos por reporte+IP+User-Agent; se marca antes de incrementar. **La respuesta conserva el contador leído antes del incremento**. Este efecto se delegará por un puerto a los métodos de escritura heredados, sin reescribirlos ni crear un caso de escritura.

## Tendencias

`GET /reportes/trending`: optionalAuth, sin restricción institucional adicional. Solo limit: parseInt/clamp 1..50, default/falsy 12. Excluye borrado lógico; orden trending_score DESC, created_at DESC. Fórmula SQL original: votos*3 + vistas + max(0,30-TIMESTAMPDIFF(DAY,created_at,NOW())). No normaliza IA como los otros listados; solo convierte trending_score a Number. Otros filtros se ignoran.

200 `{status:'success',message:'Reportes en tendencia obtenidos correctamente.',data:{reportes,total}}`, total es longitud de la lista limitada. En listado/detalle/tendencias autenticados se añade liked_by_me mediante LikeModel.likedSet; anónimos conservan el objeto sin añadir ese campo. Mis reportes no lo añade.

## Proyecciones, errores y fronteras

Los listados generales/detalle/mis reportes normalizan ia_etiquetas (JSON inválido→[]), ia_confianza y confianza_evidencia a Number/null, y ia_procesado a boolean; no normalizan coordenadas (decimales textuales de mysql2). Atención responsable sigue priorizando en_atencion sobre atendido y cerrado. Los SELECT conservan campos, joins, subconsultas, parámetros y orden. No se reinterpretan POINT ni ejes; la escritura `axis-order=long-lat` queda intacta.

Errores pasan a next/errorHandler: statusCode o 500, `{status:'error',message}`, y stack en desarrollo. Se conservan coerciones y errores por tipos inesperados (por ejemplo arrays en un filtro que usa trim), sin introducir validación nueva.

Fuera de alcance: exportación XLSX/JSON, estadísticas, GET de evidencias, categorías/:codigo/reportes, consultas propias del módulo de entidades, escrituras, moderación, asignación y zonas. Sus consumidores del modelo conservarán métodos delegados compatibles; no se extraerán esos controladores.

Frontend: Reports (listado, filtros y búsqueda local), ReportDetail (skip_view), Profile, Dashboard, Moderacion, Trending, DescargarDatos y useUbicacionUsuario. Axios sigue usando baseURL /api. No se cambia React, sus filtros locales, ordenamientos visuales ni rutas.
