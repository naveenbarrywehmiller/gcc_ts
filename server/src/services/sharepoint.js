/**
 * sharepoint.js — Microsoft Graph / SharePoint REST API client
 *
 * Provides CRUD operations against SharePoint Online lists.
 * Uses client credentials flow (application permissions) — server-side only.
 * Client secrets are NEVER exposed to the browser.
 *
 * All methods are no-ops when ENABLE_SHAREPOINT_SYNC=false (default).
 */

const config = require('../config/env');

// ─── Token cache ────────────────────────────────────────────────────────────
let _tokenCache = null;

/**
 * Acquire an access token for SharePoint using client credentials flow.
 * Token is cached until 5 minutes before expiry.
 *
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  if (!config.enableSharepointSync) {
    throw new Error('SharePoint sync is disabled (ENABLE_SHAREPOINT_SYNC=false)');
  }
  if (!config.entraTenantId || !config.sharepointClientId || !config.sharepointClientSecret) {
    throw new Error('SharePoint configuration incomplete. Check ENTRA_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET in .env');
  }

  // Return cached token if still valid (with 5-min buffer)
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 300000) {
    return _tokenCache.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${config.entraTenantId}/oauth2/v2.0/token`;
  const sharepointHost = new URL(config.sharepointSiteUrl).hostname;
  const scope = `https://${sharepointHost}/.default`;

  const body = new URLSearchParams({
    client_id: config.sharepointClientId,
    client_secret: config.sharepointClientSecret,
    grant_type: 'client_credentials',
    scope,
  });

  // Use native fetch (Node 18+) or fall back gracefully
  const fetchFn = globalThis.fetch;
  if (!fetchFn) throw new Error('Node.js 18+ required for SharePoint sync (fetch API)');

  const response = await fetchFn(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`SharePoint token acquisition failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  _tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
  return _tokenCache.token;
}

/**
 * Make an authenticated REST call to SharePoint.
 *
 * Implements retry with exponential backoff for 429 (throttle) responses.
 *
 * @param {string} method HTTP method
 * @param {string} relativeUrl Relative URL path after the site URL
 * @param {object} [body] Request body (JSON)
 * @param {number} [retries] Retry count remaining
 * @returns {Promise<object>} Parsed JSON response
 */
