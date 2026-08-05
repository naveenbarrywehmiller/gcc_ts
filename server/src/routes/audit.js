const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit - List audit logs with filtering and pagination
router.get('/', authenticate, authorize('admin'), (req, res) => {
  const { action, user_id, entity_type, from_date, to_date, search, page = 1, limit = 50 } = req.query;

  let countQuery = `SELECT COUNT(*) as total FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
  let query = `
    SELECT al.*, u.name as user_name, u.email as user_email
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (action) {
    query += ' AND al.action = ?';
    countQuery += ' AND al.action = ?';
    params.push(action);
  }
  if (user_id) {
    query += ' AND al.user_id = ?';
    countQuery += ' AND al.user_id = ?';
    params.push(parseInt(user_id));
  }
  if (entity_type) {
    query += ' AND al.entity_type = ?';
    countQuery += ' AND al.entity_type = ?';
    params.push(entity_type);
  }
  if (from_date) {
    query += ' AND al.created_at >= ?';
    countQuery += ' AND al.created_at >= ?';
    params.push(from_date);
  }
  if (to_date) {
    query += ' AND al.created_at <= ?';
    countQuery += ' AND al.created_at <= ?';
    params.push(to_date + ' 23:59:59');
  }
  if (search) {
    query += ' AND (al.details LIKE ? OR u.name LIKE ? OR al.action LIKE ?)';
    countQuery += ' AND (al.details LIKE ? OR u.name LIKE ? OR al.action LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const total = db.prepare(countQuery).get(...params);

  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';

  const logs = db.prepare(query).all(...params, pageSize, offset);

  res.json({
    logs,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total: total.total,
      totalPages: Math.ceil(total.total / pageSize),
    },
  });
});

// GET /api/audit/actions - Get list of distinct action types
router.get('/actions', authenticate, authorize('admin'), (req, res) => {
  const actions = db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC').all();
  res.json({ actions: actions.map(a => a.action) });
});

module.exports = router;
