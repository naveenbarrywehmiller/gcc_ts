# SHAREPOINT_SETUP.md — SharePoint Configuration Guide

## Prerequisites

- Microsoft 365 tenant with SharePoint Online
- SharePoint Administrator or Site Collection Administrator rights
- (Optional) PnP PowerShell module for automated provisioning

---

## Step 1: Create the SharePoint Site

1. Go to the [SharePoint Admin Center](https://admin.microsoft.com) → Sites → Active sites
2. Click **Create** → **Team site**
3. Site name: `GCC Timesheet`
4. Site address: `https://YOURTENANT.sharepoint.com/sites/GCCTimeSheet`
5. Privacy: **Private**
6. Add site owners: IT Administrator + Timesheet Admins
7. Click **Create**

---

## Step 2: Create Lists

Create the following lists **in this exact order** (lookup columns require target lists to exist first):

### Order of creation:
1. TS_Divisions
2. TS_Departments
3. TS_Subdivisions (needs TS_Divisions)
4. TS_DepartmentOwnerships (needs TS_Departments)
5. TS_Employees (needs TS_Divisions, TS_Subdivisions)
6. TS_Tasks
7. TS_Projects (needs TS_Divisions, TS_Subdivisions)
8. TS_Holidays
9. TS_TimesheetEntries (needs all above)

---

## Step 3: List Column Definitions

### TS_Divisions
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Division name |
| Description | Multiple lines | No | |
| IsActive | Yes/No | No | Default: Yes |

### TS_Departments
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Department name |
| IsActive | Yes/No | No | Default: Yes |

### TS_Subdivisions
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Subdivision name |
| DivisionLookup | Lookup → TS_Divisions:Title | Yes | |
| Description | Multiple lines | No | |
| IsActive | Yes/No | No | Default: Yes |

### TS_DepartmentOwnerships
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Ownership label |
| DepartmentLookup | Lookup → TS_Departments:Title | Yes | |
| IsActive | Yes/No | No | Default: Yes |

### TS_Employees
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Full name |
| Email | Single line text | Yes | **Create index** |
| Department | Single line text | No | Synced from Entra ID |
| DivisionLookup | Lookup → TS_Divisions:Title | No | |
| SubdivisionLookup | Lookup → TS_Subdivisions:Title | No | |
| Manager | Person or Group | No | |
| Role | Choice | No | Values: Employee; Manager; Admin |
| SupportingCategory | Choice | No | Values: Dedicated Team; Flex Team |
| IsActive | Yes/No | No | Default: Yes |
| LastSeen | Date and Time | No | Include time |

### TS_Tasks
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Task category name |
| Classification | Choice | No | Values: Billable; Non-Billable |
| TaskDescription | Multiple lines | No | |
| RequiresProject | Yes/No | No | Default: Yes |
| IsActive | Yes/No | No | Default: Yes |

### TS_Projects
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Project name |
| ProjectCode | Single line text | Yes | **Create index** |
| CustomerName | Single line text | No | |
| DivisionLookup | Lookup → TS_Divisions:Title | No | |
| SubdivisionLookup | Lookup → TS_Subdivisions:Title | No | |
| Activity | Single line text | No | |
| TeamType | Choice | No | Values: Dedicated; Flex |
| IsActive | Yes/No | No | Default: Yes |

### TS_Holidays
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Holiday name |
| HolidayDate | Date and Time | Yes | Date only; **Create index** |

### TS_TimesheetEntries
| Column | Type | Required | Notes |
|---|---|---|---|
| Title | Single line text | Yes | Auto: `{Email}_{Date}_{Code}` |
| EmployeeLookup | Lookup → TS_Employees:Title | Yes | **Create index** |
| EmployeeEmail | Single line text | Yes | **Create index** (for Power Automate + PBI) |
| WorkDate | Date and Time | Yes | Date only; **Create index** |
| WeekNumber | Number | No | ISO 8601 week |
| WeekYear | Number | No | |
| WeekStart | Date and Time | No | Date only |
| WeekEnd | Date and Time | No | Date only |
| ProjectLookup | Lookup → TS_Projects:Title | No | Nullable |
| TaskLookup | Lookup → TS_Tasks:Title | No | Nullable |
| DivisionLookup | Lookup → TS_Divisions:Title | No | **Create index** |
| SubdivisionLookup | Lookup → TS_Subdivisions:Title | No | |
| OwnershipLookup | Lookup → TS_DepartmentOwnerships:Title | No | |
| Hours | Number | Yes | Min: 0, Max: 24 |
| Description | Multiple lines | No | |
| Billable | Yes/No | No | Default: No |
| Status | Choice | No | Values: Draft; Submitted; Approved; Rejected; Recalled |
| SubmittedDate | Date and Time | No | Include time |
| ApprovedDate | Date and Time | No | Include time |
| RejectedDate | Date and Time | No | Include time |
| ApproverEmail | Single line text | No | |
| ApproverComments | Multiple lines | No | |
| ProjectDescription | Multiple lines | No | |

---

## Step 4: Create Indexes (CRITICAL)

> **Warning**: SharePoint has a 5,000-item list view threshold. Without indexes on filtered columns, queries will fail once the list grows beyond this limit.

For each list, go to: List Settings → Indexed Columns → Create a new index

### Required indexes:

| List | Column to index |
|---|---|
| TS_Employees | Email |
| TS_Projects | ProjectCode |
| TS_Holidays | HolidayDate |
| TS_TimesheetEntries | EmployeeEmail |
| TS_TimesheetEntries | WorkDate |
| TS_TimesheetEntries | EmployeeLookup |
| TS_TimesheetEntries | DivisionLookup |
| TS_TimesheetEntries | Status |

---

## Step 5: Set List Permissions

For each list, configure permissions to allow only appropriate users:

1. List Settings → Permissions for this list → Stop Inheriting Permissions
2. Configure:
   - **Site Members** (employees): Contribute (read + add + edit own items)
   - **Site Owners** (admins): Full Control
   - **Approvers** group (managers): Contribute + approve items

---

## Step 6: Entra ID App Registration

This is required for both MSAL authentication and SharePoint programmatic access.

### 6a. Create App Registration (for user login)

1. Go to [Azure Portal](https://portal.azure.com) → Entra ID → App registrations → New registration
2. Name: `GCC Timesheet`
3. Supported account types: **Accounts in this organizational directory only**
4. Redirect URI: **Single-page application (SPA)**
   - `https://your-app-domain.com/auth/callback`
   - `http://localhost:5173/auth/callback` (development)
5. Click **Register**
6. Note the **Application (client) ID** and **Directory (tenant) ID**
7. Under **Certificates & secrets**: create a client secret (for server-to-server calls)
8. Under **API permissions** → Add a permission:
   - Microsoft Graph → Delegated → `User.Read`
   - Microsoft Graph → Delegated → `User.ReadBasic.All`
   - Microsoft Graph → Delegated → `offline_access`
9. For SharePoint sync, also add:
   - SharePoint → Application → `Sites.ReadWrite.All`
10. Click **Grant admin consent**

### 6b. Note your values for .env

```bash
ENTRA_TENANT_ID=<Directory (tenant) ID>
ENTRA_CLIENT_ID=<Application (client) ID>
ENTRA_CLIENT_SECRET=<Client secret value>
SHAREPOINT_SITE_URL=https://YOURTENANT.sharepoint.com/sites/GCCTimeSheet
SHAREPOINT_CLIENT_ID=<same Application (client) ID>
SHAREPOINT_CLIENT_SECRET=<same client secret>
```

---

## Step 7: Automated Provisioning with PnP PowerShell (Optional)

Install PnP PowerShell:
```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
```

Then run the provisioning script included in this repository:
```powershell
cd scripts
.\provision-sharepoint.ps1 -SiteUrl "https://YOURTENANT.sharepoint.com/sites/GCCTimeSheet"
```

See `scripts/provision-sharepoint.ps1` for the full automated list creation script.

---

## Step 8: Initial Data Import

After creating the lists, import reference data from the migration export:

1. Run: `node scripts/export-to-sharepoint-csv.js`
2. This generates CSV files in `scripts/export/`
3. For each list, go to List Settings → Import from CSV (or use PnP PowerShell)

Import order (same as creation order):
1. `divisions.csv` → TS_Divisions
2. `departments.csv` → TS_Departments
3. `subdivisions.csv` → TS_Subdivisions
4. `ownerships.csv` → TS_DepartmentOwnerships
5. `employees.csv` → TS_Employees
6. `tasks.csv` → TS_Tasks
7. `projects.csv` → TS_Projects
8. `holidays.csv` → TS_Holidays
9. `timesheets.csv` → TS_TimesheetEntries (historical data, import last)

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "List view threshold exceeded" error | Add missing index to filtered column |
| Lookup column not showing items | Ensure target list was created first |
| 403 Forbidden from API | Check app registration permissions + admin consent |
| SharePoint sync not working | Verify SHAREPOINT_SITE_URL ends without trailing slash |
| "Access denied" from Graph API | Add `User.ReadBasic.All` permission + admin consent |
