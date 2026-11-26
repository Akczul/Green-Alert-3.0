# Convenciones de la aplicación móvil

Se aplican las reglas de `../../AGENTS.md`. El alcance de esta carpeta es el cliente Android; no modificar backend, frontend activo ni archivos compartidos como efecto secundario.

- Mantener JavaScript/JSX, componentes nativos y comentarios/documentación en español. No introducir WebView para sustituir la aplicación.
- Antes de usar APIs de Expo, EAS o React Native, revisar la versión de `expo` en `package.json` y consultar la documentación de ese SDK en `https://docs.expo.dev/versions/v<major>.0.0/`. Para otras funciones consultar el índice oficial `https://docs.expo.dev/llms.txt` y la página correspondiente; las APIs cambian entre versiones.
- Usar Expo Router para navegación. Las rutas están en `src/app`, con `_layout.jsx` y stack protegido. Mantener componentes, contexto y adaptadores fuera de las rutas. Usar `router`, `Link` y `useLocalSearchParams` desde `expo-router` según corresponda.
- Resolver bibliotecas mediante `npx expo install`, respetando `package-lock.json`. Instalación independiente mediante `npm ci`; no crear workspaces ni enlaces simbólicos.
- Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run check` y las comprobaciones de bundle/prebuild pertinentes antes de terminar. El proyecto es JavaScript: el comando tsc valida la configuración y sintaxis sin afirmar seguridad estática de tipos. No convertir a TypeScript para satisfacer ese comando.
- Android/iOS se generan con Expo CNG. No editar a mano el código generado: usar `app.config.js` y plugins. No versionar keystores, tokens, `.env`, APK ni carpetas generadas.
- Una dependencia nativa exige reconstruir la aplicación. Expo Go y un bundle correcto no acreditan una APK instalada.
- Priorizar compilación local reproducible para esta tarea; `eas.json` ofrece una alternativa en la nube que requiere cuenta Expo y autorización de carga del titular. No iniciar publicación ni carga de fuentes sin el alcance correspondiente del usuario.
- Mantener acceso/renovación exclusivamente en SecureStore. Adaptar contratos de autenticación en `src/api.js`, sin incorporar secretos en variables públicas.
- No afirmar GPS, cámara, Keystore, API desplegada o aceptación física sin evidencia real. Registrar resultados y límites en `docs/verificacion.md` y `docs/aceptacion.md`.
