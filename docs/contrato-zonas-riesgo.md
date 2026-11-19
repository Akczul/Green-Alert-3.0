# Contrato de zonas de riesgo antes de la extracción

Referencia previa: commit `a79b6ba`, revisado antes de modificar la implementación del piloto. La referencia ejecutable está en `apps/backend/tests/fixtures/zonas-riesgo/contrato.json`: resultados del servicio original con reloj fijo y filas sintéticas, no respuestas inventadas por la nueva implementación.

## Entrada HTTP

`GET /reportes/zonas-riesgo`, anteponiendo `API_PREFIX` (`/api` en la configuración vigente). Registro: `routes/reporte.routes.js`; controlador activo: `controllers/prediccion.controller.js`. Middleware: `verifyToken` y `requireRoles('admin', 'moderador')`. Sin token: 401; token inválido/expirado: 403; ciudadano o entidad: 403. El prefijo vacío también se conserva.

| Parámetro | Semántica original que se conserva |
| --- | --- |
| dias | Ausente, null o cadena vacía: 30; usa parseInt, acepta prefijos numéricos y trunca decimales; limita a 1..365; valor no numérico: 400 |
| tipo | Cadena no vacía: trim y minúsculas; otro tipo/vacío: null; no valida el catálogo |
| min_score | Ausente o cadena vacía: 30; conversión Number; rango finito 0..100; fuera de rango/no numérico: 400 |

Mensajes de validación exactos: `El parametro debe ser un entero entre 1 y 365.` y `min_score debe ser un numero entre 0 y 100.`. El límite temporal se calcula con Date.setDate en la zona horaria del proceso, conservando la hora del día.

## SQL y geografía

`ReporteModel.findParaPrediccion` selecciona id_reporte, tipo_contaminacion, subcategoria, estado, nivel_severidad, latitud, longitud, municipio, departamento y created_at. Condiciones: deleted_at nulo, coordenadas no nulas, estado en `en_proceso`/`resuelto`, created_at >= desde y categoría opcional exacta parametrizada. Orden created_at DESC, sin límite. No consulta autores ni POINT. El servicio solicita el doble de la ventana: desde = corte actual menos dias adicionales. No existe límite superior de fecha.

La clasificación usa las columnas decimales latitud/longitud: no intercambiar ejes ni sustituirlas por ST_X/ST_Y. La escritura existente de POINT con SRID 4326 y `axis-order=long-lat` queda intacta. No se necesitan cambios de esquema, índices, datos o procedimientos para esta lectura.

Cada eje se asigna con `floor(coordenada / 0.05) * 0.05`; ID con cuatro decimales y centro con seis. Se conserva floor para negativos, conversión Number y redondeo JS. El corte es inclusivo para el período actual; filas anteriores solo participan en la tendencia y no generan una zona sin filas actuales.

Score: min(100, round(n_actual * 16 + severidad_promedio * 14 + recencia_promedio)). Severidad: bajo=1, medio=2, alto=3, critico=4; desconocida=1. Recencia: max(0, 30 - max(0, días transcurridos)); fecha inválida equivale a 365 días. Niveles: critico>=80, alto>=60, medio>=35, bajo>=0. Tendencia por n_actual/n_previo: >=1.2 subiendo; <=0.8 bajando; resto estable; sin previos y con actuales: subiendo. Dominantes por frecuencia, con empates conservando la primera aparición. Orden final: score DESC, n_reportes DESC y orden estable para empates.

## Salida y errores

200: `{status:'success', message:'Zonas de riesgo obtenidas correctamente.', data:{actualizado_en, celda_grados:0.05, zonas:[...]}}`. Sin resultados: zonas vacía, con el mismo envelope y código 200.

Cada zona contiene exactamente: id, zona_id, centro `{lat,lng}`, tipo_dominante, subcategoria_dominante, municipio, departamento, n_reportes, n_reportes_previo, tendencia, severidad_promedio, ultimo_reporte, score y nivel. No incluye IDs de reportes, usuarios ni autores. Fechas de MySQL se serializan mediante el JSON habitual de Express.

El controlador entrega errores a next; el middleware global conserva `{status:'error',message}`, statusCode o 500 y el campo stack en desarrollo. No se convierte un error SQL en una lista vacía.

## Caché y dependencias

TTL 300000 ms; clave `zonas:` + JSON.stringify de dias, tipo y min_score, en ese orden; desde no participa. Se conserva el timestamp original del payload cacheado. Una entrada vence cuando expiresAt <= now. Zonas y alertas usan el mismo Map, con namespaces distintos. Crear o borrar reportes y cambiar estado/severidad vacía ambas; no ampliar silenciosamente esa política. Una operación en curso puede repoblar después de invalidar, como en el servicio original; no se incorpora control de concurrencia en esta extracción.

`calcularAlertasPredictivas` reutiliza zonas y sigue siendo heredado: nivel, distancia Haversine, radio, tipo y límite permanecen sin cambios. También lo consume chatbot-context. `ReporteModel.getZonasRiesgo` y las funciones homónimas de reporte.controller son implementaciones heredadas diferentes, no montadas en esta ruta: no confundirlas con el piloto ni migrarlas aquí.

Frontend: services/api.js usa Axios con baseURL `/api`; Dashboard carga zonas cuando admin/moderador activa la capa predictiva, enviando dias/min_score y leyendo data.data.zonas. ReportsMap consume centros/score/nivel del dashboard. Las alertas alimentan también los hooks y el chatbot. No se modifican pantallas, componentes ni rutas del cliente.
