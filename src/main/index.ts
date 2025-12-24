import electron from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
const { app, BrowserWindow, protocol } = electron;
import { startApiServer } from '../server/index.js';
import { BrowserController } from '../browser/controller.js';

let mainWindow: BrowserWindowType | null = null;
let browserController: BrowserController | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    title: 'Fuba Browser'
  });

  // Initialize browser controller
  browserController = new BrowserController(mainWindow);
  
  // Start with a blank page
  await mainWindow.loadURL('about:blank');
  
  // Start API server
  const apiPort = process.env.API_PORT || 39000;
  await startApiServer(Number(apiPort), browserController);
  
  console.log(`API server started on port ${apiPort}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
    browserController = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle protocol for local file access if needed
app.on('ready', () => {
  protocol.registerFileProtocol('file', (request, callback) => {
    const pathname = decodeURI(request.url.replace('file:///', ''));
    callback(pathname);
  });
});