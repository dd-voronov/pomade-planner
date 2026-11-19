import { AGENT_REPORTER } from "./model/ticket";

/** A four-point spark: the mark of a ticket an agent filed on its own. */
function AgentGlyph() {
  return (
    <svg className="reporter__glyph" width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M5 0.5c0.3 2.4 1.2 3.9 4.5 4.5c-3.3 0.6-4.2 2.1-4.5 4.5c-0.3-2.4-1.2-3.9-4.5-4.5c3.3-0.6 4.2-2.1 4.5-4.5z" />
    </svg>
  );
}

/** Who raised a ticket ([[convention-areas-columns]] "Cards"): the handle; `claude` with a spark before it. */
export function Reporter({ handle, testId }: { handle: string; testId: string }) {
  const agent = handle === AGENT_REPORTER;
  return (
    <span className={`reporter${agent ? " reporter--agent" : ""}`} data-testid={testId} data-agent={agent ? "true" : undefined} title={agent ? "Filed by Claude on its own" : `Reported by ${handle}`}>
      {agent ? <AgentGlyph /> : null}
      <span className="reporter__handle">{handle}</span>
    </span>
  );
}
