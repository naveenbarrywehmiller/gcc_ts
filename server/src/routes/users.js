const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Generate a random secure password.
 * Includes uppercase, lowercase, numbers, and special characters.
 */
function generatePassword(length = 14) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specials = '!@#$%&*_+-=?';
  const allChars = uppercase + lowercase + numbers + specials;

  let password = '';
  // Ensure at least one of each category
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += specials[crypto.randomInt(specials.length)];

  // Fill remaining length with random characters
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle the password so required chars aren't always at start
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

// GET /api/users/generate-password - Generate a random secure password
router.get('/generate-password', authenticate, authorize('admin'), (req, res) => {
  const length = parseInt(req.query.length) || 14;
  const password = generatePassword(Math.max(8, Math.min(length, 32)));
  res.json({ password });
});

// GET /api/users/active-count - Get total active users and online users
router.get('/active-count', authenticate, (req, res) => {
  const totalObj = db.prepare('SELECT COUNT(*) as count FROM users WHERE active = 1').get();
  const onlineObj = db.prepare(`
    SELECT COUNT(*) as count FROM users 
    WHERE active = 1 AND last_seen_at > datetime('now', '-5 minutes')
  `).get();
  res.json({ 
    total: totalObj.count, 
    online: onlineObj.count,
    count: totalObj.count 
  });
});

// GET /api/users - List all users (with enhanced filtering and sorting)
router.get('/', authenticate, authorize('admin'), (req, res) => {
  const { search, division, division_id, department_id, supporting_category_id, role, active, sort_by, sort_dir } = req.query;
  let query = `
    SELECT u.id, u.name, u.email, u.role, u.division, u.core, u.team_type, u.active, u.created_at,
           u.division_id, u.department_id, u.supporting_category_id, u.employee_id,
           d.name as division_name,
           dept.name as department_name,
           sc.name as supporting_category_name,
           uaa.admin_id,
           admin_u.name as admin_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    LEFT JOIN departments dept ON u.department_id = dept.id
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    LEFT JOIN user_admin_assignments uaa ON uaa.user_id = u.id
    LEFT JOIN users admin_u ON uaa.admin_id = admin_u.id
    WHERE u.name != '[Deleted User]'
  `;
  const params = [];

  if (search) {
    query += ' AND (u.name LIKE ? OR u.email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (division) {
    query += ' AND u.division = ?';
    params.push(division);
  }
  if (division_id) {
    query += ' AND u.division_id = ?';
    params.push(parseInt(division_id));
  }
  if (department_id) {
    query += ' AND u.department_id = ?';
    params.push(parseInt(department_id));
  }
  if (supporting_category_id) {
    query += ' AND u.supporting_category_id = ?';
    params.push(parseInt(supporting_category_id));
  }
  if (role) {
    query += ' AND u.role = ?';
    params.push(role);
  }
  if (active !== undefined && active !== '') {
    query += ' AND u.active = ?';
    params.push(parseInt(active) ? 1 : 0);
  }

  // Sorting
  const allowedSorts = {
    name: 'u.name',
    email: 'u.email',
    role: 'u.role',
    division: 'd.name',
    department: 'dept.name',
    supporting_category: 'sc.name',
    status: 'u.active',
    created_at: 'u.created_at',
  };
  const sortColumn = allowedSorts[sort_by] || 'u.name';
  const sortDirection = sort_dir === 'desc' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${sortColumn} ${sortDirection}`;

  const users = db.prepare(query).all(...params);
  res.json({ users });
});

// GET /api/users/:id
router.get('/:id', authenticate, authorize('admin'), (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.division, u.core, u.team_type, u.active, u.created_at,
           u.division_id, u.department_id, u.supporting_category_id, u.employee_id,
           d.name as division_name,
           dept.name as department_name,
           sc.name as supporting_category_name,
           uaa.admin_id,
           admin_u.name as admin_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    LEFT JOIN departments dept ON u.department_id = dept.id
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    LEFT JOIN user_admin_assignments uaa ON uaa.user_id = u.id
    LEFT JOIN users admin_u ON uaa.admin_id = admin_u.id
    WHERE u.id = ?
  `).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// GET /api/users/:id/divisions - Get divisions assigned to an admin user
router.get('/:id/divisions', authenticate, authorize('admin'), (req, res) => {
  const userId = req.params.id;
  const divisions = db.prepare(`
    SELECT d.id, d.name FROM admin_divisions ad
    JOIN divisions d ON ad.division_id = d.id
    WHERE ad.user_id = ?
    ORDER BY d.name ASC
  `).all(userId);
  res.json({ divisions });
});

// PUT /api/users/:id/divisions - Assign divisions to an admin user
router.put('/:id/divisions', authenticate, authorize('admin'), (req, res) => {
  const userId = req.params.id;
  const { division_ids } = req.body;

  if (!Array.isArray(division_ids)) {
    return res.status(400).json({ error: 'division_ids array is required' });
  }

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const assignDivisions = db.transaction(() => {
    // Remove existing assignments
    db.prepare('DELETE FROM admin_divisions WHERE user_id = ?').run(userId);
    // Insert new assignments
    const insert = db.prepare('INSERT INTO admin_divisions (user_id, division_id) VALUES (?, ?)');
    for (const divId of division_ids) {
      insert.run(userId, divId);
    }
  });
  assignDivisions();

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'ASSIGN_DIVISIONS', `Assigned ${division_ids.length} divisions to user ${userId}`, 'user', userId, req.ip
  );

  const divisions = db.prepare(`
    SELECT d.id, d.name FROM admin_divisions ad
    JOIN divisions d ON ad.division_id = d.id
    WHERE ad.user_id = ?
    ORDER BY d.name ASC
  `).all(userId);

  res.json({ divisions });
});

