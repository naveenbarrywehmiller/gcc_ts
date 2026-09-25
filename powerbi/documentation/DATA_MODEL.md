# Power BI Data Model — GCC Timesheet

> **Dashboard Version:** 1.0.0  
> **Last Updated:** 2026-09-25

---

## Star Schema Overview

The Power BI data model follows a **star schema** design optimized for analytical queries.

```
                    DimDate
                       │
                       │ date ↔ Date
                       │
   DimEmployee ─── FactTimesheet ─── DimProject
   (employeeId)    │         │      (projectCode)
                   │         │
            DimDivision   DimDepartment
            (division)    (department)
                   │
              DimHoliday
              (date ↔ Date)
```

---

## Fact Table

### FactTimesheet (Source: `/api/powerbi/timesheets`)

The central fact table containing individual timesheet entries.

| Column | Data Type | Source | Description |
|--------|-----------|--------|-------------|
| `id` | Whole Number | `t.id` | Unique timesheet entry ID |
| `employeeId` | Text | `u.employee_id` or `u.id` | Employee identifier (FK → DimEmployee) |
| `employeeName` | Text | `u.name` | Employee display name |
| `email` | Text | `u.email` | Employee email |
| `division` | Text | `d.name` | Division name (FK → DimDivision) |
| `department` | Text | `dept.name` | Department name (FK → DimDepartment) |
| `admin` | Text | `admin_u.name` | Assigned admin name |
| `date` | Date | `t.work_date` | Work date (FK → DimDate) |
| `week` | Whole Number | `t.week_number` | ISO week number |
| `weekYear` | Whole Number | `t.week_year` | ISO week year |
| `project` | Text | `p.project_name` | Project name |
| `projectCode` | Text | `p.project_code` | Project code (FK → DimProject) |
| `projectCategory` | Text | `tk.task_category` | Task category |
| `taskClassification` | Text | `tk.classification` | Billable/Non-Billable |
| `hours` | Decimal Number | `t.hours` | Hours worked (0–24) |
| `status` | Text | `t.status` | Entry status |
| `isBillable` | True/False | `t.billable` | Billable flag |
| `submissionDate` | DateTime | Computed | When timesheet was submitted |
| `approvalDate` | DateTime | Computed | When timesheet was approved |
| `createdDate` | DateTime | `t.created_at` | Record creation timestamp |
| `updatedDate` | DateTime | `t.updated_at` | Last update timestamp |

---

## Dimension Tables

### DimEmployee (Source: `/api/powerbi/users`)

| Column | Data Type | Description |
|--------|-----------|-------------|
| `id` | Whole Number | Internal user ID |
| `employeeId` | Text | Employee identifier (PK) |
| `employeeName` | Text | Full name |
| `email` | Text | Email address |
| `role` | Text | admin / manager / employee |
| `division` | Text | Division assignment |
| `department` | Text | Department assignment |
| `supportingCategory` | Text | Dedicated Team / Flex Team |
| `admin` | Text | Assigned admin name |
| `status` | Text | Active / Inactive |
| `isActive` | True/False | Active flag |
| `createdDate` | DateTime | Account creation date |
| `updatedDate` | DateTime | Last update date |

> ⚠️ **Security:** Password hashes, session tokens, and authentication secrets are **never** included.

### DimProject (Source: `/api/powerbi/projects`)

| Column | Data Type | Description |
|--------|-----------|-------------|
| `id` | Whole Number | Internal project ID |
| `projectCode` | Text | Unique project code (PK) |
| `projectName` | Text | Project display name |
| `customerName` | Text | Customer/client name |
| `activity` | Text | Activity type |
| `division` | Text | Division assignment |
| `subdivision` | Text | Subdivision assignment |
| `teamType` | Text | Team type classification |
| `status` | Text | Active / Inactive |
| `isActive` | True/False | Active flag |
| `createdDate` | DateTime | Project creation date |
| `updatedDate` | DateTime | Last update date |

### DimDivision (Source: `/api/powerbi/divisions`)

| Column | Data Type | Description |
|--------|-----------|-------------|
| `id` | Whole Number | Internal division ID |
| `divisionName` | Text | Division name (PK) |
| `status` | Text | Active / Inactive |
| `isActive` | True/False | Active flag |
| `createdDate` | DateTime | Creation date |

