const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  sendQuestionResponse: (responseData) => ipcRenderer.invoke('send-question-response', responseData),
  setWindowFocusable: (focusable) => ipcRenderer.invoke('set-window-focusable', focusable)
}); 