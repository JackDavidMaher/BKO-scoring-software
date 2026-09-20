const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let displayWindow;
let controlWindow;
function createDefaultRound() {
  return {
    redScore: '',
    blueScore: '',
    winner: 'none',
    senshu: false,
  };
}

let state = {
  red: {
    label: 'AKA',
    name: 'AKA',
    score: 0,
    countback: {
      yuko: 0,
      wazaAri: 0,
      ippon: 0,
    },
  },
  blue: {
    label: 'AO',
    name: 'AO',
    score: 0,
    countback: {
      yuko: 0,
      wazaAri: 0,
      ippon: 0,
    },
  },
  timerCentiseconds: 9000,
  timerRunning: false,
  matchType: 'individual',
  senshuSide: null,
  currentRoundIndex: 0,
  teamRounds: Array.from({ length: 5 }, () => createDefaultRound()),
  matchEvent: {
    id: 0,
    reason: 'none',
    winner: 'tie',
    buzzerMs: 2000,
    flashMs: 5000,
  },
};
let timerInterval = null;
let timerTargetMs = null;
let nextMatchEventId = 1;
let diffThresholdActive = false;

function getWinner() {
  if (state.red.score > state.blue.score) {
    return 'red';
  }

  if (state.blue.score > state.red.score) {
    return 'blue';
  }

  return 'tie';
}

function getRoundWinnerFromScores(redScore, blueScore, senshuSide = null) {
  if (Number(redScore) > Number(blueScore)) {
    return 'red';
  }

  if (Number(blueScore) > Number(redScore)) {
    return 'blue';
  }

  if (senshuSide === 'red' || senshuSide === 'blue') {
    return senshuSide;
  }

  return 'tie';
}

function triggerMatchEvent(reason) {
  let winner = getWinner();
  let buzzerMs = 2000;
  let flashMs = 5000;

  if (reason === 'time-warning') {
    winner = 'none';
    buzzerMs = 700;
    flashMs = 10;
  }

  state.matchEvent = {
    id: nextMatchEventId,
    reason,
    winner,
    buzzerMs,
    flashMs,
  };

  nextMatchEventId += 1;
}

function evaluateMatchEvents(previousTimerCentiseconds) {
  const hasEightPointDiff = Math.abs(state.red.score - state.blue.score) >= 8;
  if (hasEightPointDiff && !diffThresholdActive) {
    triggerMatchEvent('score-difference');
  }
  diffThresholdActive = hasEightPointDiff;

  const timerHitFifteenSeconds = previousTimerCentiseconds > 1500 && state.timerCentiseconds <= 1500 && state.timerCentiseconds > 0;
  if (timerHitFifteenSeconds) {
    triggerMatchEvent('time-warning');
  }

  const timerReachedZero = previousTimerCentiseconds > 0 && state.timerCentiseconds <= 0;
  if (timerReachedZero) {
    triggerMatchEvent('time-up');
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerTargetMs = null;
  state.timerRunning = false;
}

function startTimer() {
  if (state.timerRunning || state.timerCentiseconds <= 0) {
    return;
  }

  state.timerRunning = true;
  timerTargetMs = Date.now() + state.timerCentiseconds * 10;

  timerInterval = setInterval(() => {
    if (!timerTargetMs) {
      stopTimer();
      broadcastState();
      return;
    }

    const remainingMs = timerTargetMs - Date.now();
    const previousTimerCentiseconds = state.timerCentiseconds;
    const nextCentiseconds = Math.max(0, Math.ceil(remainingMs / 10));

    if (nextCentiseconds !== previousTimerCentiseconds) {
      state.timerCentiseconds = nextCentiseconds;
      evaluateMatchEvents(previousTimerCentiseconds);

      if (nextCentiseconds <= 0) {
        stopTimer();
      }

      broadcastState();
    }
  }, 10);
}

function broadcastState() {
  const payload = state;

  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.webContents.send('state-update', payload);
  }

  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('state-update', payload);
  }
}

