// electron/main.js
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

let mainWindow = null;
let tray = null;
const isDev = process.env.NODE_ENV !== "production";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    frame: false, // Custom Windows Chrome
    backgroundColor: "#0b0b10",
    show: false,
    title: "KHARCHA — Windows Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) {
      // mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  // Track maximize state and broadcast to renderer
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized-change", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximized-change", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    // Generate an in-memory 16x16 icon if file not present
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip("KHARCHA Expense Tracker");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open KHARCHA",
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        },
      },
      {
        label: "Quick Add Expense (Ctrl+N)",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send("shortcut:quick-add");
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit KHARCHA",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn("Tray creation skipped:", err?.message);
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:isMaximized", () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on("notification:show", (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || "KHARCHA Alert",
      body: body || "",
      silent: false,
    }).show();
  }
});

ipcMain.handle("app:get-version", () => {
  return app.getVersion();
});

ipcMain.handle("app:toggle-auto-launch", (_event, enable) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enable),
      path: process.execPath,
    });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("app:get-auto-launch-status", () => {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch {
    return false;
  }
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
