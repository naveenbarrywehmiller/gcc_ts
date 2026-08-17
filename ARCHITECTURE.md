# ARCHITECTURE.md — GCC Timesheet M365 Architecture

## Overview

The GCC Timesheet application is a self-hosted web application that integrates with Microsoft 365 to provide enterprise authentication, automated approval workflows, and rich analytics.

The architecture is **additive** — all existing functionality is preserved and Microsoft 365 capabilities are layered on top via feature flags.

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                                  │
│                                                                         │
│  ┌─────────────────────┐    ┌───────────────────────────────────────┐  │
│  │    React 19 + Vite  │    │         MSAL.js (optional)            │  │
│  │   Timesheet SPA     │◄──►│   OAuth2 PKCE → Entra ID login        │  │
│  │                     │    └───────────────────────────────────────┘  │
│  └──────────┬──────────┘                                               │
└─────────────┼───────────────────────────────────────────────────────────┘
              │ HTTPS (Axios, HttpOnly cookie auth)
              │
┌─────────────▼───────────────────────────────────────────────────────────┐
│                      EXPRESS API SERVER (Node.js)                       │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Security: Helmet + CORS + Rate Limiting + HttpOnly Cookie Auth  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  /api/auth (local JWT)   /api/auth/ms-callback (MSAL)                   │
│  /api/timesheets         /api/reports          /api/manager             │
│  /api/powerbi            /api/sharepoint-sync  /api/users               │
│  /api/projects           /api/tasks            /api/divisions           │
│  /api/holidays           /api/audit            /api/import              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │         Repository Layer (TimesheetRepository)                   │  │
│  │         sqlite | sharepoint | dual  (feature-flagged)            │  │
│  └────────────────────┬────────────────────┬─────────────────────── ┘  │
│                       │                    │                            │
│           ┌───────────▼──────┐   ┌─────────▼──────────┐               │
│           │  better-sqlite3  │   │  SharePoint Client  │               │
│           │  (primary)       │   │  (optional sync)    │               │
│           └──────────────────┘   └────────────────────┘               │
└─────────────────────────────────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────┐       ┌─────────────────────────────────────────┐
│   SQLite Database   │       │              Microsoft 365              │
│  timesheet.db (WAL) │       │                                         │
│                     │       │  Entra ID (Auth)   SharePoint (Lists)   │
│  Primary store for  │       │  Power Automate    Power BI             │
│  all transactional  │       │  (Approvals)       (Dashboards)         │
│  data               │       │                                         │
└─────────────────────┘       └─────────────────────────────────────────┘
```

---

## Feature Flags

All Microsoft 365 features are controlled by environment variables:

```bash
ENABLE_MSAL_AUTH=false        # Show/hide Microsoft login button
ENABLE_SHAREPOINT_SYNC=false  # Enable SharePoint dual-write
ENABLE_POWER_AUTOMATE=false   # Trigger PA webhook on submit
```

When all flags are `false`, the app behaves identically to the original.

---

## Security Model

| Concern | Implementation |
|---|---|
| Auth tokens | HttpOnly, Secure, SameSite=Strict cookies |
| MSAL tokens | Server validates once; never stored |
| SharePoint secrets | Server env vars only — never in frontend |
| PA callback | Shared secret in request header |
| SQL injection | Parameterized prepared statements |
| XSS | HttpOnly cookies + Helmet headers |
| CSRF | SameSite=Strict + CORS origin restriction |
| Rate limiting | 2000 req/15 min per token |
| Password storage | bcrypt 12 rounds |
| Data isolation | Employees see only own timesheets |

---

## Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| SQLite as primary DB | Keep | WAL mode, zero config, excellent performance |
| SharePoint data layer | Additive sync only | Avoids SP throttling on transactional writes |
| MSAL auth approach | Server validates → issues own cookie | Consistent session lifecycle |
| Power Automate trigger | Outbound webhook from server | Decouples approval; PA handles manager lookup |
| Power BI connection | SharePoint Lists → Power BI | Standard M365 pattern |
| Repository abstraction | TimesheetRepository class | Migration without rewriting routes |
| Feature flags | Env var booleans | Zero-config local dev; gradual rollout |
| Manager role | Added to role constraint | Middle tier for org-level approvals |
| Billable column | Denormalized into timesheets | Avoids JOIN cost on Power BI scans |

---

## Data Flow — Employee Submission

```
Employee fills weekly grid
  → Auto-save: POST /api/timesheets/batch (every 30s)
  → Submit: POST /api/timesheets/submit
          → SQLite: status = 'submitted'
          → [IF PA_ENABLED] POST to Power Automate HTTP trigger
                           → PA: GET manager via Graph API
                           → PA: Send Teams/Outlook approval card
          → [IF SP_SYNC] Write to TS_TimesheetEntries list
  ← Success toast shown
```

## Data Flow — Manager/Admin Approval

```
Via Power Automate:
  Manager clicks Approve/Reject in Teams card
    → PA calls: PATCH /api/timesheets/pa-callback
              → Validates shared secret
              → SQLite: status = 'approved'|'rejected'
              → [IF SP_SYNC] Update SharePoint entry

Via App UI (always available as fallback):
  Admin/Manager → POST /api/timesheets/approve | /reject | /recall
    → SQLite updated immediately
```

## Data Flow — MSAL Authentication

```
Click "Sign in with Microsoft"
  → MSAL.js: OAuth2 PKCE flow → Microsoft login
  → Redirect back with tokens
  → POST /api/auth/ms-callback { idToken }
  → Server: validate signature via MS public keys
  → Server: extract email, name, department
  → Server: find/create user in SQLite
  → Server: issue HttpOnly session cookie
  ← User logged in (same session mechanism as local auth)
```

---

## Future Considerations

1. **Power Apps front end**: SharePoint as common data layer enables native Power Apps UI without backend changes.
2. **PostgreSQL migration**: If SQLite becomes a bottleneck, repository pattern enables migration.
3. **Copilot integration**: Entra ID + SharePoint data enables M365 Copilot over timesheet data.
4. **Teams Tab**: The SPA can be embedded as a Microsoft Teams tab using MSAL SSO.
