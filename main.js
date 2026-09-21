const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let displayWindow;
let controlWindow;

function createDefaultWarnings() {
  return {
    c1: false,
    c2: false,
    c3: false,
    hc: false,
    h: false,
  };
}

function sanitizeWarnings(rawWarnings) {
  const nextWarnings = createDefaultWarnings();

  if (!rawWarnings || typeof rawWarnings !== 'object') {
    return nextWarnings;
  }

  nextWarnings.c1 = Boolean(rawWarnings.c1);
  nextWarnings.c2 = Boolean(rawWarnings.c2);
  nextWarnings.c3 = Boolean(rawWarnings.c3);
  nextWarnings.hc = Boolean(rawWarnings.hc);
  nextWarnings.h = Boolean(rawWarnings.h);

  return nextWarnings;
}

function createDefaultCountback() {
  return {
    yuko: 0,
    wazaAri: 0,
    ippon: 0,
  };
}

function sanitizeCountback(rawCountback) {
  const nextCountback = createDefaultCountback();

  if (!rawCountback || typeof rawCountback !== 'object') {
    return nextCountback;
  }

  const yuko = Number(rawCountback.yuko);
  const wazaAri = Number(rawCountback.wazaAri);
  const ippon = Number(rawCountback.ippon);

  nextCountback.yuko = Number.isFinite(yuko) ? yuko : 0;
  nextCountback.wazaAri = Number.isFinite(wazaAri) ? wazaAri : 0;
  nextCountback.ippon = Number.isFinite(ippon) ? ippon : 0;

  return nextCountback;
}

function applyCountbackDelta(side, key, delta) {
  state[side].countback[key] += delta;
  state.currentRoundCountback[side][key] += delta;
}

function undoCurrentRoundCountback() {
  ['red', 'blue'].forEach((side) => {
    ['yuko', 'wazaAri', 'ippon'].forEach((key) => {
      state[side].countback[key] -= state.currentRoundCountback[side][key];
      state[side].countback[key] = Math.max(0, state[side].countback[key]);
    });
  });
}

function resetCurrentRoundCountback() {
  state.currentRoundCountback = {
    red: createDefaultCountback(),
    blue: createDefaultCountback(),
  };
}

function createDefaultRound() {
  return {
    redScore: '',
    blueScore: '',
    winner: 'none',
    senshu: false,
    senshuSide: null,
    redWarnings: createDefaultWarnings(),
    blueWarnings: createDefaultWarnings(),
    redCountback: createDefaultCountback(),
    blueCountback: createDefaultCountback(),
    completed: false,
  };
}

let state = {
  red: {
    label: 'AKA',
    name: 'AKA',
    score: 0,
    warnings: createDefaultWarnings(),
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
    warnings: createDefaultWarnings(),
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
  currentRoundCountback: {
    red: createDefaultCountback(),
    blue: createDefaultCountback(),
  },
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
    applyCountbackDelta(side, key, delta > 0 ? 1 : -1);
    state[side].score += delta;
    evaluateMatchEvents(state.timerCentiseconds);
    broadcastState();
  });

  ipcMain.on('score:reset', () => {
    undoCurrentRoundCountback();
    resetCurrentRoundCountback();
    state.red.score = 0;
    state.blue.score = 0;
    state.red.warnings = createDefaultWarnings();
    state.blue.warnings = createDefaultWarnings();
    state.senshuSide = null;
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

    const selectedRound = state.teamRounds[numericIndex];
    if (selectedRound && selectedRound.completed) {
      const redScore = Number(selectedRound.redScore);
      const blueScore = Number(selectedRound.blueScore);
      state.red.score = Number.isFinite(redScore) ? redScore : 0;
      state.blue.score = Number.isFinite(blueScore) ? blueScore : 0;
      state.red.warnings = sanitizeWarnings(selectedRound.redWarnings);
      state.blue.warnings = sanitizeWarnings(selectedRound.blueWarnings);
      state.currentRoundCountback.red = sanitizeCountback(selectedRound.redCountback);
      state.currentRoundCountback.blue = sanitizeCountback(selectedRound.blueCountback);

      if (selectedRound.senshuSide === 'red' || selectedRound.senshuSide === 'blue') {
        state.senshuSide = selectedRound.senshuSide;
      } else {
        state.senshuSide = null;
      }

      state.timerCentiseconds = 9000;
      stopTimer();
    } else {
      resetCurrentRoundCountback();
    }

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
    round.senshuSide = state.senshuSide;
    round.redWarnings = sanitizeWarnings(state.red.warnings);
    round.blueWarnings = sanitizeWarnings(state.blue.warnings);
    round.redCountback = sanitizeCountback(state.currentRoundCountback.red);
    round.blueCountback = sanitizeCountback(state.currentRoundCountback.blue);
    round.completed = true;

    state.red.score = 0;
    state.blue.score = 0;
    state.timerCentiseconds = 9000;
    stopTimer();
    state.senshuSide = null;
    state.red.warnings = createDefaultWarnings();
    state.blue.warnings = createDefaultWarnings();
    resetCurrentRoundCountback();

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
    state.red.countback = createDefaultCountback();
    state.blue.countback = createDefaultCountback();
    resetCurrentRoundCountback();
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

  ipcMain.on('warning:toggle', (_, side, level) => {
    if (!['red', 'blue'].includes(side)) {
      return;
    }

    if (!['c1', 'c2', 'c3', 'hc', 'h'].includes(level)) {
      return;
    }

    state[side].warnings[level] = !state[side].warnings[level];
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
