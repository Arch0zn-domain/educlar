[CmdletBinding()]
param(
    [ValidateSet('start', 'status', 'stop')]
    [string]$Action = 'start',
    [ValidateRange(1, 65535)]
    [int]$Port = 3000,
    [ValidateSet('development', 'production')]
    [string]$Mode = 'development',
    [ValidateRange(15, 180)]
    [int]$TimeoutSeconds = 90,
    [string]$DataDirectory = '',
    [switch]$Json
)

# Compatible with Windows PowerShell 5.1 and PowerShell 7.
# Start-Process detaches Node from this terminal; logs stay in the repository.
$ErrorActionPreference = 'Stop'
$repoDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$logDirectory = Join-Path $repoDirectory '.logs'
$statePath = Join-Path $logDirectory ("server-{0}.json" -f $Port)
$nextCli = Join-Path $repoDirectory 'node_modules\next\dist\bin\next'
$serverUrl = "http://127.0.0.1:$Port"
$nextServerEntry = Join-Path $repoDirectory 'node_modules\next\dist\server\lib\start-server.js'

function Get-ProcessDetails([int]$ProcessNumber) {
    return Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessNumber) -ErrorAction SilentlyContinue
}

function Test-RepositoryServer($ProcessDetails) {
    if ($null -eq $ProcessDetails -or [string]::IsNullOrWhiteSpace($ProcessDetails.CommandLine)) { return $false }
    if ($ProcessDetails.Name -ine 'node.exe') { return $false }
    # Parse the executable and script tokens; merely mentioning a Next path in
    # another Node command must not authorize stopping that process.
    $tokens = [regex]::Match($ProcessDetails.CommandLine, '^(?:"[^"\r\n]+"|[^\s"]+)\s+(?:"(?<script>[^"\r\n]+)"|(?<script>[^\s"]+))(?:\s|$)')
    if (-not $tokens.Success) { return $false }
    try { $scriptPath = [IO.Path]::GetFullPath($tokens.Groups['script'].Value) }
    catch { return $false }
    return $scriptPath -ieq $nextCli -or $scriptPath -ieq $nextServerEntry
}

function Get-Listeners {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, OwningProcess -Unique)
}

function Read-State {
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { return $null }
    try { return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
    catch { return $null }
}

function Test-SameProcess($ProcessDetails, $Identity) {
    if (-not (Test-RepositoryServer $ProcessDetails)) { return $false }
    if ([int]$ProcessDetails.ProcessId -ne [int]$Identity.ProcessId) { return $false }
    return $ProcessDetails.CreationDate.ToUniversalTime().ToString('o') -eq $Identity.CreatedAt
}

function Test-HttpHealth([int]$RequestTimeoutSeconds = 5) {
    try {
        $response = Invoke-WebRequest -Uri "$serverUrl/" -UseBasicParsing -TimeoutSec $RequestTimeoutSeconds
        return @{ Healthy = ($response.StatusCode -eq 200); StatusCode = [int]$response.StatusCode; Error = $null }
    } catch {
        $statusCode = $null
        if ($null -ne $_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
        }
        return @{ Healthy = $false; StatusCode = $statusCode; Error = $_.Exception.Message }
    }
}

function Get-Status {
    $listeners = @(Get-Listeners)
    $processDetails = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        $details = Get-ProcessDetails ([int]$_)
        if ($null -ne $details) {
            [pscustomobject]@{
                ProcessId = [int]$details.ProcessId
                ParentProcessId = [int]$details.ParentProcessId
                CreatedAt = $details.CreationDate.ToUniversalTime().ToString('o')
                ExecutablePath = $details.ExecutablePath
                CommandLine = $details.CommandLine
                RepositoryServer = [bool](Test-RepositoryServer $details)
            }
        }
    })
    $owned = $processDetails.Count -gt 0 -and @($processDetails | Where-Object { -not $_.RepositoryServer }).Count -eq 0
    $loopback = @($listeners | Where-Object { $_.LocalAddress -in @('127.0.0.1', '::1', '0.0.0.0', '::') }).Count -gt 0
    $health = @{ Healthy = $false; StatusCode = $null; Error = $null }
    if ($owned -and $loopback) { $health = Test-HttpHealth }
    $state = Read-State
    $managed = $false
    if ($null -ne $state) {
        $managed = Test-SameProcess (Get-ProcessDetails ([int]$state.ProcessId)) $state
    }
    $statusName = 'stopped'
    if ($listeners.Count -gt 0) {
        if (-not $owned) { $statusName = 'port_conflict' }
        elseif ($health.Healthy) { $statusName = 'healthy' }
        else { $statusName = 'unhealthy' }
    }
    return [pscustomobject]@{
        Status = $statusName
        Url = $serverUrl
        Repository = $repoDirectory
        Managed = [bool]$managed
        HttpStatus = $health.StatusCode
        HealthError = $health.Error
        Processes = $processDetails
        Listeners = $listeners
        State = $state
    }
}

