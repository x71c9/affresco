// Builds dist/chromium and dist/firefox: sources, icons and the manifest merged
// from manifests/base.json and manifests/<target>.json, with the version of
// package.json.
// Usage: node build.mjs
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const pkg = await readJson('package.json');

for (const target of ['chromium', 'firefox']) {
  const outdir = `dist/${target}`;
  await rm(outdir, { recursive: true, force: true });
  await mkdir(`${outdir}/icons`, { recursive: true });
  await cp('src', outdir, { recursive: true });
  for (const file of await readdir('icons')) {
    if (file.endsWith('.png')) await cp(`icons/${file}`, `${outdir}/icons/${file}`);
  }
  const manifest = {
    ...(await readJson('manifests/base.json')),
    ...(await readJson(`manifests/${target}.json`)),
    version: pkg.version,
  };
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${outdir} (${pkg.version})`);
}
