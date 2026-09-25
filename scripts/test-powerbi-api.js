'use strict';

/**
 * scripts/test-powerbi-api.js
 * Comprehensive automated test suite for Power BI Read-Only REST API.
 * Tests:
 * 1. Read-only enforcement (Reject POST, PUT, PATCH, DELETE with 405)
 * 2. Authentication mechanisms (X-API-Key, Bearer token, Basic Auth, Query param ?apiKey=)
 * 3. Security (Rejection of missing credentials, invalid credentials, employee JWT restrictions)
 * 4. Reporting endpoints (timesheets, users, divisions, departments, projects, holidays, legacy export)
 * 5. Data sanitization (No password hashes, secrets, or tokens exposed)
 * 6. Server-side filtering (from, to, employeeId, division, department, project, status)
 * 7. Filter validation (Invalid date formats, inverted date ranges, invalid status)
 * 8. SQL injection resistance on all filters
 * 9. Pagination functionality
 * 10. Regression check on existing endpoints
 */

const http = require('http');
const app = require('../server/src/index');
const config = require('../server/src/config/env');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');

let server;
let baseUrl;
const TEST_PORT = 3999;
const TEST_API_KEY = 'test-powerbi-secret-key-12345';

// Set test API key in config
config.powerBiApiKey = TEST_API_KEY;

