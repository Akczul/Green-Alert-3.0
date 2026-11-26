# syntax=docker/dockerfile:1.7
# Compilación reproducible de la APK de evaluación en Linux.
# Evita el límite Win32 de 260 caracteres que bloqueó Ninja/CMake en Windows
# (ver docs/compilacion-android-local.md). Solo produce el artefacto; no publica nada.
#
# Uso desde la raíz del repositorio (ver npm run apk:docker):
#   docker build -f apps/mobile/docker/apk.Dockerfile --target apk \
#     --build-arg EXPO_PUBLIC_API_URL=http://IP_LAN:8080/api --build-arg EXPO_PUBLIC_ALLOW_HTTP=true \
#     --output type=local,dest=.local/apk apps/mobile
FROM node:24.11.1-bookworm AS build

ARG CMDLINE_TOOLS_BUILD=15859902
ARG CMDLINE_TOOLS_SHA256
ENV ANDROID_HOME=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    GRADLE_USER_HOME=/gradle \
    CI=1
ENV PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jdk-headless unzip \
 && rm -rf /var/lib/apt/lists/*

# Herramientas oficiales de Google con hash comprobado.
RUN curl -fsSLo /tmp/clt.zip "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_BUILD}_latest.zip" \
 && echo "${CMDLINE_TOOLS_SHA256}  /tmp/clt.zip" | sha256sum -c - \
 && mkdir -p "$ANDROID_HOME/cmdline-tools" \
 && unzip -q /tmp/clt.zip -d /tmp/clt \
 && mv /tmp/clt/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest" \
 && rm -rf /tmp/clt /tmp/clt.zip

# Mismos paquetes SDK documentados para Expo SDK 58 / React Native 0.88.
RUN yes | sdkmanager --licenses > /dev/null \
 && sdkmanager 'platform-tools' 'platforms;android-37.0' 'build-tools;37.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1' > /dev/null

# Build-Tools 36 lo exige el plugin Android de React Native; preinstalado para no descargarlo en pleno Gradle.
RUN sdkmanager 'build-tools;36.0.0' > /dev/null

WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . .

# La URL de compilación es solo el valor inicial: la app permite elegir el servidor al iniciar sesión.
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_ALLOW_HTTP=false
ARG ANDROID_ABIS=arm64-v8a
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL} \
    EXPO_PUBLIC_ALLOW_HTTP=${EXPO_PUBLIC_ALLOW_HTTP}
RUN test -n "$EXPO_PUBLIC_API_URL" || (echo "Define EXPO_PUBLIC_API_URL" >&2; exit 1)
RUN npx expo prebuild --platform android --no-install

# Firma debug generada por la plantilla de Expo: válida para instalar en evaluación, nunca para publicar.
RUN --mount=type=cache,target=/gradle \
    cd android \
 && ./gradlew :app:assembleRelease --no-daemon --max-workers=2 --no-parallel \
      -PreactNativeArchitectures="${ANDROID_ABIS}" \
 && mkdir -p /out \
 && cp app/build/outputs/apk/release/app-release.apk /out/greenalert.apk \
 && "$ANDROID_HOME/build-tools/37.0.0/apksigner" verify --print-certs /out/greenalert.apk > /out/firma.txt \
 && "$ANDROID_HOME/build-tools/37.0.0/aapt" dump badging /out/greenalert.apk > /out/contenido.txt \
 && unzip -l /out/greenalert.apk >> /out/contenido.txt \
 && grep -q 'assets/index.android.bundle' /out/contenido.txt \
 && sha256sum /out/greenalert.apk > /out/greenalert.apk.sha256

FROM scratch AS apk
COPY --from=build /out/ /
