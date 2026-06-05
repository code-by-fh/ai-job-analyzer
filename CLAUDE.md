# Development Rules

## 1. Load Context

### At the Start of Every Session

Always read:

* `context/progress-tracker.md`

  * current status
  * completed work
  * open questions
  * next steps

### Read Additional Files Only When Relevant

* `context/project-overview.md` → product goals, scope, features
* `context/architecture.md` → system structure, boundaries, data model
* `context/ui-context.md` → design and UI conventions
* `context/code-standards.md` → coding standards and conventions
* `context/ai-workflow-rules.md` → development workflow and process

For trivial changes (e.g. typos, one-line fixes, obvious bugs), `progress-tracker.md` is sufficient.

---

## 2. Think Before Coding

* Do not make hidden assumptions.
* State assumptions explicitly.
* If multiple interpretations exist, present them.
* If a simpler solution exists, say so.
* Push back on unnecessary complexity.
* If something is unclear, stop and ask.

Never silently choose an interpretation when requirements are ambiguous.

---

## 3. Keep It Simple

* Implement only what was requested.
* No speculative features.
* No unnecessary abstractions.
* No configurability unless requested.
* No handling of unrealistic edge cases.
* Prefer the simplest solution that solves the problem.

Ask yourself:

> Would a senior engineer consider this overengineered?

If yes, simplify it.

---

## 4. Make Surgical Changes

* Change only what is necessary.
* Do not refactor unrelated code.
* Do not "clean up" surrounding code unless required.
* Follow the existing code style and patterns.
* Leave unrelated issues untouched.

Allowed:

* Remove imports, variables, functions, or code made unused by your changes.

Not allowed:

* Removing pre-existing dead code unless explicitly requested.

Every changed line should directly support the requested task.

---

## 5. Work Toward Verifiable Goals

For non-trivial tasks, define a brief plan:

1. Task → verification
2. Task → verification
3. Task → verification

Success must be measurable.

Examples:

* Bug fix → reproduce the bug, then verify it no longer occurs.
* Validation → create tests for invalid input and make them pass.
* Refactor → verify behavior remains unchanged before and after.

Avoid:

* "Make it work."

Prefer:

* "Test X passes."
* "Bug Y no longer occurs."
* "Requirement Z is verified."

---

## 6. Keep Context Up to Date

After every meaningful implementation change:

* Update `context/progress-tracker.md`.

**Format for progress-tracker updates:**

* Set the Phase line to the current focus in one sentence.
* In the Status Board: mark the feature row ✅, add the relevant file paths, and note test count if tests exist.
* Add ADRs only for decisions that are non-obvious or would be revisited otherwise.
* Open Questions: list only unresolved decisions that block future work. Remove entries once resolved.

If the change affects architecture, scope, standards, or documented behavior:

* Update the relevant context file before continuing.

**Which file to update:**

| Changed area | File to update |
| --- | --- |
| Architecture, DB schema, process model, boundaries | `context/architecture.md` |
| Coding patterns, libraries, safety rules | `context/code-standards.md` |
| Scope, features, hard invariants | `context/project-overview.md` |
| Design system, UI conventions | `context/ui-context.md` |
| Workflow, verification steps | `context/ai-workflow-rules.md` |
