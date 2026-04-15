import React from "react";
import { createRoot } from "react-dom/client";
import "../styles/app.css";

function App(): React.JSX.Element {
  return (
    <main className="app-shell">
      <p className="eyebrow">ClaudeUsage Electron</p>
      <h1>Runtime scaffold ready.</h1>
      <p>Secure tray, preload, renderer, and storage modules will be added in the next foundation steps.</p>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
