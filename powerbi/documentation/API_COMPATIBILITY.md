# Power BI API Compatibility — GCC Timesheet

> **Last Updated:** 2026-10-09

---

## Compatibility Matrix

| Power BI Dashboard Version | Required API Version | GCC Timesheet App Version | Status |
|---------------------------|---------------------|--------------------------|--------|
| v2.0.0 | v2.0.0 | v1.21.0+ | ✅ Current |
| v1.1.4 | v1.1.0 | v1.15.0–v1.20.0 | Legacy numeric staffing contract |
| v1.1.0–v1.1.3 | v1.x | v1.3.0+ | ✅ Legacy |
| v1.0.0 | v1.x | v1.3.0+ | ✅ Legacy |

---

## API Versioning Policy

### Current: API v2.0.0

The Power BI REST API is served at `/api/powerbi/*` without explicit version prefixes. The current contract is **v2.0.0**. In `/staffing`, `openPositions` and `newJoiners` are nullable text rather than nullable counts. Existing numeric records migrate to text, preserving zero as `"0"`. Upgrade the application and saved PBIP together, then refresh the model in Desktop. Dashboard v1.1.4 expects numbers and cannot refresh against this contract.

### Backward Compatibility Rules

1. **New fields may be added** to existing endpoint responses without a version bump
2. **Existing fields will not be removed** or renamed within v1.x
3. **Existing endpoints will not be removed** within v1.x
4. **Response format** (`{ data: [...], pagination: {...} }`) will remain consistent within v1.x
5. **New endpoints** may be added without a version bump

### Breaking Changes (Require Major Version Bump)

A **breaking change** triggers a new major API version (e.g., v2.x):

- Removing or renaming existing fields
- Changing field data types
- Removing existing endpoints
- Changing the response envelope format
- Changing authentication mechanism
- Changing pagination format

### When Breaking Changes Occur

1. Preserve the old API version for a transition period when practical. The staffing contract in v2.0.0 has no parallel v1 endpoint; update the report before refreshing it.
2. A new Power BI Dashboard version must be released that supports the new API
3. Documentation must clearly state the migration path
4. The CHANGELOG must document the breaking change

---

## Endpoint Stability Contract

| Endpoint | Stability | Notes |
|----------|-----------|-------|
| `GET /api/powerbi/timesheets` | **Stable** | Core fact table — will not change within v1.x |
| `GET /api/powerbi/users` | **Stable** | Core dimension — will not change within v1.x |
| `GET /api/powerbi/divisions` | **Stable** | Core dimension — will not change within v1.x |
| `GET /api/powerbi/departments` | **Stable** | Core dimension — will not change within v1.x |
| `GET /api/powerbi/projects` | **Stable** | Core dimension — will not change within v1.x |
| `GET /api/powerbi/holidays` | **Stable** | Core dimension — will not change within v1.x |
| `GET /api/powerbi/tasks` | **Stable** | Added in v1.0.0 |
| `GET /api/powerbi/assignments` | **Stable** | Added in v1.0.0 |
| `GET /api/powerbi/status-summary` | **Stable** | Added in v1.0.0 |
| `GET /api/powerbi/version` | **Stable** | Added in v1.0.0 |
| `GET /api/powerbi/export` | **Legacy** | Maintained for backward compatibility; prefer specific endpoints |

---

## Field Contracts

### Timesheets Response Fields (v1.x)

```json
{
  "id": "integer — STABLE",
  "employeeId": "string — STABLE",
  "employeeName": "string — STABLE",
  "email": "string — STABLE",
  "division": "string — STABLE",
  "department": "string — STABLE",
  "admin": "string — STABLE",
  "date": "string (YYYY-MM-DD) — STABLE",
  "week": "integer — STABLE",
  "weekYear": "integer — STABLE",
  "project": "string — STABLE",
  "projectCode": "string — STABLE",
  "projectCategory": "string — STABLE",
  "taskClassification": "string — STABLE",
  "hours": "number — STABLE",
  "status": "string — STABLE",
  "isBillable": "boolean — STABLE",
  "submissionDate": "string|null — STABLE",
  "approvalDate": "string|null — STABLE",
  "createdDate": "string — STABLE",
  "updatedDate": "string — STABLE"
}
```

### Pagination Response Format (v1.x)

```json
{
  "data": [],
  "pagination": {
    "total": "integer — STABLE",
    "page": "integer — STABLE",
    "limit": "integer — STABLE",
    "totalPages": "integer — STABLE",
    "hasNextPage": "boolean — STABLE",
    "hasPrevPage": "boolean — STABLE"
  }
}
```

---

## Status Values Contract

The `status` field in timesheets uses these values (case-sensitive, lowercase):

| Value | Description | Since |
|-------|------------|-------|
| `draft` | Not yet submitted | v1.0.0 |
| `submitted` | Submitted for approval | v1.0.0 |
| `approved` | Approved by admin | v1.0.0 |
| `rejected` | Rejected by admin | v1.0.0 |
| `recalled` | Recalled for revision | v1.0.0 |

New status values may be added in future versions. Power BI queries should handle unknown status values gracefully.

---

## Query Parameter Contract

### Timesheets Filters (v1.x)

| Parameter | Type | Format | Since | Stability |
|-----------|------|--------|-------|-----------|
| `from` | string | YYYY-MM-DD | v1.0.0 | Stable |
| `to` | string | YYYY-MM-DD | v1.0.0 | Stable |
| `employeeId` | string | text/number | v1.0.0 | Stable |
| `division` | string | text | v1.0.0 | Stable |
| `department` | string | text | v1.0.0 | Stable |
| `project` | string | text | v1.0.0 | Stable |
| `status` | string | enum | v1.0.0 | Stable |
| `page` | integer | >= 1 | v1.0.0 | Stable |
| `limit` | integer | 1-50000 | v1.0.0 | Stable |

New query parameters may be added in future minor versions.

---

## Migration Guide

### When upgrading the GCC Timesheet Application:

1. Check the application CHANGELOG for API changes
2. Verify the Power BI API compatibility in this document
3. If no breaking changes: refresh Power BI as normal
4. If breaking changes: download the corresponding Power BI Dashboard version

### When upgrading the Power BI Dashboard:

1. Check `powerbi/CHANGELOG.md` for required API version
2. Verify the server meets the minimum application version
3. Download the new PBIT template
4. Re-enter server URL and API key
5. Verify data loads correctly with a manual refresh

---

*GCC Timesheet Power BI API Compatibility v2.0.0*
