// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Secure Preload Bridge for KHARCHA Windows Desktop
 * Only exposes whitelisted, context-isolated APIs to the renderer
 */
contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),

  onMaximizedChange: (callback) => {
    const handler = (_event, isMax) => callback(isMax);
    ipcRenderer.on("window:maximized-change", handler);
    return () => ipcRenderer.removeListener("window:maximized-change", handler);
  },

  // Desktop Notifications
  showNotification: (options) => ipcRenderer.send("notification:show", options),

  // Windows System Integration
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  toggleAutoLaunch: (enable) => ipcRenderer.invoke("app:toggle-auto-launch", enable),
  getAutoLaunchStatus: () => ipcRenderer.invoke("app:get-auto-launch-status"),

  // Keyboard Shortcuts from Main
  onQuickAdd: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("shortcut:quick-add", handler);
    return () => ipcRenderer.removeListener("shortcut:quick-add", handler);
  },

  onNavigate: (callback) => {
    const handler = (_event, screen) => callback(screen);
    ipcRenderer.on("shortcut:navigate", handler);
    return () => ipcRenderer.removeListener("shortcut:navigate", handler);
  },
});
