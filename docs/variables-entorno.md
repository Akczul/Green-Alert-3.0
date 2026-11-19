# Variables de entorno detectadas

Generadas desde referencias literales en código; incluye variables exclusivas de pruebas. Se omiten los valores. Los ejemplos de configuración están en `.env.example` y en cada aplicación.

## backend

- `API_PREFIX`
- `API_PUBLIC_URL`
- `API_URL`
- `APP_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_AVATAR_FOLDER`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_FOLDER`
- `CORS_ORIGIN`
- `DB_HOST`
- `DB_NAME`
- `DB_PASSWORD`
- `DB_PORT`
- `DB_SSL`
- `DB_SSL_CA`
- `DB_SSL_CA_PATH`
- `DB_SSL_REJECT_UNAUTHORIZED`
- `DB_USER`
- `EMAIL_FROM`
- `EMAIL_HOST`
- `EMAIL_PASS`
- `EMAIL_PORT`
- `EMAIL_TEST_TO`
- `EMAIL_TRANSPORT`
- `EMAIL_USER`
- `ENABLE_EXIF_IN_TESTS`
- `EXIF_MAX_HORAS`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_CALLBACK_RESPONSE`
- `FACEBOOK_CALLBACK_URL`
- `FACEBOOK_GRAPH_API_VERSION`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FRONTEND_URL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GOOGLE_CALLBACK_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `HF_API_KEY`
- `HF_IMAGE_MODEL`
- `JWT_EXPIRES_IN`
- `JWT_SECRET`
- `MAX_FILE_SIZE`
- `NODE_ENV`
- `NODE_TEST_CONTEXT`
- `OAUTH_CALLBACK_CODE_TTL_SECONDS`
- `OAUTH_STATE_TTL_SECONDS`
- `PORT`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_LOGIN_MAX`
- `RATE_LIMIT_PASSWORD_RESET_MAX`
- `REFRESH_TOKEN_EXPIRES_DAYS`
- `TEST_EMAIL`
- `UPLOAD_DIR`

## frontend

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_VAPID_KEY`
- `VITE_GITHUB_CLIENT_ID`
- `VITE_GOOGLE_CLIENT_ID`

Arranque backend: configurar MySQL y JWT; la validación de correo exige EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS y EMAIL_FROM incluso con transporte JSON. `npm run setup` prepara valores locales de prueba. `API_PREFIX=/api` coincide con el proxy conservado. Variables VITE_* se incorporan al compilar; no se modifican en runtime Nginx. `VITE_API_URL` aparece en documentación histórica, pero Axios usa `/api` de manera fija.

Servicios opcionales: Cloudinary para crear evidencias/avatar; OAuth Google/Facebook con credenciales y redirects propios; HF/Groq/Gemini para inferencia remota; Firebase para push. El service worker conserva configuración pública histórica y necesita alineación manual al cambiar de proyecto Firebase. Nunca copiar claves privadas al frontend.
