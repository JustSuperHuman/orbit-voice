// Produce the source-layout companion Bro validates, including its Electron runtime.
// Provider keys, user profiles and developer dependencies never enter the archive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The Bro preview package currently targets Windows x64.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!pkg.version.includes('-bro-preview.')) throw new Error('A Bro preview version is required.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'orbit-host-compatibility.json'), 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (manifest.source.revision !== revision || manifest.version !== pkg.version) throw new Error('Regenerate compatibility metadata after committing the preview.');
for (const [relative, expected] of Object.entries(manifest.files)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
  if (actual !== expected) throw new Error(`The preview manifest is stale: ${relative}`);
}
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
const name = `orbit-bro-preview-${pkg.version}-win32-x64`;
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-bro-package-'));
const bundle = path.join(staging, name);
const app = path.join(bundle, 'app');
fs.mkdirSync(app, { recursive: true });
for (const entry of ['electron', 'src', 'public', 'assets', 'package.json', 'orbit-host-compatibility.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  fs.cpSync(path.join(root, entry), path.join(app, entry), { recursive: true, errorOnExist: true });
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this package script through npm.');
const production = execFileSync(process.execPath, [npm, 'ls', '--omit=dev', '--parseable', '--all'], { cwd: root, encoding: 'utf8' });
const dependencies = new Set();
for (const installed of production.trim().split(/\r?\n/)) {
  const relative = path.relative(path.join(root, 'node_modules'), installed);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
  const parts = relative.split(path.sep);
  dependencies.add(parts[0].startsWith('@') ? parts.slice(0, 2).join(path.sep) : parts[0]);
}
for (const dependency of dependencies) fs.cpSync(path.join(root, 'node_modules', dependency), path.join(app, 'node_modules', dependency), { recursive: true });
fs.cpSync(path.join(root, 'node_modules/electron/dist'), path.join(bundle, 'runtime'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts/install-bro-preview.ps1'), path.join(bundle, 'install-bro-preview.ps1'));
fs.writeFileSync(path.join(bundle, 'README.txt'), `Orbit Voice for Bro ${pkg.version}\r\n\r\nWindows x64 compatibility preview.\r\nExtract this archive, then run install-bro-preview.ps1 in PowerShell.\r\nEnable Orbit Voice in Bro settings. Connecting keeps the microphone off.\r\nThe preview uses its own OrbitCompanion profile and an available local port.\r\nFor an update, quit the existing companion in Bro before installing this preview.\r\n\r\nSource: https://github.com/JustSuperHuman/orbit-voice/tree/${revision}\r\nOriginal Orbit: https://github.com/Cookiebubba/orbit-voice\r\n`);
const archive = path.join(output, `${name}.zip`);
const tar = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
execFileSync(tar, ['-a', '-cf', archive, '-C', staging, name], { stdio: 'inherit' });
const hash = crypto.createHash('sha256');
for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
fs.writeFileSync(`${archive}.sha256`, `${hash.digest('hex')}  ${path.basename(archive)}\n`);
console.log(`Packaged ${archive}`);
console.log(`Staged companion: ${bundle}`);