// POST /api/users - Create user
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name, email, password, role, division, core, team_type, division_id, department_id, supporting_category_id, employee_id } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'Email already exists' });
  }

  // Resolve division name from division_id if provided
  let divisionName = division || null;
  if (division_id && !divisionName) {
    const div = db.prepare('SELECT name FROM divisions WHERE id = ?').get(division_id);
    if (div) divisionName = div.name;
  }

  // Resolve team_type from supporting_category_id if provided
  let teamType = team_type || null;
  if (supporting_category_id && !teamType) {
    const sc = db.prepare('SELECT name FROM supporting_categories WHERE id = ?').get(supporting_category_id);
    if (sc) teamType = sc.name;
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, division, core, team_type, division_id, department_id, supporting_category_id, employee_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), email.toLowerCase().trim(), hash, role || 'employee', divisionName, core || null, teamType, division_id || null, department_id || null, supporting_category_id || null, employee_id || null);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'CREATE_USER', `Created user: ${email}`, 'user', result.lastInsertRowid, req.ip
  );

  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.division, u.core, u.team_type, u.active,
           u.division_id, u.department_id, u.supporting_category_id,
           d.name as division_name, dept.name as department_name, sc.name as supporting_category_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    LEFT JOIN departments dept ON u.department_id = dept.id
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    WHERE u.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ user });
});

// PUT /api/users/:id - Update user
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { name, email, password, role, division, core, team_type, active, division_id, department_id, supporting_category_id, employee_id } = req.body;
  const userId = req.params.id;

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  if (email) {
    const emailExists = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), userId);
    if (emailExists) return res.status(409).json({ error: 'Email already in use' });
  }

  let updateFields = [];
  let params = [];

  if (name !== undefined) { updateFields.push('name = ?'); params.push(name.trim()); }
  if (email !== undefined) { updateFields.push('email = ?'); params.push(email.toLowerCase().trim()); }
  if (role !== undefined) { updateFields.push('role = ?'); params.push(role); }
  if (core !== undefined) { updateFields.push('core = ?'); params.push(core); }
  if (active !== undefined) { updateFields.push('active = ?'); params.push(active ? 1 : 0); }
  if (employee_id !== undefined) { updateFields.push('employee_id = ?'); params.push(employee_id || null); }
  if (password) {
    updateFields.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 12));
  }

  // Handle division_id — also sync the text division field
  if (division_id !== undefined) {
    updateFields.push('division_id = ?');
    params.push(division_id || null);
    if (division_id) {
      const div = db.prepare('SELECT name FROM divisions WHERE id = ?').get(division_id);
      if (div) { updateFields.push('division = ?'); params.push(div.name); }
    } else {
      updateFields.push('division = ?'); params.push(null);
    }
  } else if (division !== undefined) {
    updateFields.push('division = ?'); params.push(division);
  }

  if (department_id !== undefined) {
    updateFields.push('department_id = ?');
    params.push(department_id || null);
  }

  // Handle supporting_category_id — also sync team_type text field
  if (supporting_category_id !== undefined) {
    updateFields.push('supporting_category_id = ?');
    params.push(supporting_category_id || null);
    if (supporting_category_id) {
      const sc = db.prepare('SELECT name FROM supporting_categories WHERE id = ?').get(supporting_category_id);
      if (sc) { updateFields.push('team_type = ?'); params.push(sc.name); }
    } else {
      updateFields.push('team_type = ?'); params.push(null);
    }
  } else if (team_type !== undefined) {
    updateFields.push('team_type = ?'); params.push(team_type);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(userId);

  db.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'UPDATE_USER', `Updated user ID: ${userId}`, 'user', userId, req.ip
  );

  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.division, u.core, u.team_type, u.active,
           u.division_id, u.department_id, u.supporting_category_id,
           d.name as division_name, dept.name as department_name, sc.name as supporting_category_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    LEFT JOIN departments dept ON u.department_id = dept.id
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    WHERE u.id = ?
  `).get(userId);
  res.json({ user });
});

// POST /api/users/:id/reset-password - Admin: Reset a user's password
router.post('/:id/reset-password', authenticate, authorize('admin'), (req, res) => {
  const userId = req.params.id;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, userId);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'RESET_PASSWORD', `Reset password for user ID: ${userId}`, 'user', userId, req.ip
  );

  res.json({ message: 'Password reset successfully' });
});

// POST /api/users/:id/toggle-active - Toggle user active/inactive status
router.post('/:id/toggle-active', authenticate, authorize('admin'), (req, res) => {
  const userId = req.params.id;

  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  const existing = db.prepare('SELECT id, name, active FROM users WHERE id = ?').get(userId);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const newActive = existing.active ? 0 : 1;
  db.prepare('UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newActive, userId);

  const action = newActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER';
  const actionText = newActive ? 'Activated' : 'Deactivated';
  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, action, `${actionText} user: ${existing.name} (ID: ${userId})`, 'user', userId, req.ip
  );

  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.division, u.core, u.team_type, u.active,
           u.division_id, u.department_id, u.supporting_category_id,
           d.name as division_name, dept.name as department_name, sc.name as supporting_category_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    LEFT JOIN departments dept ON u.department_id = dept.id
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    WHERE u.id = ?
  `).get(userId);
  res.json({ user, message: `User ${actionText.toLowerCase()} successfully` });
});

