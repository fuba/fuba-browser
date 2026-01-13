import electron from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
const { app, BrowserWindow, protocol, Menu } = electron;
import { startApiServer } from '../server/index.js';
import { BrowserController } from '../browser/controller.js';
import { SnapshotGenerator } from '../browser/snapshot.js';

let mainWindow: BrowserWindowType | null = null;
let browserController: BrowserController | null = null;
let snapshotGenerator: SnapshotGenerator | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 2000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    title: 'Fuba Browser'
  });

  // Initialize browser controller and snapshot generator
  browserController = new BrowserController(mainWindow);
  snapshotGenerator = new SnapshotGenerator(mainWindow);

  // Start with a blank page
  await mainWindow.loadURL('about:blank');

  // Setup context menu for right-click operations
  setupContextMenu(mainWindow);

  // Start API server
  const apiPort = process.env.API_PORT || 39000;
  await startApiServer(Number(apiPort), browserController, snapshotGenerator);

  console.log(`API server started on port ${apiPort}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
    browserController = null;
    snapshotGenerator = null;
  });
}

function setupContextMenu(window: BrowserWindowType) {
  window.webContents.on('context-menu', (_event, params) => {
    const menuTemplate: electron.MenuItemConstructorOptions[] = [];

    // Add Back/Forward navigation
    if (window.webContents.canGoBack()) {
      menuTemplate.push({
        label: 'Back',
        click: () => {
          window.webContents.goBack();
        }
      });
    }

    if (window.webContents.canGoForward()) {
      menuTemplate.push({
        label: 'Forward',
        click: () => {
          window.webContents.goForward();
        }
      });
    }

    // Add separator if navigation items exist
    if (menuTemplate.length > 0) {
      menuTemplate.push({ type: 'separator' });
    }

    // Add Copy if text is selected
    if (params.selectionText) {
      menuTemplate.push({
        label: 'Copy',
        role: 'copy'
      });
    }

    // Add Paste for editable fields
    if (params.isEditable) {
      menuTemplate.push({
        label: 'Paste',
        role: 'paste'
      });
    }

    // Add Cut for editable fields with selected text
    if (params.isEditable && params.selectionText) {
      menuTemplate.push({
        label: 'Cut',
        role: 'cut'
      });
    }

    // Add separator and additional useful items
    if (menuTemplate.length > 0) {
      menuTemplate.push({ type: 'separator' });
    }

    // Add Reload
    menuTemplate.push({
      label: 'Reload',
      click: () => {
        window.webContents.reload();
      }
    });

    // Show the context menu
    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup();
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