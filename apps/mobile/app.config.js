const path = require('path');

const androidWidgetConfig = {
  widgets: [
    {
      name: 'SiteBrief',
      label: 'Site Brief',
      description: "Today's tasks, weather, and overdue alerts.",
      minWidth: '320dp',
      minHeight: '120dp',
      targetCellWidth: 5,
      targetCellHeight: 2,
      updatePeriodMillis: 1800000,
    },
    {
      name: 'SiteBriefSmall',
      label: 'Site Brief Compact',
      description: 'Due counts and weather at a glance.',
      minWidth: '120dp',
      minHeight: '120dp',
      targetCellWidth: 2,
      targetCellHeight: 2,
      updatePeriodMillis: 1800000,
    },
  ],
};

module.exports = function(env) {
  return {
    expo: {
      name: "SiteWeave",
      slug: "siteweave-mobile",
      version: "1.0.5",
      main: "./main.js",
      runtimeVersion: {
        policy: "appVersion",
      },
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
        [
          "expo-location",
          {
            locationAlwaysAndWhenInUsePermission: "We use your location to display local weather conditions.",
            locationAlwaysPermission: "We use your location to display local weather conditions.",
            locationWhenInUsePermission: "We use your location to display local weather conditions.",
          }
        ],
        "./plugins/removePushEntitlement.js",
        ["react-native-android-widget", androidWidgetConfig],
      ],
      extra: {
        router: {
          origin: false
        },
        eas: {
          projectId: "0e8aedb2-5084-4046-a750-5032e61afd9a",
        }
      }
    }
  };
};

