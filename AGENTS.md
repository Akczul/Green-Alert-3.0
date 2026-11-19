# Convenciones de trabajo para GreenAlert

## Alcance y arquitectura actual

- Este repositorio consolida Green-Alert/Backend y Green-Alert/Frontend. Los SHA de origen están en `docs/procedencia.md`; ambos historiales son ancestros de `main`.
- Backend: JavaScript ESM, Express 4, `mysql2/promise`, SQL explícito. Rutas en `apps/backend/routes`, middleware en `middlewares`, controladores/modelos/servicios en `src`.
- Frontend: React 18 JSX, Vite 5, React Router 6, Tailwind 3, Axios, Leaflet, Firebase. Mantener las pantallas y los componentes originales.
- No hay NestJS, gateway distribuido ni microservicios. No describir como hexagonal la implementación actual. La propuesta está en `docs/arquitectura-objetivo.md`.
- Instalaciones independientes por aplicación. No introducir workspaces, hoisting ni otro gestor sin justificar cómo se preservan los lockfiles y contratos.

## Contratos y convenciones

- Mantener rutas, métodos, formatos JSON, códigos HTTP y eventos existentes. Axios usa `/api`; la configuración local fija `API_PREFIX=/api`. El backend sin variable conserva rutas sin prefijo.
- Respuesta habitual `{status, message, data}`; los errores omiten `data`; health tiene su propio formato. Respetar las excepciones actuales.
- Roles: `ciudadano`, `moderador`, `admin`, `entidad`. Verificar propiedad y alcance institucional en el backend, además de controles visuales.
- Estados de reporte: `pendiente`, `en_proceso`, `resuelto`, `rechazado`; conservar normalización de `en proceso`. Atención institucional es otro ciclo: `pendiente`, `en_atencion`, `atendido`, `cerrado`.
- Conservar `deleted_at`, paginación, UUID, normalizaciones, nombres multipart y formato de sesiones. No cambiar almacenamiento de tokens silenciosamente.
- No reconstruir el frontend, convertir a TypeScript o migrar a NestJS como efecto secundario de la auditoría. No instalar nuevas bases ni ML sin una tarea que autorice esa fase.
- Mantener comentarios y documentación en español. Preferir cambios pequeños, sin formatear masivamente fuentes importadas.

## Comandos desde la raíz

```sh
npm run install:apps       # npm ci de cada aplicación
npm run setup              # .env locales sin sobrescribir
npm run dev                # ambos procesos; Ctrl+C para detener
npm run build              # sintaxis backend y bundle frontend
npm run lint               # ESLint del frontend, cero warnings
npm test                   # node:test backend + Vitest frontend
npm run test:smoke         # HTTP/proxy real; sin persistencia
npm run infra:config       # validar Compose sin exponer variables
npm run docs:inventory     # regenerar endpoints/dependencias/nombres de variables
```

Node de referencia: 24. Ver `docs/verificacion.md` antes de afirmar qué entornos fueron comprobados. Backend no tiene compilador ni lint propio. Las suites legacy/SMTP/remotas requieren revisión previa y no forman parte de `npm test`.

## Datos, credenciales e historial

- No modificar los repositorios originales ni hacer push sin instrucción del usuario. No configurar publicación automática como parte de cambios locales.
- No guardar `.env`, claves privadas, certificados, datos personales, uploads ni volcados de producción. No imprimir valores al diagnosticar; mostrar nombres de variables y rutas.
- El esquema completo solo inicializa una base nueva. Las migraciones históricas no se ejecutan automáticamente. No ejecutar el esquema o cambios destructivos sobre datos existentes.
- `dist`, caché npm y repomix permanecen recuperables en el historial importado y quedan fuera del seguimiento actual. `apps/backend/Frontend` es una copia histórica, **no el frontend activo**. Las pruebas de contrato deben usar `apps/frontend`.
- No crear `.git` anidados, submódulos o dependencias entre carpetas que requieran enlaces simbólicos en Windows.

## Verificación y evolución

- Antes de terminar: ejecutar los checks pertinentes, informar fallos y límites. No confundir sintaxis, pruebas con dobles y disponibilidad real de MySQL.
- No borrar pruebas o reducir aserciones para obtener verde. Comparar el cliente activo con las rutas Express y mantener el inventario.
- Si se autoriza una extracción hexagonal: el dominio y los casos de uso no importan Express, mysql2, SDK de proveedores, modelos estáticos ni `process.env`; reciben puertos por constructor/fábrica. Los adaptadores implementan esos puertos y se ensamblan en un composition root.
- No crear un contenedor de inyección o un bus distribuido antes de necesitarlos. JavaScript y fábricas explícitas permiten una extracción inicial pequeña.
- No afirmar que FCM, EXIF, clasificación remota, SQL de arranque o contenedores funcionan sin verificarlos: hay limitaciones heredadas documentadas.
