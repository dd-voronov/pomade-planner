// What each app's entry (apps/<app>/main.tsx) starts its page with: the shared base styles, the
// handshake and the shell around the app's own views.

import { createRoot } from "react-dom/client";
import { connect } from "pomade-kit/sdk";

import { App, type AppShell } from "./App";
import { Tips } from "./Tips";
import "./tokens.css";
import "./app.css";
import "./switcher.css";
import "./tips.css";

/** Render the app `shell` into the page's `#root`. */
export function mountApp(shell: AppShell): void {
  // One handshake per page load, started before the first render.
  const pending = connect();
  const root = document.getElementById("root");
  if (!root) throw new Error("index.html has no #root");
  createRoot(root).render(
    <>
      <App pending={pending} shell={shell} />
      <Tips />
    </>,
  );
}
