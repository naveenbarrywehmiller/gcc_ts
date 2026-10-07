# Dot-sourced by test-powerbi-model.ps1 inside its isolated synthetic database.
# Never clear caches or mutate the canonical report database.
$daxCandidateText = Get-Content (Join-Path $PSScriptRoot 'compare-powerbi-dax-candidates.dax') -Raw
$daxCandidateDefinitions = $daxCandidateText.Substring(0, $daxCandidateText.IndexOf('    MEASURE ''_Measures''[__Candidate Mismatch Count]'))
$daxEvidence = [Collections.Generic.List[object]]::new()

function Invoke-GccCandidateQuery([string]$Query) {
    $daxCommand = $taskConnection.CreateCommand()
    $daxCommand.CommandText = $Query
    $daxCommand.CommandTimeout = 120
    $daxReader = $daxCommand.ExecuteReader()
    $daxRows = 0
    try { while ($daxReader.Read()) { $daxRows++ } } finally { $daxReader.Close(); $daxCommand.Dispose() }
    return $daxRows
}

function Test-GccDaxCandidates([string]$Scenario, [switch]$Benchmark) {
    if (-not $taskDb.ID.StartsWith('gcc_requirements_validation_')) { throw 'Candidate checks require the isolated fixture database.' }
    $daxRows = Invoke-GccCandidateQuery $daxCandidateText
    $daxEvidence.Add([pscustomobject]@{scenario=$Scenario;check='Month/division, totals, empty dates, project/employee/task contexts';mismatchRows=$daxRows})
    if ($daxRows -ne 0) { throw "DAX candidate mismatch in $Scenario" }

    # Override dependencies at query scope to exercise precise branches and boundaries.
    $daxBoundaryCases = @(
        @{measure='Available Hours';dependency='Roster Capacity Hours';values=@('BLANK()','0','8')},
        @{measure='Under Utilized %';dependency='Monthly Utilization %';values=@('BLANK()','0','1','1.25')},
        @{measure='Effort Deviation %';dependency='Delivered Project Budget Hours';values=@('BLANK()','0','100')},
        @{measure='Effort Alert Color';dependency='Effort Deviation %';values=@('BLANK()','0','0.05','-0.05','0.050001','-0.050001')},
        @{measure='Schedule Alert Color';dependency='Schedule Deviation %';values=@('BLANK()','0','0.03','-0.03','0.030001','-0.030001')},
        @{measure='Defect Alert Color';dependency='Defect Density %';values=@('BLANK()','0','0.05','0.050001')}
    )
    $daxBoundaryCount = 0
    foreach ($daxCase in $daxBoundaryCases) {
        foreach ($daxValue in $daxCase.values) {
            $daxQuery = $daxCandidateDefinitions + "`nMEASURE '_Measures'[$($daxCase.dependency)] = $daxValue`n"
            # Model-defined dependencies do not consume query-scoped overrides.
            # Put the original expression at query scope too for a fair boundary test.
            $daxOriginalExpression = $taskDb.Model.Tables['_Measures'].Measures[$daxCase.measure].Expression
            $daxQuery += "MEASURE '_Measures'[__Baseline] = $daxOriginalExpression`n"
            if ($daxCase.measure -eq 'Available Hours') { $daxQuery += "MEASURE '_Measures'[Capacity Vacation Hours] = 12`n" }
            if ($daxCase.measure -eq 'Effort Deviation %') { $daxQuery += "MEASURE '_Measures'[Delivered Project Actual Hours] = 120`n" }
            $daxQuery += "EVALUATE FILTER(ROW(`"Mismatch`", NOT ([__Baseline] == [__Opt $($daxCase.measure)])), [Mismatch])"
            if ((Invoke-GccCandidateQuery $daxQuery) -ne 0) {
                $daxDebug = $taskConnection.CreateCommand()
                $daxDebug.CommandText = $daxQuery.Substring(0,$daxQuery.IndexOf('EVALUATE')) + "EVALUATE ROW(`"Original`",[__Baseline],`"Candidate`",[__Opt $($daxCase.measure)],`"Input`",[$($daxCase.dependency)])"
                $daxDebugReader = $daxDebug.ExecuteReader()
                try { while($daxDebugReader.Read()) { for($daxCol=0;$daxCol -lt $daxDebugReader.FieldCount;$daxCol++) { Write-Output ($daxDebugReader.GetName($daxCol)+': '+$daxDebugReader.GetValue($daxCol)) } } } finally { $daxDebugReader.Close(); $daxDebug.Dispose() }
                throw "Boundary mismatch: $($daxCase.measure) with $daxValue"
            }
            $daxBoundaryCount++
        }
    }
    $daxEvidence.Add([pscustomobject]@{scenario=$Scenario;check='Blank, zero, over-capacity and positive/negative threshold boundaries';cases=$daxBoundaryCount;mismatchRows=0})

    if ($Benchmark) {
        $daxOriginal = 'EVALUATE SUMMARIZECOLUMNS(DimDate[Year],DimDivision[divisionName],"Capacity",[Available Hours],"Unused",[Under Utilized %],"Effort",[Effort Deviation %],"EffortColor",[Effort Alert Color],"ScheduleColor",[Schedule Alert Color],"DefectColor",[Defect Alert Color])'
        $daxOriginalExpressions = @{}
        $daxCandidateExpressions = @{}
        foreach ($daxMatch in [regex]::Matches($daxCandidateDefinitions, '(?ms)^\s*MEASURE ''_Measures''\[__Opt (.*?)\] =\s*(.*?)(?=^\s*MEASURE|\z)')) {
            $daxName = $daxMatch.Groups[1].Value
            $daxOriginalExpressions[$daxName] = $taskDb.Model.Tables['_Measures'].Measures[$daxName].Expression
            $daxCandidateExpressions[$daxName] = $daxMatch.Groups[2].Value.Trim()
        }
        if ($daxCandidateExpressions.Count -ne 6) { throw 'Expected six candidate expressions.' }
        $daxTimings = [Collections.Generic.List[object]]::new()
        try {
        foreach ($daxMode in @('cold','warm')) {
            for ($daxRun=0; $daxRun -lt 7; $daxRun++) {
                $daxOrder = if ($daxRun % 2 -eq 0) { @('original','candidate') } else { @('candidate','original') }
                foreach ($daxVariant in $daxOrder) {
                    $daxExpressions = if ($daxVariant -eq 'original') { $daxOriginalExpressions } else { $daxCandidateExpressions }
                    foreach ($daxName in $daxExpressions.Keys) { $taskDb.Model.Tables['_Measures'].Measures[$daxName].Expression = $daxExpressions[$daxName] }
                    $taskDb.Model.SaveChanges() | Out-Null
                    $daxQuery = $daxOriginal
                    if ($daxMode -eq 'cold') {
                        $daxClear = '<ClearCache xmlns="http://schemas.microsoft.com/analysisservices/2003/engine"><Object><DatabaseID>' + $taskDb.ID + '</DatabaseID></Object></ClearCache>'
                        $taskServer.Execute($daxClear) | Out-Null
                    } else { Invoke-GccCandidateQuery $daxQuery | Out-Null }
                    $daxWatch = [Diagnostics.Stopwatch]::StartNew()
                    Invoke-GccCandidateQuery $daxQuery | Out-Null
                    $daxWatch.Stop()
                    $daxTimings.Add([pscustomobject]@{cache=$daxMode;variant=$daxVariant;run=$daxRun+1;elapsedMs=$daxWatch.Elapsed.TotalMilliseconds})
                }
            }
        }
        } finally {
            foreach ($daxName in $daxOriginalExpressions.Keys) { $taskDb.Model.Tables['_Measures'].Measures[$daxName].Expression = $daxOriginalExpressions[$daxName] }
            $taskDb.Model.SaveChanges() | Out-Null
        }
        $daxMedians = foreach ($daxGroup in ($daxTimings | Group-Object cache,variant)) {
            $daxSorted = @($daxGroup.Group.elapsedMs | Sort-Object)
            [pscustomobject]@{cache=$daxGroup.Group[0].cache;variant=$daxGroup.Group[0].variant;medianMs=$daxSorted[3];runs=7}
        }
        $daxEvidence.Add([pscustomobject]@{scenario=$Scenario;check='Alternating original/candidate annual-summary benchmark';measurement='Identical query with six model-level formulas swapped in the isolated database before each run; client elapsed query time; synthetic fixture only, no formula/storage-engine trace';medians=$daxMedians;samples=$daxTimings})
    }
    $daxJson = $daxEvidence | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText((Join-Path $taskRoot 'powerbi/validation/dax-candidate-validation.json'), $daxJson, [Text.UTF8Encoding]::new($false))
    Write-Output "DAX candidates: $Scenario passed; $daxBoundaryCount boundary cases; zero context mismatches."
}
