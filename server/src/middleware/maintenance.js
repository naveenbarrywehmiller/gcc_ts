const fs = require('fs');
const path = require('path');

const maintenanceFile = process.env.MAINTENANCE_FILE || path.join(__dirname, '..', '..', '.maintenance');
const operationFile = maintenanceFile + '-operation';
const page = fs.readFileSync(path.join(__dirname, '..', 'views', 'maintenance.html'), 'utf8');

function isEnabled() {
  return fs.existsSync(maintenanceFile) || isOperationActive();
}

function disable() {
  if (isOperationActive()) throw new Error('Database operation is still in progress. Try again after it finishes.');
  try {
    fs.unlinkSync(maintenanceFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function enable() {
  fs.mkdirSync(path.dirname(maintenanceFile), { recursive: true });
  fs.writeFileSync(maintenanceFile, 'Maintenance enabled\n');
}

function isOperationActive() { return fs.existsSync(operationFile); }

function beginOperation() {
  fs.mkdirSync(path.dirname(maintenanceFile), { recursive: true });
  fs.writeFileSync(operationFile, 'Database operation in progress\n', { flag: 'wx' });
  enable();
}

function endOperation() {
  enable();
  fs.rmSync(operationFile, { force: true });
}

function maintenance(req, res, next) {
  if (!isEnabled()) return next();
  res.set('Cache-Control', 'no-store');
  // These routes enforce authentication/roles themselves. All other APIs stay blocked.
  if ((req.method === 'GET' && req.path === '/api/health/live')
      || /^\/api\/system(?:\/|$)/i.test(req.path)
      || (req.method === 'POST' && /^\/api\/auth\/(?:login|maintenance-login)\/?$/i.test(req.path))) {
    return next();
  }
  if (/^\/api(?:\/|$)/i.test(req.path)) {
    return res.status(503).json({ error: 'System is currently down for maintenance (Database operations in progress).' });
  }
  return res.status(503).type('html').send(page);
}

module.exports = { maintenance, isEnabled, enable, disable, beginOperation, endOperation, isOperationActive };
