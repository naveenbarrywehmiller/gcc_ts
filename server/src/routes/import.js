const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { permit } = require('../middleware/permissions');
const { validateProject, fail } = require('../utils/projectFields');
const { canManageProjectDivision } = require('../utils/projectPermissions');
const { validateAssignments, saveAssignments } = require('../utils/projectTasks');
const { validateProjectUsers, saveProjectUsers } = require('../utils/platformAssignments');
const { validateTask, validateTaskHistory } = require('../utils/taskFields');
const { projectColumns, taskColumns, readWorkbook, activeValue, recordId, idList } = require('../utils/catalogWorkbook');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (req, file, cb) => cb(['.xlsx', '.csv'].includes(path.extname(file.originalname).toLowerCase()) ? null : new Error('Only .xlsx and .csv files are supported'), true),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function checkScope(user, project) {
  if (project && !canManageProjectDivision(user, project.division_id)) fail('You can only import projects in your assigned divisions', 403);
}

function existingRecord(kind, input, manifest, user) {
  const id = recordId(input.id);
  const key = kind === 'projects' ? 'project_code' : 'task_category';
  let existing;
  if (id) {
    if (manifest && !manifest.some(([exportedId]) => exportedId === id)) fail('Record ID was not in this export. Leave the ID blank for a new row.');
    existing = db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(id);
    if (!existing) fail(`Record ID ${id} no longer exists. Export a fresh workbook.`);
  } else if (input[key]) {
    const matches = kind === 'projects'
      ? db.prepare('SELECT * FROM projects WHERE LOWER(TRIM(project_code))=LOWER(?)').all(String(input[key]).trim())
      : db.prepare('SELECT * FROM tasks WHERE LOWER(TRIM(task_category))=LOWER(?) AND classification=?').all(String(input[key]).trim(), input.classification);
    if (matches.length > 1) fail('Multiple tasks have this name and classification. Use an exported Task ID.');
    existing = matches[0];
    if (manifest && existing) fail(`Keep the ${kind === 'projects' ? 'Project' : 'Task'} ID when editing an existing row`);
  }
  if (kind === 'projects') checkScope(user, existing);
  return existing;
}

function prepareProject(input, existing, req) {
  if (Object.hasOwn(input, 'active')) input.active = input.active === '' && !existing ? 1 : activeValue(input.active);
  for (const key of ['billable_task_ids', 'non_billable_task_ids']) {
    if (Object.hasOwn(input, key)) input[key] = idList(input[key]);
  }
  if (Object.hasOwn(input, 'user_ids')) input.user_ids = idList(input.user_ids);
  if (input.user_assignment_mode === '' && !existing) input.user_assignment_mode = 'division';
  if (Object.hasOwn(input, 'division')) input.division_id = null;
  else if (!existing && req.body.division_id) input.division_id = req.body.division_id;
  if (Object.hasOwn(input, 'location')) input.subdivision_id = null;
  if (input.platform_name) {
    const platform = db.prepare('SELECT id FROM platforms WHERE LOWER(TRIM(name))=LOWER(?) AND active=1').get(String(input.platform_name).trim());
    if (!platform) fail(`Unknown Platform: ${input.platform_name}`);
    input.platform_id = platform.id;
  }
  const project = validateProject(input, req.user, existing);
  for (const [key, label, table] of [['activity', 'Work Type', 'activities'], ['team_type', 'Dedicated/Flex', 'supporting_categories']]) {
    if (!project[key]) continue;
    const option = db.prepare(`SELECT name FROM ${table} WHERE active=1 AND LOWER(TRIM(name))=LOWER(?)`).get(project[key]);
    if (!option && project[key] !== existing?.[key]) fail(`${label} "${project[key]}" is not in the active sidebar list. Add it there or use an existing value.`);
    if (option) project[key] = option.name;
  }
  return { data: project, groups: validateAssignments(input, existing?.id), members: validateProjectUsers(input, project.division_id, existing) };
}

function prepareTask(input, existing) {
  if (Object.hasOwn(input, 'active')) input.active = input.active === '' && !existing ? 1 : activeValue(input.active);
  const data = validateTask(input, existing);
  validateTaskHistory(data, existing);
  const duplicate = db.prepare('SELECT id FROM tasks WHERE LOWER(TRIM(task_category))=LOWER(?) AND classification=? AND id!=?')
    .get(data.task_category, data.classification, existing?.id || 0);
  if (duplicate && (!existing || existing.task_category !== data.task_category || existing.classification !== data.classification)) fail('A task with this name and classification already exists');
  return { data };
}

