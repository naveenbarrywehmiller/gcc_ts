param(
    [string]$ModelPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'powerbi/GCC_Requirements/GCC_Requirements.SemanticModel'),
    [string]$OutputPath
)
# Read-only TOM deserialization supports Desktop's TMDL save format and older BIM models.
$ErrorActionPreference = 'Stop'
$taskDll = 'C:/Program Files/Microsoft Power BI Desktop/bin/Microsoft.PowerBI.Tabular.dll'
if (-not (Test-Path -LiteralPath $taskDll)) {
    throw 'Install Power BI Desktop, or update taskDll to its Microsoft.PowerBI.Tabular.dll location.'
}
Add-Type -Path $taskDll
$taskDefinition = Join-Path $ModelPath 'definition'
$taskBim = Join-Path $ModelPath 'model.bim'
if ((Test-Path -LiteralPath $taskDefinition) -and (Test-Path -LiteralPath $taskBim)) {
    throw 'Both TMDL definition/ and model.bim exist. Select one canonical model format before validation.'
}
if (Test-Path -LiteralPath $taskDefinition) {
    $taskDb = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeDatabaseFromFolder($taskDefinition)
} elseif (Test-Path -LiteralPath $taskBim) {
    $taskDb = [Microsoft.AnalysisServices.Tabular.JsonSerializer]::DeserializeDatabase((Get-Content -LiteralPath $taskBim -Raw))
} else {
    throw "No TMDL definition/ or model.bim found in $ModelPath"
}
$taskJson = [Microsoft.AnalysisServices.Tabular.JsonSerializer]::SerializeDatabase($taskDb)
if ($OutputPath) {
    [IO.File]::WriteAllText($OutputPath, $taskJson, [Text.UTF8Encoding]::new($false))
} else {
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    [Console]::Write($taskJson)
}
