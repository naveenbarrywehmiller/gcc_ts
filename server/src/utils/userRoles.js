const roles = new Set(['employee', 'manager', 'admin', 'system admin']);

function validateRoleAssignment(actor, role) {
  if (!roles.has(role)) return { status: 400, error: 'Invalid user role' };
  if (['admin', 'system admin'].includes(role) && actor.role !== 'system admin') {
    return { status: 403, error: 'Only a system admin can assign administrator roles' };
  }
  return null;
}

module.exports = { validateRoleAssignment };
