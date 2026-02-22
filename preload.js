const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("device", {
  getHWID: () => ipcRenderer.invoke("get-hwid"),
});

contextBridge.exposeInMainWorld("runtime", {
  getConfig: () => ipcRenderer.invoke("get-runtime-config"),
});

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
});
