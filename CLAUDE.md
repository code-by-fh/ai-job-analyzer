## Application Building Context

The project context lives in `context/`. To keep session
overhead low, read **conditionally** — not everything every time.

**Always at session start:**

- `context/progress-tracker.md` — current phase, completed
  work, open questions, and next steps.

**On demand — read the file whose domain your task touches:**

- `context/project-overview.md` — product definition, goals,
  features, scope. Read when scoping a feature or unsure if
  something is in scope.
- `context/architecture.md` — system structure, boundaries,
  storage model, invariants. Read before any structural or
  cross-boundary change.
- `context/ui-context.md` — theme, colors, typography,
  component conventions. Read for any frontend/UI work.
- `context/code-standards.md` — implementation rules and
  conventions. Read before non-trivial backend/frontend code.
- `context/ai-workflow-rules.md` — development workflow,
  scoping rules, delivery approach. Read before multi-step
  or multi-file changes.

For a trivial change (typo, one-line fix, obvious bug),
`progress-tracker.md` alone is enough.

## Keeping Context in Sync

Update `context/progress-tracker.md` after each meaningful
implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.