### DimDepartment (Source: `/api/powerbi/departments`)

| Column | Data Type | Description |
|--------|-----------|-------------|
| `id` | Whole Number | Internal department ID |
| `departmentName` | Text | Department name (PK) |
| `status` | Text | Active / Inactive |
| `isActive` | True/False | Active flag |
| `createdDate` | DateTime | Creation date |

### DimHoliday (Source: `/api/powerbi/holidays`)

| Column | Data Type | Description |
|--------|-----------|-------------|
| `id` | Whole Number | Internal holiday ID |
| `date` | Date | Holiday date |
| `holidayName` | Text | Holiday name |
| `createdDate` | DateTime | Creation date |

### DimDate (Generated via DAX)

| Column | Data Type | Description |
|--------|-----------|-------------|
| `Date` | Date | Calendar date (PK) |
| `Year` | Whole Number | Calendar year |
| `Quarter` | Text | Q1, Q2, Q3, Q4 |
| `QuarterNumber` | Whole Number | 1–4 |
| `Month` | Whole Number | 1–12 |
| `MonthName` | Text | January, February, ... |
| `MonthShort` | Text | Jan, Feb, ... |
| `WeekNumber` | Whole Number | ISO week number |
| `WeekStart` | Date | Monday of the ISO week |
| `DayOfWeek` | Whole Number | 1 (Mon) – 7 (Sun) |
| `DayName` | Text | Monday, Tuesday, ... |
| `IsWeekend` | True/False | Saturday or Sunday |
| `IsHoliday` | True/False | Matches holiday calendar |
| `YearMonth` | Text | YYYY-MM format |
| `YearQuarter` | Text | YYYY Q1 format |

---

## Relationships

| From Table (Many) | From Column | To Table (One) | To Column | Cross Filter |
|-------------------|-------------|----------------|-----------|-------------|
| FactTimesheet | `employeeId` | DimEmployee | `employeeId` | Single |
| FactTimesheet | `projectCode` | DimProject | `projectCode` | Single |
| FactTimesheet | `division` | DimDivision | `divisionName` | Single |
| FactTimesheet | `department` | DimDepartment | `departmentName` | Single |
| FactTimesheet | `date` | DimDate | `Date` | Single |

### Relationship Properties:
- **Cardinality:** Many-to-One for all fact-to-dimension relationships
- **Cross filter direction:** Single (from dimension to fact)
- **Active:** Yes for all relationships above

### Notes:
- The `DimHoliday` table is used in the `DimDate[IsHoliday]` calculated column, not as a direct relationship
- `admin` is a denormalized text field in FactTimesheet; for admin drill-through, filter `DimEmployee` by `role = "admin"`
- Avoid many-to-many relationships — they degrade performance and cause ambiguity

---

## Data Types Reference

| Power BI Type | API JSON Type | Columns |
|---------------|--------------|---------|
| Whole Number | integer | `id`, `week`, `weekYear` |
| Decimal Number | float | `hours` |
| Text | string | `employeeName`, `division`, `status`, etc. |
| Date | string (YYYY-MM-DD) | `date` |
| DateTime | string (ISO 8601) | `createdDate`, `updatedDate`, `submissionDate`, `approvalDate` |
| True/False | boolean | `isBillable`, `isActive`, `IsWeekend`, `IsHoliday` |

---

## Source Database Tables (Reference Only)

The following database tables feed the REST API. Power BI never accesses these directly.

| Database Table | API Endpoint | Power BI Table |
|---------------|-------------|---------------|
| `timesheets` | `/api/powerbi/timesheets` | FactTimesheet |
| `users` | `/api/powerbi/users` | DimEmployee |
| `projects` | `/api/powerbi/projects` | DimProject |
| `divisions` | `/api/powerbi/divisions` | DimDivision |
| `departments` | `/api/powerbi/departments` | DimDepartment |
| `holidays` | `/api/powerbi/holidays` | DimHoliday |
| `tasks` | `/api/powerbi/tasks` | (Reference) |
| `user_admin_assignments` | `/api/powerbi/assignments` | (Reference) |

---

*GCC Timesheet Power BI Data Model v1.0.0*
