// Power Query M — Timesheets (FactTimesheet)
// GCC Timesheet Power BI Dashboard v1.1.0
//
// Instructions:
//   1. In Power BI Desktop → Get Data → Blank Query
//   2. Click Advanced Editor
//   3. Paste this script
//   4. Update ApiBaseUrl, ApiKey, and the optional date filters
//   5. Click Done → Close & Apply

let
    // ═══ CONFIGURATION — UPDATE THESE VALUES ═══
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",
    PageSize = 1000,
    FromDate = null,
    ToDate = null,
    StatusFilter = null,

    BaseUrl = Text.TrimEnd(ApiBaseUrl, "/"),

    BuildRequestUrl = (pageNumber as number) as text =>
        let
            queryParts = {
                "page=" & Number.ToText(pageNumber),
                "limit=" & Number.ToText(PageSize)
            }
            & (if FromDate <> null then {"from=" & Date.ToText(FromDate, "yyyy-MM-dd")} else {})
            & (if ToDate <> null then {"to=" & Date.ToText(ToDate, "yyyy-MM-dd")} else {})
            & (if StatusFilter <> null then {"status=" & StatusFilter} else {}),
            RequestUrl = BaseUrl & "/api/powerbi/timesheets?" & Text.Combine(queryParts, "&")
        in
            RequestUrl,

    FetchPage = (pageNumber as number) as table =>
        let
            RequestUrl = BuildRequestUrl(pageNumber),
            Source = try Web.Contents(RequestUrl, [Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"]]) otherwise error "Power BI API request failed for timesheets page " & Number.ToText(pageNumber) & ". Check the API URL, server availability, and API key.",
            ParsedJson = try Json.Document(Source) otherwise error "Power BI API returned malformed JSON for timesheets page " & Number.ToText(pageNumber) & ".",
            Root = if ParsedJson[HasError] then error "Power BI API error while reading timesheets page " & Number.ToText(pageNumber) else ParsedJson[Value],
            ResponseData = if Value.Is(Root, type record) and Record.HasFields(Root, "data") then Root[data] else error "Power BI API response for timesheets is missing the required 'data' property.",
            DataList = if Value.Is(ResponseData, type list) then ResponseData else { },
            DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
            Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
                "id", "employeeId", "employeeName", "email", "division", "department",
                "admin", "date", "week", "weekYear", "project", "projectCode",
                "projectCategory", "taskClassification", "hours", "status",
                "isBillable", "submissionDate", "approvalDate", "createdDate", "updatedDate"
            }, {
                "id", "employeeId", "employeeName", "email", "division", "department",
                "admin", "date", "week", "weekYear", "project", "projectCode",
                "projectCategory", "taskClassification", "hours", "status",
                "isBillable", "submissionDate", "approvalDate", "createdDate", "updatedDate"
            }),
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
            Typed,

    FirstPage = FetchPage(1),
    FirstPageSize = Table.RowCount(FirstPage),
    FirstPayload = try Json.Document(Web.Contents(BuildRequestUrl(1), [Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"]])) otherwise null,
    TotalPages =
        if FirstPayload <> null then
            let
                Parsed = FirstPayload[Value],
                Pagination = if Value.Is(Parsed, type record) and Record.HasFields(Parsed, "pagination") then Parsed[pagination] else [totalPages = 1],
                ValueFromRecord = if Value.Is(Pagination, type record) and Record.HasFields(Pagination, "totalPages") then Number.From(Pagination[totalPages]) else 1
            in
                ValueFromRecord
        else
            1,
    PageNumbers = List.Numbers(1, if TotalPages > 0 then TotalPages else 1),
    AllPages = List.Transform(PageNumbers, each FetchPage(_)),
    Combined = Table.Combine(AllPages)
in
    Combined
