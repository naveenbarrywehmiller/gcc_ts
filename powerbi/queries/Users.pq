// Power Query M — Users (DimEmployee)
// GCC Timesheet Power BI Dashboard v1.1.0

let
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",
    Endpoint = Text.TrimEnd(ApiBaseUrl, "/") & "/api/powerbi/users",

    FetchData =
        let
            Response = try Web.Contents(Endpoint, [Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"]]) otherwise error "Power BI API request failed for users. Check the API URL and key.",
            JsonResponse = try Json.Document(Response) otherwise error "Power BI API returned malformed JSON for users.",
            Root = if JsonResponse[HasError] then error "Power BI API request for users failed." else JsonResponse[Value],
            DataList = if Value.Is(Root, type record) and Record.HasFields(Root, "data") then Root[data] else error "Power BI API response for users is missing the required 'data' property.",
            DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
            Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
                "id", "employeeId", "employeeName", "email", "role",
                "division", "department", "supportingCategory", "admin",
                "status", "isActive", "createdDate", "updatedDate"
            }, {
                "id", "employeeId", "employeeName", "email", "role",
                "division", "department", "supportingCategory", "admin",
                "status", "isActive", "createdDate", "updatedDate"
            }),
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
in
    FetchData
