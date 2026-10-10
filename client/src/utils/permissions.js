import policy from '../../../shared/accessPolicy.json';

export function hasPermission(user, permission) {
  return policy.permissions[permission]?.includes(user?.role) ?? false;
}

export { policy };
