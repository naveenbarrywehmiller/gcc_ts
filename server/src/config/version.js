// Reads the version from the root package.json (monorepo root)
// The root package.json is the single source of truth for the release version
// which matches the GitHub release tag (e.g. v1.6.0)
const path = require('path');

let version = 'unknown';
try {
  const rootPkg = require(path.join(__dirname, '..', '..', '..', 'package.json'));
  version = rootPkg.version;
} catch {
  // Fallback to server package.json if root not available
  try {
    const serverPkg = require(path.join(__dirname, '..', '..', 'package.json'));
    version = serverPkg.version;
  } catch {}
}

module.exports = { version };
