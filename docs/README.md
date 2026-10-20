# GCC project documentation

Three products share this repository. Their source paths and release versions are independent.

| Product | Source | Start here |
| --- | --- | --- |
| GCC Timesheet App | `client/`, `server/`, `shared/` | [Application setup](../README.md) |
| GCC Dashboard Power BI | `powerbi/GCC_Dashboard/` | [Power BI overview](../powerbi/README.md) |
| GCC Timesheet Linux Admin | `deploy/linux-admin/` | [Linux installation and operations](../deploy/linux-admin/README.md) |

## Application reference

- [Architecture](ARCHITECTURE.md) and [API reference](API_REFERENCE.md)
- [Permissions and Matrix help](PERMISSIONS_MATRIX.md)
- [Reports](REPORTS.md), [task planning](TASK_PLANNING.md), and [workbook changes](WORKBOOK_CHANGES.md)
- [Platform management](PLATFORM_MANAGEMENT.md) and [catalog import/export](CATALOG_IMPORT_EXPORT.md)
- [Required timesheet fields](TIMESHEET_REQUIRED_CHANGES.md)

## Installation, integrations, and support

- [GitHub Help: setup, workflows, releases, and troubleshooting](../.github/HELP.md)
- [Power BI API integration](POWERBI.md) and [Power BI user guide](../powerbi/documentation/POWERBI_USER_GUIDE.md)
- [SharePoint setup](integrations/SHAREPOINT_SETUP.md) and [integration clarification](integrations/SHAREPOINT_CLARIFICATION.md)
- [Power Automate setup](integrations/POWER_AUTOMATE_SETUP.md)
- [Earlier SharePoint-based Power BI setup](integrations/POWER_BI_SETUP.md)
- [Deployment history](DEPLOYMENT_NOTES.md)

## Development and validation

- [Repository and release mapping](REPOSITORY_STRUCTURE.md)
- [Scripts and checks](../scripts/README.md)
- [Responsive rules](../RESPONSIVE_WEB_DESIGN_RULES.md), [Chromium checklist](CHROMIUM_LAYOUT_TEST_CHECKLIST.md), and [responsive audit](RESPONSIVE_AUDIT.md)
- [Agent tooling](AGENT_TOOLS.md)
- [Application release history](../CHANGELOG.md) and [Power BI release history](../powerbi/CHANGELOG.md)

## Historical plans

[Migration notes](archive/M365_MIGRATION.md), [implementation plan](archive/M365_IMPLEMENTATION_PLAN.md), and [project overview](archive/PROJECT_OVERVIEW.md) are retained for history. Their proposed schemas, dependencies, and commands describe earlier designs; use current manifests, source, and setup guides for installation.
