<#
.SYNOPSIS
  Builds the Developer Toolbox and copies it into a Mendix app's extensions folder.
.EXAMPLE
  ./scripts/install.ps1 -AppDir "C:\Users\me\Mendix\MyApp"
#>
param(
    [Parameter(Mandatory = $true)][string]$AppDir,
    [string]$Configuration = "Release"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not (Get-ChildItem -Path $AppDir -Filter *.mpr -ErrorAction SilentlyContinue)) {
    throw "No .mpr file in $AppDir. Point -AppDir at the folder of your Mendix app."
}
dotnet build "$root/src/DevToolbox/DevToolbox.csproj" -c $Configuration
$out = "$root/src/DevToolbox/bin/$Configuration/net10.0"
$target = Join-Path $AppDir "extensions/DevToolbox"
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item "$out/Stoneworx.DevToolbox.dll", "$out/manifest.json" -Destination $target -Force
Write-Host "Installed to $target"
Write-Host "Start Studio Pro with --enable-extension-development, open the app, then use Extensions > Developer Toolbox."
