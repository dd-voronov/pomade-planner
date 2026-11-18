import type { ReactNode } from "react";

interface EmptyStateProps {
  /** `data-testid` of the view. */
  testId: string;
  glyph?: ReactNode;
  title: string;
  children?: ReactNode;
  /** A button under the text. */
  action?: ReactNode;
  /** A line in the danger colour under the action (what the action just failed with). */
  error?: string | null;
  /** `div` when it sits inside a view that is already the page's `main`. */
  tag?: "main" | "div";
}

/** A view with nothing to show yet: a glyph, a title, one muted line and an optional action, centred in the frame. */
export function EmptyState({ testId, glyph, title, children, action, error, tag = "main" }: EmptyStateProps) {
  const Tag = tag;
  return (
    <Tag className="empty-state" data-testid={testId}>
      {glyph ? <div className="empty-state__glyph">{glyph}</div> : null}
      <h1 className="empty-state__title" data-testid="view-title">
        {title}
      </h1>
      {children ? <p className="empty-state__text">{children}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
      {error ? (
        <p className="empty-state__error" role="alert" data-testid="empty-state-error">
          {error}
        </p>
      ) : null}
    </Tag>
  );
}
