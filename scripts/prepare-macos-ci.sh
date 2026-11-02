#!/bin/bash
set -euo pipefail
# This permission fixture applies ONLY to disposable GitHub-hosted Mac runners.
# Installed SAA always uses the user's normal System Settings consent flow.
test "${GITHUB_ACTIONS:-}" = true
test "${RUNNER_OS:-}" = macOS
test -n "${RUNNER_TEMP:-}"
app_bundle="$(find release -maxdepth 3 -type d -name SAA.app -print -quit)"
test -n "$app_bundle"
driver="$RUNNER_TEMP/SaaMacInputDriver"
xcrun clang -fobjc-arc -framework Cocoa -framework ApplicationServices scripts/MacInputDriver.m -o "$driver"
codesign --force --sign - "$driver"
printf 'SAA_MAC_DRIVER=%s\n' "$driver" >> "$GITHUB_ENV"
node - "$PWD/$app_bundle" "$driver" <<'NODE'
const fs=require('fs');
const [bundle,driver]=process.argv.slice(2);
const clients=[['local.saa.assistant',0],['com.github.Electron',0],[bundle+'/Contents/MacOS/SAA',1],[bundle+'/Contents/Resources/app.asar.unpacked/desktop/native/SaaInputMac',1],[driver,1],[process.execPath,1]];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
let sql='BEGIN IMMEDIATE;\n';
for(const [client,type]of clients)for(const service of ['kTCCServiceAccessibility','kTCCServiceListenEvent','kTCCServicePostEvent','kTCCServiceScreenCapture']){
sql+=`INSERT OR REPLACE INTO access (service,client,client_type,auth_value,auth_reason,auth_version,indirect_object_identifier,flags,last_modified) VALUES (${quote(service)},${quote(client)},${type},2,4,1,'UNUSED',0,strftime('%s','now'));\n`;
}
fs.writeFileSync(process.env.RUNNER_TEMP+'/saa-tcc-fixture.sql',sql+'COMMIT;\n');
NODE
for database in "/Library/Application Support/com.apple.TCC/TCC.db" "$HOME/Library/Application Support/com.apple.TCC/TCC.db"; do
  if sudo test -f "$database"; then sudo sqlite3 -cmd '.timeout 15000' "$database" < "$RUNNER_TEMP/saa-tcc-fixture.sql"; fi
done
sudo killall tccd || true
sleep 2
