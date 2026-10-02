const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.powerBiApiKey = 'requirements-test-only';
const db = require('../server/src/config/db');
require('../server/src/config/migrate').migrate();
const express = require('../server/node_modules/express');
const jwt = require('../server/node_modules/jsonwebtoken');
const app = express();
app.use('/api/powerbi', require('../server/src/routes/powerbi'));
let server, base, north, south, employee, admin, other, project;
before(async () => {
  north=Number(db.prepare('INSERT INTO divisions(name) VALUES (?)').run('North').lastInsertRowid);
  south=Number(db.prepare('INSERT INTO divisions(name) VALUES (?)').run('South').lastInsertRowid);
  const insert=db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)');
  employee=Number(insert.run('E','e@test.invalid','unused','employee',north).lastInsertRowid);
  other=Number(insert.run('O','o@test.invalid','unused','employee',south).lastInsertRowid);
  admin=Number(insert.run('A','a@test.invalid','unused','admin',north).lastInsertRowid);
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(admin,north);
  db.prepare("INSERT INTO planned_vacations(user_id,vacation_date) VALUES (?, '2026-10-01')").run(employee);
  db.prepare("INSERT INTO planned_vacations(user_id,vacation_date) VALUES (?, '2026-10-02')").run(other);
  db.prepare("INSERT INTO division_updates(division_id,month,open_positions,new_joiners) VALUES (?, '2026-10',NULL,0)").run(north);
  db.prepare("INSERT INTO division_updates(division_id,month,open_positions,new_joiners) VALUES (?, '2026-10',4,2)").run(south);
  project=Number(db.prepare("INSERT INTO projects(project_code,project_name,division_id) VALUES ('P1','Test',?)").run(north).lastInsertRowid);
  const insertEntry=db.prepare('INSERT INTO timesheets(user_id,project_id,work_date,hours,status,week_number,week_year,details_json) VALUES (?,?,?,?,?,?,?,?)');
  for(const date of ['2026-09-28','2026-09-29']) insertEntry.run(employee,project,date,8,'approved',40,2026,'{"fundamental_error_count":2}');
  insertEntry.run(employee,project,'2026-10-05',8,'approved',41,2026,'{"fundamental_error_count":2}');
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}/api/powerbi`;
});
after(()=>{server?.close();db.close();});
async function get(endpoint, identity='key', method='GET') {
  const headers=identity==='key'?{'X-API-Key':config.powerBiApiKey}:identity?{Authorization:'Bearer '+jwt.sign({userId:identity},config.jwtSecret)}:{};
  const res=await fetch(base+'/'+endpoint,{headers,method});
  return {status:res.status,body:await res.json()};
}
test('staffing and planned vacation reads retain authentication, division scope, and read-only rules',async()=>{
  for(const endpoint of ['staffing','planned-vacations']) {
    assert.equal((await get(endpoint,null)).status,401);
    assert.equal((await get(endpoint,employee)).status,403);
    assert.equal((await get(endpoint,'key','POST')).status,405);
    assert.equal((await get(endpoint)).body.data.length,2);
    assert.equal((await get(endpoint,admin)).body.data.length,1);
  }
  const staffing=(await get('staffing',admin)).body.data[0];
  assert.equal(staffing.openPositions,null);
  assert.equal(staffing.newJoiners,0);
  assert.equal(staffing.date,'2026-10-01');
  assert.deepEqual(Object.keys(staffing).sort(),['id','divisionId','division','date','openPositions','newJoiners','updatedDate'].sort());
  assert.equal((await get('planned-vacations',admin)).body.data[0].userId,employee);
});
test('weekly row identities collapse daily detail copies while retaining separate weeks and stable IDs',async()=>{
  const {data,pagination}=(await get('timesheets?page=1&limit=2')).body;
  assert.equal(data.length,2); assert.equal(pagination.total,3);assert.equal(pagination.totalPages,2);
  const all=[...data,...(await get('timesheets?page=2&limit=2')).body.data];
  assert.equal(new Set(all.map(r=>r.weeklyRowKey)).size,2);
  assert(all.every(r=>r.userId===employee && r.projectId===project));
  assert.equal(new Map(all.map(r=>[r.weeklyRowKey,r.weeklyDetails.fundamental_error_count])).size,2);
  assert.equal([...new Map(all.map(r=>[r.weeklyRowKey,r.weeklyDetails.fundamental_error_count])).values()].reduce((a,b)=>a+b,0),4);
  assert(all.every(r=>!('password_hash' in r)));
});
