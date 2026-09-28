const roles = new Set(['employee', 'manager', 'admin', 'system admin']);

function validateRoleAssignment(actor, role) {
  if (!roles.has(role)) return { status: 400, error: 'Invalid user role' };
  if (role === 'system admin' && actor.role !== 'system admin') {
    return { status: 403, error: 'Only a system admin can assign the system admin role' };
  }
  return null;
}

module.exports = { validateRoleAssignment };
