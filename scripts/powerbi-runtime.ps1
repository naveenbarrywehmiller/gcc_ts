# Resolve the installed Desktop libraries for both MSI and Microsoft Store builds.
function Get-GccPowerBIDesktopBin {
    $taskCandidates = [Collections.Generic.List[string]]::new()
    foreach ($taskProcess in @(Get-Process -Name PBIDesktop -ErrorAction SilentlyContinue)) {
        if ($taskProcess.Path) { $taskCandidates.Add((Split-Path -Parent $taskProcess.Path)) }
    }
    $taskCandidates.Add('C:/Program Files/Microsoft Power BI Desktop/bin')
    if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
        foreach ($taskPackage in @(Get-AppxPackage -Name Microsoft.MicrosoftPowerBIDesktop -ErrorAction SilentlyContinue)) {
            if ($taskPackage.InstallLocation) { $taskCandidates.Add((Join-Path $taskPackage.InstallLocation 'bin')) }
        }
    }
    foreach ($taskCandidate in $taskCandidates) {
        if (Test-Path -LiteralPath (Join-Path $taskCandidate 'Microsoft.PowerBI.Tabular.dll')) {
            return $taskCandidate
        }
    }
    throw 'Power BI Desktop TOM libraries were not found. Install/open the MSI or Microsoft Store Desktop application.'
}
