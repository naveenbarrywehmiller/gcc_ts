// Power Query M — Projects (DimProject)
// GCC Timesheet Power BI Dashboard v1.1.0

let
    ApiBaseUrl = "http://localhost:3001",
    ApiKey = "YOUR_API_KEY_HERE",
    Endpoint = Text.TrimEnd(ApiBaseUrl, "/") & "/api/powerbi/projects",

    FetchData =
        let
            Response = try Web.Contents(Endpoint, [Headers = [#"X-API-Key" = ApiKey, #"Accept" = "application/json"]]) otherwise error "Power BI API request failed for projects. Check the API URL and key.",
            JsonResponse = try Json.Document(Response) otherwise error "Power BI API returned malformed JSON for projects.",
            Root = if JsonResponse[HasError] then error "Power BI API request for projects failed." else JsonResponse[Value],
            DataList = if Value.Is(Root, type record) and Record.HasFields(Root, "data") then Root[data] else error "Power BI API response for projects is missing the required 'data' property.",
            DataTable = Table.FromList(DataList, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
            Expanded = Table.ExpandRecordColumn(DataTable, "Column1", {
                "platformId", "platform", "id", "projectCode", "projectName", "customerName", "activity",
                "division", "subdivision", "teamType", "status", "isActive",
                "createdDate", "updatedDate", "taskEstimatedHours", "assignedTaskCount", "estimatedTaskCount", "billableTaskIds", "nonBillableTaskIds"
            }, {
                "platformId", "platform", "id", "projectCode", "projectName", "customerName", "activity",
                "division", "subdivision", "teamType", "status", "isActive",
                "createdDate", "updatedDate", "taskEstimatedHours", "assignedTaskCount", "estimatedTaskCount", "billableTaskIds", "nonBillableTaskIds"
            }),
            Typed = Table.TransformColumnTypes(Expanded, {
                {"platformId", Int64.Type}, {"platform", type text}, {"id", Int64.Type},
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
                {"updatedDate", type datetime}, {"taskEstimatedHours", type number}, {"assignedTaskCount", Int64.Type}, {"estimatedTaskCount", Int64.Type}
            })
        in
            Typed
in
    FetchData
