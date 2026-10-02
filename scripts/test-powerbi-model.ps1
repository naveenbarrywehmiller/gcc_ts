param([Parameter(Mandatory=$true)][int]$Port)
$ErrorActionPreference = 'Stop'
$taskBin = 'C:/Program Files/Microsoft Power BI Desktop/bin'
Add-Type -Path (Join-Path $taskBin 'Microsoft.PowerBI.Tabular.dll')
Add-Type -Path (Join-Path $taskBin 'Microsoft.PowerBI.AdomdClient.dll')
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskFixture = Get-Content (Join-Path $PSScriptRoot 'powerbi-fixture.json') -Raw
$taskModelPath = Join-Path $taskRoot 'powerbi/GCC_Requirements/GCC_Requirements.SemanticModel/model.bim'
$taskDb = [Microsoft.AnalysisServices.Tabular.JsonSerializer]::DeserializeDatabase((Get-Content $taskModelPath -Raw))
$taskDb.Name = 'GCC requirements isolated validation'
$taskDb.ID = 'gcc_requirements_validation_' + [Guid]::NewGuid().ToString('N')
$taskBytes = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskFixture))
$taskDb.Model.Expressions['fnApi'].Expression = '(endpoint as text) as list => Record.Field(Json.Document(Binary.FromText("' + $taskBytes + '", BinaryEncoding.Base64)), endpoint)'
$taskDb.Model.Expressions['RefreshClock'].Expression = '#datetimezone(2026,10,1,12,0,0,0,0)'
$taskServer = New-Object Microsoft.AnalysisServices.Tabular.Server
$taskServer.Connect("localhost:$Port")
$taskResults = [Collections.Generic.List[object]]::new()
function Read-TaskValue($Command) {
    $taskReader=$Command.ExecuteReader()
    try { if($taskReader.Read()) { return $taskReader.GetValue(0) } } finally { $taskReader.Close() }
}
function Test-TaskValue($Actual,$Expected) {
    if($null -eq $Expected){return $null -eq $Actual}
    if($Expected -is [ValueType] -and $null -ne $Actual){return [Math]::Abs([double]$Actual-[double]$Expected) -lt 0.000000001}
    return $Actual -eq $Expected
}
try {
    $taskServer.Databases.Add($taskDb)
    $taskDb.Update([Microsoft.AnalysisServices.UpdateOptions]::ExpandFull)
    $taskDb.Model.RequestRefresh([Microsoft.AnalysisServices.Tabular.RefreshType]::Full)
    $taskDb.Model.SaveChanges() | Out-Null
    $taskConnection = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection("Data Source=localhost:$Port;Initial Catalog=$($taskDb.Name)")
    $taskConnection.Open()
    foreach ($taskMeasure in $taskDb.Model.Tables['_Measures'].Measures) {
        $taskCommand = $taskConnection.CreateCommand()
        $taskCommand.CommandText = 'EVALUATE ROW("Value", [' + $taskMeasure.Name.Replace(']',']]') + '])'
        try {
            $taskValue = Read-TaskValue $taskCommand
            $taskResults.Add([pscustomobject]@{measure=$taskMeasure.Name;status='Evaluated';value=if($taskValue -is [DBNull]){$null}else{$taskValue}})
        } catch {
            $taskResults.Add([pscustomobject]@{measure=$taskMeasure.Name;status='Error';error=$_.Exception.Message})
        }
    }
    $taskCases = @(
        @{name='Weekly counts not multiplied by days';dax='CALCULATE([Weekly Fundamental Errors], DimDate[YearMonth]="2026-09")';expected=2},
        @{name='Monthly productive hours';dax='CALCULATE([Effective Hours],DimDate[YearMonth]="2026-09")';expected=16},
        @{name='Staffing snapshot preserves known zero';dax='CALCULATE([Open Positions],DimDate[YearMonth]="2026-10",DimDivision[divisionName]="North")';expected=0},
        @{name='Missing staffing is unknown';dax='CALCULATE([Open Positions],DimDate[YearMonth]="2026-10",DimDivision[divisionName]="South")';expected=$null},
        @{name='Missing deliverables is unknown';dax='[Defect Density %]';expected=$null},
        @{name='Team capacity counts both employees';dax='CALCULATE([Available Hours],DimDate[Date]=DATE(2026,10,2),DimDivision[divisionName]="North")';expected=16},
        @{name='Holiday and vacation overlap not subtracted twice';dax='CALCULATE([Available Hours],DimDate[Date]=DATE(2026,10,1),DimDivision[divisionName]="North")';expected=0},
        @{name='Project capacity needs allocation';dax='CALCULATE([Available Hours],DimProject[projectCode]="TEST-1")';expected=$null},
        @{name='New joiners with a mid-month date selection';dax='CALCULATE([New Joiners],DimDate[Date]=DATE(2026,10,15),DimDivision[divisionName]="North")';expected=1},
        @{name='Plan allocation reconciles to budget';dax='[Hours Scheduled]';expected=80},
        @{name='Forecast uses past actuals plus remaining budget';dax='[Team Forecast Hours]';expected=88},
        @{name='Flex slicer changes roster capacity';dax='CALCULATE([Available Hours],DimDate[Date]=DATE(2026,10,2),DimEmployee[supportingCategory]="Flex Team")';expected=8},
        @{name='Division filter excludes other-division hours';dax='CALCULATE([Actual Hours],DimDivision[divisionName]="South")';expected=$null},
        @{name='Strictly previous completed Friday';dax='INT([Last Completed Friday])';expected=46290}
    )
    foreach($taskCase in $taskCases) {
        $taskCommand=$taskConnection.CreateCommand()
        $taskCommand.CommandText='EVALUATE ROW("Value", '+$taskCase.dax+')'
        try {
            $taskValue=Read-TaskValue $taskCommand
            if($taskValue -is [DBNull]){$taskValue=$null}
            $taskResults.Add([pscustomobject]@{test=$taskCase.name;status=if(Test-TaskValue $taskValue $taskCase.expected){'Pass'}else{'Fail'};expected=$taskCase.expected;actual=$taskValue})
        } catch {
            $taskResults.Add([pscustomobject]@{test=$taskCase.name;status='Error';error=$_.Exception.Message})
        }
    }
    # Second scenario checks non-empty delivery/quality data and contradictory weekly copies.
    $taskScenario=ConvertFrom-Json $taskFixture -AsHashtable
    $taskScenario.projects += @{id=2;projectCode='TEST-2';projectName='Completed synthetic project';division='North';startDate='2026-09-01';targetDate='2026-09-29';deliveredDate='2026-09-30';budgetHours=100;projectStatus='Completed';isActive=$true}
    foreach($taskEntry in @(@{id=4;date='2026-08-31';hours=40},@{id=5;date='2026-09-30';hours=80})) {
        $taskScenario.timesheets += @{id=$taskEntry.id;userId=1;projectId=2;taskId=1;date=$taskEntry.date;hours=$taskEntry.hours;status='approved';division='North';department='Engineering';projectCategory='Development';weeklyRowKey=('test-extra-'+$taskEntry.id);weeklyDetails=@{};updatedDate='2026-09-30T12:00:00'}
    }
    $taskScenario.timesheets[1].weeklyDetails.fundamental_error_count=3
    $taskScenarioBytes=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($taskScenario | ConvertTo-Json -Depth 20)))
    $taskDb.Model.Expressions['fnApi'].Expression='(endpoint as text) as list => Record.Field(Json.Document(Binary.FromText("'+$taskScenarioBytes+'",BinaryEncoding.Base64)),endpoint)'
    $taskDb.Model.Tables['FactDeliverable'].Partitions[0].Source.Expression='#table(type table [deliverableId=text,projectId=Int64.Type,plannedDate=date,deliveredDate=date,fundamentalErrors=Int64.Type,informationErrors=Int64.Type,readableErrors=Int64.Type,hadRework=logical], {{"d1",2,#date(2026,9,30),#date(2026,9,30),1,0,0,false},{"d2",2,#date(2026,9,30),#date(2026,9,30),0,null,0,false}})'
    $taskDb.Model.RequestRefresh([Microsoft.AnalysisServices.Tabular.RefreshType]::Full)
    $taskDb.Model.SaveChanges() | Out-Null
    $taskExtraCases=@(
        @{name='Effort compares lifetime actuals with lifetime budget';dax='CALCULATE([Effort Deviation %],DimDate[YearMonth]="2026-09")';expected=0.2},
        @{name='Effort tolerance turns red';dax='CALCULATE([Effort Alert Color],DimDate[YearMonth]="2026-09")';expected='#DC2626'},
        @{name='Schedule reports days late';dax='CALCULATE([Schedule Deviation Days],DimDate[YearMonth]="2026-09")';expected=1},
        @{name='Schedule tolerance turns red';dax='CALCULATE([Schedule Alert Color],DimDate[YearMonth]="2026-09")';expected='#DC2626'},
        @{name='Defect density uses explicit deliverables';dax='[Defect Density %]';expected=0.5},
        @{name='First-time-right uses explicit false rework flags';dax='[First Time Right %]';expected=1},
        @{name='Partial error counts remain unknown';dax='[Information Errors]';expected=$null},
        @{name='Conflicting weekly detail copies block totals';dax='[Weekly Fundamental Errors]';expected=$null},
        @{name='Conflicting weekly rows counted once';dax='[Detail Conflicts]';expected=1}
    )
    foreach($taskCase in $taskExtraCases) {
        $taskCommand=$taskConnection.CreateCommand()
        $taskCommand.CommandText='EVALUATE ROW("Value", '+$taskCase.dax+')'
        try {
            $taskValue=Read-TaskValue $taskCommand
            if($taskValue -is [DBNull]){$taskValue=$null}
            $taskResults.Add([pscustomobject]@{test=$taskCase.name;status=if(Test-TaskValue $taskValue $taskCase.expected){'Pass'}else{'Fail'};expected=$taskCase.expected;actual=$taskValue})
        } catch {$taskResults.Add([pscustomobject]@{test=$taskCase.name;status='Error';error=$_.Exception.Message})}
    }
    $taskConnection.Close()
    $taskResults | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $taskRoot 'powerbi/validation/engine-validation.json') -Encoding utf8
    $taskResults | Where-Object { $_.status -in 'Fail','Error' } | ConvertTo-Json -Depth 8
    Write-Output ("Native engine: {0} measures evaluated; {1} cases checked; {2} failures" -f $taskDb.Model.Tables['_Measures'].Measures.Count,($taskCases.Count+$taskExtraCases.Count),@($taskResults | Where-Object {$_.status -in 'Fail','Error'}).Count)
    if(@($taskResults | Where-Object {$_.status -in 'Fail','Error'}).Count){throw 'Native validation failed.'}
} finally {
    # This database was created above with a random task-specific ID. Never touch the report database.
    if ($taskDb.Server -and $taskServer.Databases.Contains($taskDb.ID)) {$taskDb.Drop()}
    $taskServer.Disconnect()
}
