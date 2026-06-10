const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const imagesDir = path.join(root, 'docs', 'images');
const generatorOutput = path.join(imagesDir, 'generator-page.png');
const filterOutput = path.join(imagesDir, 'filter-page.png');
const legacyOutput = path.join(imagesDir, 'main-window.png');

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
  ipcMain.handle('app:system-info', () => ({
    cpuModel: 'Screenshot CPU',
    logicalCores: 8,
    totalMemoryMb: 16384,
    recommendedThreads: 7,
    maxRecommendedThreads: 8,
  }));

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

  await mkdir(imagesDir, { recursive: true });

  const generatorImage = await win.webContents.capturePage();
  await writeFile(generatorOutput, generatorImage.toPNG());
  await writeFile(legacyOutput, generatorImage.toPNG());

  await win.webContents.executeJavaScript(`
    document.querySelector('[data-tab="filterTab"]')?.click();
    document.querySelector('#filterBody').innerHTML = [
      '<tr>',
      '<td>TRX</td>',
      '<td class="filter-address mono" title="TExampleVanityAddressSuffix8888">TExampleVanityAddressSuffix<mark>8888</mark></td>',
      '<td><span class="tag">豹子4</span></td>',
      '<td><div class="filter-copy-cell"><span class="filter-value-preview">a1b2c3d4...889900</span><button>复制私钥</button></div></td>',
      '<td><span class="muted">-</span></td>',
      '<td><button>复制地址</button></td>',
      '</tr>'
    ].join('');
    document.querySelector('#filterTotal').textContent = '23';
    document.querySelector('#filterTrx').textContent = '18';
    document.querySelector('#filterEth').textContent = '5';
    document.querySelector('#filterCount').textContent = '8';
  `);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const filterImage = await win.webContents.capturePage();
  await writeFile(filterOutput, filterImage.toPNG());

  win.destroy();
  app.exit(0);
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
