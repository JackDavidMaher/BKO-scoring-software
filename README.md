# BKO Scoreboard

Basic Electron scoreboard app that opens two windows on startup:

- Display window: shows the current score in large text.
- Control window: updates the score with buttons.

## Prerequisites

- Node.js 18+ (includes npm)

If npm is missing on Linux, install Node.js and npm with your package manager.

## Run

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

The app opens both windows automatically.

## Controls

- `+1`, `-1`
- `+5`, `-5`
- `Reset To 0`

Both windows stay in sync through Electron IPC.
