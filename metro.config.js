const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');
config.resolver.assetExts.push('wasm');

// expo-sqlite's web build uses SharedArrayBuffer (via wa-sqlite/OPFS), which browsers only expose
// on cross-origin-isolated pages. Without these headers, opening the database throws
// "SharedArrayBuffer is not defined" on web.
const { enhanceMiddleware } = config.server;
config.server.enhanceMiddleware = (middleware, server) => {
  const wrapped = enhanceMiddleware ? enhanceMiddleware(middleware, server) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    wrapped(req, res, next);
  };
};

module.exports = config;
