import type { ProjectInfo } from "pomade-kit/protocol";

import { Popover } from "../core/Popover";
import type { Rect } from "../core/place";
import { PickList } from "./PickList";
import { filterProjects, groupLabel } from "./model/project-folders";

interface ProjectPickerProps {
  anchor: Rect;
  /** The projects on offer, in the sidebar's order. */
  projects: readonly ProjectInfo[];
  onPick: (project: ProjectInfo) => void;
  /** Escape, Cancel or a click outside. */
  onCancel: () => void;
  restoreFocus: () => void;
}

const idOf = (project: ProjectInfo): string => project.id;

function ProjectOption(project: ProjectInfo) {
  const group = groupLabel(project);
  return (
    <>
      <span className="pick-option__title">{project.name}</span>
      {group !== "" ? <span className="pick-option__meta pick-option__meta--clip">{group}</span> : null}
    </>
  );
}

/** The settings page's "Add a project…" ([[backlog-location]] "Settings page"): which project gets a backlog folder of its own. */
export function ProjectPicker({ anchor, projects, onPick, onCancel, restoreFocus }: ProjectPickerProps) {
  return (
    <Popover anchor={anchor} label="Add a project" testId="project-picker" className="popover--form" onClose={onCancel} restoreFocus={restoreFocus}>
      <div className="pop-form">
        <header className="pop-form__head pop-form__head--stack">
          <span className="pop-form__title">Add a project</span>
          <span className="pop-form__meta">Its backlog folder is chosen next.</span>
        </header>
        {projects.length === 0 ? (
          <p className="pop-form__note" data-testid="project-picker-none">
            Every project has a folder of its own.
          </p>
        ) : (
          <PickList
            items={projects}
            filter={filterProjects}
            idOf={idOf}
            value={null}
            mode="pick"
            onChange={(id) => {
              const project = projects.find((p) => p.id === id);
              if (project) onPick(project);
            }}
            label="Project"
            placeholder="Search projects by name or group"
            emptyText={(query) => `No project matches “${query}”`}
            renderOption={ProjectOption}
            testId="project"
            autoFocus
          />
        )}
        <footer className="pop-form__actions">
          <button type="button" className="btn btn--ghost" data-testid="project-picker-cancel" onClick={onCancel}>
            Cancel
          </button>
        </footer>
      </div>
    </Popover>
  );
}