function createWindows() {
  displayWindow = new BrowserWindow({
    width: 720,
    height: 480,
    title: 'Score Display',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controlWindow = new BrowserWindow({
    width: 560,
    height: 780,
    title: 'Score Controls',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  displayWindow.loadFile('display.html');
  controlWindow.loadFile('control.html');

  displayWindow.webContents.on('did-finish-load', broadcastState);
  controlWindow.webContents.on('did-finish-load', broadcastState);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindows();

  ipcMain.handle('state:get', () => state);

  ipcMain.on('score:change', (_, side, delta) => {
    if (!['red', 'blue'].includes(side)) {
      return;
    }

    if (typeof delta !== 'number' || Number.isNaN(delta)) {
      return;
    }

    const absoluteValue = Math.abs(Number(delta));
    if (absoluteValue === 0 || ![1, 2, 3].includes(absoluteValue)) {
      return;
    }

    const key = absoluteValue === 1 ? 'yuko' : absoluteValue === 2 ? 'wazaAri' : 'ippon';
    state[side].countback[key] += delta > 0 ? 1 : -1;
    state[side].score += delta;
    evaluateMatchEvents(state.timerCentiseconds);
    broadcastState();
  });

  ipcMain.on('score:reset', () => {
    state.red.score = 0;
    state.blue.score = 0;
    state.red.countback = { yuko: 0, wazaAri: 0, ippon: 0 };
    state.blue.countback = { yuko: 0, wazaAri: 0, ippon: 0 };
    evaluateMatchEvents(state.timerCentiseconds);
    broadcastState();
  });

  ipcMain.on('match-type:set', (_, nextType) => {
    if (nextType !== 'team' && nextType !== 'individual') {
      return;
    }

    state.matchType = nextType;
    broadcastState();
  });

  ipcMain.on('senshu:set', (_, side) => {
    if (!['red', 'blue'].includes(side)) {
      return;
    }

    state.senshuSide = state.senshuSide === side ? null : side;
    broadcastState();
  });

  ipcMain.on('round:set-current', (_, index) => {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < -1 || numericIndex >= state.teamRounds.length) {
      return;
    }

    state.currentRoundIndex = numericIndex;
    broadcastState();
  });

  ipcMain.on('round:set-value', (_, index, side, value) => {
    const numericIndex = Number(index);
    if (!['red', 'blue'].includes(side) || !Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.teamRounds.length) {
      return;
    }

    if (value === '' || value === null || value === undefined) {
      state.teamRounds[numericIndex][`${side}Score`] = '';
      broadcastState();
      return;
    }

    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue)) {
      return;
    }

    state.teamRounds[numericIndex][`${side}Score`] = parsedValue;
    broadcastState();
  });

  ipcMain.on('round:set-winner', (_, index, winner) => {
    const numericIndex = Number(index);
    if (!['red', 'blue', 'tie', 'none'].includes(winner) || !Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.teamRounds.length) {
      return;
    }

    state.teamRounds[numericIndex].winner = winner;
    broadcastState();
  });

  ipcMain.on('round:toggle-senshu', (_, index) => {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.teamRounds.length) {
      return;
    }

    state.teamRounds[numericIndex].senshu = !state.teamRounds[numericIndex].senshu;
    broadcastState();
  });

  ipcMain.on('round:save-current', () => {
    if (!Number.isInteger(state.currentRoundIndex) || state.currentRoundIndex < 0 || state.currentRoundIndex >= state.teamRounds.length) {
      return;
    }

    const round = state.teamRounds[state.currentRoundIndex];
    if (!round) {
      return;
    }

    round.redScore = state.red.score;
    round.blueScore = state.blue.score;
    round.winner = getRoundWinnerFromScores(round.redScore, round.blueScore, state.senshuSide);
    round.senshu = state.senshuSide !== null && round.winner === state.senshuSide;

    state.red.score = 0;
    state.blue.score = 0;
    state.timerCentiseconds = 9000;
    stopTimer();
    state.senshuSide = null;

    if (state.currentRoundIndex === state.teamRounds.length - 1) {
      state.currentRoundIndex = -1;
    } else {
      state.currentRoundIndex = state.currentRoundIndex + 1;
    }

    broadcastState();
  });

  ipcMain.on('round:reset-all', () => {
    state.teamRounds = Array.from({ length: 5 }, () => createDefaultRound());
    state.currentRoundIndex = 0;
    state.senshuSide = null;
    broadcastState();
  });

  ipcMain.on('competitor:set-name', (_, side, nextName) => {
    if (!['red', 'blue'].includes(side)) {
      return;
    }

    if (typeof nextName !== 'string') {
      return;
    }

    state[side].name = nextName.trim() || (side === 'red' ? 'AKA' : 'AO');
    broadcastState();
  });

  ipcMain.on('timer:set', (_, nextCentiseconds) => {
    if (typeof nextCentiseconds !== 'number' || Number.isNaN(nextCentiseconds)) {
      return;
    }

    const previousTimerCentiseconds = state.timerCentiseconds;
    const safeCentiseconds = Math.max(0, Math.floor(nextCentiseconds));
    state.timerCentiseconds = safeCentiseconds;
    evaluateMatchEvents(previousTimerCentiseconds);

    if (safeCentiseconds === 0) {
      stopTimer();
    } else if (state.timerRunning) {
      timerTargetMs = Date.now() + safeCentiseconds * 10;
    }

    broadcastState();
  });

  ipcMain.on('timer:toggle', () => {
    if (state.timerRunning) {
      stopTimer();
    } else {
      startTimer();
    }

    broadcastState();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindows();
    }
  });
});

app.on('window-all-closed', () => {
  stopTimer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
