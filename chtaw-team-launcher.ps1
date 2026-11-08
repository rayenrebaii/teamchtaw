# Windows PowerShell 5.1 / Windows 10 and 11. No project source is changed.
[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop', 'Serve', 'Library')][string]$Action = 'Start',
    [ValidateSet('backend', 'frontend')][string]$Service,
    [string]$RunId,
    [switch]$NoBrowser,
    [switch]$NoPause
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Root = [IO.Path]::GetFullPath($PSScriptRoot)
$script:Launcher = Join-Path $script:Root 'chtaw-team-launcher.ps1'
$script:Runtime = Join-Path $script:Root '.chtaw-team-runtime'
$hash = [Security.Cryptography.SHA256]::Create()
try { $script:WorkspaceId = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($script:Root.ToLowerInvariant())))).Replace('-', '').Substring(0, 24) }
finally { $hash.Dispose() }

# A kernel Job Object owns the complete npm/cmd/node process tree. PID reuse is
# irrelevant: stop opens the unique job, not a PID or a process name.
if (-not ('ChtawJobs' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class ChtawJobs {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveLimit;
        public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
        public uint cb; public string reserved, desktop, title;
        public uint x,y,xSize,ySize,xChars,yChars,fill,flags;
        public ushort show, reservedSize; public IntPtr reservedData, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
        public IntPtr process, thread; public uint pid, tid;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int info, ref ExtendedLimits data, uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int info, IntPtr data, uint length, out uint returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr environment, string cwd, ref Startup startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static Exception Error(string operation) { return new Win32Exception(Marshal.GetLastWin32Error(), operation); }
    public static IntPtr Create(string name) {
        IntPtr job=CreateJobObject(IntPtr.Zero,name);
        int error=Marshal.GetLastWin32Error();
        if(job==IntPtr.Zero) throw Error("CreateJobObject");
        if(error==183) { CloseHandle(job); throw new InvalidOperationException("Job already exists"); }
        var limits=new ExtendedLimits(); limits.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE
        if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits))) { var e=Error("SetInformationJobObject"); CloseHandle(job); throw e; }
        return job;
    }
    public static IntPtr Open(string name) {
        IntPtr handle=OpenJobObject(0x0004|0x0008,false,name); // QUERY | TERMINATE
        int error=Marshal.GetLastWin32Error();
        if(handle==IntPtr.Zero && error!=2) throw new Win32Exception(error,"OpenJobObject");
        return handle;
    }
    public static IntPtr Start(IntPtr job,string app,string command,string cwd,bool hidden) {
        var startup=new Startup(); startup.cb=(uint)Marshal.SizeOf(startup);
        ProcessInfo info;
        if(!CreateProcess(app,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,false,0x00000004u|(hidden?0x08000000u:0u),IntPtr.Zero,cwd,ref startup,out info)) throw Error("CreateProcess");
        try {
            if(!AssignProcessToJobObject(job,info.process)) { var e=Error("AssignProcessToJobObject"); TerminateProcess(info.process,1); throw e; }
            if(ResumeThread(info.thread)==UInt32.MaxValue) { var e=Error("ResumeThread"); TerminateProcess(info.process,1); throw e; }
            return info.process;
        } catch { CloseHandle(info.process); throw; }
        finally { CloseHandle(info.thread); }
    }
    public static bool Contains(IntPtr job,int pid) {
        int count=32;
        for(int attempt=0;attempt<10;attempt++) {
            IntPtr buffer=Marshal.AllocHGlobal(8+IntPtr.Size*count);
            try {
                uint returned;
                if(!QueryInformationJobObject(job,3,buffer,(uint)(8+IntPtr.Size*count),out returned)) {
                    if(Marshal.GetLastWin32Error()==234) { count*=2; continue; }
                    throw Error("QueryInformationJobObject");
                }
                int found=Marshal.ReadInt32(buffer,4);
                for(int i=0;i<found;i++) if(Marshal.ReadIntPtr(buffer,8+IntPtr.Size*i).ToInt64()==pid) return true;
                return false;
            } finally { Marshal.FreeHGlobal(buffer); }
        }
        throw new InvalidOperationException("Job process list too large");
    }
    public static int Wait(IntPtr process) {
        WaitForSingleObject(process,UInt32.MaxValue); uint code;
        if(!GetExitCodeProcess(process,out code)) throw Error("GetExitCodeProcess");
        return unchecked((int)code);
    }
    public static int Active(IntPtr job) {
        IntPtr buffer=Marshal.AllocHGlobal(48);
        try { uint returned; if(!QueryInformationJobObject(job,1,buffer,48,out returned)) throw Error("Job accounting"); return Marshal.ReadInt32(buffer,40); }
        finally { Marshal.FreeHGlobal(buffer); }
    }
    public static void Terminate(IntPtr job) { if(!TerminateJobObject(job,0)) throw Error("TerminateJobObject"); }
    public static void Close(IntPtr handle) { if(handle!=IntPtr.Zero) CloseHandle(handle); }
}
'@
}

