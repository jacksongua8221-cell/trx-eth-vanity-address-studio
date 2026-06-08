import { cp, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.join(root, 'release');
const appName = 'TRX_ETH_靓号地址生成器';
const portableDir = path.join(releaseRoot, `${appName}_便携版`);
const appDir = path.join(portableDir, 'resources', 'app');
const electronDir = path.dirname(require('electron'));

await rm(portableDir, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });

await cp(electronDir, portableDir, { recursive: true });
await cp(path.join(root, 'src'), path.join(appDir, 'src'), { recursive: true });
await cp(path.join(root, 'scripts'), path.join(appDir, 'scripts'), { recursive: true });
await cp(path.join(root, 'package.json'), path.join(appDir, 'package.json'));
await copyNodeModules();
await rename(path.join(portableDir, 'electron.exe'), path.join(portableDir, `${appName}.exe`));

await writeFile(
  path.join(portableDir, '启动说明.txt'),
  [
    `双击 ${appName}.exe 启动。`,
    '程序本地离线运行，不上传私钥、助记词、地址或任务记录。',
    '默认保存目录在“文档\\TRX_ETH_Vanity_Results”。',
    '结果文件为 txt：每行只保存地址、私钥，勾选助记词保存时会追加助记词。',
  ].join('\r\n'),
  'utf8'
);

const zipPath = `${portableDir}.zip`;
await rm(zipPath, { force: true });
await powershellZip(portableDir, zipPath);

console.log(`Portable folder: ${portableDir}`);
console.log(`Portable zip: ${zipPath}`);

async function copyNodeModules() {
  const source = path.join(root, 'node_modules');
  const target = path.join(appDir, 'node_modules');
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'electron' || entry.name === '.bin') continue;
    await cp(path.join(source, entry.name), path.join(target, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

function powershellZip(source, target) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -LiteralPath '${source}' -DestinationPath '${target}' -Force`,
    ], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Compress-Archive exited with ${code}`));
    });
  });
}
