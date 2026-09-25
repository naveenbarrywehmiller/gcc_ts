// Power Query M — Timesheets (FactTimesheet)
// GCC Timesheet Power BI Dashboard v1.0.0
//
// Instructions:
//   1. In Power BI Desktop → Get Data → Blank Query
//   2. Click Advanced Editor
//   3. Paste this script
//   4. Update ApiBaseUrl and ApiKey below
//   5. Click Done → Close & Apply

let
    // ═══ CONFIGURATION — UPDATE THESE VALUES ═══
    ApiBaseUrl = "http://localhost:3001",    // Change to your server URL
    ApiKey = "YOUR_API_KEY_HERE",           // Change to your Power BI API key

    // ═══ BUILD REQUEST ═══
    Endpoint = ApiBaseUrl & "/api/powerbi/timesheets",
    Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"],

    // ═══ FETCH DATA ═══
    Source = Json.Document(Web.Contents(Endpoint, [Headers = Headers])),

    // ═══ EXTRACT DATA ARRAY ═══
    DataList = Source[data],
    DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),

    // ═══ EXPAND RECORD COLUMNS ═══
    Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
        "id", "employeeId", "employeeName", "email", "division", "department",
        "admin", "date", "week", "weekYear", "project", "projectCode",
        "projectCategory", "taskClassification", "hours", "status",
        "isBillable", "submissionDate", "approvalDate", "createdDate", "updatedDate"
    }),

    // ═══ SET DATA TYPES ═══
    Typed = Table.TransformColumnTypes(Expanded, {
        {"id", Int64.Type},
        {"employeeId", type text},
        {"employeeName", type text},
        {"email", type text},
        {"division", type text},
        {"department", type text},
        {"admin", type text},
        {"date", type date},
        {"week", Int64.Type},
        {"weekYear", Int64.Type},
        {"project", type text},
        {"projectCode", type text},
        {"projectCategory", type text},
        {"taskClassification", type text},
        {"hours", type number},
        {"status", type text},
        {"isBillable", type logical},
        {"submissionDate", type datetime},
        {"approvalDate", type datetime},
        {"createdDate", type datetime},
        {"updatedDate", type datetime}
    })
in
    Typed
