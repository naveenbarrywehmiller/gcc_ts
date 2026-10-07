const express = require('express');
const { authenticate } = require('../middleware/auth');
const { commonGuides, managerGuides, adminGuides, systemAdminGuides } = require('../data/helpGuides');

const router = express.Router();

function groupsForRole(role) {
  if (!['employee', 'manager', 'admin', 'system admin'].includes(role)) return null;

  const groups = [
    { id: 'everyday', title: 'Everyday help', description: 'Guides for everyone using the application.', guides: commonGuides },
  ];
  if (role === 'manager') groups.push({ id: 'manager', title: 'Manager help', description: 'Additional guidance for team managers.', guides: managerGuides });
  if (role === 'admin' || role === 'system admin') groups.push({ id: 'admin', title: 'Admin help', description: 'Additional guidance for administrators.', guides: adminGuides });
  if (role === 'system admin') groups.push({ id: 'system-admin', title: 'System admin help', description: 'Additional guidance for system administrators.', guides: systemAdminGuides });
  return groups;
}

router.get('/', authenticate, (req, res) => {
  const groups = groupsForRole(req.user.role);
  if (!groups) return res.status(403).json({ error: 'Insufficient permissions' });
  res.set('Cache-Control', 'private, no-store');
  res.json({ groups });
});

module.exports = router;
