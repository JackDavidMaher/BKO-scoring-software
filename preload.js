const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scoreboard', {
  getState: () => ipcRenderer.invoke('state:get'),
  changeScore: (side, delta) => ipcRenderer.send('score:change', side, delta),
  resetScores: () => ipcRenderer.send('score:reset'),
  setCompetitorName: (side, name) => ipcRenderer.send('competitor:set-name', side, name),
  toggleWarning: (side, level) => ipcRenderer.send('warning:toggle', side, level),
  setMatchType: (mode) => ipcRenderer.send('match-type:set', mode),
  setSenshu: (side) => ipcRenderer.send('senshu:set', side),
  setCurrentRound: (index) => ipcRenderer.send('round:set-current', index),
  setRoundValue: (index, side, value) => ipcRenderer.send('round:set-value', index, side, value),
  setRoundWinner: (index, winner) => ipcRenderer.send('round:set-winner', index, winner),
  toggleRoundSenshu: (index) => ipcRenderer.send('round:toggle-senshu', index),
  resetRoundScores: () => ipcRenderer.send('round:reset-all'),
  saveCurrentRound: () => ipcRenderer.send('round:save-current'),
  setTimer: (seconds) => ipcRenderer.send('timer:set', seconds),
  toggleTimer: () => ipcRenderer.send('timer:toggle'),
  onStateUpdate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('state-update', handler);
    return () => ipcRenderer.removeListener('state-update', handler);
  },
});
