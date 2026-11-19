import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import type { HostClient } from "pomade-kit/sdk";
import { parseTime } from "pomade-kit/schedule";

import { errorText } from "../core/host";
import { dailyNoteText } from "./model/daily";
import { formatBoundary, normalizeTemplatePath, PLANNER_KEYS, SYNCED_SETTINGS_PATH, type ParsedPlannerSettings } from "./model/settings";
import { chooseTasksRoot } from "./Planner";
import { readTemplate, saveSettings, WriteError } from "./write";

interface SettingsPageProps {
  host: HostClient;
  settings: ParsedPlannerSettings;
  reload: () => Promise<void>;
  onBack: () => void;
}

const message = (e: unknown): string => (e instanceof WriteError ? e.message : errorText(e));

/**
 * Why the daily-note template at `path` won't be used, live: re-checked when the path changes and
 * whenever the page is shown again. `null` while it reads well (or none is set).
 */
function useTemplateProblem(host: HostClient, path: string | null): string | null {
  const [problem, setProblem] = useState<{ path: string | null; text: string | null }>({ path: null, text: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);
  useEffect(() => {
    let live = true;
    void readTemplate(host, path).then((read) => {
      if (live) setProblem({ path, text: dailyNoteText("2000-01-01", read).problem });
    });
    return () => {
      live = false;
    };
  }, [host, path, tick]);
  return problem.path === path ? problem.text : null;
}

/** The Planner tab's settings page ([[settings-and-onboarding]]): the tasks root, the day boundary and the daily-note template, saved in the synced settings file. */
export function SettingsPage({ host, settings, reload, onBack }: SettingsPageProps) {
  const { tasksRoot, dayBoundary, dailyNoteTemplate } = settings.settings;
  const [template, setTemplate] = useState(dailyNoteTemplate ?? "");
  const [templateError, setTemplateError] = useState<string | null>(null);
  const templateProblem = useTemplateProblem(host, dailyNoteTemplate);
  useEffect(() => setTemplate(dailyNoteTemplate ?? ""), [dailyNoteTemplate]);
  const [boundary, setBoundary] = useState(formatBoundary(dayBoundary));
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const current = formatBoundary(dayBoundary);
  useEffect(() => setBoundary(current), [current]);

  const changeRoot = () => {
    setRootError(null);
    setSaved(null);
    void chooseTasksRoot(host, tasksRoot).then(
      async (path) => {
        if (path === null) return;
        await reload();
        setSaved("Tasks folder saved.");
      },
      (e: unknown) => setRootError(message(e)),
    );
  };

  const saveBoundary = (e?: FormEvent) => {
    e?.preventDefault();
    setSaved(null);
    const time = parseTime(boundary.trim());
    if (time === null) {
      setBoundaryError("A time from 0:00 to 23:59, like 3:00.");
      return;
    }
    setBoundaryError(null);
    if (formatBoundary(time) === current) {
      setBoundary(current);
      return;
    }
    void saveSettings(host, { [PLANNER_KEYS.dayBoundary]: formatBoundary(time) }).then(
      async () => {
        await reload();
        setSaved("Day boundary saved.");
      },
      (err: unknown) => setBoundaryError(message(err)),
    );
  };

  /** Save `typed` as the template: empty = none; else a readable `.md` path in the workspace. */
  const commitTemplate = (typed: string) => {
    setSaved(null);
    const text = typed.trim();
    if (text === "") {
      setTemplateError(null);
      setTemplate("");
      if (dailyNoteTemplate === null) return;
      void saveSettings(host, { [PLANNER_KEYS.dailyNoteTemplate]: undefined }).then(
        async () => {
          await reload();
          setSaved("Daily notes use the built-in template.");
        },
        (err: unknown) => setTemplateError(message(err)),
      );
      return;
    }
    const normalized = normalizeTemplatePath(text);
    if (!normalized.ok) {
      setTemplateError(`${normalized.problem}.`);
      return;
    }
    if (normalized.path === dailyNoteTemplate) {
      setTemplateError(null);
      setTemplate(normalized.path);
      return;
    }
    void readTemplate(host, normalized.path).then(async (read) => {
      if (read.kind === "error") {
        setTemplateError(`No file can be read at ${normalized.path} — ${read.reason}.`);
        return;
      }
      setTemplateError(null);
      try {
        await saveSettings(host, { [PLANNER_KEYS.dailyNoteTemplate]: normalized.path });
        await reload();
        setSaved("Daily note template saved.");
      } catch (err) {
        setTemplateError(message(err));
      }
    });
  };

  const submitTemplate = (e?: FormEvent) => {
    e?.preventDefault();
    commitTemplate(template);
  };

  const chooseTemplate = () => {
    setSaved(null);
    setTemplateError(null);
    void host.files.pickFile({ under: tasksRoot ?? "", extensions: ["md"] }).then(
      ({ path }) => {
        if (path === null) return;
        setTemplate(path);
        commitTemplate(path);
      },
      (err: unknown) => setTemplateError(`Couldn't open the file picker: ${errorText(err)}`),
    );
  };

  const clearTemplate = () => {
    setTemplate("");
    commitTemplate("");
  };

  /** A button beside the field acts without the field's blur saving first: what it does replaces what is typed. */
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <main className="planner planner--tab" data-testid="planner-settings-page">
      <header className="planner__header">
        <button type="button" className="btn btn--ghost btn--sm" data-testid="settings-back" onClick={onBack}>
          ← Planner
        </button>
        <span className="planner__header-title">Settings</span>
      </header>
      <div className="planner__body">
        <div className="settings">
          {settings.problem !== null ? (
            <p className="settings__problem" role="status" data-testid="settings-problem">
              {settings.problem} — using the defaults.
            </p>
          ) : null}
          <section className="settings__row">
            <div className="settings__label">
              <h2 className="settings__name">Tasks folder</h2>
              <p className="settings__help">Where every task is a Markdown file. Choosing another folder moves no files.</p>
            </div>
            <div className="settings__control">
              <code className="settings__path" data-testid="settings-tasks-root">
                {tasksRoot === null ? "not chosen" : tasksRoot === "" ? "/" : `${tasksRoot}/`}
              </code>
              <button type="button" className="btn btn--ghost" data-testid="settings-change-root" onClick={changeRoot}>
                Change…
              </button>
              {rootError !== null ? (
                <p className="settings__error" role="alert" data-testid="settings-root-error">
                  {rootError}
                </p>
              ) : null}
            </div>
          </section>
          <section className="settings__row">
            <div className="settings__label">
              <h2 className="settings__name">
                <label htmlFor="day-boundary">Day starts at</label>
              </h2>
              <p className="settings__help">Ticked tasks leave Today and unfinished ones roll over at this time. Until then, the Planner still shows the day before.</p>
            </div>
            <form className="settings__control" onSubmit={saveBoundary} noValidate>
              <input
                id="day-boundary"
                className="field-input settings__time"
                data-testid="settings-boundary"
                value={boundary}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={boundaryError !== null}
                onChange={(e) => setBoundary(e.target.value)}
                onBlur={() => saveBoundary()}
              />
              {boundaryError !== null ? (
                <p className="settings__error" role="alert" data-testid="settings-boundary-error">
                  {boundaryError}
                </p>
              ) : null}
            </form>
          </section>
          <section className="settings__row">
            <div className="settings__label">
              <h2 className="settings__name">
                <label htmlFor="daily-template">Daily note template</label>
              </h2>
              <p className="settings__help">
                A Markdown file anywhere in the workspace. Each day&apos;s note in Daily/ starts as a copy of it, with its type and date set. Empty: a date heading and an empty checklist.
              </p>
            </div>
            <form className="settings__control" onSubmit={submitTemplate} noValidate>
              <input
                id="daily-template"
                className="field-input settings__file"
                data-testid="settings-template"
                value={template}
                placeholder="Templates/Daily.md"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={templateError !== null}
                onChange={(e) => setTemplate(e.target.value)}
                onBlur={() => submitTemplate()}
              />
              <button type="button" className="btn btn--ghost" data-testid="settings-template-choose" onMouseDown={keepFocus} onClick={chooseTemplate}>
                Choose…
              </button>
              {dailyNoteTemplate !== null ? (
                <button type="button" className="btn btn--ghost" data-testid="settings-template-clear" onMouseDown={keepFocus} onClick={clearTemplate}>
                  Clear
                </button>
              ) : null}
              {templateError !== null ? (
                <p className="settings__error" role="alert" data-testid="settings-template-error">
                  {templateError}
                </p>
              ) : templateProblem !== null && dailyNoteTemplate !== null ? (
                <p className="settings__warning" role="status" data-testid="settings-template-problem">
                  Can&apos;t use {dailyNoteTemplate}: {templateProblem}. New daily notes use the built-in template until it can be read.
                </p>
              ) : null}
            </form>
          </section>
          <p className="settings__foot">
            Saved in <code>{SYNCED_SETTINGS_PATH}</code>, synced with the workspace.
            {saved !== null ? (
              <span className="settings__saved" role="status" data-testid="settings-saved">
                {" "}
                {saved}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </main>
  );
}
