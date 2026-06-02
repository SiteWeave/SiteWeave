const path = require('path');

module.exports = function(env) {
  return {
    expo: {
      name: "SiteWeave",
      slug: "siteweave-mobile",
      version: "1.0.1",
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
          NSLocationWhenInUseUsageDescription: "We use your location to display local weather conditions."
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
      ],
      extra: {
        router: {
          origin: false
        },
        eas: {
          projectId: "0e8aedb2-5084-4046-a750-5032e61afd9a"
        }
      }
    }
  };
};