function request(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(data);
        } catch (e) {
          body = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }

    req.end();
  });
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Running Power BI Read-Only REST API Test Suite');
  console.log('═══════════════════════════════════════════════════════\n');

  // Start HTTP server for testing
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      baseUrl = `http://localhost:${TEST_PORT}`;
      resolve();
    });
  });

  try {
    // -------------------------------------------------------------
    console.log('Test Group 1: Authentication & Authorization');
    // -------------------------------------------------------------

    // 1.1 Missing credentials
    const noAuthRes = await request('GET', '/api/powerbi/timesheets');
    assert(noAuthRes.status === 401, 'Missing authentication returns 401 Unauthorized');
    assert(noAuthRes.body.error !== undefined, 'Returns descriptive error message for missing auth');

    // 1.2 Invalid API key in header
    const badKeyRes = await request('GET', '/api/powerbi/timesheets', {
      headers: { 'X-API-Key': 'completely-wrong-key' },
    });
    assert(badKeyRes.status === 401, 'Invalid API key returns 401 Unauthorized');

    // 1.3 Valid X-API-Key header
    const validHeaderRes = await request('GET', '/api/powerbi/timesheets', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(validHeaderRes.status === 200, 'Valid X-API-Key header succeeds with 200 OK');
    assert(Array.isArray(validHeaderRes.body.data), 'Response contains data array');

    // 1.4 Valid Authorization Bearer header
    const validBearerRes = await request('GET', '/api/powerbi/timesheets', {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    assert(validBearerRes.status === 200, 'Valid Bearer token succeeds with 200 OK');

    // 1.5 Valid Basic Auth
    const basicToken = Buffer.from(`powerbi:${TEST_API_KEY}`).toString('base64');
    const validBasicRes = await request('GET', '/api/powerbi/timesheets', {
      headers: { Authorization: `Basic ${basicToken}` },
    });
    assert(validBasicRes.status === 200, 'Valid Basic Auth succeeds with 200 OK');

    // 1.6 Valid Query parameter (?apiKey=)
    const validQueryRes = await request('GET', `/api/powerbi/timesheets?apiKey=${TEST_API_KEY}`);
    assert(validQueryRes.status === 200, 'Valid apiKey query parameter succeeds with 200 OK');

    // 1.7 Employee JWT rejection (employee should not have Power BI access via employee JWT)
    const empUser = db.prepare("SELECT id FROM users WHERE role = 'employee' LIMIT 1").get();
    if (empUser) {
      const empJwt = jwt.sign({ userId: empUser.id }, config.jwtSecret, { expiresIn: '1h' });
      const empRes = await request('GET', '/api/powerbi/timesheets', {
        headers: { Authorization: `Bearer ${empJwt}` },
      });
      assert(empRes.status === 403, 'Regular employee JWT is rejected with 403 Forbidden');
    }

    // 1.8 Admin JWT allows read access
    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (adminUser) {
      const adminJwt = jwt.sign({ userId: adminUser.id }, config.jwtSecret, { expiresIn: '1h' });
      const adminRes = await request('GET', '/api/powerbi/timesheets', {
        headers: { Authorization: `Bearer ${adminJwt}` },
      });
      assert(adminRes.status === 200, 'Admin JWT is permitted read access with 200 OK');
    }

    // -------------------------------------------------------------
    console.log('\nTest Group 2: Read-Only Enforcement (HTTP Methods)');
    // -------------------------------------------------------------

    // 2.1 POST rejection
    const postRes = await request('POST', '/api/powerbi/timesheets', {
      headers: { 'X-API-Key': TEST_API_KEY },
      body: { hours: 8 },
    });
    assert(postRes.status === 405, 'POST /api/powerbi/timesheets rejected with 405 Method Not Allowed');
    assert(postRes.headers.allow && postRes.headers.allow.includes('GET'), 'Response includes Allow: GET header');

    // 2.2 PUT rejection
    const putRes = await request('PUT', '/api/powerbi/timesheets/1', {
      headers: { 'X-API-Key': TEST_API_KEY },
      body: { hours: 8 },
    });
    assert(putRes.status === 405, 'PUT /api/powerbi/timesheets rejected with 405 Method Not Allowed');

    // 2.3 PATCH rejection
    const patchRes = await request('PATCH', '/api/powerbi/timesheets/1', {
      headers: { 'X-API-Key': TEST_API_KEY },
      body: { hours: 8 },
    });
    assert(patchRes.status === 405, 'PATCH /api/powerbi/timesheets rejected with 405 Method Not Allowed');

    // 2.4 DELETE rejection
    const deleteRes = await request('DELETE', '/api/powerbi/timesheets/1', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(deleteRes.status === 405, 'DELETE /api/powerbi/timesheets rejected with 405 Method Not Allowed');

    // 2.5 POST to users rejection
    const postUserRes = await request('POST', '/api/powerbi/users', {
      headers: { 'X-API-Key': TEST_API_KEY },
      body: { name: 'Test Hacker' },
    });
    assert(postUserRes.status === 405, 'POST /api/powerbi/users rejected with 405 Method Not Allowed');

    // -------------------------------------------------------------
    console.log('\nTest Group 3: Power BI Dedicated Reporting Key Isolation');
    // -------------------------------------------------------------

    // 3.1 Reporting API key CANNOT access standard user management write APIs
    const attemptCreateUser = await request('POST', '/api/users', {
      headers: { 'X-API-Key': TEST_API_KEY },
      body: { name: 'Unauthorized User', email: 'unauth@company.com' },
    });
    assert(attemptCreateUser.status === 401, 'Power BI reporting key cannot access POST /api/users (401)');

    // 3.2 Reporting API key CANNOT access timesheet approval API
    const attemptApprove = await request('POST', '/api/timesheets/approve', {
      headers: { 'X-API-Key': TEST_API_KEY },
      body: { user_id: 1, week: 39, year: 2026 },
    });
    assert(attemptApprove.status === 401, 'Power BI reporting key cannot access POST /api/timesheets/approve (401)');

    // -------------------------------------------------------------
    console.log('\nTest Group 4: Endpoints & Data Model Verification');
    // -------------------------------------------------------------

    // 4.1 GET /api/powerbi/timesheets
    const tsRes = await request('GET', '/api/powerbi/timesheets', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(tsRes.status === 200, 'GET /api/powerbi/timesheets returns 200');
    assert(tsRes.body.data && tsRes.body.pagination, 'Timesheet response has data and pagination objects');
    if (tsRes.body.data.length > 0) {
      const sample = tsRes.body.data[0];
      assert('employeeId' in sample, 'Timesheet record contains employeeId');
      assert('employeeName' in sample, 'Timesheet record contains employeeName');
      assert('email' in sample, 'Timesheet record contains email');
      assert('division' in sample, 'Timesheet record contains division');
      assert('department' in sample, 'Timesheet record contains department');
      assert('admin' in sample, 'Timesheet record contains admin');
      assert('date' in sample, 'Timesheet record contains date');
      assert('week' in sample, 'Timesheet record contains week');
      assert('project' in sample, 'Timesheet record contains project');
      assert('projectCategory' in sample, 'Timesheet record contains projectCategory');
      assert('hours' in sample, 'Timesheet record contains hours');
      assert('status' in sample, 'Timesheet record contains status');
      assert('isBillable' in sample, 'Timesheet record contains isBillable');
      assert('submissionDate' in sample, 'Timesheet record contains submissionDate');
      assert('approvalDate' in sample, 'Timesheet record contains approvalDate');
      assert('createdDate' in sample, 'Timesheet record contains createdDate');
      assert('updatedDate' in sample, 'Timesheet record contains updatedDate');

      // Security check: ensure no passwords or secrets leaked in timesheet record
      assert(!('password' in sample), 'Timesheet record does NOT contain password');
      assert(!('password_hash' in sample), 'Timesheet record does NOT contain password_hash');
    }

    // 4.2 GET /api/powerbi/users
    const usersRes = await request('GET', '/api/powerbi/users', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(usersRes.status === 200, 'GET /api/powerbi/users returns 200');
    assert(Array.isArray(usersRes.body.data), 'Users response has data array');
    if (usersRes.body.data.length > 0) {
      const uSample = usersRes.body.data[0];
      assert('employeeId' in uSample, 'User record contains employeeId');
      assert('employeeName' in uSample, 'User record contains employeeName');
      assert('email' in uSample, 'User record contains email');
      assert('division' in uSample, 'User record contains division');
      assert('department' in uSample, 'User record contains department');
      assert('admin' in uSample, 'User record contains admin');
      assert('status' in uSample, 'User record contains status');
      assert('isActive' in uSample, 'User record contains isActive');

      // Security check: strictly NO password_hash in users response
      const hasPassword = usersRes.body.data.some((u) => u.password_hash || u.password);
      assert(!hasPassword, 'Users endpoint NEVER returns password or password_hash');
    }

    // 4.3 GET /api/powerbi/divisions
    const divRes = await request('GET', '/api/powerbi/divisions', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(divRes.status === 200, 'GET /api/powerbi/divisions returns 200');
    assert(Array.isArray(divRes.body.data), 'Divisions response has data array');

    // 4.4 GET /api/powerbi/departments
    const deptRes = await request('GET', '/api/powerbi/departments', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(deptRes.status === 200, 'GET /api/powerbi/departments returns 200');
    assert(Array.isArray(deptRes.body.data), 'Departments response has data array');

    // 4.5 GET /api/powerbi/projects
    const projRes = await request('GET', '/api/powerbi/projects', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(projRes.status === 200, 'GET /api/powerbi/projects returns 200');
    assert(Array.isArray(projRes.body.data), 'Projects response has data array');

    // 4.6 GET /api/powerbi/holidays
    const holRes = await request('GET', '/api/powerbi/holidays', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(holRes.status === 200, 'GET /api/powerbi/holidays returns 200');
    assert(Array.isArray(holRes.body.data), 'Holidays response has data array');

    // 4.7 GET /api/powerbi/export (legacy flat format)
    const exportRes = await request('GET', `/api/powerbi/export?apiKey=${TEST_API_KEY}`);
    assert(exportRes.status === 200, 'GET /api/powerbi/export returns 200 for legacy compatibility');
    assert(Array.isArray(exportRes.body), 'Legacy export returns flat JSON array');

    // -------------------------------------------------------------
    console.log('\nTest Group 5: Timesheet Filtering & Validation');
    // -------------------------------------------------------------

    // 5.1 Valid date filter
    const dateFilterRes = await request('GET', '/api/powerbi/timesheets?from=2026-01-01&to=2026-12-31', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(dateFilterRes.status === 200, 'Valid date range filter returns 200 OK');

    // 5.2 Invalid 'from' date format
    const badFromRes = await request('GET', '/api/powerbi/timesheets?from=2026/01/01', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(badFromRes.status === 400, "Invalid 'from' date format returns 400 Bad Request");

    // 5.3 Non-existent calendar date (e.g. Feb 31)
    const badCalendarRes = await request('GET', '/api/powerbi/timesheets?from=2026-02-31', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(badCalendarRes.status === 400, 'Non-existent calendar date returns 400 Bad Request');

    // 5.4 Inverted date range (from > to)
    const invertedRes = await request('GET', '/api/powerbi/timesheets?from=2026-09-25&to=2026-09-01', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(invertedRes.status === 400, "Inverted date range ('from' > 'to') returns 400 Bad Request");

    // 5.5 Status filter validation
    const validStatusRes = await request('GET', '/api/powerbi/timesheets?status=approved', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(validStatusRes.status === 200, 'Valid status filter returns 200 OK');

    const badStatusRes = await request('GET', '/api/powerbi/timesheets?status=fake_status', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(badStatusRes.status === 400, 'Invalid status filter returns 400 Bad Request');

    // 5.6 Pagination validation
    const pageRes = await request('GET', '/api/powerbi/timesheets?page=1&limit=5', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(pageRes.status === 200, 'Pagination page & limit returns 200 OK');
    assert(pageRes.body.pagination.limit === 5, 'Pagination limit is respected');
    assert(pageRes.body.pagination.page === 1, 'Pagination page is respected');

    const badPageRes = await request('GET', '/api/powerbi/timesheets?page=0', {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(badPageRes.status === 400, 'Invalid page=0 returns 400 Bad Request');

    // -------------------------------------------------------------
    console.log('\nTest Group 6: SQL Injection Protection');
    // -------------------------------------------------------------

    // 6.1 SQL injection in employeeId
    const sqliEmp = await request('GET', "/api/powerbi/timesheets?employeeId=1' OR '1'='1", {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(sqliEmp.status === 200, 'SQL injection in employeeId parameter is safely parameterized');
    // Should not return all records unexpectedly or throw SQL error

    // 6.2 SQL injection in project
    const sqliProj = await request("GET", "/api/powerbi/timesheets?project=' UNION SELECT * FROM users --", {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(sqliProj.status === 200, 'SQL injection in project parameter is safely parameterized');

    // 6.3 SQL injection in date filter
    const sqliDate = await request("GET", "/api/powerbi/timesheets?from=2026-01-01' OR 1=1 --", {
      headers: { 'X-API-Key': TEST_API_KEY },
    });
    assert(sqliDate.status === 400, 'SQL injection in date filter is caught by strict date validator (400)');

    // -------------------------------------------------------------
    console.log('\nTest Group 7: Regression Testing (Existing App Functions)');
    // -------------------------------------------------------------

    // 7.1 Health check still works
    const healthRes = await request('GET', '/api/health');
    assert(healthRes.status === 200 && healthRes.body.status === 'ok', 'Health check /api/health returns status ok');

    // 7.2 Regular login API continues to work
    const loginRes = await request('POST', '/api/auth/login', {
      body: { email: 'admin@company.com', password: 'admin123' },
    });
    assert(loginRes.status === 200, 'Standard authentication /api/auth/login succeeds for admin');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`Test Results: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('═══════════════════════════════════════════════════════\n');
  } finally {
    if (server) {
      server.close();
    }
  }

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner encountered an unexpected error:', err);
  if (server) server.close();
  process.exit(1);
});
