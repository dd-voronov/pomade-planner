// What each app's entry (apps/<app>/main.tsx) starts its page with: Pomade's design tokens and the
// shared base styles, the handshake, Pomade's theme on the page's root and the shell around the
// app's own views.

import { createRoot } from "react-dom/client";
import { applyTheme, connect, followTheme } from "pomade-kit/sdk";
import "pomade-kit/tokens.css";

import { App, type AppShell } from "./App";
import { Tips } from "./Tips";
import "./app.css";
import "./settings.css";
import "./switcher.css";
import "./tips.css";

/** Render the app `shell` into the page's `#root`. */
export function mountApp(shell: AppShell): void {
  // One handshake per page load, started before the first render.
  const pending = connect();
  // Pomade's theme (`data-theme` on the root, kept current), never the Mac's appearance; light
  // outside Pomade.
  void pending.then((result) => {
    if (result.status === "connected") followTheme(result.host);
    else applyTheme("light");
  });
  const root = document.getElementById("root");
  if (!root) throw new Error("index.html has no #root");
  createRoot(root).render(
    <>
      <App pending={pending} shell={shell} />
      <Tips />
    </>,
  );
}