function Write-Status($StatusDetails) {
    if ($Json) {
        $StatusDetails | ConvertTo-Json -Depth 6
        return
    }
    Write-Host ("EduClar: {0} | {1}" -f $StatusDetails.Status, $StatusDetails.Url)
    foreach ($details in $StatusDetails.Processes) {
        Write-Host ("PID {0} | server din acest proiect: {1}" -f $details.ProcessId, $details.RepositoryServer)
        Write-Host ("Executabil: {0}" -f $details.ExecutablePath)
        Write-Host ("Comanda: {0}" -f $details.CommandLine)
    }
    if ($StatusDetails.Status -eq 'healthy' -and -not $StatusDetails.Managed) {
        Write-Host 'Serverul raspunde, dar a fost pornit din alt terminal. Lansatorul nu porneste o copie.'
    }
    if ($StatusDetails.HealthError) { Write-Host ("Verificare HTTP: {0}" -f $StatusDetails.HealthError) }
    if ($null -ne $StatusDetails.State) {
        Write-Host ("Log iesire: {0}" -f $StatusDetails.State.StdoutLog)
        Write-Host ("Log erori: {0}" -f $StatusDetails.State.StderrLog)
    }
}

function Get-ServerTree($FirstProcess) {
    $rootProcess = $FirstProcess
    while ($true) {
        $parentProcess = Get-ProcessDetails ([int]$rootProcess.ParentProcessId)
        if (-not (Test-RepositoryServer $parentProcess)) { break }
        $rootProcess = $parentProcess
    }
    $allProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'")
    $tree = @($rootProcess)
    $pending = @([int]$rootProcess.ProcessId)
    while ($pending.Count -gt 0) {
        $children = @($allProcesses | Where-Object {
            [int]$_.ParentProcessId -in $pending -and (Test-RepositoryServer $_)
        })
        $tree += $children
        $pending = @($children | ForEach-Object { [int]$_.ProcessId })
    }
    return @($tree | Select-Object ProcessId, CommandLine, @{ Name = 'CreatedAt'; Expression = { $_.CreationDate.ToUniversalTime().ToString('o') } } -Unique)
}

