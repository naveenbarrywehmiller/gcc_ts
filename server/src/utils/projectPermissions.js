const { adminDivisionIds } = require('./divisionScope');

function projectDivisionIds(user) {
  return adminDivisionIds(user);
}

function canManageProjectDivision(user, divisionId) {
  return user.role === 'system admin' ||
    (user.role === 'admin' && projectDivisionIds(user).includes(Number(divisionId)));
}

module.exports = { projectDivisionIds, canManageProjectDivision };
