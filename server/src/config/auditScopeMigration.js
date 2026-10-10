module.exports = function auditScopeMigration(db) {
  if (!db.prepare('PRAGMA table_info(audit_logs)').all().some(column => column.name === 'division_id')) {
    // Historic events lack a trustworthy division snapshot and remain system-admin only.
    db.exec('ALTER TABLE audit_logs ADD COLUMN division_id INTEGER');
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_division ON audit_logs(division_id);
    CREATE TRIGGER IF NOT EXISTS audit_logs_snapshot_division AFTER INSERT ON audit_logs
    WHEN NEW.division_id IS NULL
    BEGIN
      UPDATE audit_logs SET division_id = CASE
        WHEN NEW.entity_type = 'user' THEN (SELECT division_id FROM users WHERE id = NEW.entity_id)
        WHEN NEW.entity_type = 'project' THEN (SELECT division_id FROM projects WHERE id = NEW.entity_id)
        WHEN NEW.entity_type = 'subdivision' THEN (SELECT division_id FROM subdivisions WHERE id = NEW.entity_id)
        WHEN NEW.action IN ('LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'SUBMIT_TIMESHEET', 'POST_TIMESHEET', 'POWER_AUTOMATE_APPROVAL')
          THEN (SELECT division_id FROM users WHERE id = NEW.user_id)
        ELSE NULL END
      WHERE id = NEW.id;
    END;
  `);
};
