const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.PORT) || 43117;
const APP_ROOT = path.join(__dirname, '..');
const URL = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let mainWindow = null;
let quitting = false;

function startServer() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  serverProcess = spawn(process.execPath, [path.join(APP_ROOT, 'server', 'index.js')], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      BAHI_DATA_DIR: dataDir,
      ACCESS_MODE: 'desktop',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    serverProcess = null;
    if (!quitting && code !== 0) {
      console.error(`Server process exited with code ${code}`);
    }
  });
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(retries = 80, delay = 250) {
  for (let i = 0; i < retries; i += 1) {
    if (await ping()) return true;
    await new Promise(r => setTimeout(r, delay));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f172a',
    title: 'BahiBooks ERP',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(URL);

  // Bahar ke links default browser me kholo
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    try { serverProcess.kill(); } catch { /* ignore */ }
  }
}

app.whenReady().then(async () => {
  startServer();
  const ok = await waitForServer();
  if (!ok) {
    console.error('BahiBooks server start nahi hua.');
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  quitting = true;
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  stopServer();
});

process.on('exit', stopServer);
