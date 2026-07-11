// run.js — robust launcher for Lumshot during development.
//
// Why this exists:
//   This machine has the environment variable ELECTRON_RUN_AS_NODE=1 set
//   system-wide. That variable forces the Electron binary to behave like a
//   plain Node.js runtime — it skips all the browser/GUI setup, so APIs like
//   `ipcMain`, `BrowserWindow`, and `globalShortcut` come back undefined and
//   the app crashes on startup.
//
//   Running `node run.js` lets us spawn the real Electron binary with a
//   cleaned-up environment (the bad variable removed), so Electron starts in
//   normal GUI mode. This works in any shell (cmd, PowerShell, bash).

const { spawn } = require('child_process');

// In plain Node, require('electron') returns the path to the electron.exe binary.
const electronBinary = require('electron');

// Copy the current environment and remove the variable that breaks Electron.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Launch Electron on the current project ('.') with the cleaned environment.
const child = spawn(electronBinary, ['.'], {
  stdio: 'inherit',   // forward console output to this terminal
  env,
});

child.on('close', (code) => process.exit(code));
