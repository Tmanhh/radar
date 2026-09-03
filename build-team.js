#!/usr/bin/env node
// Build mot ban phat hanh rieng cho mot team.
//   node build-team.js S1 --mac
//   node build-team.js S2 --win
//
// Chep teams/<ID>/ vao team/ (thu muc nay duoc dong goi vao app.asar),
// roi goi electron-builder voi ten file rieng cho team do.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [, , teamId, ...rest] = process.argv;

if (!teamId) {
  const avail = fs.existsSync('teams')
    ? fs.readdirSync('teams').filter((d) => fs.existsSync(path.join('teams', d, 'team.json')))
    : [];
  console.error('Dung: node build-team.js <TEAM_ID> [--mac|--win]');
  console.error('Co san: ' + (avail.join(', ') || '(chua co team nao)'));
  process.exit(1);
}

const src = path.join('teams', teamId);
const cfgPath = path.join(src, 'team.json');
if (!fs.existsSync(cfgPath)) {
  console.error(`Khong tim thay ${cfgPath}`);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
if (!cfg.sheetId || /DAN_ID_SHEET/.test(cfg.sheetId)) {
  console.error(`${cfgPath}: chua dien sheetId that.`);
  process.exit(1);
}

const keySrc = path.join(src, 'service-account.json');
if (!fs.existsSync(keySrc)) {
  console.error(`Thieu ${keySrc}.`);
  console.error('Tren CI: khoa duoc ghi ra tu GitHub Secret SA_' + teamId + '.');
  console.error('Cuc bo: chep file khoa service account cua team vao duong dan tren.');
  process.exit(1);
}

// Moi team phai co service account RIENG. Dung chung mot khoa la hong
// toan bo ranh gioi, vi khoa nam trong app tren may ho va trich ra duoc.
const key = JSON.parse(fs.readFileSync(keySrc, 'utf8'));
if (!key.client_email || !key.private_key) {
  console.error(`${keySrc}: khong phai khoa service account hop le.`);
  process.exit(1);
}

fs.rmSync('team', { recursive: true, force: true });
fs.mkdirSync('team', { recursive: true });
fs.copyFileSync(cfgPath, path.join('team', 'team.json'));
fs.copyFileSync(keySrc, path.join('team', 'service-account.json'));

console.log(`Team ${cfg.id} (${cfg.name})`);
console.log(`  Sheet: ${cfg.sheetId}`);
console.log(`  Chia se Sheet nay cho: ${key.client_email}`);

const args = [
  ...(rest.length ? rest : ['--mac']),
  '--publish',
  'never',
  '-c.extraMetadata.name=radar-' + cfg.id.toLowerCase(),
  '-c.productName=Radar ' + cfg.id,
  '-c.mac.artifactName=Radar-' + cfg.id + '-${version}-mac.${ext}',
  '-c.win.artifactName=Radar-' + cfg.id + '-${version}-win.${ext}'
];

execFileSync(path.join('node_modules', '.bin', 'electron-builder'), args, { stdio: 'inherit' });
