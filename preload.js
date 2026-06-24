const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scoreboard', {
  getState: () => ipcRenderer.invoke('state:get'),
  changeScore: (side, delta) => ipcRenderer.send('score:change', side, delta),
  resetScores: () => ipcRenderer.send('score:reset'),
  setCompetitorName: (side, name) => ipcRenderer.send('competitor:set-name', side, name),
  setTimer: (seconds) => ipcRenderer.send('timer:set', seconds),
  toggleTimer: () => ipcRenderer.send('timer:toggle'),
  onStateUpdate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('state-update', handler);
    return () => ipcRenderer.removeListener('state-update', handler);
  },
});
