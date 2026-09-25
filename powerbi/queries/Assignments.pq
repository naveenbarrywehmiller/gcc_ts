// Power Query M — Assignments (AdminAssignments)
// GCC Timesheet Power BI Dashboard v1.0.0

let
    // ═══ CONFIGURATION — UPDATE THESE VALUES ═══
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",

    // ═══ FETCH DATA ═══
    Endpoint = ApiBaseUrl & "/api/powerbi/assignments",
    Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"],
    Source = Json.Document(Web.Contents(Endpoint, [Headers = Headers])),
    DataList = Source[data],
    DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),

    // ═══ EXPAND ═══
    Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
        "id", "employeeId", "employeeName", "employeeEmail", 
        "adminId", "adminName", "adminEmail", 
        "employeeDivision", "employeeDepartment", "assignedDate"
    }),

    // ═══ SET DATA TYPES ═══
    Typed = Table.TransformColumnTypes(Expanded, {
        {"id", Int64.Type},
        {"employeeId", type text},
        {"employeeName", type text},
        {"employeeEmail", type text},
        {"adminId", type text},
        {"adminName", type text},
        {"adminEmail", type text},
        {"employeeDivision", type text},
        {"employeeDepartment", type text},
        {"assignedDate", type datetime}
    })
in
    Typed
