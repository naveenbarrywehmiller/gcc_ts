# Power BI Deployment Guide — GCC Timesheet

> **Dashboard Version:** 1.0.0  
> **Last Updated:** 2026-09-25

---

## Deployment Architecture

```
┌────────────────────────────────────────────────┐
│              Production Server                 │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  Docker Container / Node.js Process      │  │
│  │                                          │  │
│  │  GCC Timesheet App + Power BI REST API   │  │
│  │  Port: 3001 (configurable)               │  │
│  │                                          │  │
│  │  ┌────────────────────────────────────┐  │  │
│  │  │  SQLite Database (internal)        │  │  │
│  │  │  /app/server/data/timesheet.db     │  │  │
│  │  └────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Port 3001 exposed via firewall/reverse proxy  │
└────────────────┬───────────────────────────────┘
                 │
                 │ HTTP/HTTPS
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼───┐  ┌────▼────┐  ┌────▼────┐
│ PC 1  │  │  PC 2   │  │  PC 3   │
│ PBI   │  │  PBI    │  │  PBI    │
│Desktop│  │ Desktop │  │ Desktop │
└───────┘  └─────────┘  └─────────┘
```

---

## Docker Deployment

Power BI is **NOT** part of the Docker container. The existing Docker setup serves both the application and the Power BI REST API:

```yaml
# docker-compose.yml — already configured
services:
  timesheet:
    environment:
      - POWERBI_API_ENABLED=true
      - POWERBI_API_KEY=${POWERBI_API_KEY:-}
      - POWERBI_MAX_RECORDS=${POWERBI_MAX_RECORDS:-50000}
```

### What Docker does:
- ✅ Runs the GCC Timesheet application
- ✅ Serves the Power BI REST API on the same port
- ✅ Stores the SQLite database in a Docker volume
- ✅ Exposes port 3001 for all API traffic

### What Docker does NOT do:
- ❌ Install Power BI Desktop
- ❌ Run Power BI as a service
- ❌ Expose the SQLite database file externally
- ❌ Depend on Power BI for application functionality

---

## Environment Configuration by Deployment Scenario

### Local Development

```ini
APP_BASE_URL=http://localhost:3001
POWERBI_API_ENABLED=true
POWERBI_API_KEY=dev-test-key-not-for-production
POWERBI_CACHE_TTL=10
```

Power BI Desktop URL: `http://localhost:3001/api/powerbi/timesheets`

### Internal Company Server

```ini
APP_BASE_URL=http://192.168.1.100:3001
POWERBI_API_ENABLED=true
POWERBI_API_KEY=<strong-random-key>
POWERBI_CACHE_TTL=60
```

Power BI Desktop URL: `http://192.168.1.100:3001/api/powerbi/timesheets`

### Production (HTTPS via Reverse Proxy)

```ini
APP_BASE_URL=https://gcc-timesheet.company.com
POWERBI_API_ENABLED=true
POWERBI_API_KEY=<strong-random-key>
POWERBI_CACHE_TTL=60
```

Power BI Desktop URL: `https://gcc-timesheet.company.com/api/powerbi/timesheets`

> 💡 HTTPS is **strongly recommended** for production to protect the API key in transit.

---

## Reverse Proxy Configuration

### Nginx Example

```nginx
server {
    listen 443 ssl;
    server_name gcc-timesheet.company.com;

    ssl_certificate /etc/ssl/certs/gcc-timesheet.crt;
    ssl_certificate_key /etc/ssl/private/gcc-timesheet.key;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Power BI API-specific settings
    location /api/powerbi/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;  # Allow time for large dataset queries
        proxy_buffering on;
    }
}
```

---

## Multi-User Deployment

### Central API, Multiple Power BI Clients

All Power BI users connect to the **same** central REST API. There is no need for per-user databases or separate data copies.

```
User A (Power BI Desktop) ──┐
User B (Power BI Desktop) ──┼──→ https://gcc-timesheet.company.com/api/powerbi/*
User C (Power BI Desktop) ──┤
User D (Power BI Service) ──┘
```

### Configuration for Each Client PC:

1. Install Power BI Desktop
2. Open the shared PBIT template file
3. When prompted, enter:
   - **Server URL:** `https://gcc-timesheet.company.com`
   - **API Key:** (shared reporting key)
4. Click **Refresh** to load data

### Performance Considerations for Multiple Users:

| Users | Cache TTL | Max Records | Notes |
|-------|-----------|-------------|-------|
| 1–5 | 60s | 50000 | Default settings |
| 5–15 | 120s | 50000 | Increase cache TTL |
| 15+ | 300s | 25000 | Consider pagination + longer cache |

---

## Power BI Service Deployment

### Publishing

1. Save the completed `.pbix` file
2. Click **Home** → **Publish** → select workspace
3. The report and dataset are uploaded to Power BI Service

### Data Source Credentials

In Power BI Service → Dataset Settings:

| Setting | Value |
|---------|-------|
| **Authentication method** | Basic |
| **User name** | `powerbi` |
| **Password** | `<POWERBI_API_KEY>` |
| **Privacy level** | Organizational |

### On-Premises Data Gateway

Required if the GCC Timesheet server is **not** accessible from the public internet.

1. Download and install **On-Premises Data Gateway** on a machine with network access to the server
2. Sign in with your Power BI account
3. Register the gateway in Power BI Service
4. In dataset settings, select the gateway for the data source

---

## Distributing PBIX/PBIT Files

### PBIT (Template) — Recommended for distribution

- Does **not** contain data
- Does **not** embed credentials
- Prompts user for parameters on open
- Small file size, suitable for Git

### PBIX (Full Report)

- Contains data snapshot
- May be large (depending on data volume)
- Use Git LFS or GitHub Releases for files > 50 MB

### GitHub Release Strategy

```
Tag: powerbi-v1.0.0
Title: GCC Timesheet Power BI Dashboard v1.0.0

Artifacts:
  - GCC_Timesheet_Dashboard_v1.0.0.pbit
  - GCC_Timesheet_Dashboard_v1.0.0.pbix (optional, via LFS)
```

---

## Release Checklist

Before releasing a Power BI version:

- [ ] Dashboard opens successfully
- [ ] API connection works (test with curl first)
- [ ] Authentication works (API key validated)
- [ ] Manual refresh completes without errors
- [ ] All 10 pages display correctly
- [ ] All filters/slicers function correctly
- [ ] Drill-through navigation works
- [ ] Tooltips display correctly
- [ ] DAX measures return expected values
- [ ] Totals match source application data
- [ ] No broken visuals or error icons
- [ ] No secrets/credentials embedded in PBIT/PBIX
- [ ] API compatibility documented in CHANGELOG
- [ ] CHANGELOG.md updated
- [ ] Version number updated
- [ ] Documentation updated
- [ ] Docker does not depend on Power BI
- [ ] GitHub Release created with tag `powerbi-v<VERSION>`

---

## Security Checklist

- [ ] API key is not hardcoded in source code
- [ ] API key is not embedded in PBIT/PBIX files
- [ ] HTTPS is used in production
- [ ] Power BI API rejects all write operations (POST/PUT/PATCH/DELETE)
- [ ] API never returns passwords, hashes, or tokens
- [ ] Rate limiting is active
- [ ] Unauthorized access returns 401/403
- [ ] Invalid tokens are rejected

---

*GCC Timesheet Power BI Deployment Guide v1.0.0*
