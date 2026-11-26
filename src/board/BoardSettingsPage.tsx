import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { ProjectInfo } from "pomade-kit/protocol";

import { CloseGlyph } from "../core/glyphs";
import { errorText } from "../core/host";
import type { Rect } from "../core/place";
import { SettingsShell } from "../core/SettingsShell";
import { ProjectPicker } from "./ProjectPicker";
import { folderLabel, groupLabel, splitByFolder } from "./model/project-folders";
import {
  DEFAULT_BACKLOG_PATTERN,
  DEFAULT_REPORTER,
  normalizeRelative,
  normalizeReporter,
  patternOf,
  SYNCED_KEYS,
  SYNCED_SETTINGS_PATH,
  type ParsedSyncedSettings,
} from "./model/settings";
import { useCandidates, useSyncedSettings } from "./useBoardData";
import { chooseBacklogFolder, saveSyncedSettings, setBacklogFolder } from "./write";

interface BoardSettingsPageProps {
  host: HostClient;
  onBack: () => void;
}

/**
 * The Board tab's settings page ([[backlog-location]] "Settings page"), the same whichever project
 * is active: the workspace's default backlog folder, the projects with a folder of their own, and
 * the reporter of new tickets.
 */
export function BoardSettingsPage({ host, onBack }: BoardSettingsPageProps) {
  const { synced, reload } = useSyncedSettings(host);
  if (synced === null) return <main className="settings-page" data-testid="board-settings-page" aria-busy="true" />;
  return <Loaded host={host} synced={synced} reload={reload} onBack={onBack} />;
}

