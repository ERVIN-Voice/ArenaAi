const { app, BrowserWindow, shell, utilityProcess } = require('electron');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.PORT) || 8080;
let serverProcess = null;
let mainWindow = null;

function waitForServer(url, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) return reject(new Error('Server start timeout'));
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

function startServer() {
  const isPackaged = app.isPackaged;
  const root = isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const serverEntry = isPackaged
    ? path.join(root, 'app-server', 'server.cjs')
    : path.join(root, 'server.js');
  const cwd = isPackaged ? path.join(root, 'app-server') : root;

  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'production', NO_OPEN: '1' };

  serverProcess = utilityProcess.fork(serverEntry, [], {
    env,
    cwd,
    stdio: 'ignore',
  });

  serverProcess.on('exit', (code) => {
    if (code && code !== 0) console.error('Server exited with code', code);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#000000',
    title: 'Arena Shooter 3D',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer(`http://localhost:${PORT}`);
  } catch (e) {
    console.error(e);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
