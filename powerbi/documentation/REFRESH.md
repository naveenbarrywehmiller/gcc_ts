# Power BI Refresh Architecture — GCC Timesheet

> **Dashboard Version:** 1.0.0  
> **Last Updated:** 2026-09-25

---

## Refresh Overview

The GCC Timesheet Power BI solution uses **Import mode** — Power BI pulls data from the REST API into its in-memory model. This provides the best query performance for dashboards while requiring periodic refreshes to reflect new data.

---

## Manual Refresh

### Power BI Desktop
1. Click **Home** → **Refresh** (or press `Ctrl+F5`)
2. Power BI re-queries all API endpoints and updates all visuals
3. Manual refresh always works regardless of licensing tier

### Power BI Service
1. Navigate to the dataset in your workspace
2. Click **Refresh now** (⟳ icon)
3. The dataset refreshes using the configured credentials and gateway

> ✅ **Manual refresh is always available and always reliable.**

---

## Automatic / Scheduled Refresh

### Power BI Service (Cloud) — Recommended

| Feature | Pro License | Premium License |
|---------|------------|----------------|
| Scheduled refresh | ✅ Up to 8x/day | ✅ Up to 48x/day |
| Minimum interval | 30 minutes | 30 minutes |
| Incremental refresh | ✅ | ✅ |
| On-demand refresh | ✅ | ✅ |
| Automatic page refresh | ❌ (Import mode) | ✅ (30 min minimum) |

#### Configuration Steps:

1. **Publish** the report to Power BI Service
2. Go to **Dataset Settings** → **Scheduled Refresh**
3. Configure credentials:
   - **Authentication method:** Basic
   - **Username:** `powerbi`
   - **Password:** `<YOUR_POWERBI_API_KEY>`
4. Enable scheduled refresh and set frequency
5. If the GCC Timesheet server is on a private network, configure an **On-Premises Data Gateway**

### Power BI Desktop — Limitations

| Feature | Supported | Details |
|---------|-----------|---------|
| Manual refresh | ✅ | Always available |
| Scheduled/automatic refresh | ❌ | Desktop does not support scheduled refresh |
| Background refresh | ❌ | Only refreshes when manually triggered |
| Real-time / streaming | ❌ | Not applicable for REST API Import mode |

> ⚠️ **Important Clarification:**  
> Power BI Desktop does **NOT** support automatic or scheduled refresh for REST API (Web) data sources.  
> Automatic refresh of any kind requires **Power BI Service** (cloud).

---

## One-Minute Refresh — Technical Assessment

The original requirement targets approximately 1-minute refresh intervals. Here is an honest assessment:

### Can we achieve 1-minute refresh?

| Scenario | Possible? | Details |
|----------|-----------|---------|
| Power BI Desktop (Import mode) | ❌ No | No automatic refresh capability |
| Power BI Service Pro (Import mode) | ❌ No | Minimum scheduled refresh: 30 minutes |
| Power BI Service Premium (Import mode) | ❌ No | Minimum scheduled refresh: 30 minutes |
| Power BI Service Premium (DirectQuery) | ⚠️ Partial | Possible but requires SQL data source, not REST API |
| Power BI Service Premium (Automatic Page Refresh) | ⚠️ Partial | Minimum 30 minutes for Import; 1 second for DirectQuery |
| Power BI Streaming Dataset | ❌ Not suitable | Requires push API, limited visual types, no relationships |

### Closest Supported Option

**Power BI Service with Premium capacity and Automatic Page Refresh:**
- Set data source to refresh every 30 minutes (scheduled)
- Enable Automatic Page Refresh at 30-minute intervals
- For near-real-time needs, consider a DirectQuery approach with a SQL data source (not applicable for SQLite/REST API)

### Recommendation

For the GCC Timesheet architecture (SQLite + REST API + Import mode):

1. **Configure scheduled refresh** at 30-minute intervals in Power BI Service
2. **Use manual refresh** for immediate data needs
3. **Implement server-side caching** (already configured with `POWERBI_CACHE_TTL`) to optimize API response times during refresh cycles
4. **Use date-filtered queries** (`?from=...&to=...`) to reduce data transfer volume

---

## Incremental Refresh Strategy

For growing timesheet data, configure incremental refresh in Power BI Service:

### Setup Steps:

1. In Power Query, create two parameters:
   - `RangeStart` (Date/Time) — e.g., `1/1/2024`
   - `RangeEnd` (Date/Time) — e.g., `12/31/2026`

2. Filter the `date` column: `date >= RangeStart AND date < RangeEnd`

3. In Power BI Desktop, right-click the table → **Incremental Refresh**:
   - Archive data: Last 3 years
   - Incrementally refresh: Last 30 days
   - Detect data changes: `updatedDate` column

4. Publish to Power BI Service — the service handles partition management

### API Support:

The REST API supports incremental refresh via `from`/`to` query parameters:
```
GET /api/powerbi/timesheets?from=2026-09-01&to=2026-09-25
```

This is handled by the Power Query M scripts in `powerbi/queries/`.

---

## Server-Side Caching

The API implements server-side caching to optimize performance for multiple concurrent Power BI clients:

| Setting | Default | Description |
|---------|---------|-------------|
| `POWERBI_CACHE_TTL` | 60 seconds | Cache duration for API responses |
| Cache invalidation | Automatic (TTL-based) | Stale data cleared after TTL expires |
| Cache scope | Per-endpoint, per-filter-combination | Different filter combinations cached independently |

### Configuration:

```ini
# In server .env
POWERBI_CACHE_TTL=60    # 60 seconds (recommended)
POWERBI_CACHE_TTL=0     # Disable caching (always fresh data)
POWERBI_CACHE_TTL=300   # 5 minutes (for high-traffic scenarios)
```

### Behavior:
- First request to an endpoint/filter combination queries the database
- Subsequent requests within the TTL window return cached data
- Cache is in-memory (server restart clears cache)
- Each unique filter combination has its own cache entry

---

## Refresh Checklist

Before confirming refresh works correctly:

- [ ] Manual refresh succeeds in Power BI Desktop
- [ ] All tables load without errors
- [ ] Data matches the application (spot-check totals)
- [ ] Date filters work correctly
- [ ] Pagination handles large datasets
- [ ] API responds within acceptable time (<5 seconds per endpoint)
- [ ] Server-side cache is functioning (`POWERBI_CACHE_TTL > 0`)
- [ ] Power BI Service scheduled refresh configured (if applicable)
- [ ] On-Premises Data Gateway configured (if server is private)

---

*GCC Timesheet Power BI Refresh Architecture v1.0.0*
