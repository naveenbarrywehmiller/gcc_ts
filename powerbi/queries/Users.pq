// Power Query M — Users (DimEmployee)
// GCC Timesheet Power BI Dashboard v1.0.0

let
    // ═══ CONFIGURATION — UPDATE THESE VALUES ═══
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",

    // ═══ FETCH DATA ═══
    Endpoint = ApiBaseUrl & "/api/powerbi/users",
    Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"],
    Source = Json.Document(Web.Contents(Endpoint, [Headers = Headers])),
    DataList = Source[data],
    DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),

    // ═══ EXPAND ═══
    Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
        "id", "employeeId", "employeeName", "email", "role",
        "division", "department", "supportingCategory", "admin",
        "status", "isActive", "createdDate", "updatedDate"
    }),

    // ═══ SET DATA TYPES ═══
    Typed = Table.TransformColumnTypes(Expanded, {
        {"id", Int64.Type},
        {"employeeId", type text},
        {"employeeName", type text},
        {"email", type text},
        {"role", type text},
        {"division", type text},
        {"department", type text},
        {"supportingCategory", type text},
        {"admin", type text},
        {"status", type text},
        {"isActive", type logical},
        {"createdDate", type datetime},
        {"updatedDate", type datetime}
    })
in
    Typed
