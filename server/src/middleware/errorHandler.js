function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  console.error(err.stack);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.code === 'SQLITE_CONSTRAINT_TRIGGER' && err.message === 'Project code already exists')) {
    return res.status(409).json({ error: 'Record already exists' });
  }

  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({ error: 'Database constraint violation' });
  }

  const status = err.status || 500;
  if (status >= 500) require('../utils/systemLog').recordSystemError(err, `${req.method} ${req.route?.path || 'server'}`);
  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({ error: message });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { errorHandler, notFound };
