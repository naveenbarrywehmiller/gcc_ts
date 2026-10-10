const db = require('../config/db');

function catalogAudit(table, entityType) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
    const previous = req.params.id ? db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id) : null;
    const send = res.json.bind(res);
    res.json = body => {
      if (res.statusCode < 400) {
        const record = Object.values(body).find(value => value && typeof value === 'object' && value.id);
        const id = record?.id || previous?.id || Number(req.params.id) || null;
        const action = req.path === '/import' ? 'IMPORT_HOLIDAYS' : `${{ POST: 'CREATE', PUT: 'UPDATE', DELETE: 'DELETE' }[req.method]}_${entityType.toUpperCase()}`;
        db.prepare(`INSERT INTO audit_logs(user_id, action, details, entity_type, entity_id, old_value, new_value, division_id, ip_address)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(req.user.id, action,
          `${entityType.replaceAll('_', ' ')} ${id || ''} ${req.method === 'DELETE' ? 'removed' : 'saved'}`,
          entityType, id, previous ? JSON.stringify(previous) : null, record ? JSON.stringify(record) : JSON.stringify(body),
          entityType === 'subdivision' ? (record?.division_id || previous?.division_id || null) : null, req.ip);
      }
      return send(body);
    };
    next();
  };
}

module.exports = { catalogAudit };
