# MIGRATION.md — Data Migration Guide

This guide details how to export existing SQLite data and import it into Microsoft SharePoint Lists during the migration phase.

---

## 1. Export Data from SQLite to CSV

The repository includes a Node.js script that automatically queries the existing SQLite database (`data/timesheet.db`) and generates CSV files formatted specifically for SharePoint lookup columns and choice fields.

1. Open a terminal in the root of the project.
2. Run the export script:
   ```bash
   node scripts/export-to-sharepoint-csv.js
   ```
3. The script will generate 9 CSV files inside the `scripts/export/` directory:
   - `1_divisions.csv`
   - `2_departments.csv`
   - `3_subdivisions.csv`
   - `4_ownerships.csv`
   - `5_employees.csv`
   - `6_tasks.csv`
   - `7_projects.csv`
   - `8_holidays.csv`
   - `9_timesheets.csv` (Only includes 'approved' status entries to save time)

---

## 2. Import CSVs to SharePoint Lists

SharePoint lookup columns require the target data to exist **before** the lookup column is populated. Therefore, you must import the CSV files in the exact numeric order they were generated.

### Method A: Manual Import (Web UI)

For each file in order (1 through 9):

1. Go to your SharePoint Site (`https://YOURTENANT.sharepoint.com/sites/GCCTimeSheet`).
2. Navigate to the corresponding List (e.g., `TS_Divisions`).
3. Click the **Edit in grid view** button in the list header.
4. Open the CSV file in Excel.
5. Select the data rows (excluding headers) and **Copy**.
6. Back in SharePoint, select the empty row at the bottom of the grid and **Paste** (Ctrl+V).
7. Wait for SharePoint to save all rows.
8. Click **Exit grid view**.

*Note: For `TS_TimesheetEntries`, which may contain thousands of records, pasting in chunks of 500 rows is recommended to avoid browser timeouts.*

### Method B: Automated Import via PnP PowerShell

If you have the PnP PowerShell module installed, you can automate the import:

```powershell
# Connect to your site
Connect-PnPOnline -Url "https://YOURTENANT.sharepoint.com/sites/GCCTimeSheet" -Interactive

# Function to import CSV to List
function Import-CSVToList($csvPath, $listName) {
    $data = Import-Csv $csvPath
    foreach ($row in $data) {
        $itemValues = @{}
        foreach ($prop in $row.psobject.properties) {
            $itemValues[$prop.Name] = $prop.Value
        }
        Add-PnPListItem -List $listName -Values $itemValues
        Write-Host "Added item to $listName"
    }
}

# Run imports in order
Import-CSVToList ".\scripts\export\1_divisions.csv" "TS_Divisions"
Import-CSVToList ".\scripts\export\2_departments.csv" "TS_Departments"
# ... continue for all 9 files
```

---

## 3. Enable SharePoint Sync in App

Once all historical data is imported into SharePoint:

1. Open `.env`
2. Set `ENABLE_SHAREPOINT_SYNC=true`
3. Restart the Node.js server.
4. From now on, any new timesheets, edits, or approvals will dual-write to both SQLite and SharePoint automatically.

---

## 4. Troubleshooting Data Types

If SharePoint rejects a row during import:

- **Lookups failed**: Ensure the referenced item (e.g., a specific Division name) was successfully imported in step 1. SharePoint lookup fields are case-sensitive strings in grid view.
- **Dates**: The export script formats dates as `YYYY-MM-DDTHH:mm:ss`. If your SharePoint regional settings expect `DD/MM/YYYY`, you may need to adjust the format in Excel before pasting.
- **Yes/No fields**: The script exports `1/0` as `Yes/No` to match SharePoint UI expectations.