function Stop-RepositoryServer($StatusDetails) {
    if ($StatusDetails.Status -eq 'port_conflict') {
        Write-Status $StatusDetails
        throw 'Portul este ocupat de alt proces. Nu a fost oprit.'
    }
    $targets = @()
    foreach ($details in $StatusDetails.Processes) {
        $liveProcess = Get-ProcessDetails ([int]$details.ProcessId)
        if (Test-SameProcess $liveProcess $details) { $targets += Get-ServerTree $liveProcess }
    }
    # Also permit stopping a managed process whose HTTP server has not bound yet.
    if ($targets.Count -eq 0 -and $null -ne $StatusDetails.State) {
        $liveProcess = Get-ProcessDetails ([int]$StatusDetails.State.ProcessId)
        if (Test-SameProcess $liveProcess $StatusDetails.State) { $targets += Get-ServerTree $liveProcess }
    }
    $targets = @($targets | Select-Object ProcessId, CommandLine, CreatedAt -Unique)
    foreach ($identity in $targets) {
        $liveProcess = Get-ProcessDetails ([int]$identity.ProcessId)
        # PID reuse, a changed command or a foreign process can never authorize a stop.
        if ((Test-SameProcess $liveProcess $identity) -and $liveProcess.CommandLine -eq $identity.CommandLine) {
            Stop-Process -Id ([int]$identity.ProcessId) -ErrorAction SilentlyContinue
        }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (@(Get-Listeners).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if (@(Get-Listeners).Count -gt 0) { throw 'Portul este inca ocupat. Verificati statusul; nu se opresc procese suplimentare.' }
    if (Test-Path -LiteralPath $statePath -PathType Leaf) { Remove-Item -LiteralPath $statePath }
    if (-not $Json) { Write-Host 'Server oprit. Datele, cache-ul si logurile au fost pastrate.' }
}

try {
    $status = Get-Status
    if ($Action -eq 'status') {
        Write-Status $status
        if ($status.Status -eq 'healthy') { exit 0 }
        if ($status.Status -eq 'port_conflict') { exit 2 }
        if ($status.Status -eq 'unhealthy') { exit 3 }
        exit 1
    }
    if ($Action -eq 'stop') {
        Stop-RepositoryServer $status
        if ($Json) { Write-Status (Get-Status) }
        exit 0
    }
    if ($status.Status -eq 'healthy') { Write-Status $status; exit 0 }
    if ($status.Status -eq 'port_conflict') {
        Write-Status $status
        throw 'Portul este ocupat de alt proces. Alegeti alt port sau opriti manual procesul identificat.'
    }
    if ($status.Status -eq 'unhealthy' -or $status.Managed) {
        Write-Status $status
        throw 'Exista deja un server al proiectului care nu raspunde corect. Consultati logurile; folositi stop, apoi start.'
    }
    if (-not (Test-Path -LiteralPath $nextCli -PathType Leaf)) { throw 'Lipsesc dependentele. Executati npm ci in folderul proiectului.' }
    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $nodeVersion = (& $nodeCommand.Source --version).Trim()
    if ($nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw "Este necesar Node.js 22 sau mai nou. Versiune curenta: $nodeVersion" }
    if ($Mode -eq 'production' -and -not (Test-Path -LiteralPath (Join-Path $repoDirectory '.next\BUILD_ID'))) {
        throw 'Lipseste build-ul production. Executati npm run build sau folositi modul development.'
    }
    $otherServers = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { Test-RepositoryServer $_ })
    if ($Mode -eq 'development' -and @($otherServers | Where-Object { $_.CommandLine -match '(?:^|\s)dev(?:\s|$)' }).Count -gt 0) {
        throw 'Exista deja un Next dev al acestui proiect pe alt port. Next permite un singur dev pentru acelasi folder; verificati portul existent.'
    }
    if ($DataDirectory -eq '') {
        if ($otherServers.Count -gt 0) { throw 'Exista alt server al proiectului. Pentru un port separat specificati si -DataDirectory, pentru a evita accesul simultan la baza locala.' }
        $resolvedDataDirectory = Join-Path $repoDirectory '.data'
    } elseif ([IO.Path]::IsPathRooted($DataDirectory)) {
        $resolvedDataDirectory = [IO.Path]::GetFullPath($DataDirectory)
    } else {
        $resolvedDataDirectory = [IO.Path]::GetFullPath((Join-Path $repoDirectory $DataDirectory))
    }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
    $stdoutPath = Join-Path $logDirectory ("server-{0}-{1}.out.log" -f $Port, $timestamp)
    $stderrPath = Join-Path $logDirectory ("server-{0}-{1}.err.log" -f $Port, $timestamp)
    $nextCommand = 'dev'
    if ($Mode -eq 'production') { $nextCommand = 'start' }
    $nativeArguments = @(('"{0}"' -f $nextCli), $nextCommand, ('"{0}"' -f $repoDirectory), '--hostname', '127.0.0.1', '--port', [string]$Port)
    $savedEnvironment = @{}
    foreach ($name in @('APP_MODE', 'DATA_DIR', 'BETTER_AUTH_URL')) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    try {
        [Environment]::SetEnvironmentVariable('APP_MODE', 'local', 'Process')
        [Environment]::SetEnvironmentVariable('DATA_DIR', $resolvedDataDirectory, 'Process')
        [Environment]::SetEnvironmentVariable('BETTER_AUTH_URL', $serverUrl, 'Process')
        $launchedProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList $nativeArguments -WorkingDirectory $repoDirectory -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    } finally {
        foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
    }
    $liveProcess = Get-ProcessDetails $launchedProcess.Id
    if (-not (Test-RepositoryServer $liveProcess)) { throw "Procesul Next nu a pornit. Consultati $stderrPath" }
    $state = [pscustomobject]@{
        Repository = $repoDirectory
        ProcessId = [int]$liveProcess.ProcessId
        CreatedAt = $liveProcess.CreationDate.ToUniversalTime().ToString('o')
        Port = $Port
        Mode = $Mode
        DataDirectory = $resolvedDataDirectory
        StdoutLog = $stdoutPath
        StderrLog = $stderrPath
    }
    $temporaryStatePath = "$statePath.tmp"
    [IO.File]::WriteAllText($temporaryStatePath, ($state | ConvertTo-Json), [Text.Encoding]::UTF8)
    Move-Item -LiteralPath $temporaryStatePath -Destination $statePath -Force
    if (-not $Json) { Write-Host ("Pornire {0}. Verificare HTTP, maxim {1} secunde..." -f $serverUrl, $TimeoutSeconds) }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (-not (Test-SameProcess (Get-ProcessDetails $state.ProcessId) $state)) { throw "Next s-a inchis in timpul pornirii. Consultati $stderrPath" }
        $remainingSeconds = [Math]::Max(1, [Math]::Min(5, [int]($deadline - [DateTime]::UtcNow).TotalSeconds))
        $health = Test-HttpHealth $remainingSeconds
        if ($health.Healthy) { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $health.Healthy) { throw "Serverul nu a raspuns HTTP 200 in $TimeoutSeconds secunde. Procesul si logurile au fost pastrate pentru diagnostic: $stderrPath" }
    Write-Status (Get-Status)
    exit 0
} catch {
    if ($Json) { [pscustomobject]@{ Error = $_.Exception.Message; Url = $serverUrl } | ConvertTo-Json }
    else { Write-Host ("EROARE: {0}" -f $_.Exception.Message) -ForegroundColor Red }
    exit 1
}
