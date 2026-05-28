// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Set the app root for Expo Router (required for web) - use absolute path
if (!process.env.EXPO_ROUTER_APP_ROOT) {
  process.env.EXPO_ROUTER_APP_ROOT = path.resolve(__dirname, 'app');
}

// Get the project root directory (apps/mobile)
const projectRoot = __dirname;
// Get the workspace root directory (siteweaveapp)
const workspaceRoot = path.resolve(projectRoot, '../..');
// Get the packages directory
const packagesRoot = path.resolve(workspaceRoot, 'packages');

// Paths to force resolution from mobile app's node_modules
const mobileNodeModules = path.resolve(projectRoot, 'node_modules');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Configure Metro to watch the packages directory and workspace root
config.watchFolders = [packagesRoot, workspaceRoot];

// Only use project's node_modules
config.resolver.nodeModulesPaths = [mobileNodeModules];

// Map local packages
config.resolver.extraNodeModules = {
  '@siteweave/core-logic': path.resolve(packagesRoot, 'core-logic'),
  '@siteweave/i18n': path.resolve(packagesRoot, 'i18n'),
};

// Custom resolver to force React modules to always resolve from mobile app
// Also handle @siteweave/core-logic package resolution
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force React-related modules to resolve from the mobile app's node_modules
  // This prevents "Invalid hook call" errors from multiple React instances
  if (
    moduleName === 'react' ||
    moduleName === 'react-native' ||
    moduleName === 'react-dom' ||
    moduleName.startsWith('react/') ||
    moduleName.startsWith('react-native/') ||
    moduleName.startsWith('react-dom/')
  ) {
    // Resolve from mobile app's node_modules only
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [mobileNodeModules] }),
    };
  }
  
  // Handle @siteweave/core-logic package - resolve to index.js
  if (moduleName === '@siteweave/core-logic') {
    const coreLogicPath = path.resolve(packagesRoot, 'core-logic', 'src', 'index.js');
    return {
      type: 'sourceFile',
      filePath: coreLogicPath,
    };
  }

  if (moduleName === '@siteweave/i18n') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(packagesRoot, 'i18n', 'index.js'),
    };
  }
  
  // Handle relative imports within @siteweave/core-logic package
  // When Metro processes exports from index.js, it needs to resolve relative paths
  // from the package's src directory, not from the mobile app root
  if (context.originModulePath && context.originModulePath.includes('core-logic')) {
    // If the origin is within core-logic, resolve relative imports from that directory
    const originDir = path.dirname(context.originModulePath);
    if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
      const resolvedPath = path.resolve(originDir, moduleName);
      const fs = require('fs');
      const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
      
      // Try with extensions
      for (const ext of extensions) {
        const fullPath = resolvedPath + ext;
        if (fs.existsSync(fullPath)) {
          return {
            type: 'sourceFile',
            filePath: fullPath,
          };
        }
      }
      
      // Try as directory with index
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
        for (const ext of extensions) {
          const indexPath = path.join(resolvedPath, 'index' + ext);
          if (fs.existsSync(indexPath)) {
            return {
              type: 'sourceFile',
              filePath: indexPath,
            };
          }
        }
      }
    }
  }
  
  // Handle relative imports that incorrectly reference packages/core-logic
  // This can happen when Metro resolves relative paths from the wrong base
  if (moduleName.startsWith('./packages/core-logic/') || moduleName.startsWith('../packages/core-logic/')) {
    const relativePath = moduleName.replace(/^\.\.?\/packages\/core-logic\/src\//, '').replace(/^\.\.?\/packages\/core-logic\//, '');
    const coreLogicSrc = path.resolve(packagesRoot, 'core-logic', 'src');
    const resolvedPath = path.resolve(coreLogicSrc, relativePath);
    
    // Try to find the file with common extensions
    const fs = require('fs');
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      if (fs.existsSync(fullPath)) {
        return {
          type: 'sourceFile',
          filePath: fullPath,
        };
      }
    }
    // If no extension found, try as directory with index
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      for (const ext of extensions) {
        const indexPath = path.join(resolvedPath, 'index' + ext);
        if (fs.existsSync(indexPath)) {
          return {
            type: 'sourceFile',
            filePath: indexPath,
          };
        }
      }
    }
  }
  
  // Use the original resolver for everything else
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  
  // Default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
