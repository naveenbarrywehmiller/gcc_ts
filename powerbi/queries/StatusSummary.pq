// Power Query M — Status Summary
// GCC Timesheet Power BI Dashboard v1.0.0

let
    // ═══ CONFIGURATION — UPDATE THESE VALUES ═══
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",

    // ═══ FETCH DATA ═══
    Endpoint = ApiBaseUrl & "/api/powerbi/status-summary",
    Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"],
    Source = Json.Document(Web.Contents(Endpoint, [Headers = Headers])),
    DataList = Source[data],
    DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),

    // ═══ EXPAND ═══
    Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
        "status", "entryCount", "totalHours", "employeeCount", "percentage"
    }),

    // ═══ SET DATA TYPES ═══
    Typed = Table.TransformColumnTypes(Expanded, {
        {"status", type text},
        {"entryCount", Int64.Type},
        {"totalHours", type number},
        {"employeeCount", Int64.Type},
        {"percentage", type number}
    })
in
    Typed
