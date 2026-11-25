param()
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
if (-not $env:EXPO_PUBLIC_API_URL) { throw 'Define EXPO_PUBLIC_API_URL (URL accesible desde el teléfono).' }
$apiUri = [Uri]$env:EXPO_PUBLIC_API_URL
if (-not $apiUri.IsAbsoluteUri -or $apiUri.Host -in @('localhost','127.0.0.1','::1','0.0.0.0') -or $apiUri.UserInfo -or $apiUri.Query -or $apiUri.Fragment) { throw 'URL de API inválida para un teléfono.' }
if ($apiUri.Scheme -ne 'https' -and -not ($apiUri.Scheme -eq 'http' -and $env:EXPO_PUBLIC_ALLOW_HTTP -eq 'true')) { throw 'Usa HTTPS o habilita explícitamente HTTP para laboratorio.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Falta Java compatible con el SDK de Expo.' }
$mobileSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $mobileSdk 'platform-tools\adb.exe'))) { throw 'Falta Android SDK/platform-tools. Instala Android Studio y configura ANDROID_HOME.' }
$env:ANDROID_HOME = $mobileSdk
$env:CI = '1'
npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'Falló prebuild Android.' }
Push-Location android
try {
  # APK de evaluación autocontenida: JS empaquetado y firma debug local, nunca para publicar.
  .\gradlew.bat :app:assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Falló Gradle. No se generó una APK verificada.' }
} finally { Pop-Location }
$mobileApk = Join-Path $PWD 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $mobileApk)) { throw 'Gradle terminó sin el artefacto esperado.' }
Get-FileHash -LiteralPath $mobileApk -Algorithm SHA256
Write-Output "APK: $mobileApk"
