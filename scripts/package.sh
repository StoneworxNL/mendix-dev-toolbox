#!/usr/bin/env bash
# Builds the extension and zips the folder that goes into <app>/extensions/.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dotnet build "$root/src/DevToolbox/DevToolbox.csproj" -c Release
out="$root/src/DevToolbox/bin/Release/net10.0"
stage="$root/dist/DevToolbox"
rm -rf "$root/dist" && mkdir -p "$stage"
cp "$out/Stoneworx.DevToolbox.dll" "$out/manifest.json" "$stage/"
version=$(grep -oP '(?<=<Version>)[^<]+' "$root/src/DevToolbox/DevToolbox.csproj")
(cd "$root/dist" && zip -qr "DevToolbox-$version.zip" DevToolbox)
echo "$root/dist/DevToolbox-$version.zip"
