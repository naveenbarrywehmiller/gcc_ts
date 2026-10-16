const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = require('node:path').join(require('node:os').tmpdir(), `gcc-platforms-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
config.powerBiApiKey = 'platform-test-only';
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const ExcelJS = require('../server/node_modules/exceljs');
const { analysis, parseReportQuery } = require('../server/src/services/reporting');
let server, base, system, admin, employee, outsider, alpha, beta, a, a2, b, task, project, foreignProject;
const actor = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const period = 'start_date=2026-10-01&end_date=2026-10-16';
async function request(route, body, method = body === undefined ? 'GET' : 'POST', id = system) {
  const res = await fetch(base + route, { method, headers: {
    Authorization: `Bearer ${jwt.sign({ userId:id },config.jwtSecret)}`,
    ...(body === undefined ? {} : { 'Content-Type':'application/json' }),
  }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status:res.status, body:res.headers.get('content-type')?.includes('json') ? JSON.parse(bytes) : bytes };
}
before(async () => {
  const platform = name => Number(db.prepare('INSERT INTO platforms(name) VALUES (?)').run(name).lastInsertRowid);
  alpha=platform('Alpha'); beta=platform('Beta');
  const division = (name,platform) => Number(db.prepare('INSERT INTO divisions(name,platform_id) VALUES (?,?)').run(name,platform).lastInsertRowid);
  a=division('A Design',alpha); a2=division('A Engineering',alpha); b=division('B Design',beta);
  const user = (name,role,division) => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)').run(name,`${name}@platform.test`,'unused',role,division).lastInsertRowid);
  system=user('system','system admin',null); admin=user('admin','admin',a); employee=user('employee','employee',a); outsider=user('outsider','employee',b);
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(admin,a);
  for (const id of [employee,outsider]) db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id) VALUES (?,?)').run(id,system);
  task=Number(db.prepare("INSERT INTO tasks(task_category,classification) VALUES ('Design','Billable')").run().lastInsertRowid);
  const makeProject = (code,division) => {
    const id=Number(db.prepare('INSERT INTO projects(project_code,project_name,division_id) VALUES (?,?,?)').run(code,code,division).lastInsertRowid);
    db.prepare('INSERT INTO project_tasks(project_id,task_id) VALUES (?,?)').run(id,task); return id;
  };
  project=makeProject('ALPHA',a); foreignProject=makeProject('BETA',b);
  server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve)); base=`http://127.0.0.1:${server.address().port}/api`;
});
after(()=>{ server?.close(); db.close(); });