// DELETE /api/users/:id/permanent - Permanently delete a user
// IMPORTANT: This route MUST be defined before DELETE /:id to avoid Express route shadowing.
// Anonymizes the user record to preserve timesheet history and report integrity.
// Old timesheet entries will show "[Deleted User]" instead of the original name.
router.delete('/:id/permanent', authenticate, authorize('admin'), (req, res) => {
  const userId = req.params.id;

  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const existing = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Check if user has any timesheet entries
  const hasTimesheets = db.prepare('SELECT COUNT(*) as count FROM timesheets WHERE user_id = ?').get(userId);

  const permanentDelete = db.transaction(() => {
    if (hasTimesheets.count > 0) {
      // User has timesheet history — anonymize instead of hard delete
      // This preserves all JOIN relationships in reports
      const anonEmail = `deleted_${userId}_${Date.now()}@removed.local`;
      db.prepare(`
        UPDATE users SET 
          name = '[Deleted User]',
          email = ?,
          password_hash = '',
          role = 'employee',
          division = NULL,
          core = NULL,
          team_type = NULL,
          division_id = NULL,
          department_id = NULL,
          supporting_category_id = NULL,
          active = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(anonEmail, userId);
    } else {
      // No timesheet history — safe to hard delete
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    }

    // Clean up admin division assignments
    db.prepare('DELETE FROM admin_divisions WHERE user_id = ?').run(userId);
    // Clean up admin-user ownership assignments (as admin or as user)
    db.prepare('DELETE FROM user_admin_assignments WHERE user_id = ? OR admin_id = ?').run(userId, userId);
  });

  permanentDelete();

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'PERMANENT_DELETE_USER',
    `Permanently deleted user: ${existing.name} (${existing.email}, ID: ${userId})${hasTimesheets.count > 0 ? ' — anonymized (had ' + hasTimesheets.count + ' timesheet entries)' : ' — hard deleted (no timesheet data)'}`,
    'user', userId, req.ip
  );

  res.json({
    message: hasTimesheets.count > 0
      ? 'User permanently deleted. Historical timesheet data has been preserved with anonymized user info.'
      : 'User permanently deleted.',
    had_timesheets: hasTimesheets.count > 0,
    timesheet_count: hasTimesheets.count
  });
});

// DELETE /api/users/:id - Soft delete (deactivate)
// NOTE: This MUST come after /:id/permanent to avoid Express route shadowing.
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const userId = req.params.id;

  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'DELETE_USER', `Deactivated user ID: ${userId}`, 'user', userId, req.ip
  );

  res.json({ message: 'User deactivated successfully' });
});

module.exports = router;
