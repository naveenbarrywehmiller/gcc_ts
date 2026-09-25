// Power Query M — Projects (DimProject)
// GCC Timesheet Power BI Dashboard v1.0.0

let
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",

    Endpoint = ApiBaseUrl & "/api/powerbi/projects",
    Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"],
    Source = Json.Document(Web.Contents(Endpoint, [Headers = Headers])),
    DataList = Source[data],
    DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),

    Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
        "id", "projectCode", "projectName", "customerName", "activity",
        "division", "subdivision", "teamType", "status", "isActive",
        "createdDate", "updatedDate"
    }),

    Typed = Table.TransformColumnTypes(Expanded, {
        {"id", Int64.Type},
        {"projectCode", type text},
        {"projectName", type text},
        {"customerName", type text},
        {"activity", type text},
        {"division", type text},
        {"subdivision", type text},
        {"teamType", type text},
        {"status", type text},
        {"isActive", type logical},
        {"createdDate", type datetime},
        {"updatedDate", type datetime}
    })
in
    Typed
