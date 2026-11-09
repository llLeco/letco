#!/bin/sh
# Gera o .dmg sem depender do Finder (o bundle_dmg do Tauri usa AppleScript).
set -e
cd "$(dirname "$0")"
APP="src-tauri/target/release/bundle/macos/Letco.app"
VER=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
OUT="src-tauri/target/release/bundle/dmg"
STAGE=$(mktemp -d)
mkdir -p "$OUT"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$OUT/Letco_${VER}.dmg"
hdiutil create -volname "Letco" -srcfolder "$STAGE" -ov -format UDZO "$OUT/Letco_${VER}.dmg" >/dev/null
rm -rf "$STAGE"
echo "$OUT/Letco_${VER}.dmg"
