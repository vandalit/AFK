import { contextBridge, ipcRenderer } from 'electron';

// Exponer un subconjunto seguro de ipcRenderer a los procesos de renderizado
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send(channel: string, data: any) {
      ipcRenderer.send(channel, data);
    },
    on(channel: string, func: (...args: any[]) => void) {
      const subscription = (_event: any, ...args: any[]) => func(_event, ...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  }
});
