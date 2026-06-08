const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'images', 'main-window.png');

app.on('window-all-closed', () => {});

async function main() {
  await app.whenReady();
  ipcMain.handle('app:default-folders', () => {
    const base = path.join(app.getPath('documents'), 'TRX_ETH_Vanity_Results');
    return {
      resultsDir: path.join(base, 'results'),
      suspiciousDir: path.join(base, 'results', 'suspicious'),
    };
  });

  const win = new BrowserWindow({
    width: 1480,
    height: 900,
    show: false,
    backgroundColor: '#050808',
    webPreferences: {
      preload: path.join(root, 'src', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await win.loadFile(path.join(root, 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const image = await win.webContents.capturePage();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, image.toPNG());

  win.destroy();
  app.exit(0);
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
