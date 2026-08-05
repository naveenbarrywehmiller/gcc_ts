const db = require('./db');
const bcrypt = require('bcryptjs');
const { migrate } = require('./migrate');

function seed() {
  console.log('🌱 Seeding database...');

  // Run migrations first
  migrate();

  // Check if already seeded
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@company.com');
  if (existingAdmin) {
    console.log('⚠️  Database already seeded. Skipping.');
    // Still seed new tables if they're empty
    seedNewTablesIfEmpty();
    return;
  }

  const adminHash = bcrypt.hashSync('admin123', 12);
  const employeeHash = bcrypt.hashSync('password123', 12);

  // Seed divisions (use INSERT OR IGNORE for re-run safety)
  const insertDivision = db.prepare('INSERT OR IGNORE INTO divisions (name) VALUES (?)');
  const seedDivisions = db.transaction(() => {
    ['Engineering', 'Design', 'QA', 'IT', 'Management', 'HR', 'Finance'].forEach(d => insertDivision.run(d));
  });
  seedDivisions();

  // Seed departments (use INSERT OR IGNORE — migration may have pre-seeded them)
  const insertDepartment = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
  const seedDepartments = db.transaction(() => {
    ['Controls', 'Electrical', 'Mechanical', 'IT', 'Manufacturing', 'Quality', 'Others'].forEach(d => insertDepartment.run(d));
  });
  seedDepartments();

  // Seed supporting categories (use INSERT OR IGNORE — migration may have pre-seeded them)
  const insertSC = db.prepare('INSERT OR IGNORE INTO supporting_categories (name) VALUES (?)');
  const seedSCs = db.transaction(() => {
    ['Dedicated Team', 'Flex Team'].forEach(s => insertSC.run(s));
  });
  seedSCs();

  // Seed subdivisions (some divisions have subdivisions, some don't)
  const getDivisionId = (name) => db.prepare('SELECT id FROM divisions WHERE name = ?').get(name)?.id;
  const insertSubdiv = db.prepare('INSERT INTO subdivisions (name, division_id) VALUES (?, ?)');
  const seedSubdivisions = db.transaction(() => {
    const engId = getDivisionId('Engineering');
    const itId = getDivisionId('IT');
    const qaId = getDivisionId('QA');
    if (engId) {
      insertSubdiv.run('Frontend', engId);
      insertSubdiv.run('Backend', engId);
      insertSubdiv.run('DevOps', engId);
    }
    if (itId) {
      insertSubdiv.run('Infrastructure', itId);
      insertSubdiv.run('Security', itId);
    }
    if (qaId) {
      insertSubdiv.run('Manual Testing', qaId);
      insertSubdiv.run('Automation', qaId);
    }
  });
  seedSubdivisions();

  // Get FK IDs for seeding
  const getSCId = (name) => db.prepare('SELECT id FROM supporting_categories WHERE name = ?').get(name)?.id;
  const getDeptId = (name) => db.prepare('SELECT id FROM departments WHERE name = ?').get(name)?.id;
  const dedicatedId = getSCId('Dedicated Team');
  const flexId = getSCId('Flex Team');
  const itDeptId = getDeptId('IT');
  const mechDeptId = getDeptId('Mechanical');
  const elecDeptId = getDeptId('Electrical');
  const qualityDeptId = getDeptId('Quality');

  // Seed users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, division, core, team_type, division_id, department_id, supporting_category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedUsers = db.transaction(() => {
    insertUser.run('System Admin', 'admin@company.com', adminHash, 'admin', 'IT', 'Core', 'Dedicated', getDivisionId('IT'), itDeptId, dedicatedId);
    insertUser.run('John Smith', 'john.smith@company.com', employeeHash, 'employee', 'Engineering', 'Core', 'Dedicated', getDivisionId('Engineering'), mechDeptId, dedicatedId);
    insertUser.run('Jane Doe', 'jane.doe@company.com', employeeHash, 'employee', 'Engineering', 'Support', 'Flex', getDivisionId('Engineering'), elecDeptId, flexId);
    insertUser.run('Bob Wilson', 'bob.wilson@company.com', employeeHash, 'employee', 'Design', 'Core', 'Dedicated', getDivisionId('Design'), mechDeptId, dedicatedId);
    insertUser.run('Alice Chen', 'alice.chen@company.com', employeeHash, 'employee', 'QA', 'Core', 'Flex', getDivisionId('QA'), qualityDeptId, flexId);
  });
  seedUsers();

  // Seed admin_divisions - assign admin to multiple divisions
  const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@company.com');
  const allDivisions = db.prepare('SELECT id FROM divisions').all();
  const insertAdminDiv = db.prepare('INSERT INTO admin_divisions (user_id, division_id) VALUES (?, ?)');
  const seedAdminDivisions = db.transaction(() => {
    allDivisions.forEach(d => insertAdminDiv.run(adminUser.id, d.id));
  });
  seedAdminDivisions();

  // Seed activities
  const insertActivity = db.prepare('INSERT INTO activities (name) VALUES (?)');
  const seedActivities = db.transaction(() => {
    ['Development', 'Testing', 'Design', 'Documentation', 'Meeting', 'Training', 'Support', 'Research', 'Deployment', 'Code Review'].forEach(a => insertActivity.run(a));
  });
  seedActivities();

  // Seed projects (with division_id FK)
  const insertProject = db.prepare(`
    INSERT INTO projects (project_code, project_name, customer_name, activity, division, team_type, division_id, subdivision_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getSubdivId = (name) => db.prepare('SELECT id FROM subdivisions WHERE name = ?').get(name)?.id;

  const seedProjects = db.transaction(() => {
    insertProject.run('PRJ-001', 'Internal Portal Redesign', 'Internal', 'Development', 'Engineering', 'Dedicated', getDivisionId('Engineering'), getSubdivId('Frontend'));
    insertProject.run('PRJ-002', 'Mobile App v2', 'ClientCorp', 'Development', 'Engineering', 'Dedicated', getDivisionId('Engineering'), getSubdivId('Backend'));
    insertProject.run('PRJ-003', 'Data Migration', 'TechStart Inc', 'Development', 'IT', 'Flex', getDivisionId('IT'), getSubdivId('Infrastructure'));
    insertProject.run('PRJ-004', 'UX Audit', 'DesignHub', 'Design', 'Design', 'Flex', getDivisionId('Design'), null);
    insertProject.run('PRJ-005', 'API Gateway', 'Internal', 'Development', 'Engineering', 'Dedicated', getDivisionId('Engineering'), getSubdivId('DevOps'));
    insertProject.run('INT-001', 'Training & Development', 'Internal', 'Training', 'HR', 'Flex', getDivisionId('HR'), null);
    insertProject.run('INT-002', 'Team Meetings', 'Internal', 'Meeting', 'Management', 'Flex', getDivisionId('Management'), null);
    insertProject.run('INT-003', 'Leave / Holiday', 'Internal', 'Support', 'HR', 'Flex', getDivisionId('HR'), null);
  });
  seedProjects();

  // Seed tasks (requires_project: 1 = needs project, 0 = standalone like Leave/Meeting)
  const insertTask = db.prepare(`
    INSERT INTO tasks (classification, task_category, task_description, requires_project)
    VALUES (?, ?, ?, ?)
  `);

  const seedTasks = db.transaction(() => {
    insertTask.run('Billable', 'Development', 'Feature development and coding', 1);
    insertTask.run('Billable', 'Bug Fix', 'Bug investigation and fixing', 1);
    insertTask.run('Billable', 'Code Review', 'Reviewing pull requests and code', 1);
    insertTask.run('Billable', 'Testing', 'Writing and running tests', 1);
    insertTask.run('Billable', 'Design', 'UI/UX design work', 1);
    insertTask.run('Billable', 'Documentation', 'Writing technical documentation', 1);
    insertTask.run('Non-Billable', 'Meeting', 'Team meetings and stand-ups', 0);
    insertTask.run('Non-Billable', 'Training', 'Learning and training activities', 0);
    insertTask.run('Non-Billable', 'Admin', 'Administrative tasks', 0);
    insertTask.run('Non-Billable', 'Leave', 'Paid time off / sick leave', 0);
  });
  seedTasks();

  // Seed holidays (2026 sample)
  const insertHoliday = db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?)');
  const seedHolidays = db.transaction(() => {
    insertHoliday.run('2026-01-01', 'New Year\'s Day');
    insertHoliday.run('2026-01-26', 'Republic Day');
    insertHoliday.run('2026-03-30', 'Holi');
    insertHoliday.run('2026-04-03', 'Good Friday');
    insertHoliday.run('2026-05-01', 'Labour Day');
    insertHoliday.run('2026-08-15', 'Independence Day');
    insertHoliday.run('2026-10-02', 'Gandhi Jayanti');
    insertHoliday.run('2026-10-20', 'Dussehra');
    insertHoliday.run('2026-11-09', 'Diwali');
    insertHoliday.run('2026-12-25', 'Christmas');
  });
  seedHolidays();

  console.log('✅ Database seeded successfully.');
  console.log('   Admin: admin@company.com / admin123');
  console.log('   Employees: john.smith@company.com / password123');
}

/**
 * Seed new tables if they were added after initial seeding.
 * This ensures existing databases get the new master data.
 */
function seedNewTablesIfEmpty() {
  // Seed departments if empty
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get();
  if (deptCount.count === 0) {
    console.log('  → Seeding departments...');
    const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
    ['Controls', 'Electrical', 'Mechanical', 'IT', 'Manufacturing', 'Quality', 'Others'].forEach(d => insertDept.run(d));
  }

  // Seed supporting categories if empty
  const scCount = db.prepare('SELECT COUNT(*) as count FROM supporting_categories').get();
  if (scCount.count === 0) {
    console.log('  → Seeding supporting categories...');
    const insertSC = db.prepare('INSERT OR IGNORE INTO supporting_categories (name) VALUES (?)');
    ['Dedicated Team', 'Flex Team'].forEach(s => insertSC.run(s));
  }

  // Seed subdivisions if empty (only if divisions exist)
  const subdivCount = db.prepare('SELECT COUNT(*) as count FROM subdivisions').get();
  if (subdivCount.count === 0) {
    const divs = db.prepare('SELECT id, name FROM divisions WHERE active = 1').all();
    if (divs.length > 0) {
      console.log('  → Seeding sample subdivisions...');
      const insertSubdiv = db.prepare('INSERT INTO subdivisions (name, division_id) VALUES (?, ?)');
      const getDivId = (name) => divs.find(d => d.name === name)?.id;
      const engId = getDivId('Engineering');
      const itId = getDivId('IT');
      const qaId = getDivId('QA');
      if (engId) {
        insertSubdiv.run('Frontend', engId);
        insertSubdiv.run('Backend', engId);
        insertSubdiv.run('DevOps', engId);
      }
      if (itId) {
        insertSubdiv.run('Infrastructure', itId);
        insertSubdiv.run('Security', itId);
      }
      if (qaId) {
        insertSubdiv.run('Manual Testing', qaId);
        insertSubdiv.run('Automation', qaId);
      }
    }
  }
}

// Run if called directly
if (require.main === module) {
  seed();
  process.exit(0);
}

module.exports = seed;

