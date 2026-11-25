# Aceptación Android y trazabilidad

Fuente: instructivo oficial `Programación_avanzada-Instructivo_proyecto_final_2026-2.pdf`, páginas 1–3 y 5–7, leído del repositorio original en `docs/requisitos`. Ese PDF todavía no figuraba en el checkout inicial de esta rama; no se copió ni modificó documentación compartida. Esta matriz cubre el aporte móvil; no certifica el proyecto completo.

| Requisito | Caso / implementación | Comprobación automatizada | Evidencia pendiente |
| --- | --- | --- | --- |
| M-01 Cliente móvil instalable conectado a API (p. 1–2) | Expo/RN, configuración pública y script APK | Bundle, prebuild, Expo Doctor y validación de URL | Compilar, instalar APK y consumir API real |
| M-02 Acceso y registro locales (p. 3, 5) | AuthScreen y adaptador de auth | API, validación y pantallas | Alta/login contra datos sintéticos y SMTP reales |
| M-03 Sesión segura (p. 3) | SecureStore, renovación/rotación, logout remoto | Expiración, concurrencia de refresh, logout fallido/exitoso | Android Keystore, reinicio y revocación en API desplegada |
| M-04 Alcance por rol/objeto (p. 3, 5) | Navegación por roles actuales; entidad usa alcance servidor | Rechazo 403, rutas protegidas y navegación de entidad | Intentar objetos de otra entidad en API real; roles finales de seguridad |
| M-05 Consulta y creación reales (p. 5) | Listados, detalle, formulario multipart | Paginación, campos, payload y confirmación | Leer/escribir y comprobar persistencia en servidor |
| M-06 Cámara/GPS con consentimiento | ImagePicker/Location bajo acción explícita | Denegación de permisos sin inventar valores | Fotos y coordenadas obtenidas de un teléfono |
| M-07 Estados y accesibilidad (p. 5) | Carga, error, vacío, confirmación, etiquetas y controles 48 | Componentes y guardia de doble pulsación | TalkBack, teclado, orientación, fuentes grandes y capturas verificables |
| M-08 Marca común y documentación (p. 5–7) | Logotipo, verdes, Inter y guía visual | Recursos incluidos en bundle | Comparación capturada de la misma tarea web/móvil |
| M-09 Al menos 10 pruebas (p. 2, 6) | Suite móvil automatizada | Ver resultado vigente en verificacion.md | Las pruebas con dobles no sustituyen M-01/M-05/M-06 |
| S-01 Dos proveedores OIDC, MFA admin y política completa (p. 3) | Pendiente del refuerzo de seguridad; contrato aislado | No acreditado ni simulado | Flujos reales y contrato móvil final |
| S-02 Caducidad por inactividad/absoluta y revocación (p. 3) | Cliente renueva/revoca según API actual | Rechazo/renovación probados con dobles | Verificar garantías del servidor y JWT ya emitidos |

## Recorrido obligatorio en teléfono (sin marcar como realizado)

Preparación: API real de evaluación con datos sintéticos y cuentas de ciudadano, moderador, admin y dos entidades de ámbitos diferentes. No usar datos personales de producción. APK propia con URL correcta y hash registrado. Confirmar que funciona sin Metro.

1. Instalar APK en Android API 24 o superior; anotar modelo, Android, versión, commit, SHA-256 y URL pública de evaluación (sin credenciales).
2. Registro con correo de prueba; mostrar validaciones, recuperación de error y confirmación. Verificar OTP real. Si SMTP falla, registrar el límite sin fingir verificación.
3. Login local correcto/incorrecto; consultar reportes y detalle. Lista vacía con una cuenta de prueba sin reportes. Comprobar siguiente página y regreso físico.
4. Denegar ubicación/cámara y comprobar explicación. Concederlas al reintentar; obtener GPS real y foto real. Probar también el selector del sistema y quitar evidencia.
5. Crear reporte; pulsar dos veces rápidamente y comprobar una sola solicitud. Ver confirmación; abrir Mis reportes y detalle. Comprobar campos/coordenadas/evidencia en API persistida.
6. Desactivar red: consultar y enviar deben mostrar error, sin cola ni confirmación falsa. Restaurar red y reintentar. Si hubo timeout de alta, comprobar Mis reportes antes de repetir.
7. Reiniciar app: recuperar perfil con tokens desde SecureStore. Forzar expiración de acceso en entorno de prueba y comprobar rotación en servidor; revocar refresh y verificar retorno al acceso.
8. Logout con conexión: confirmar invalidación de refresh en API y ausencia de sesión al reiniciar. Logout sin conexión: mostrar fallo, reconectar y completar revocación. No presentar el fallo como logout remoto exitoso.
9. Entidad A: ver solo asignados; intentar detalle de entidad B directamente contra API con identidad A y comprobar 403. Usuario común: intentar acción administrativa y objeto ajeno. La prueba de autorización debe ejecutarse en backend, no solo mirar botones.
10. Verificar TalkBack, contraste, foco del teclado, rotación, áreas seguras, tamaño de texto grande y selección sin depender solo del color. Capturar pantallas reales de carga/error/vacío/éxito y la misma tarea web/móvil; numerarlas y describir fuente.

Guardar evidencia sanitizada (sin tokens, correos reales, ubicaciones personales ni claves) en la entrega acordada. Hasta que se complete este recorrido, la aceptación final y el cumplimiento integral del instructivo siguen pendientes.
