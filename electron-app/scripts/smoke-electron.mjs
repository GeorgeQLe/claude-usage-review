import { spawn } from "node:child_process";
import electronPath from "electron";

const timeoutMs = 15_000;
const successMarker = "CLAUDE_USAGE_ELECTRON_SMOKE_OK";
const failurePatterns = [
  /Unable to load preload script/i,
  /Electron Security Warning/i,
  /Failed to start ClaudeUsage Electron runtime/i
];
let output = "";
let sawSuccessMarker = false;

const child = spawn(electronPath, ["."], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    CLAUDE_USAGE_ELECTRON_SMOKE: "1",
    ELECTRON_ENABLE_LOGGING: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
  fail(`Electron smoke launch timed out after ${timeoutMs}ms.`);
}, timeoutMs);

child.stdout.on("data", (chunk) => {
  recordOutput(chunk);
});

child.stderr.on("data", (chunk) => {
  recordOutput(chunk);
});

child.on("error", (error) => {
  clearTimeout(timeout);
  fail(`Electron smoke launch failed to start: ${error.message}`);
});

child.on("close", (code, signal) => {
  clearTimeout(timeout);

  const failurePattern = failurePatterns.find((pattern) => pattern.test(output));

  if (failurePattern) {
    fail(`Electron smoke launch emitted disallowed output matching ${failurePattern}.`);
    return;
  }

  if (code === 0 && sawSuccessMarker) {
    console.log("Electron smoke launch passed with mocked local usage state.");
    return;
  }

  fail(`Electron smoke launch exited with code ${code ?? "null"} and signal ${signal ?? "null"}.`);
});

function recordOutput(chunk) {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);

  if (text.includes(successMarker)) {
    sawSuccessMarker = true;
  }
}

function fail(message) {
  console.error(message);

  if (output.trim().length > 0) {
    console.error("Electron smoke output:");
    console.error(output.trim());
  }

  process.exit(1);
}
