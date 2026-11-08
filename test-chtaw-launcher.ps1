# Focused Windows kernel tests; no Docker or application data is modified.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'chtaw-team-launcher.ps1') -Action Library
$jobs = @(); $processes = @()
try {
    $job1 = [ChtawJobs]::Create((Get-JobName 'backend' ([Guid]::NewGuid().ToString('N')))); $jobs += $job1
    $job2 = [ChtawJobs]::Create((Get-JobName 'frontend' ([Guid]::NewGuid().ToString('N')))); $jobs += $job2
    $command = '"' + $env:ComSpec + '" /d /c "node.exe -e ""setInterval(function(){},1000)"""'
    $child1 = [ChtawJobs]::Start($job1, $env:ComSpec, $command, $PSScriptRoot, $true); $processes += $child1
    $child2 = [ChtawJobs]::Start($job2, $env:ComSpec, $command, $PSScriptRoot, $true); $processes += $child2
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $candidates = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { [ChtawJobs]::Contains($job1, [int]$_.ProcessId) })
        if ($candidates.Count) { break }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $candidates.Count) { throw 'The job did not contain its node descendant.' }
    $ownedPid = [int]$candidates[0].ProcessId
    if ([ChtawJobs]::Contains($job2, $ownedPid)) { throw 'Jobs must be isolated.' }
    if ([ChtawJobs]::Active($job1) -lt 2) { throw 'The job should contain cmd and its Node descendant.' }
    [ChtawJobs]::Terminate($job1)
    $null = [ChtawJobs]::Wait($child1)
    if ([ChtawJobs]::Contains($job1, $ownedPid)) { throw 'Owned descendant survived termination.' }
    $survivors = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { [ChtawJobs]::Contains($job2, [int]$_.ProcessId) })
    if (-not $survivors.Count) { throw 'Unrelated job was stopped.' }
    Write-Host 'PASS: descendant tracking, independent jobs, scoped termination, unrelated Node preserved.'
    $absent = [ChtawJobs]::Open((Get-JobName 'backend' ([Guid]::NewGuid().ToString('N'))))
    if ($absent -ne [IntPtr]::Zero) { throw 'Unknown jobs must not resolve.' }
    Write-Host 'PASS: nonexistent/stale run does not target a reused PID.'
    try { $null = Get-JobName 'backend' '../../bad'; throw 'Validation failed.' } catch { if ($_.Exception.Message -eq 'Validation failed.') { throw } }
    Write-Host 'PASS: invalid run identifiers rejected.'
    $originalRoot = $script:Root
    $fixture = Join-Path $script:Runtime ('launcher-tests-path with spaces-' + [Guid]::NewGuid().ToString('N'))
    try {
        foreach ($folder in @('chtaw-team-backend','chtaw-team-pwa')) {
            $null = New-Item -ItemType Directory -Path (Join-Path $fixture $folder) -Force
            [IO.File]::WriteAllText((Join-Path $fixture "$folder/package.json"), '{}')
        }
        $script:Root = $fixture
        try { Test-Prerequisites; throw 'Missing env was accepted.' }
        catch { if ($_.Exception.Message -notlike '*backend/.env est absent*') { throw } }
        Write-Host 'PASS: missing backend .env rejected before launching anything.'
        foreach ($file in @('chtaw-team-launcher.ps1','start-chtaw-team.bat','stop-chtaw-team.bat')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $fixture $file) }
        $probe = New-Object Diagnostics.Process
        try {
            $probe.StartInfo.FileName = $env:ComSpec
            $probe.StartInfo.Arguments = '/d /s /c ""' + (Join-Path $fixture 'start-chtaw-team.bat') + '" < nul"'
            $probe.StartInfo.WorkingDirectory = $PSScriptRoot
            $probe.StartInfo.UseShellExecute = $false; $probe.StartInfo.CreateNoWindow = $true
            $probe.StartInfo.RedirectStandardOutput = $true; $probe.StartInfo.RedirectStandardError = $true
            $null = $probe.Start()
            $outputTask = $probe.StandardOutput.ReadToEndAsync(); $errorTask = $probe.StandardError.ReadToEndAsync()
            if (-not $probe.WaitForExit(30000)) { $probe.Kill(); throw 'BAT path test timed out.' }
            $output = $outputTask.GetAwaiter().GetResult(); $null = $errorTask.GetAwaiter().GetResult()
            if ($probe.ExitCode -ne 1 -or $output -notlike '*backend/.env est absent*') { throw 'BAT did not resolve its relative helper in a path with spaces.' }
            Write-Host 'PASS: actual BAT resolves %~dp0 in a directory containing spaces and reports missing .env.'
        } finally { $probe.Dispose() }
    } finally {
        $script:Root = $originalRoot
        $resolvedFixture = [IO.Path]::GetFullPath($fixture)
        $allowedPrefix = [IO.Path]::GetFullPath($script:Runtime).TrimEnd('\') + '\launcher-tests-'
        if (-not $resolvedFixture.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup path.' }
        if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
    }
    # A listener deliberately not recorded by the launcher must never be reused or stopped.
    if (@(Get-Listeners 3001).Count -eq 0) {
        $foreignJob = [ChtawJobs]::Create((Get-JobName 'frontend' ([Guid]::NewGuid().ToString('N')))); $jobs += $foreignJob
        $listenCommand = '"' + $env:ComSpec + '" /d /c "node.exe -e ""require(''net'').createServer().listen(3001,''127.0.0.1'')"""'
        $foreignChild = [ChtawJobs]::Start($foreignJob, $env:ComSpec, $listenCommand, $PSScriptRoot, $true); $processes += $foreignChild
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        while (@(Get-Listeners 3001).Count -eq 0) { if ([DateTime]::UtcNow -gt $deadline) { throw 'Test listener unavailable.' }; Start-Sleep -Milliseconds 100 }
        if (Test-ManagedListener 'frontend') { throw 'Unrecorded listener was accepted.' }
        try { Test-Prerequisites; throw 'Occupied port was accepted.' }
        catch { if ($_.Exception.Message -notlike '*port 3001 est occupe*') { throw } }
        Invoke-Stop
        if ([ChtawJobs]::Active($foreignJob) -eq 0 -or @(Get-Listeners 3001).Count -eq 0) { throw 'Stop touched an unrecorded server.' }
        Write-Host 'PASS: occupied port rejected; unrecorded Node listener survives stop.'
    } else { Write-Host 'SKIP: port-conflict fixture (port 3001 already occupied).' }
} finally {
    foreach ($job in $jobs) { try { [ChtawJobs]::Terminate($job) } finally { [ChtawJobs]::Close($job) } }
    foreach ($child in $processes) { [ChtawJobs]::Close($child) }
}
