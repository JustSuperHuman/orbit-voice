$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $sourceRoot 'app\orbit-host-compatibility.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 1 -or $manifest.channel -ne 'bro-preview' -or $manifest.platform -ne 'win32-x64' -or
    $manifest.version -notmatch '^\d+\.\d+\.\d+-bro-preview\.[0-9A-Za-z.-]+$' -or
    $manifest.source.repository -ne 'https://github.com/JustSuperHuman/orbit-voice') { throw 'This archive is not a compatible Windows Bro preview.' }
$bro = Get-Command bro.exe -ErrorAction Stop
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\OrbitCompanion'
$build = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()
$destination = Join-Path $installRoot ($manifest.version + '-' + $build)
if (Test-Path -LiteralPath $destination) { $destination += '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) }
[void][IO.Directory]::CreateDirectory($destination)
foreach ($entry in @('app','runtime','README.txt')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $entry) -Destination (Join-Path $destination $entry) -Recurse -ErrorAction Stop
}
& $bro.Source orbit register (Join-Path $destination 'runtime\electron.exe') (Join-Path $destination 'app')
if ($LASTEXITCODE -ne 0) { throw 'Bro could not validate the installed Orbit companion.' }
Write-Host 'Orbit preview installed. Enable Orbit Voice in Bro settings to connect.'
Write-Host 'If Orbit was already connected, quit the old companion in Bro before resuming it.'
