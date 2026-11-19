# Infraestructura de GreenAlert

El Compose compartido está en la raíz para que sus rutas sean estables desde Windows y Linux. Reutiliza los Dockerfiles de ambas aplicaciones. Solo incorpora una instancia local de **MySQL, la base ya utilizada por el backend**. No instala MongoDB, Cassandra, Druid ni servicios de ML.

`npm run setup` genera secretos locales; `npm run infra:config` valida la configuración sin imprimirlos. `npm run infra:db` inicia únicamente MySQL para desarrollo con Node. `npm run infra:up` construye e inicia los tres componentes. `npm run infra:down` detiene contenedores y conserva volúmenes.

El volumen `greenalert_mysql_data` es independiente de cualquier base anterior. El SQL de inicialización se ejecuta **solo en un volumen vacío**. No montar aquí un directorio de datos existente ni ejecutar el esquema completo sobre producción: contiene semillas, actualizaciones de entidades y procedimientos no repetibles. Las migraciones históricas se conservan en `apps/backend/migrations`, sin ejecución automática.

Los Compose individuales se conservan como referencia histórica. Para ejecutar el proyecto completo se usa el de la raíz. SMTP, Cloudinary, OAuth y proveedores de IA necesitan configuración propia; por defecto el correo local usa transporte JSON.
