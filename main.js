const electron = require("electron");
const fs = require("fs");
const path = require("path");
const { machineIdSync } = require("node-machine-id");

const { app, BrowserWindow, ipcMain } = electron;

let mainWindow = null;

function readEnvFile() {
  const envPath = path.join(app.getAppPath(), ".env");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const parsed = {};
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
}

function getRuntimeConfig() {
  const envFile = readEnvFile();

  return {
    supabaseUrl: process.env.SUPABASE_URL || envFile.SUPABASE_URL || "",
    supabaseAnonKey:
      process.env.SUPABASE_ANON_KEY || envFile.SUPABASE_ANON_KEY || "",
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 920,
    minHeight: 620,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Fallback: prevent "invisible app" if ready-to-show does not fire.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1500);

  mainWindow.webContents.on("did-fail-load", (_event, code, desc) => {
    console.error("Renderer load failed:", code, desc);
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("get-hwid", () => machineIdSync(true));
ipcMain.handle("get-runtime-config", () => getRuntimeConfig());
ipcMain.handle("window:minimize", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win) {
    win.minimize();
  }
});
ipcMain.handle("window:toggle-maximize", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) {
    return false;
  }
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});
ipcMain.handle("window:close", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win) {
    win.close();
  }
});
ipcMain.handle("window:is-maximized", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  return Boolean(win && win.isMaximized());
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
