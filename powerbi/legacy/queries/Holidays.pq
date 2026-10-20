// Power Query M — Holidays (DimHoliday)
// GCC Timesheet Power BI Dashboard v1.1.0

let
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",
    Endpoint = Text.TrimEnd(ApiBaseUrl, "/") & "/api/powerbi/holidays",

    FetchData =
        let
            Response = try Web.Contents(Endpoint, [Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"]]) otherwise error "Power BI API request failed for holidays. Check the API URL and key.",
            JsonResponse = try Json.Document(Response) otherwise error "Power BI API returned malformed JSON for holidays.",
            Root = if JsonResponse[HasError] then error "Power BI API request for holidays failed." else JsonResponse[Value],
            DataList = if Value.Is(Root, type record) and Record.HasFields(Root, "data") then Root[data] else error "Power BI API response for holidays is missing the required 'data' property.",
            DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
            Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
                "id", "date", "holidayName", "createdDate"
            }, {
                "id", "date", "holidayName", "createdDate"
            }),
            Typed = Table.TransformColumnTypes(Expanded, {
                {"id", Int64.Type},
                {"date", type date},
                {"holidayName", type text},
                {"createdDate", type datetime}
            })
        in
            Typed
in
    FetchData
