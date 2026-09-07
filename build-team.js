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

const secSrc = path.join(src, 'secret.json');
if (!fs.existsSync(secSrc)) {
  console.error(`Thieu ${secSrc}.`);
  console.error('Noi dung: {"webAppUrl": "https://script.google.com/macros/s/.../exec", "token": "..."}');
  console.error('Tren CI: file nay duoc ghi ra tu GitHub Secret TEAM_' + teamId + '.');
  process.exit(1);
}

// Moi team phai co token RIENG. Dung chung mot token la hong ranh gioi,
// vi token nam trong app tren may ho va trich ra duoc.
const sec = JSON.parse(fs.readFileSync(secSrc, 'utf8'));
if (!sec.webAppUrl || !sec.token) {
  console.error(`${secSrc}: thieu webAppUrl hoac token.`);
  process.exit(1);
}
if (!/^https:\/\/script\.google\.com\//.test(sec.webAppUrl)) {
  console.error(`${secSrc}: webAppUrl phai la dia chi Apps Script Web App.`);
  process.exit(1);
}

fs.rmSync('team', { recursive: true, force: true });
fs.mkdirSync('team', { recursive: true });
fs.copyFileSync(cfgPath, path.join('team', 'team.json'));
fs.copyFileSync(secSrc, path.join('team', 'secret.json'));

console.log(`Team ${cfg.id} (${cfg.name})`);
console.log(`  Web App: ${sec.webAppUrl.slice(0, 52)}...`);
console.log(`  Token:   ${sec.token.slice(0, 6)}... (${sec.token.length} ky tu)`);

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
