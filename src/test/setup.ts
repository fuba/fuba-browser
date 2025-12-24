import { app, BrowserWindow } from 'electron';
import { startApiServer } from '../server/index.js';
import { BrowserController } from '../browser/controller.js';

let testWindow: BrowserWindow | null = null;
let browserController: BrowserController | null = null;
let apiApp: any = null;

export async function setup() {
  // Wait for Electron to be ready
  await app.whenReady();
  
  // Create test window
  testWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // Initialize controller
  browserController = new BrowserController(testWindow);
  
  // Start API server on test port
  apiApp = await startApiServer(39001, browserController);
  
  return { testWindow, browserController, apiApp };
}

export async function teardown() {
  if (testWindow) {
    testWindow.close();
    testWindow = null;
  }
  
  if (app.isReady()) {
    app.quit();
  }
}

export { apiApp as app };