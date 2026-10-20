// Power Query M — Status Summary
// GCC Timesheet Power BI Dashboard v1.1.0

let
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",
    Endpoint = Text.TrimEnd(ApiBaseUrl, "/") & "/api/powerbi/status-summary",

    FetchData =
        let
            Response = try Web.Contents(Endpoint, [Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"]]) otherwise error "Power BI API request failed for status summary. Check the API URL and key.",
            JsonResponse = try Json.Document(Response) otherwise error "Power BI API returned malformed JSON for status summary.",
            Root = if JsonResponse[HasError] then error "Power BI API request for status summary failed." else JsonResponse[Value],
            DataList = if Value.Is(Root, type record) and Record.HasFields(Root, "data") then Root[data] else error "Power BI API response for status summary is missing the required 'data' property.",
            DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
            Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
                "status", "entryCount", "totalHours", "employeeCount", "percentage"
            }, {
                "status", "entryCount", "totalHours", "employeeCount", "percentage"
            }),
            Typed = Table.TransformColumnTypes(Expanded, {
                {"status", type text},
                {"entryCount", Int64.Type},
                {"totalHours", type number},
                {"employeeCount", Int64.Type},
                {"percentage", type number}
            })
        in
            Typed
in
    FetchData