async function spFetch(method, relativeUrl, body = null, retries = 3) {
  const token = await getAccessToken();
  const url = `${config.sharepointSiteUrl}${relativeUrl}`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json;odata=nometadata',
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await globalThis.fetch(url, options);

  // Handle throttling (429) with retry-after backoff
  if (response.status === 429 && retries > 0) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
    console.warn(`[SharePoint] Throttled — retrying after ${retryAfter}s (${retries} retries left)`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spFetch(method, relativeUrl, body, retries - 1);
  }

  if (response.status === 204) return null; // No content (DELETE success)

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SharePoint ${method} ${url} failed: ${response.status} ${errText}`);
  }

  return response.json();
}

// ─── List helpers ────────────────────────────────────────────────────────────

const LIST_ENDPOINTS = {
  employees:     '/_api/web/lists/getbytitle(\'TS_Employees\')/items',
  divisions:     '/_api/web/lists/getbytitle(\'TS_Divisions\')/items',
  subdivisions:  '/_api/web/lists/getbytitle(\'TS_Subdivisions\')/items',
  departments:   '/_api/web/lists/getbytitle(\'TS_Departments\')/items',
  ownerships:    '/_api/web/lists/getbytitle(\'TS_DepartmentOwnerships\')/items',
  projects:      '/_api/web/lists/getbytitle(\'TS_Projects\')/items',
  tasks:         '/_api/web/lists/getbytitle(\'TS_Tasks\')/items',
  holidays:      '/_api/web/lists/getbytitle(\'TS_Holidays\')/items',
  timesheets:    '/_api/web/lists/getbytitle(\'TS_TimesheetEntries\')/items',
};

/**
 * Get items from a SharePoint list with optional OData filter.
 *
 * @param {string} listKey Key from LIST_ENDPOINTS
 * @param {string} [filter] OData $filter expression
 * @param {string} [select] OData $select fields
 * @param {number} [top] Max items to return (default 500)
 * @returns {Promise<Array>}
 */
async function getListItems(listKey, filter = null, select = null, top = 500) {
  let url = `${LIST_ENDPOINTS[listKey]}?$top=${top}`;
  if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
  if (select) url += `&$select=${encodeURIComponent(select)}`;
  const result = await spFetch('GET', url);
  return result.value || [];
}

/**
 * Create a new item in a SharePoint list.
 *
 * @param {string} listKey Key from LIST_ENDPOINTS
 * @param {object} fields Field values
 * @returns {Promise<object>} Created item
 */
async function createListItem(listKey, fields) {
  return spFetch('POST', LIST_ENDPOINTS[listKey], fields);
}

/**
 * Update an existing SharePoint list item by its ID.
 *
 * SharePoint REST requires IF-MATCH: * header and X-HTTP-Method: MERGE for updates.
 *
 * @param {string} listKey Key from LIST_ENDPOINTS
 * @param {number} itemId SharePoint item ID
 * @param {object} fields Fields to update
 * @returns {Promise<null>}
 */
async function updateListItem(listKey, itemId, fields) {
  const token = await getAccessToken();
  const url = `${config.sharepointSiteUrl}${LIST_ENDPOINTS[listKey]}(${itemId})`;

  const response = await globalThis.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json',
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify(fields),
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return updateListItem(listKey, itemId, fields);
  }

  if (!response.ok && response.status !== 204) {
    const err = await response.text();
    throw new Error(`SharePoint MERGE ${url} failed: ${response.status} ${err}`);
  }

  return null;
}

// ─── Timesheet-specific operations ──────────────────────────────────────────

/**
 * Sync a single timesheet entry to SharePoint.
 * If the entry already exists (by Title), update it. Otherwise create it.
 *
 * @param {object} entry SQLite timesheet entry row (with joined fields)
 */
async function syncTimesheetEntry(entry) {
  if (!config.enableSharepointSync) return;

  const title = `${entry.user_email}_${entry.work_date}_${entry.project_code || entry.task_category || 'NOTASK'}`;

  // Check if item already exists
  const existing = await getListItems('timesheets', `Title eq '${title}'`, 'Id', 1);

  const fields = {
    Title: title,
    EmployeeEmail: entry.user_email || '',
    WorkDate: entry.work_date,
    WeekNumber: entry.week_number,
    WeekYear: entry.week_year,
    Hours: entry.hours,
    Description: entry.description || '',
    Billable: !!entry.billable,
    Status: capitalizeStatus(entry.status),
  };

  if (entry.submitted_at) fields.SubmittedDate = entry.submitted_at;
  if (entry.approved_at) fields.ApprovedDate = entry.approved_at;
  if (entry.rejected_at) fields.RejectedDate = entry.rejected_at;
  if (entry.admin_comment) fields.ApproverComments = entry.admin_comment;
  if (entry.project_description) fields.ProjectDescription = entry.project_description;

  if (existing.length > 0) {
    await updateListItem('timesheets', existing[0].Id, fields);
  } else {
    await createListItem('timesheets', fields);
  }
}

/**
 * Update a timesheet entry's status in SharePoint after approval/rejection.
 *
 * @param {string} employeeEmail
 * @param {number} weekNumber
 * @param {number} weekYear
 * @param {string} status New status
 * @param {string} [approverEmail]
 * @param {string} [comments]
 */
async function updateTimesheetStatus(employeeEmail, weekNumber, weekYear, status, approverEmail = null, comments = null) {
  if (!config.enableSharepointSync) return;

  try {
    const filter = `EmployeeEmail eq '${employeeEmail}' and WeekNumber eq ${weekNumber} and WeekYear eq ${weekYear}`;
    const items = await getListItems('timesheets', filter, 'Id', 200);

    const fields = { Status: capitalizeStatus(status) };
    if (approverEmail) fields.ApproverEmail = approverEmail;
    if (comments) fields.ApproverComments = comments;

    const now = new Date().toISOString();
    if (status === 'approved') fields.ApprovedDate = now;
    if (status === 'rejected') fields.RejectedDate = now;

    // Update all entries for this week in parallel (max 5 at a time to avoid throttling)
    for (let i = 0; i < items.length; i += 5) {
      await Promise.all(
        items.slice(i, i + 5).map(item => updateListItem('timesheets', item.Id, fields))
      );
    }
  } catch (err) {
    // Log but don't fail the main operation — SharePoint sync is best-effort
    console.error('[SharePoint] updateTimesheetStatus failed:', err.message);
  }
}

function capitalizeStatus(status) {
  if (!status) return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

module.exports = {
  getAccessToken,
  getListItems,
  createListItem,
  updateListItem,
  syncTimesheetEntry,
  updateTimesheetStatus,
  LIST_ENDPOINTS,
};