function Get-JobName([string]$Kind, [string]$Id) {
    if ($Kind -notin @('backend','frontend') -or $Id -notmatch '^[a-f0-9]{32}$') { throw 'Identifiant de serveur invalide.' }
    return "Local\ChtawTeam_$($script:WorkspaceId)_${Id}_$Kind"
}
function Get-StatePath([string]$Kind, [string]$Id) {
    $null = Get-JobName $Kind $Id
    return Join-Path $script:Runtime "$Kind-$Id.json"
}
function Get-Port([string]$Kind) { if ($Kind -eq 'backend') { return 3002 }; return 3001 }
function Get-Url([string]$Kind) { if ($Kind -eq 'backend') { return 'http://127.0.0.1:3002/api/v1/health' }; return 'http://127.0.0.1:3001' }
function Get-Listeners([int]$Port) {
    return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}
function Test-Http([string]$Url) {
    try { return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 5).StatusCode -eq 200 }
    catch { return $false }
}
function Get-Records([string]$Kind) {
    if (-not (Test-Path -LiteralPath $script:Runtime)) { return @() }
    $result = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $script:Runtime -Filter "$Kind-*.json" -File)) {
        try {
            $record = [IO.File]::ReadAllText($file.FullName) | ConvertFrom-Json
            if ($record.service -ne $Kind -or $record.workspace -ne $script:WorkspaceId) { throw 'invalid' }
            $expected = Get-StatePath $Kind $record.runId
            if ($expected -ne $file.FullName) { throw 'invalid' }
            $result += $record
        } catch { throw 'Fichier de suivi invalide dans .chtaw-team-runtime. Aucun processus inconnu ne sera arrete.' }
    }
    return $result
}
function Test-ManagedListener([string]$Kind) {
    $listeners = @(Get-Listeners (Get-Port $Kind))
    if (-not $listeners.Count) { return $false }
    foreach ($record in @(Get-Records $Kind)) {
        $job = [ChtawJobs]::Open((Get-JobName $Kind $record.runId))
        if ($job -eq [IntPtr]::Zero) { continue }
        try {
            $all = $true
            foreach ($listener in $listeners) { if (-not [ChtawJobs]::Contains($job, $listener)) { $all = $false } }
            if ($all) { return $true }
        } finally { [ChtawJobs]::Close($job) }
    }
    return $false
}
function Invoke-Checked([string]$File, [string]$Arguments, [string]$WorkingDirectory, [int]$Seconds, [string]$Failure) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $File; $info.Arguments = $Arguments; $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        $null = $process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($Seconds * 1000)) { $process.Kill(); $process.WaitForExit(); throw "$Failure (delai depasse)." }
        # Outputs are deliberately not printed: configuration errors can contain secrets.
        $null = $stdout.GetAwaiter().GetResult(); $null = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw $Failure }
    } finally { $process.Dispose() }
}
function Test-Prerequisites {
    Write-Host '[1/5] Verification des outils, dossiers et configurations...'
    foreach ($name in @('node.exe','npm.cmd','docker.exe','powershell.exe')) {
        if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name est introuvable. Installez l'outil puis relancez le BAT." }
    }
    foreach ($folder in @('chtaw-team-backend','chtaw-team-pwa')) {
        if (-not (Test-Path -LiteralPath (Join-Path $script:Root "$folder/package.json"))) { throw "Dossier ou package.json absent : $folder." }
    }
    $backend = Join-Path $script:Root 'chtaw-team-backend'
    $frontend = Join-Path $script:Root 'chtaw-team-pwa'
    if (-not (Test-Path -LiteralPath (Join-Path $backend '.env'))) { throw 'Le fichier chtaw-team-backend/.env est absent. Configurez-le avant de demarrer.' }
    foreach ($item in @('node_modules/ts-node/register/transpile-only.js','node_modules/.prisma/client/default.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $backend $item))) { throw 'Dependances backend ou client Prisma absents. Consultez le README ; aucune installation automatique ne sera effectuee.' }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $frontend 'node_modules/next/package.json'))) { throw 'Dependances frontend absentes. Installez-les manuellement selon le README.' }
    Invoke-Checked (Get-Command node.exe).Source '--version' $backend 15 'Node.js ne fonctionne pas.'
    Invoke-Checked $env:ComSpec '/d /c "npm.cmd --version"' $backend 15 'npm ne fonctionne pas.'
    $probeBackend = 'try { const fs=require("fs");const e=require("dotenv").parse(fs.readFileSync(".env"));if(e.PORT && Number(e.PORT)!==3002)process.exit(2);require("./src/config/environment").validateEnvironment({...process.env,...e,NODE_ENV:"development",PORT:3002,HOST:"127.0.0.1"}); } catch { process.exit(1); }'
    Invoke-Checked (Get-Command node.exe).Source ('--require ts-node/register/transpile-only -e "' + $probeBackend.Replace('"','\"') + '"') $backend 20 'Configuration backend invalide. Verifiez .env, les secrets JWT, les origines CORS et PORT=3002 (sans partager les secrets).'
    $probeFrontend = 'try {require("@next/env").loadEnvConfig(process.cwd(),true,{info:()=>{},error:()=>{}});const api=(process.env.NEXT_PUBLIC_API_URL||"http://127.0.0.1:3002/api/v1").replace(/\/$/,"");const ws=(process.env.NEXT_PUBLIC_SOCKET_URL||"http://127.0.0.1:3002").replace(/\/$/,"");if(api!=="http://127.0.0.1:3002/api/v1"||ws!=="http://127.0.0.1:3002")process.exit(2);}catch{process.exit(1);}'
    Invoke-Checked (Get-Command node.exe).Source ('-e "' + $probeFrontend.Replace('"','\"') + '"') $frontend 20 'Configuration frontend invalide : utilisez les URL locales 127.0.0.1:3002 de .env.example.'
    if (-not (Test-Path -LiteralPath (Join-Path $frontend '.env.local'))) { Write-Host '  Frontend : .env.local absent, valeurs locales par defaut verifiees.' }
    $dev = ([IO.File]::ReadAllText((Join-Path $frontend 'package.json')) | ConvertFrom-Json).scripts.dev
    if ($dev -notmatch '--port\s+3001(?:\s|$)') { throw 'Le script dev du frontend doit utiliser explicitement le port 3001.' }
    $docker = (Get-Command docker.exe).Source
    Invoke-Checked $docker 'compose version --short' $backend 15 'Docker Compose V2 est absent. Mettez Docker Desktop a jour.'
    Invoke-Checked $docker 'info --format {{.ServerVersion}}' $backend 20 'Docker Desktop est arrete ou son moteur est inaccessible. Demarrez Docker Desktop, attendez son etat pret, puis relancez.'
    foreach ($kind in @('backend','frontend')) {
        if (@(Get-Listeners (Get-Port $kind)).Count -and -not (Test-ManagedListener $kind)) { throw "Le port $(Get-Port $kind) est occupe par un serveur non suivi par ce lanceur. Arretez-le manuellement ; aucun processus inconnu ne sera touche." }
    }
}
function Start-Server([string]$Kind) {
    if (Test-ManagedListener $Kind) { Write-Host "  $Kind deja lance par ce systeme : instance reutilisee."; return }
    # Also reuse a supervisor that is still starting, before it opens its port.
    foreach ($record in @(Get-Records $Kind)) {
        $job = [ChtawJobs]::Open((Get-JobName $Kind $record.runId))
        if ($job -ne [IntPtr]::Zero) {
            try { if ([ChtawJobs]::Active($job) -eq 0) { throw "Le terminal $Kind precedent est termine. Consultez-le puis fermez-le avant de relancer." } }
            finally { [ChtawJobs]::Close($job) }
            Write-Host "  $Kind est deja en cours de demarrage."; return
        }
    }
    $id = [Guid]::NewGuid().ToString('N')
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $script:Launcher + '" -Action Serve -Service ' + $Kind + ' -RunId ' + $id
    # Visible windows are explicitly requested by the user.
    $null = Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList $arguments -WorkingDirectory $script:Root -WindowStyle Normal -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    $state = Get-StatePath $Kind $id
    while (-not (Test-Path -LiteralPath $state)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw "Le terminal $Kind n'a pas confirme son demarrage. Consultez sa fenetre puis utilisez stop-chtaw-team.bat avant de reessayer." }
        Start-Sleep -Milliseconds 200
    }
}
function Wait-Server([string]$Kind, [int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $listeners = @(Get-Listeners (Get-Port $Kind))
        if ($listeners.Count) {
            if (-not (Test-ManagedListener $Kind)) { throw "Un processus non suivi a pris le port $(Get-Port $Kind). Aucun navigateur ne sera ouvert." }
            if (Test-Http (Get-Url $Kind)) { Write-Host "  $Kind repond sur le port $(Get-Port $Kind)."; return }
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Le serveur $Kind ne repond pas apres $Seconds secondes. Consultez son terminal. Lancez stop-chtaw-team.bat pour arreter les serveurs suivis."
}
function Invoke-Serve {
    $name = Get-JobName $Service $RunId
    $folder = if ($Service -eq 'backend') { 'chtaw-team-backend' } else { 'chtaw-team-pwa' }
    $cwd = Join-Path $script:Root $folder
    $host.UI.RawUI.WindowTitle = "Team Chtaw - $Service"
    $env:NODE_ENV = 'development'
    $env:PORT = [string](Get-Port $Service)
    $env:HOST = '127.0.0.1'
    $job = [IntPtr]::Zero; $child = [IntPtr]::Zero
    $state = Get-StatePath $Service $RunId
    $stopFlag = "$state.stop"
    try {
        $job = [ChtawJobs]::Create($name)
        $child = [ChtawJobs]::Start($job, $env:ComSpec, ('"' + $env:ComSpec + '" /d /s /c "npm.cmd run dev"'), $cwd, $false)
        $record = @{ workspace=$script:WorkspaceId; service=$Service; runId=$RunId; supervisorPid=$PID; createdUtc=[DateTime]::UtcNow.ToString('o') }
        $temporary = "$state.tmp"
        [IO.File]::WriteAllText($temporary, ($record | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        [IO.File]::Move($temporary, $state)
        Write-Host "Team Chtaw - $Service - npm.cmd run dev"
        Write-Host 'Fermer cette fenetre arrete uniquement cet arbre de processus.'
        $code = [ChtawJobs]::Wait($child)
        if (-not (Test-Path -LiteralPath $stopFlag)) {
            Write-Host "Le serveur $Service s'est termine (code $code)." -ForegroundColor Yellow
            if (-not $NoPause) { $null = Read-Host 'Consultez les erreurs ci-dessus. Appuyez sur Entree pour fermer' }
        }
    } finally {
        [ChtawJobs]::Close($child); [ChtawJobs]::Close($job)
        foreach ($file in @($state, $stopFlag, "$state.tmp")) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
    }
}
function Invoke-Start {
    Test-Prerequisites
    if (-not (Test-Path -LiteralPath $script:Runtime)) { $null = New-Item -ItemType Directory -Path $script:Runtime }
    [IO.File]::WriteAllText((Join-Path $script:Runtime '.gitignore'), "*`r`n")
    Write-Host '[2/5] Demarrage de PostgreSQL et attente de son healthcheck...'
    Invoke-Checked (Get-Command docker.exe).Source 'compose -p chtaw-team-backend up -d --wait --wait-timeout 90 postgres' (Join-Path $script:Root 'chtaw-team-backend') 180 'PostgreSQL ne peut pas demarrer. Verifiez Docker, le port 5434 et le .env backend. Les volumes sont conserves.'
    Write-Host '[3/5] Demarrage du backend NestJS...'
    Start-Server 'backend'; Wait-Server 'backend' 90
    Write-Host '[4/5] Demarrage du frontend Next.js...'
    Start-Server 'frontend'; Wait-Server 'frontend' 120
    Write-Host '[5/5] Team Chtaw est pret : http://127.0.0.1:3001'
    if (-not $NoBrowser) { $null = Start-Process 'http://127.0.0.1:3001' }
    Write-Host 'Pour arreter les serveurs : double-cliquez sur stop-chtaw-team.bat.'
    Write-Host 'PostgreSQL et Docker restent en marche. Aucune installation, migration ou seed automatique.'
}
function Invoke-Stop {
    Write-Host 'Arret uniquement des serveurs enregistres par ce lanceur...'
    $stopped = 0
    foreach ($kind in @('frontend','backend')) {
        foreach ($record in @(Get-Records $kind)) {
            $state = Get-StatePath $kind $record.runId
            $job = [ChtawJobs]::Open((Get-JobName $kind $record.runId))
            if ($job -eq [IntPtr]::Zero) {
                if (Test-Path -LiteralPath $state) { Remove-Item -LiteralPath $state -Force }
                continue
            }
            try {
                [IO.File]::WriteAllText("$state.stop", 'stop')
                [ChtawJobs]::Terminate($job)
                $deadline = [DateTime]::UtcNow.AddSeconds(15)
                while ([ChtawJobs]::Active($job) -gt 0) {
                    if ([DateTime]::UtcNow -gt $deadline) { throw "L'arbre $kind met trop de temps a s'arreter. Reessayez stop." }
                    Start-Sleep -Milliseconds 100
                }
                $stopped++
                Write-Host "  $kind : arret demande a son arbre de processus."
            } finally { [ChtawJobs]::Close($job) }
        }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        $managed = (Test-ManagedListener 'backend') -or (Test-ManagedListener 'frontend')
        if (-not $managed) { break }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($managed) { throw 'Un serveur suivi est encore actif. Reessayez stop ; aucun processus externe ne sera touche.' }
    Write-Host "Termine : $stopped arbre(s) de processus arrete(s)."
    Write-Host 'Les autres projets, Docker Desktop, PostgreSQL et ses donnees sont conserves.'
}
if ($Action -eq 'Library') { return }
$mutex = $null; $locked = $false
try {
    if ($Action -eq 'Serve') { Invoke-Serve; exit 0 }
    $mutex = New-Object Threading.Mutex($false, "Local\ChtawLauncher_$($script:WorkspaceId)")
    try { $locked = $mutex.WaitOne(1000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Un demarrage ou arret Team Chtaw est deja en cours. Attendez sa fin puis reessayez.' }
    if ($Action -eq 'Start') { Invoke-Start } else { Invoke-Stop }
    exit 0
} catch {
    # Only our concise errors are printed; do not dump native outputs or configuration.
    Write-Host ("[ERREUR] " + $_.Exception.Message) -ForegroundColor Red
    if ($Action -eq 'Serve' -and -not $NoPause) { $null = Read-Host 'Appuyez sur Entree pour fermer' }
    exit 1
} finally {
    if ($locked -and $mutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
