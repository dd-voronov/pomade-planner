import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HostClient } from "pomade-kit/sdk";
import type { ProjectInfo } from "pomade-kit/protocol";

import { EmptyState } from "../core/EmptyState";
import { Groups, needsYouGlyph } from "./NeedsYouGroups";
import {
  LIST_LEVEL,
  needsYou,
  needsYouCount,
  needsYouCounts,
  needsYouParts,
  shownLevel,
  waitingProjects,
  type Level,
  type NeedsYou,
  type NeedsYouCounts,
} from "./model/needs-you";
import { useBacklog, useCandidates, type Candidate } from "./useBoardData";

const NOTHING: NeedsYou = { review: [], signals: [] };
const ALL = "All projects";

/** Reads one project's backlog, live, and reports what waits there: `null` while it loads, nothing when it has no backlog. */
function ProjectFeed({ host, candidate, onItems }: { host: HostClient; candidate: Candidate; onItems: (projectId: string, items: NeedsYou | null) => void }) {
  const { state } = useBacklog(host, candidate.path);
  const items = useMemo(() => (state.status === "loading" ? null : state.status === "ready" ? needsYou(state.backlog.tickets) : NOTHING), [state]);
  const id = candidate.project.id;
  useEffect(() => onItems(id, items), [onItems, id, items]);
  return null;
}

function OpenGlyph() {
  return (
    <svg className="ny-list__open" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5L8 6 4.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackGlyph() {
  return (
    <svg className="ny-back__glyph" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const groupOf = (project: ProjectInfo): string | null => (project.groupPath.length > 0 ? project.groupPath.join(" › ") : null);

interface ListRowProps {
  testId: string;
  projectId?: string;
  name: string;
  group?: string | null;
  counts: NeedsYouCounts;
  onOpen: () => void;
}

/** A row of the list: a name with its counts, worded as the Board tab's project chooser words them. */
function ListRow({ testId, projectId, name, group, counts, onOpen }: ListRowProps) {
  return (
    <li>
      <button type="button" className={`ny-list__row${projectId === undefined ? " ny-list__row--all" : ""}`} data-testid={testId} data-project={projectId} onClick={onOpen}>
        <span className="ny-list__text">
          <span className="ny-list__head">
            <span className="ny-list__name">{name}</span>
            {group ? <span className="ny-list__group">{group}</span> : null}
          </span>
          <span className="ny-list__counts" data-testid="needs-you-list-counts">
            {needsYouParts(counts).map((part) => (
              <span key={part} className="ny-list__count" data-testid="needs-you-list-count">
                {part}
              </span>
            ))}
          </span>
        </span>
        <OpenGlyph />
      </button>
    </li>
  );
}

/**
 * The panel at Workspace: the list of projects with something waiting under "All projects", and,
 * a click in, one project's groups or every project's sections under a row that leads back.
 */
export function NeedsYouWorkspace({ host }: { host: HostClient }) {
  const state = useCandidates(host);
  const [read, setRead] = useState<Record<string, NeedsYou | null>>({});
  const onItems = useCallback((id: string, items: NeedsYou | null) => setRead((r) => (r[id] === items ? r : { ...r, [id]: items })), []);
  const candidates = useMemo(() => (state.status === "ready" ? state.candidates : []), [state]);
  const projects = useMemo(() => candidates.map((c) => ({ project: c.project, items: read[c.project.id] ?? null })), [candidates, read]);
  const waiting = useMemo(() => waitingProjects(projects), [projects]);
  const settled = state.status === "ready" && projects.every((p) => p.items !== null);

  const [opened, setOpened] = useState<Level>(LIST_LEVEL);
  // The projects are not known while they load: an opened project is only dropped once they are.
  const level = state.status === "ready" ? shownLevel(opened, candidates.map((c) => c.project.id)) : opened;
  const list = useRef<HTMLUListElement>(null);
  const cameFrom = useRef<Level | null>(null);
  const back = () => {
    cameFrom.current = level;
    setOpened(LIST_LEVEL);
  };
  // Back on the list, the keyboard is on the row that was open.
  useEffect(() => {
    const from = cameFrom.current;
    if (level.kind !== "list" || from === null) return;
    cameFrom.current = null;
    const rows = list.current?.querySelectorAll<HTMLElement>("button") ?? [];
    for (const row of rows) {
      if (from.kind === "all" ? row.dataset.project === undefined : from.kind === "project" && row.dataset.project === from.id) row.focus();
    }
  }, [level]);

  const nothing = (where: string) => (
    <EmptyState tag="div" testId="needs-you-empty" glyph={needsYouGlyph} title="Nothing needs you">
      No tickets in review and no new signals in {where}.
    </EmptyState>
  );
  const backRow = (name: string, group: string | null) => (
    <div className="ny-back">
      <button type="button" className="ny-back__row" data-testid="needs-you-back" title="Back to the projects" aria-label={`${name} — back to the projects`} autoFocus onClick={back}>
        <BackGlyph />
        <span className="ny-back__name">{name}</span>
        {group ? <span className="ny-back__group">{group}</span> : null}
      </button>
    </div>
  );

  let body: ReactNode = null;
  if (state.status === "error") {
    body = (
      <EmptyState tag="div" testId="needs-you-error" glyph={needsYouGlyph} title="Can't list the projects">
        {state.message}
      </EmptyState>
    );
  } else if (level.kind === "list") {
    if (waiting.length > 0) {
      body = (
        <ul className="ny-list" data-testid="needs-you-list" ref={list}>
          <ListRow testId="needs-you-all" name={ALL} counts={needsYouCounts(waiting.map((w) => w.items))} onOpen={() => setOpened({ kind: "all" })} />
          {waiting.map(({ project, items }) => (
            <ListRow
              key={project.id}
              testId="needs-you-list-project"
              projectId={project.id}
              name={project.name}
              group={groupOf(project)}
              counts={needsYouCounts([items])}
              onOpen={() => setOpened({ kind: "project", id: project.id })}
            />
          ))}
        </ul>
      );
    } else if (settled) {
      body = nothing("any project");
    }
  } else if (level.kind === "all") {
    body = (
      <>
        {backRow(ALL, null)}
        {waiting.map(({ project, items }) => (
          <section key={project.id} className="ny-project" data-testid="needs-you-project" data-project={project.id} aria-label={project.name}>
            <h2 className="ny-project__title">
              <span className="ny-project__name">{project.name}</span>
              {groupOf(project) ? <span className="ny-project__group">{groupOf(project)}</span> : null}
            </h2>
            <Groups host={host} projectId={project.id} items={items} />
          </section>
        ))}
        {settled && waiting.length === 0 ? nothing("any project") : null}
      </>
    );
  } else {
    const shown = projects.find((p) => p.project.id === level.id);
    if (shown) {
      const { project, items } = shown;
      body = (
        <>
          {backRow(project.name, groupOf(project))}
          {items === null ? null : needsYouCount(items) > 0 ? <Groups host={host} projectId={project.id} items={items} /> : nothing(project.name)}
        </>
      );
    }
  }

  return (
    <main
      className="needs-you"
      data-testid="view-needs-you-panel"
      data-project="__workspace__"
      data-level={level.kind}
      data-level-project={level.kind === "project" ? level.id : undefined}
      aria-busy={state.status !== "error" && !settled}
    >
      {candidates.map((c) => (
        <ProjectFeed key={c.project.id} host={host} candidate={c} onItems={onItems} />
      ))}
      {body}
    </main>
  );
}
