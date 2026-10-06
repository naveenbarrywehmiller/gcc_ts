param([Parameter(Mandatory=$true)][int]$Port, [string]$OutputPath)
# Read aggregate values from the currently open report; no model mutation or employee records.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'powerbi-runtime.ps1')
$taskBin = Get-GccPowerBIDesktopBin
Add-Type -Path (Join-Path $taskBin 'Microsoft.PowerBI.Tabular.dll')
Add-Type -Path (Join-Path $taskBin 'Microsoft.PowerBI.AdomdClient.dll')
$taskServer = New-Object Microsoft.AnalysisServices.Tabular.Server
$taskConnection = $null
$taskReader = $null
try {
    $taskServer.Connect("localhost:$Port")
    $taskCandidates = @($taskServer.Databases | Where-Object {
        $_.Model.Tables.Contains('FactTimesheet') -and $_.Model.Tables.Contains('Settings') -and $_.Model.Tables.Contains('_Measures')
    })
    if ($taskCandidates.Count -ne 1) { throw 'Expected exactly one GCC requirements model. Close unrelated matching reports or use its specific engine port.' }
    $taskConnection = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection("Data Source=localhost:$Port;Initial Catalog=$($taskCandidates[0].Name)")
    $taskConnection.Open()
    $taskCommand = $taskConnection.CreateCommand()
    $taskCommand.CommandText = 'EVALUATE ROW("LastRefreshUTC",[Last Refresh UTC],"HeaderValue",[Report Status],"DailyRows",COUNTROWS(FactTimesheet),"RawHours",[Raw Hours],"ActualHours",[Actual Hours],"ApprovedHours",[Approved Hours])'
    $taskReader = $taskCommand.ExecuteReader()
    if (-not $taskReader.Read()) { throw 'No metadata row returned.' }
    $taskResult = [ordered]@{mode='Read-only aggregate query of the canonical open Desktop model'}
    for ($taskIndex=0; $taskIndex -lt $taskReader.FieldCount; $taskIndex++) {
        $taskName = $taskReader.GetName($taskIndex).Trim('[',']')
        $taskResult[$taskName] = if ($taskReader.IsDBNull($taskIndex)) {$null} else {$taskReader.GetValue($taskIndex)}
    }
    $taskJson = $taskResult | ConvertTo-Json
    if ($OutputPath) { [IO.File]::WriteAllText($OutputPath, $taskJson, [Text.UTF8Encoding]::new($false)) }
    $taskJson
} finally {
    if ($taskReader) { $taskReader.Close() }
    if ($taskConnection) { $taskConnection.Close() }
    $taskServer.Disconnect()
}
