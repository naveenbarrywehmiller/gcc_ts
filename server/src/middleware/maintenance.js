const fs = require('fs');
const path = require('path');

const maintenanceFile = path.join(__dirname, '..', '..', '.maintenance');
const page = fs.readFileSync(path.join(__dirname, '..', 'views', 'maintenance.html'), 'utf8');

function isEnabled() {
  return fs.existsSync(maintenanceFile);
}

function disable() {
  try {
    fs.unlinkSync(maintenanceFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function maintenance(req, res, next) {
  if (!isEnabled()) return next();
  res.set('Cache-Control', 'no-store');
  // These routes enforce authentication/roles themselves. All other APIs stay blocked.
  if (/^\/api\/system(?:\/|$)/i.test(req.path)
      || (req.method === 'POST' && /^\/api\/auth\/(?:login|maintenance-login)\/?$/i.test(req.path))) {
    return next();
  }
  if (/^\/api(?:\/|$)/i.test(req.path)) {
    return res.status(503).json({ error: 'System is currently down for maintenance (Database operations in progress).' });
  }
  return res.status(503).type('html').send(page);
}

module.exports = { maintenance, isEnabled, disable };
