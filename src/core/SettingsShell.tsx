import type { ReactNode } from "react";

interface SettingsShellProps {
  testId: string;
  /** The button that leaves the page: "← Planner", "← Board". */
  back: string;
  onBack: () => void;
  /** The page's rows (core/settings.css). */
  children: ReactNode;
}

/** An app's settings page in its tab: a header with the way back and the title, then the rows in a scrolling column. */
export function SettingsShell({ testId, back, onBack, children }: SettingsShellProps) {
  return (
    <main className="settings-page" data-testid={testId}>
      <header className="settings-page__header">
        <button type="button" className="btn btn--ghost btn--sm" data-testid="settings-back" onClick={onBack}>
          {back}
        </button>
        <span className="settings-page__title">Settings</span>
      </header>
      <div className="settings-page__body">
        <div className="settings">{children}</div>
      </div>
    </main>
  );
}
