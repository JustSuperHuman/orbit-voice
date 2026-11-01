// Local source-preview provenance. Not a release signature or a promise of live acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Compatibility acceptance currently targets Windows x64 only; native macOS parity is not implemented.');
if (!pkg.version.includes('-bro-preview.') || pkg.build.appId !== 'dev.orbit.voice.companion') throw new Error('Only the isolated preview can advertise compatibility.');
if (!fs.existsSync(path.join(root, 'public/index.html'))) throw new Error('Build the UI before generating compatibility metadata.');
const files = {};
function hash(rel) {
  const file = path.join(root, rel);
  const st = fs.lstatSync(file);
  if (st.isSymbolicLink()) throw new Error('Compatibility inputs must not be symlinks.');
  if (st.isDirectory()) for (const name of fs.readdirSync(file).sort()) hash(`${rel}/${name}`);
  else if (st.isFile()) files[rel] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
for (const rel of ['package.json', 'electron', 'src', 'public']) hash(rel);
const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifest = {
  schema: 1, version: pkg.version, channel: 'bro-preview', platform: `${process.platform}-${process.arch}`,
  source: { repository: 'https://github.com/JustSuperHuman/orbit-voice', revision, upstreamRevision: 'f65f437d8df7b5a5b976da6b7bbd79476ebd7232' },
  protocol: { min: 1, max: 1 },
  capabilities: ['sessions.read','sessions.focus','orchestrator.submit','requests.observe','requests.cancel-queued','avatar.desktop','avatar.attached','avatar.stage.v1','avatar.roam.v1','voice.lifecycle.v1','tools.v1','avatar.containment.v1'],
  realtimeProviders: ['openai'], appId: pkg.build.appId, profile: 'OrbitCompanion', updatesDisabled: true, files,
};
const dest = path.join(root, 'orbit-host-compatibility.json');
fs.writeFileSync(`${dest}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(`${dest}.tmp`, dest);
console.log(`Generated source-preview compatibility metadata for ${Object.keys(files).length} files.`);
