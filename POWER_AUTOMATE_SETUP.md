# POWER_AUTOMATE_SETUP.md — Power Automate Approval Flow

## Overview

This document explains how to configure the Power Automate flow that handles timesheet approval notifications via Microsoft Teams and email.

---

## Prerequisites

- Power Automate license (included in Microsoft 365 Business Basic or higher)
- Access to the SharePoint site configured in SHAREPOINT_SETUP.md
- The GCC Timesheet application deployed and accessible via HTTPS

---

## Flow 1: Timesheet Submission Approval

### Step 1: Create a new Automated Cloud Flow

1. Go to [Power Automate](https://make.powerautomate.com)
2. Click **+ Create** → **Automated cloud flow**
3. Name: `GCC Timesheet - Approval Flow`
4. Trigger: **When an HTTP request is received**

### Step 2: Configure the HTTP Trigger

The app will POST to this trigger URL when an employee submits a timesheet.

In the trigger settings, paste this JSON schema:

```json
{
  "type": "object",
  "properties": {
    "employeeEmail": { "type": "string" },
    "employeeName": { "type": "string" },
    "weekNumber": { "type": "integer" },
    "weekYear": { "type": "integer" },
    "weekStart": { "type": "string" },
    "weekEnd": { "type": "string" },
    "totalHours": { "type": "number" },
    "timesheetUrl": { "type": "string" },
    "callbackUrl": { "type": "string" },
    "callbackSecret": { "type": "string" }
  }
}
```

After saving, **copy the HTTP POST URL** — you will need this for the app's `POWER_AUTOMATE_WEBHOOK_URL` environment variable.

### Step 3: Get Manager from Entra ID

Add action: **Send an HTTP request to Azure AD**

- Method: GET
- URL: `https://graph.microsoft.com/v1.0/users/@{triggerBody()?['employeeEmail']}/manager`
- Headers: default (PA handles auth automatically)

Store the response body. Extract `mail` from the response as the manager's email.

### Step 4: Start and Wait for an Approval

Add action: **Start and wait for an approval**

- Approval type: **Approve/Reject - First to respond**
- Title: `Timesheet Approval: @{triggerBody()?['employeeName']} - Week @{triggerBody()?['weekNumber']}/@{triggerBody()?['weekYear']}`
- Assigned to: `@{body('Send_an_HTTP_request_to_Azure_AD')?['mail']}`
- Details:
```
Employee: @{triggerBody()?['employeeName']}
Period: Week @{triggerBody()?['weekNumber']} (@{triggerBody()?['weekStart']} to @{triggerBody()?['weekEnd']})
Total Hours: @{triggerBody()?['totalHours']}

View Timesheet: @{triggerBody()?['timesheetUrl']}
```
- Item link: `@{triggerBody()?['timesheetUrl']}`
- Item link description: `Open Timesheet`

**Timeout**: Set to 7 days (P7D)

### Step 5: Condition — Approved or Rejected

Add action: **Condition**

- Condition: `@{outputs('Start_and_wait_for_an_approval')?['body/outcome']}` equals `Approve`

#### If Yes (Approved):

**Action 1 — Notify the app (callback):**

Add action: **HTTP**
- Method: PATCH
- URI: `@{triggerBody()?['callbackUrl']}`
- Headers:
  - `Content-Type`: `application/json`
  - `x-callback-secret`: `@{triggerBody()?['callbackSecret']}`
- Body:
```json
{
  "status": "approved",
  "employeeEmail": "@{triggerBody()?['employeeEmail']}",
  "weekNumber": @{triggerBody()?['weekNumber']},
  "weekYear": @{triggerBody()?['weekYear']},
  "approverEmail": "@{outputs('Start_and_wait_for_an_approval')?['body/responder/email']}",
  "approverComments": "@{outputs('Start_and_wait_for_an_approval')?['body/comments']}"
}
```

**Action 2 — Email employee:**

Add action: **Send an email (V2)**
- To: `@{triggerBody()?['employeeEmail']}`
- Subject: `✅ Timesheet Approved — Week @{triggerBody()?['weekNumber']}/@{triggerBody()?['weekYear']}`
- Body:
```html
<p>Hi @{triggerBody()?['employeeName']},</p>
<p>Your timesheet for <strong>Week @{triggerBody()?['weekNumber']} (@{triggerBody()?['weekStart']} to @{triggerBody()?['weekEnd']})</strong> has been <strong>approved</strong>.</p>
<p>Approved by: @{outputs('Start_and_wait_for_an_approval')?['body/responder/displayName']}</p>
<p><a href="@{triggerBody()?['timesheetUrl']}">View your timesheet</a></p>
```

#### If No (Rejected):

**Action 1 — Notify the app (callback):**

Add action: **HTTP**
- Method: PATCH
- URI: `@{triggerBody()?['callbackUrl']}`
- Headers:
  - `Content-Type`: `application/json`
  - `x-callback-secret`: `@{triggerBody()?['callbackSecret']}`
- Body:
```json
{
  "status": "rejected",
  "employeeEmail": "@{triggerBody()?['employeeEmail']}",
  "weekNumber": @{triggerBody()?['weekNumber']},
  "weekYear": @{triggerBody()?['weekYear']},
  "approverEmail": "@{outputs('Start_and_wait_for_an_approval')?['body/responder/email']}",
  "approverComments": "@{outputs('Start_and_wait_for_an_approval')?['body/comments']}"
}
```

**Action 2 — Email employee:**

Add action: **Send an email (V2)**
- To: `@{triggerBody()?['employeeEmail']}`
- Subject: `❌ Timesheet Rejected — Week @{triggerBody()?['weekNumber']}/@{triggerBody()?['weekYear']}`
- Body:
```html
<p>Hi @{triggerBody()?['employeeName']},</p>
<p>Your timesheet for <strong>Week @{triggerBody()?['weekNumber']}</strong> has been <strong>rejected</strong>.</p>
<p>Rejected by: @{outputs('Start_and_wait_for_an_approval')?['body/responder/displayName']}</p>
<p>Comments: @{outputs('Start_and_wait_for_an_approval')?['body/comments']}</p>
<p>Please log in to make corrections and resubmit:<br>
<a href="@{triggerBody()?['timesheetUrl']}">Open Timesheet</a></p>
```

### Step 6: Configure Timeout / Escalation (Optional)

After the approval action, add a **Condition** checking if the approval timed out:

- If `@{outputs('Start_and_wait_for_an_approval')?['body/outcome']}` equals `WaitingForResponse` (timeout)
- Then send escalation email to the admin or HR team

### Step 7: Save and copy the trigger URL

1. Save the flow
2. Go back to the HTTP trigger
3. Copy the **HTTP POST URL**
4. Set it in your application `.env`:
```bash
POWER_AUTOMATE_WEBHOOK_URL=https://prod-xx.eastus.logic.azure.com/workflows/.../triggers/...
POWER_AUTOMATE_CALLBACK_SECRET=<generate-a-strong-random-secret>
ENABLE_POWER_AUTOMATE=true
```

---

## Flow 2: SharePoint Status Sync (Optional)

If you are using SharePoint sync, create a second flow to keep SP entries in sync with approval decisions.

**Trigger**: When an item is modified in TS_TimesheetEntries

**Condition**: Status changed to Approved or Rejected

**Actions**:
- Send email notification (duplicate of above, but triggered from SP change)
- Update any related tracking lists

---

## Callback Endpoint Security

The app exposes `PATCH /api/timesheets/pa-callback` for Power Automate to call back.

This endpoint:
1. Validates the `x-callback-secret` header against `POWER_AUTOMATE_CALLBACK_SECRET`
2. Verifies the `employeeEmail` + `weekNumber` + `weekYear` match existing submitted entries
3. Updates the status in SQLite
4. Optionally syncs to SharePoint if `ENABLE_SHAREPOINT_SYNC=true`
5. Returns 200 OK or appropriate error

**Never** expose the callback secret in frontend code. It is a server-to-server secret only.

---

## Testing the Flow

1. Enable Power Automate in the app: `ENABLE_POWER_AUTOMATE=true`
2. Log in as an employee and submit a timesheet
3. Check Power Automate run history for the flow
4. The manager should receive a Teams notification or email
5. Approve or reject from the Teams card
6. Check that the timesheet status updates in the app
7. Check that the employee receives a notification email

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Flow not triggered | Check `POWER_AUTOMATE_WEBHOOK_URL` is correct in .env |
| Manager not found | Ensure employee's manager is set in Entra ID directory |
| Callback failing (401) | Check `POWER_AUTOMATE_CALLBACK_SECRET` matches both env and flow |
| Callback failing (404) | Verify the `callbackUrl` points to the correct API domain |
| Teams notification not appearing | Check manager's Teams notification settings |
| Approval expired without action | Configure escalation action in the timeout branch |
