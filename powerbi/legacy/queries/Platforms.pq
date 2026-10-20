// Platform dimension: one row per Platform. Configure Web Basic credentials as for the PBIP.
let
    ApiBaseUrl = "http://localhost:3001",
    Source = Json.Document(Web.Contents(ApiBaseUrl, [RelativePath="api/powerbi/platforms"])),
    Rows = Table.FromRecords(Source[data], {"id", "platformName"}, MissingField.UseNull),
    Typed = Table.TransformColumnTypes(Rows, {{"id", Int64.Type}, {"platformName", type text}})
in Typed
