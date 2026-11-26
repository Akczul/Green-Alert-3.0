# Tecnologías y dependencias

Declaraciones y resoluciones de los lockfiles. No se actualizaron los rangos de las bibliotecas originales. El backend original no tenía lockfile: sus resoluciones corresponden a esta consolidación.

## backend: green-alert-backend 1.0.0

| Dependencia | Rango original | Resolución | Tipo |
| --- | --- | --- | --- |
| `cloudinary` | `^1.41.0` | 1.41.3 | dependencies |
| `cors` | `^2.8.5` | 2.8.6 | dependencies |
| `dotenv` | `^16.4.5` | 16.6.1 | dependencies |
| `exceljs` | `^4.4.0` | 4.4.0 | dependencies |
| `express` | `^4.19.2` | 4.22.3 | dependencies |
| `express-rate-limit` | `^8.4.1` | 8.7.5 | dependencies |
| `google-auth-library` | `^10.6.2` | 10.9.1 | dependencies |
| `helmet` | `^7.1.0` | 7.2.0 | dependencies |
| `jsonwebtoken` | `^9.0.2` | 9.0.3 | dependencies |
| `multer` | `^2.1.1` | 2.5.0 | dependencies |
| `mysql2` | `^3.9.8` | 3.24.6 | dependencies |
| `nodemailer` | `^8.0.5` | 8.0.11 | dependencies |
| `redis` | `^5.12.4` | 5.12.4 | dependencies |
| `socket.io` | `^4.8.3` | 4.8.4 | dependencies |
| `nodemon` | `^3.1.3` | 3.1.14 | devDependencies |

## frontend: green-alert-frontend 0.1.0

| Dependencia | Rango original | Resolución | Tipo |
| --- | --- | --- | --- |
| `@react-oauth/google` | `^0.13.5` | 0.13.5 | dependencies |
| `axios` | `^1.7.2` | 1.13.6 | dependencies |
| `browser-image-compression` | `^2.0.2` | 2.0.2 | dependencies |
| `firebase` | `12.13.0` | 12.13.0 | dependencies |
| `jspdf` | `^4.2.1` | 4.2.1 | dependencies |
| `jspdf-autotable` | `^5.0.7` | 5.0.7 | dependencies |
| `leaflet` | `^1.9.4` | 1.9.4 | dependencies |
| `leaflet.heat` | `^0.2.0` | 0.2.0 | dependencies |
| `lucide-react` | `^0.577.0` | 0.577.0 | dependencies |
| `motion` | `^12.38.0` | 12.38.0 | dependencies |
| `react` | `^18.3.1` | 18.3.1 | dependencies |
| `react-dom` | `^18.3.1` | 18.3.1 | dependencies |
| `react-easy-crop` | `^5.5.7` | 5.5.7 | dependencies |
| `react-leaflet` | `^4.2.1` | 4.2.1 | dependencies |
| `react-leaflet-cluster` | `^2.1.0` | 2.1.0 | dependencies |
| `react-router-dom` | `^6.23.1` | 6.30.3 | dependencies |
| `@eslint/js` | `^10.0.1` | 10.0.1 | devDependencies |
| `@testing-library/dom` | `^10.4.1` | 10.4.1 | devDependencies |
| `@testing-library/jest-dom` | `^6.9.1` | 6.9.1 | devDependencies |
| `@testing-library/react` | `^16.3.2` | 16.3.2 | devDependencies |
| `@testing-library/user-event` | `^14.6.1` | 14.6.1 | devDependencies |
| `@types/react` | `^18.3.3` | 18.3.28 | devDependencies |
| `@types/react-dom` | `^18.3.0` | 18.3.7 | devDependencies |
| `@vitejs/plugin-react` | `^4.3.1` | 4.7.0 | devDependencies |
| `@vitest/coverage-v8` | `^4.1.7` | 4.1.7 | devDependencies |
| `autoprefixer` | `^10.4.19` | 10.4.27 | devDependencies |
| `eslint` | `^10.4.0` | 10.4.0 | devDependencies |
| `eslint-plugin-react` | `^7.37.5` | 7.37.5 | devDependencies |
| `eslint-plugin-react-hooks` | `^7.1.1` | 7.1.1 | devDependencies |
| `jsdom` | `^29.1.1` | 29.1.1 | devDependencies |
| `postcss` | `^8.4.38` | 8.5.15 | devDependencies |
| `tailwindcss` | `^3.4.4` | 3.4.19 | devDependencies |
| `vite` | `^5.3.1` | 5.4.21 | devDependencies |
| `vitest` | `^4.1.7` | 4.1.7 | devDependencies |

Herramientas: JavaScript ESM en ambos proyectos; React JSX; Vite; Tailwind y PostCSS; node:test en backend; Vitest y Testing Library en frontend; ESLint en frontend. Backend ejecutado directamente por Node, sin TypeScript ni compilador. MySQL real: versión del servidor original no determinada; el entorno local propuesto usa MySQL 8.4.

Runtime original de Docker/CI: Node 20. Runtime consolidado de referencia: Node 24; `.nvmrc`, Docker y CI alineados. Node 20 está fuera de soporte según [Node.js Releases](https://nodejs.org/en/about/previous-releases). Validación local realizada en Node 26.13.0/npm 11.20.0; la fase SQL construyó y ejecutó el stack Docker con imágenes Node 24. La CI remota sigue sin ejecutarse. `apps/frontend/.npmrc` conserva `legacy-peer-deps=true` por la resolución existente de ESLint/plugins.
