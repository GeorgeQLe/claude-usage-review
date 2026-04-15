import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const isDevelopment = !app.isPackaged;

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (isDevelopment) {
    await window.loadURL("http://127.0.0.1:5173");
    return;
  }

  await window.loadFile(join(__dirname, "../dist/index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