function Loaded({ host, synced, reload, onBack }: BoardSettingsPageProps & { synced: ParsedSyncedSettings; reload: () => Promise<void> }) {
  const { backlogPathPattern: currentPattern, reporter: currentReporter } = synced.settings;
  const [pattern, setPattern] = useState(currentPattern);
  const [patternError, setPatternError] = useState<string | null>(null);
  useEffect(() => setPattern(currentPattern), [currentPattern]);
  const [reporter, setReporter] = useState(currentReporter);
  const [reporterError, setReporterError] = useState<string | null>(null);
  useEffect(() => setReporter(currentReporter), [currentReporter]);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** The project picker, hanging off "Add a project…". */
  const [picker, setPicker] = useState<Rect | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const candidates = useCandidates(host);
  const { rows, free } = useMemo(() => splitByFolder(candidates.status === "ready" ? candidates.candidates : []), [candidates]);

  /** Write one key of the synced settings file (`undefined` removes it), then show the file as it is. */
  const save = async (key: string, value: string | undefined, done: string, fail: (text: string) => void) => {
    try {
      await saveSyncedSettings(host, { [key]: value });
      await reload();
      setSaved(done);
    } catch (error) {
      fail(errorText(error));
    }
  };

  const savePattern = (e?: FormEvent) => {
    e?.preventDefault();
    setSaved(null);
    const next = patternOf(pattern);
    if (next === null) {
      setPatternError(`A folder inside each project, like ${DEFAULT_BACKLOG_PATTERN} — not an absolute path or one that leaves the project.`);
      return;
    }
    setPatternError(null);
    if (normalizeRelative(next ?? DEFAULT_BACKLOG_PATTERN) === normalizeRelative(currentPattern)) {
      setPattern(currentPattern);
      return;
    }
    void save(SYNCED_KEYS.backlogPathPattern, next, next === undefined ? `The default folder is ${DEFAULT_BACKLOG_PATTERN} again.` : "Default folder saved.", setPatternError);
  };

  const saveReporter = (e?: FormEvent) => {
    e?.preventDefault();
    setSaved(null);
    const next = reporter.trim() === "" ? undefined : normalizeReporter(reporter);
    if (next === null) {
      setReporterError(`A handle without spaces, like ${DEFAULT_REPORTER}.`);
      return;
    }
    setReporterError(null);
    if ((next ?? DEFAULT_REPORTER) === currentReporter) {
      setReporter(currentReporter);
      return;
    }
    void save(SYNCED_KEYS.reporter, next, next === undefined ? `The reporter is ${DEFAULT_REPORTER} again.` : "Reporter saved.", setReporterError);
  };

  /** Ask for `project`'s folder and store it; the list follows the project's settings. */
  const chooseFolder = async (project: ProjectInfo) => {
    setSaved(null);
    setFolderError(null);
    const choice = await chooseBacklogFolder(host, project);
    if (choice.kind === "refused") setFolderError(choice.message);
    if (choice.kind === "chosen") setSaved(`Folder for ${project.name} saved.`);
  };

  const removeFolder = async (project: ProjectInfo) => {
    setSaved(null);
    setFolderError(null);
    try {
      await setBacklogFolder(host, project.id, null);
      setSaved(`${project.name} uses the default folder again.`);
    } catch (error) {
      setFolderError(`Couldn't change ${project.name}: ${errorText(error)}`);
    }
  };

  const openPicker = () => {
    const r = addButton.current?.getBoundingClientRect();
    if (r) setPicker({ left: r.left, top: r.top, width: r.width, height: r.height });
  };

  return (
    <SettingsShell testId="board-settings-page" back="← Board" onBack={onBack}>
      {synced.problem !== null ? (
        <p className="settings__problem" role="status" data-testid="settings-problem">
          {synced.problem} — using the defaults.
        </p>
      ) : null}
      <h2 className="settings__section">Backlog folder</h2>
      <section className="settings__row">
        <div className="settings__label">
          <h3 className="settings__name">
            <label htmlFor="backlog-pattern">Default for this workspace</label>
          </h3>
          <p className="settings__help">
            The folder of tickets in every project, relative to the project&apos;s own folder. Empty: <code>{DEFAULT_BACKLOG_PATTERN}</code>
          </p>
        </div>
        <form className="settings__control" onSubmit={savePattern} noValidate>
          <input
            id="backlog-pattern"
            className="field-input settings__file"
            data-testid="settings-pattern"
            value={pattern}
            placeholder={DEFAULT_BACKLOG_PATTERN}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={patternError !== null}
            onChange={(e) => setPattern(e.target.value)}
            onBlur={() => savePattern()}
          />
          {patternError !== null ? (
            <p className="settings__error" role="alert" data-testid="settings-pattern-error">
              {patternError}
            </p>
          ) : null}
        </form>
      </section>
      <section className="settings__row">
        <div className="settings__label">
          <h3 className="settings__name">Folder for a project</h3>
          <p className="settings__help">Projects whose tickets are in another folder. A project not listed here uses the default.</p>
        </div>
        <div className="settings__control">
          {candidates.status === "error" ? (
            <p className="settings__error" role="alert" data-testid="settings-projects-error">
              Can&apos;t list the projects: {candidates.message}
            </p>
          ) : null}
          {candidates.status === "ready" && rows.length === 0 ? (
            <p className="settings__none" data-testid="settings-folders-none">
              Every project uses the default.
            </p>
          ) : null}
          {rows.length > 0 ? (
            <ul className="settings__list" data-testid="settings-folders">
              {rows.map(({ project, folder }) => (
                <li key={project.id} className="settings__item" data-testid="settings-folder" data-project={project.id}>
                  <span className="settings__item-title">
                    <span className="settings__item-name" title={project.name}>
                      {project.name}
                    </span>
                    {project.groupPath.length > 0 ? <span className="settings__item-group">{groupLabel(project)}</span> : null}
                  </span>
                  <span className="settings__item-path" data-testid="settings-folder-path" title={`${project.root}/${folder}`}>
                    {folderLabel(folder)}
                  </span>
                  <button type="button" className="btn btn--ghost btn--sm" data-testid="settings-folder-change" onClick={() => void chooseFolder(project)}>
                    Change…
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${project.name}'s folder`}
                    data-tip="Remove — back to the default folder"
                    data-testid="settings-folder-remove"
                    onClick={() => void removeFolder(project)}
                  >
                    <CloseGlyph />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button ref={addButton} type="button" className="btn btn--ghost" data-testid="settings-add-project" disabled={candidates.status !== "ready"} onClick={openPicker}>
            Add a project…
          </button>
          {folderError !== null ? (
            <p className="settings__error" role="alert" data-testid="settings-folder-error">
              {folderError}
            </p>
          ) : null}
        </div>
      </section>
      <h2 className="settings__section">New tickets</h2>
      <section className="settings__row">
        <div className="settings__label">
          <h3 className="settings__name">
            <label htmlFor="reporter">Reporter</label>
          </h3>
          <p className="settings__help">
            The handle written as <code>reporter:</code> on each ticket the Board creates. Empty: <code>{DEFAULT_REPORTER}</code>
          </p>
        </div>
        <form className="settings__control" onSubmit={saveReporter} noValidate>
          <input
            id="reporter"
            className="field-input settings__file"
            data-testid="settings-reporter"
            value={reporter}
            placeholder={DEFAULT_REPORTER}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={reporterError !== null}
            onChange={(e) => setReporter(e.target.value)}
            onBlur={() => saveReporter()}
          />
          {reporterError !== null ? (
            <p className="settings__error" role="alert" data-testid="settings-reporter-error">
              {reporterError}
            </p>
          ) : null}
        </form>
      </section>
      <p className="settings__foot">
        The default folder and the reporter are saved in <code>{SYNCED_SETTINGS_PATH}</code>, a project&apos;s folder with the project — all synced with the workspace.
        {saved !== null ? (
          <span className="settings__saved" role="status" data-testid="settings-saved">
            {" "}
            {saved}
          </span>
        ) : null}
      </p>
      {picker !== null ? (
        <ProjectPicker
          anchor={picker}
          projects={free}
          onPick={(project) => {
            setPicker(null);
            void chooseFolder(project);
          }}
          onCancel={() => setPicker(null)}
          restoreFocus={() => addButton.current?.focus()}
        />
      ) : null}
    </SettingsShell>
  );
}
