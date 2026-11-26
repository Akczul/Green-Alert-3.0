const localHttp = process.env.EXPO_PUBLIC_ALLOW_HTTP === "true";
module.exports = {
  expo: {
    scheme: "greenalert",
    name: "GreenAlert",
    slug: "greenalert-mobile",
    version: "1.0.0",
    orientation: "default",
    userInterfaceStyle: "dark",
    icon: "./assets/logo.png",
    android: {
      package: "co.greenalert.mobile",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/logo.png",
        backgroundColor: "#030712",
      },
      blockedPermissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
      ],
    },
    plugins: [
      "expo-asset",
      "expo-router",
      ["expo-secure-store", { configureAndroidBackup: true }],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "GreenAlert usa tu ubicación solo cuando eliges adjuntarla a un reporte.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Elige una evidencia del problema ambiental.",
          cameraPermission: "Toma una foto como evidencia de tu reporte.",
          microphonePermission: false,
        },
      ],
      "expo-font",
      [
        "expo-build-properties",
        { android: { usesCleartextTraffic: localHttp } },
      ],
    ],
  },
};
