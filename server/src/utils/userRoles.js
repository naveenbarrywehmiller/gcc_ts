const roles = new Set(require('../../../shared/accessPolicy.json').roles);

function validateRoleAssignment(actor, role) {
  if (!roles.has(role)) return { status: 400, error: 'Invalid user role' };
  if (role !== 'employee' && actor.role !== 'system admin') {
    return { status: 403, error: 'Only a system admin can assign Manager, Admin, System Admin, or Viewer roles' };
  }
  return null;
}

module.exports = { validateRoleAssignment };