test('Platform management and mandatory Division associations are validated and scoped',async()=>{
  assert.equal((await request('/divisions',{name:'Missing'})).status,400);
  assert.equal((await request('/divisions',{name:'Invalid',platform_id:999999})).status,400);
  const created=await request('/divisions',{name:'Valid',platform_id:alpha}); assert.equal(created.status,201); assert.equal(created.body.division.platform_id,alpha);
  assert.equal((await request('/divisions',{name:'Valid',platform_id:beta})).status,409);
  assert.equal((await request(`/divisions/${a}`,{platform_id:null},'PUT')).status,400);
  assert.equal((await request('/platforms',{name:'Alpha'})).status,409);
  assert.equal((await request('/platforms',{name:'Unauthorized'},'POST',admin)).status,403);
  assert.equal((await request(`/platforms/${alpha}`,undefined,'DELETE')).status,409);
  assert.deepEqual((await request('/platforms',undefined,'GET',admin)).body.platforms.map(p=>p.id),[alpha]);
  assert.throws(()=>db.prepare('INSERT INTO divisions(name,platform_id) VALUES (?,?)').run('Bad FK',999999),/Platform/);
});
test('multiple Platforms and Divisions save atomically, deduplicate, and reload',async()=>{
  const saved=await request(`/users/${employee}`,{division_id:a,division_ids:[a,a2,b,a],platform_ids:[alpha,beta]},'PUT');
  assert.equal(saved.status,200,JSON.stringify(saved.body)); assert.deepEqual(saved.body.user.division_ids,[a,a2,b]); assert.deepEqual(saved.body.user.platform_ids,[alpha,beta]);
  const before=db.prepare('SELECT * FROM employee_divisions').all();
  assert.equal((await request(`/users/${employee}`,{name:'Must rollback',division_id:a,division_ids:[a,b],platform_ids:[alpha]},'PUT')).status,400);
  assert.deepEqual(db.prepare('SELECT * FROM employee_divisions').all(),before); assert.equal(actor(employee).name,'employee');
  const loaded=(await request(`/users/${employee}/divisions`)).body;
  assert(loaded.divisions.every(d=>d.platform_id && d.platform_name)); assert.equal(loaded.platforms.length,2);
  assert.equal((await request(`/users/${employee}`,{division_id:a,division_ids:[a],platform_ids:[alpha]},'PUT',admin)).status,403);
  assert.equal((await request(`/users/${admin}`,{division_id:a,division_ids:[a],platform_ids:[alpha,beta]},'PUT',admin)).status,403);
});
test('project membership respects actual Division grants and survives edit/reload',async()=>{
  assert.equal((await request(`/users/${outsider}`,{division_id:b,division_ids:[b],platform_ids:[alpha,beta]},'PUT')).status,200);
  assert.equal((await request(`/projects/${project}`,{user_assignment_mode:'selected',user_ids:[outsider]},'PUT')).status,403);
  const saved=await request(`/projects/${project}`,{user_assignment_mode:'selected',user_ids:[employee]},'PUT'); assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal(saved.body.project.users[0].platforms.length,2); assert.deepEqual(saved.body.project.user_ids,[employee]);
  const entry={project_id:project,task_id:task,work_date:'2026-10-05',hours:4,project_description:'Platform test'};
  assert.equal((await request('/timesheets',entry,'POST',employee)).status,201);
  assert.equal((await request('/timesheets',entry,'POST',outsider)).status,403);
  assert.equal((await request(`/projects/${project}`,{platform_id:beta},'PUT')).status,400);
  assert.equal((await request('/timesheets',{...entry,project_id:foreignProject,work_date:'2026-10-06',hours:3},'POST',employee)).status,201);
  assert.equal((await request('/timesheets',{...entry,project_id:foreignProject,work_date:'2026-10-07',hours:2},'POST',outsider)).status,201);
});
test('Platform report filters, detail rows and Power BI reconcile without multiplying hours',async()=>{
  const spec=ids=>parseReportQuery({start_date:'2026-10-01',end_date:'2026-10-16',platform_ids:ids});
  const combined=analysis(actor(system),spec(`${alpha},${beta}`),'2026-10-16');
  assert.equal(combined.summary.total_hours,9); assert.equal(combined.capacity.available,false);
  assert.equal(analysis(actor(system),spec(String(alpha))).summary.total_hours,4);
  assert.equal(analysis(actor(system),spec(String(beta))).summary.total_hours,5);
  const detail=(await request(`/reports/entries?${period}&platform_ids=${alpha},${beta}`)).body;
  assert.equal(detail.total,3); assert.equal(new Set(detail.data.map(r=>r.id)).size,3); assert(detail.data.every(r=>r.platform && r.entry_division));
  assert.equal((await request(`/reports/entries?${period}&platform_ids=${beta}&division_id=${a}`)).body.total,0);
  assert.equal((await request(`/reports/entries?${period}&platform_ids=${alpha},invalid`)).status,400);
  const bi=(await request(`/powerbi/timesheets?from=2026-10-01&to=2026-10-16&platform_ids=${alpha},${beta}`)).body;
  assert.equal(bi.data.reduce((n,r)=>n+r.hours,0),9); assert(bi.data.every(r=>r.platformId && r.divisionId));
  assert.equal((await request(`/powerbi/status-summary?platform_ids=${beta}`)).body.summary.totalHours,5);
  assert.equal((await request(`/powerbi/timesheets?platform_ids=${beta}`,undefined,'GET',admin)).body.data.length,0);
  assert.equal((await request(`/powerbi/status-summary?platform_ids=${beta}`,undefined,'GET',admin)).body.summary.totalHours,0);
  assert.equal((await request('/powerbi/divisions',undefined,'GET',admin)).body.data.length,1);
  assert((await request(`/powerbi/projects?platform_ids=${alpha}`)).body.data.every(p=>p.platformId===alpha));
  assert.equal((await request(`/powerbi/platforms?platform_ids=${alpha}`)).body.data[0].platformName,'Alpha');
  assert((await request(`/powerbi/users?platform_ids=${beta}`)).body.data.some(u=>u.id===employee));
  assert.equal((await request(`/powerbi/timesheets?division=A%20Design`)).body.data.reduce((n,r)=>n+r.hours,0),4);
  assert.equal((await request(`/powerbi/status-summary?division=A%20Design`)).body.summary.totalHours,4);
  db.prepare("INSERT INTO division_updates(division_id,month) VALUES (?,'2026-10')").run(b);
  db.prepare("INSERT INTO planned_vacations(user_id,vacation_date) VALUES (?,'2026-10-20')").run(outsider);
  for(const endpoint of ['staffing','planned-vacations']) {
    assert.equal((await request(`/powerbi/${endpoint}?platform_ids=${alpha}`)).body.data.length,0);
    const rows=(await request(`/powerbi/${endpoint}?platform_ids=${beta}`)).body.data;
    assert.equal(rows.length,1); assert.equal(rows[0].platformId,beta);
    assert.equal((await request(`/powerbi/${endpoint}?platform_ids=${beta}`,undefined,'GET',admin)).body.data.length,0);
  }
});
test('Excel and PDF use the same Platform-filtered records as the application',async()=>{
  for(const view of ['weekly','utilization','projects','missing','trends','details']) {
    const exported=await request(`/reports/export?${period}&platform_ids=${beta}&view=${view}&format=excel`); assert.equal(exported.status,200);
    const book=new ExcelJS.Workbook(); await book.xlsx.load(exported.body);
    const entries=book.getWorksheet('Timesheet Entries'); const headers=entries.getRow(1).values;
    const platformCol=headers.indexOf('Platform'),hourCol=headers.indexOf('Hours'); assert(platformCol>0);
    let hours=0; entries.eachRow((row,i)=>{if(i>1){assert.equal(row.getCell(platformCol).value,'Beta');hours+=row.getCell(hourCol).value;}}); assert.equal(hours,5);
    const pdf=await request(`/reports/export?${period}&platform_ids=${beta}&view=${view}&format=pdf`); assert.equal(pdf.status,200); assert.equal(pdf.body.subarray(0,4).toString(),'%PDF');
  }
});
test('removing a Division revokes project membership without deleting historical time',async()=>{
  const rows=db.prepare('SELECT * FROM timesheets ORDER BY id').all();
  const saved=await request(`/users/${employee}`,{division_id:b,division_ids:[b],platform_ids:[beta]},'PUT'); assert.equal(saved.status,200);
  assert.deepEqual(db.prepare('SELECT * FROM timesheets ORDER BY id').all(),rows);
  assert.deepEqual((await request(`/projects/${project}`)).body.project.user_ids,[]);
  assert.equal((await request(`/projects/${project}`)).body.project.user_assignment_mode,'selected');
  const bad={project_id:project,task_id:task,work_date:'2026-10-08',hours:1,project_description:'Revoked'};
  assert.equal((await request('/timesheets',bad,'POST',employee)).status,403);
  assert.equal((await request(`/reports/entries?${period}&platform_ids=${alpha}`)).body.total,1);
});
test('additive migration preserves IDs, hours, references and revoked grants on reruns',()=>{
  const before=db.prepare('SELECT * FROM timesheets').all();
  require('../server/src/config/platformMigration')(db);
  require('../server/src/config/platformMigration')(db);
  assert.deepEqual(db.prepare('SELECT * FROM timesheets').all(),before);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
  assert.deepEqual(db.prepare('SELECT platform_id FROM user_platforms WHERE user_id=?').all(employee).map(r=>r.platform_id),[beta]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM divisions WHERE platform_id IS NULL').get().n,0);
});

test('historical projectless rows retain all contributing Platforms without inflating totals',()=>{
  const insert=db.prepare("INSERT INTO timesheets(user_id,division_id,work_date,hours,project_description,status,week_number,week_year) VALUES (?,?,'2026-09-01',2,'Historical','approved',36,2026)");
  insert.run(employee,a); insert.run(employee,b);
  const report=analysis(actor(system),parseReportQuery({start_date:'2026-09-01',end_date:'2026-09-01'}));
  assert.equal(report.summary.total_hours,4);
  assert.equal(report.projects.length,1);
  assert.equal(report.projects[0].platform,'Alpha · Beta');
  assert.equal(report.projects[0].division,'A Design · B Design');
});

test('migration upgrades an original schema without changing existing foreign keys or time',()=>{
  const Database=require('../server/node_modules/better-sqlite3');
  const legacy=new Database(':memory:');
  try {
    legacy.pragma('foreign_keys=ON');
    legacy.exec(`CREATE TABLE divisions(id INTEGER PRIMARY KEY,name TEXT);
      CREATE TABLE users(id INTEGER PRIMARY KEY,division_id INTEGER REFERENCES divisions(id));
      CREATE TABLE projects(id INTEGER PRIMARY KEY,division_id INTEGER REFERENCES divisions(id));
      CREATE TABLE employee_divisions(user_id INTEGER,division_id INTEGER);
      CREATE TABLE admin_divisions(user_id INTEGER,division_id INTEGER);
      CREATE TABLE timesheets(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),project_id INTEGER REFERENCES projects(id),hours REAL);
      INSERT INTO divisions VALUES(25,'Existing'); INSERT INTO users VALUES(42,25);
      INSERT INTO projects VALUES(70,25); INSERT INTO timesheets VALUES(99,42,70,7.5);`);
    require('../server/src/config/platformMigration')(legacy);
    assert.deepEqual(legacy.prepare('SELECT * FROM timesheets').all(),[{id:99,user_id:42,project_id:70,hours:7.5}]);
    assert.equal(legacy.prepare('SELECT p.name FROM divisions d JOIN platforms p ON p.id=d.platform_id WHERE d.id=25').get().name,'Legacy / Unmapped');
    assert.equal(legacy.prepare('SELECT COUNT(*) n FROM user_platforms WHERE user_id=42').get().n,1);
    assert.equal(legacy.prepare('SELECT user_assignment_mode FROM projects WHERE id=70').get().user_assignment_mode,'division');
    assert.deepEqual(legacy.pragma('foreign_key_check'),[]);
    assert.throws(()=>legacy.prepare('UPDATE platforms SET id=999').run(),/Platform has divisions/);
  } finally { legacy.close(); }
});

test('CSV exports preserve Platform hierarchy, multiple assignments and historical hours',async()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  process.env.GCC_CSV_EXPORT_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gcc-platform-csv-'));
  db.prepare('INSERT INTO subdivisions(name,division_id) VALUES (?,?)').run('CSV Location',a);
  await require('./export-to-sharepoint-csv').runExports();
  const read=async name=>{
    const book=new ExcelJS.Workbook(); const sheet=await book.csv.readFile(path.join(process.env.GCC_CSV_EXPORT_DIR,name));
    const headers=sheet.getRow(1).values;
    return sheet.getRows(2,sheet.rowCount-1).map(row=>Object.fromEntries(headers.slice(1).map((h,i)=>[h,row.getCell(i+1).value])));
  };
  assert.equal((await read('3_subdivisions.csv'))[0].Platform,'Alpha');
  const entries=await read('9_timesheets.csv');
  assert.equal(entries.reduce((sum,r)=>sum+Number(r.Hours),0),4);
  assert.deepEqual(new Set(entries.map(r=>r.Platform)),new Set(['Alpha','Beta']));
  const user=(await read('5_employees.csv')).find(r=>r.Title==='outsider');
  assert.equal(user.AssignedPlatforms,'Alpha; Beta');
  assert.equal(user.AssignedDivisions,'B Design');
});
