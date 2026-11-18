// Host API helpers both surfaces use: error codes and texts, and the active project.

import { useEffect, useState } from "react";
import { HostError, type HostClient } from "pomade-kit/sdk";
import type { ProjectRef } from "pomade-kit/protocol";

export const isNotFound = (error: unknown): boolean => error instanceof HostError && error.code === "not-found";

export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const ERRNO: Record<string, string> = {
  EACCES: "permission denied",
  EPERM: "permission denied",
  EROFS: "the disk is read-only",
  ENOSPC: "the disk is full",
  EBUSY: "the file is busy",
};

/** A host's disk error in a few words: a known errno by name (`EACCES: permission denied, open '/…'` → "permission denied"), else the message's first clause. */
export function diskReason(message: string): string {
  const errno = /^([A-Z]{2,}):/.exec(message)?.[1];
  if (errno !== undefined && ERRNO[errno] !== undefined) return ERRNO[errno];
  return message.split(/[,\n]/)[0]?.trim() || "the disk refused the write";
}

/**
 * The active project, followed through every `project.changed` (a switch, Workspace, or the active
 * project renamed or moved) — rather than trusting `welcome.project`, which a tab Pomade restores at
 * launch receives as the project active at launch, not the tab's own.
 */
export function useActiveProject(host: HostClient): ProjectRef {
  const [project, setProject] = useState(host.welcome.project);
  useEffect(() => {
    let live = true;
    const off = host.project.onChange((p) => setProject(p));
    void host.project.getActive().then(
      (p) => live && setProject((current) => (current.id === p.id && current.root === p.root && current.name === p.name ? current : p)),
      () => undefined,
    );
    return () => {
      live = false;
      off();
    };
  }, [host]);
  return project;
}