for (const kind of ['projects', 'tasks']) {
  router.post(`/${kind}`, authenticate, permit(kind), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const { rows, manifest } = await readWorkbook(req.file.path, kind,
        kind === 'projects' ? projectColumns : taskColumns,
        kind === 'projects' ? ['project_code', 'project_name'] : ['classification', 'task_category']);
      if (!rows.length && !manifest?.length) fail(`No ${kind} rows found`);
      const errors = [];
      const changes = [];
      const seenKeys = new Set();
      const seenIds = new Set();
      const result = db.transaction(() => {
        for (const { input, rowNumber } of rows) {
          try {
            const existing = existingRecord(kind, input, manifest, req.user);
            const change = kind === 'projects' ? prepareProject(input, existing, req) : prepareTask(input, existing);
            const key = kind === 'projects' ? change.data.project_code.toLowerCase() : JSON.stringify([change.data.classification, change.data.task_category.toLowerCase()]);
            if (seenKeys.has(key)) fail(`Duplicate ${kind === 'projects' ? 'Project Code' : 'task name and classification'} in file`);
            if (existing && seenIds.has(existing.id)) fail(`Duplicate record ID ${existing.id} in file`);
            seenKeys.add(key);
            if (existing) seenIds.add(existing.id);
            changes.push({ ...change, existing });
          } catch (error) { errors.push(`Row ${rowNumber}: ${error.message}`); }
        }
        const removed = [];
        for (const [id, name] of manifest || []) {
          const existing = db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(id);
          if (!existing) continue; // Web deletion is never undone by an old export.
          try {
            if (kind === 'projects') checkScope(req.user, existing);
            const currentName = kind === 'projects' ? existing.project_code : existing.task_category;
            if (currentName !== name) fail('This record changed since export. Export a fresh workbook.');
            if (!seenIds.has(id) && existing.active) removed.push(existing);
          } catch (error) { errors.push(`Exported ${kind === 'projects' ? 'project' : 'task'} ${name} (ID ${id}): ${error.message}`); }
        }
        if (errors.length) return null;
        let created = 0, updated = 0;
        for (const { data, groups, members, existing } of changes) {
          const keys = Object.keys(data);
          let id = existing?.id;
          if (existing) {
            db.prepare(`UPDATE ${kind} SET ${keys.map(key => `${key}=?`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...Object.values(data), id);
            updated++;
          } else {
            id = Number(db.prepare(`INSERT INTO ${kind} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(data)).lastInsertRowid);
            created++;
          }
          if (kind === 'projects') { saveAssignments(id, groups); saveProjectUsers(id, members); }
          db.prepare('INSERT INTO audit_logs(user_id,action,details,entity_type,entity_id,division_id,ip_address) VALUES (?,?,?,?,?,?,?)')
            .run(req.user.id, `IMPORT_${existing ? 'UPDATE' : 'CREATE'}_${kind === 'projects' ? 'PROJECT' : 'TASK'}`, `Imported ${kind} row`, kind === 'projects' ? 'project' : 'task', id, data.division_id || null, req.ip);
        }
        for (const record of removed) {
          db.prepare(`UPDATE ${kind} SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(record.id);
          db.prepare('INSERT INTO audit_logs(user_id,action,details,entity_type,entity_id,division_id,ip_address) VALUES (?,?,?,?,?,?,?)')
            .run(req.user.id, `IMPORT_DEACTIVATE_${kind === 'projects' ? 'PROJECT' : 'TASK'}`, 'Row removed from exported workbook', kind === 'projects' ? 'project' : 'task', record.id, record.division_id || null, req.ip);
        }
        return { imported: changes.length, created, updated, deactivated: removed.length, skipped: 0, total: rows.length, errors: [] };
      })();
      if (errors.length) return res.status(400).json({ error: `No ${kind} changed. Correct the errors and try again.`, errors });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: `No ${kind} changed. Import failed: ${error.message}` });
    } finally { fs.rmSync(req.file.path, { force: true }); }
  });
}

module.exports = router;
