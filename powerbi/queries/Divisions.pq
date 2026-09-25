// Power Query M — Divisions (DimDivision)
// GCC Timesheet Power BI Dashboard v1.0.0

let
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",

    Endpoint = ApiBaseUrl & "/api/powerbi/divisions",
    Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"],
    Source = Json.Document(Web.Contents(Endpoint, [Headers = Headers])),
    DataList = Source[data],
    DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),

    Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
        "id", "divisionName", "status", "isActive", "createdDate"
    }),

    Typed = Table.TransformColumnTypes(Expanded, {
        {"id", Int64.Type},
        {"divisionName", type text},
        {"status", type text},
        {"isActive", type logical},
        {"createdDate", type datetime}
    })
in
    Typed
