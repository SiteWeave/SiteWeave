module.exports = function(env) {
  return {
    expo: {
      name: "SiteWeave",
      slug: "siteweave-mobile",
      version: "1.0.8",
      main: "./main.js",
      runtimeVersion: "1.0.8",
      updates: {
        url: "https://u.expo.dev/0e8aedb2-5084-4046-a750-5032e61afd9a",
        checkAutomatically: "ON_LOAD",
        fallbackToCacheTimeout: 0,
      },
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      scheme: "siteweave",
      splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#000000"
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: "com.siteweave.mobile",
        usesAppleSignIn: true,
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
          NSLocationWhenInUseUsageDescription: "We use your location to display local weather conditions.",
          NSMicrophoneUsageDescription: "SiteWeave uses the microphone so you can dictate site day notes.",
          NSSpeechRecognitionUsageDescription: "SiteWeave uses speech recognition to turn your voice into site day notes."
        }
      },
      android: {
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#000000"
        },
        edgeToEdgeEnabled: false,
        softwareKeyboardLayoutMode: "resize",
        package: "com.siteweave.mobile",
        permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]
      },
      web: {
        favicon: "./assets/favicon.png",
        bundler: "webpack"
      },
      experiments: {
        typedRoutes: true
      },
      plugins: [
        "expo-router",
        "expo-font",
        "@sentry/react-native",
        [
          "expo-image-picker",
          {
            photosPermission: "SiteWeave accesses your photo library so you can attach project, task, issue, and profile photos.",
            cameraPermission: "SiteWeave uses your camera so you can capture project, task, and issue photos.",
            microphonePermission: false,
          }
        ],
        [
          "expo-location",
          {
            locationAlwaysAndWhenInUsePermission: "We use your location to display local weather conditions.",
            locationAlwaysPermission: "We use your location to display local weather conditions.",
            locationWhenInUsePermission: "We use your location to display local weather conditions.",
          }
        ],
        "./plugins/removePushEntitlement.js",
        // TEMP: home-screen widgets disabled for App Store submit.
        // Re-enable with: ["react-native-android-widget", androidWidgetConfig]
      ],
      extra: {
        router: {
          origin: false
        },
        eas: {
          projectId: "0e8aedb2-5084-4046-a750-5032e61afd9a",
        },
        // Optional: set EXPO_PUBLIC_SENTRY_DSN or override here
        sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || null,
        sentryEnvironment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || null,
        /** Set when Metro started with `npm run start:go` — native modules stubbed. */
        expoGoCompat:
          process.env.EXPO_GO_COMPAT === '1' || process.env.EXPO_PUBLIC_EXPO_GO_COMPAT === '1',
      }
    }
  };
};
