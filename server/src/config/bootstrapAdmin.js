const bcrypt = require('bcryptjs');

// Explicit, one-time provisioning. Never recreate an account based on its email.
function bootstrapAdmin(db, env = process.env) {
  return db.transaction(() => {
    if (db.prepare("SELECT id FROM users WHERE role = 'system admin' LIMIT 1").get()) return;
    const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email && !password) return;
    if (!email || !email.includes('@') || !password || password.length < 12) {
      throw new Error('Bootstrap requires BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters)');
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      throw new Error('Bootstrap email already belongs to an existing user');
    }
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run('System Admin', email, bcrypt.hashSync(password, 12), 'system admin');
  })();
}

module.exports = { bootstrapAdmin };
