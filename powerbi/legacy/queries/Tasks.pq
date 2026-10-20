// Power Query M — Tasks (DimTask)
// GCC Dashboard Power BI Dashboard v1.0.0

let
    // ═══ CONFIGURATION — UPDATE THESE VALUES ═══
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",

    // ═══ FETCH DATA ═══
    Endpoint = ApiBaseUrl & "/api/powerbi/tasks",
    Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"],
    Source = Json.Document(Web.Contents(Endpoint, [Headers = Headers])),
    DataList = Source[data],
    DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),

    // ═══ EXPAND ═══
    Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
        "id", "classification", "taskCategory", "taskDescription", 
        "estimatedHours", "inputReceivedDate", "startDate", "targetDate", "deliveredDate",
        "requiresProject", "status", "isActive", "createdDate"
    }),

    // ═══ SET DATA TYPES ═══
    Typed = Table.TransformColumnTypes(Expanded, {
        {"id", Int64.Type},
        {"classification", type text},
        {"taskCategory", type text},
        {"taskDescription", type text},
        {"estimatedHours", type number},
        {"inputReceivedDate", type date},
        {"startDate", type date},
        {"targetDate", type date},
        {"deliveredDate", type date},
        {"requiresProject", type logical},
        {"status", type text},
        {"isActive", type logical},
        {"createdDate", type datetime}
    })
in
    Typed
