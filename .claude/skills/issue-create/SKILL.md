---
name: issue-create
description: Create a GitHub issue from a description or plan
argument-hint: [description or path to plan file]
model: inherit
allowed-tools: Bash(gh issue:*) Bash(gh api:*) Bash(gh repo:*) Bash(ls:*) Read
---

Create a well-structured GitHub issue from the provided description and/or plan.

$ARGUMENTS

---

## Plan Detection

NEVER automatically search or pick files from `.claude/plans/` — the wrong plan could be selected.

Resolve the plan in order:
1. **Explicit path**: if `$ARGUMENTS` is a `.md` file path, read it directly as the plan.
2. **Conversation context**: look for a plan written by the assistant earlier in this session.
3. **No plan found**: ask the user to provide the plan. Suggest they either:
   - Paste the plan file path (e.g., `/issue-create .claude/plans/my-plan.md`)
   - Use `/copy` to copy the plan output to clipboard, then paste it as the argument

- If a plan is found (steps 1-2), ask **once**: `I found a plan. Include it under "Implementation Plan"?`
- Wait for reply before proceeding. If confirmed, include under `## Implementation Plan`.
- If declined, proceed without it.
- Do not re-ask if already answered in this session.

---

## Issue Types

Infer the type from intent and apply the matching title prefix and labels:

| Type | Title prefix | Labels |
|------|-------------|--------|
| Bug | `[Bug]: ` | `bug` |
| Feature | `[Feature]: ` | `enhancement` |
| Task | `[Task]: ` | (none required) |

Optionally add additional labels that already exist in the repository to indicate the affected area or component. Do not invent labels — check with `gh label list` first if unsure.

---

## Milestone

Fetch open milestones from the current repository and suggest the best match:

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh api "repos/$REPO/milestones" --jq '.[] | select(.state=="open") | "\(.number) \(.title)"'
```

- Suggest the milestone that best fits the issue based on title/description.
- Ask the user to confirm or pick a different one.
- If the user declines, none exist, or none fits, omit `--milestone`.

---

## Workflow

1. Detect plan (see above)
2. Determine issue type and labels
3. Select milestone (see above)
4. Create the issue in the current repository:

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh issue create \
  --title "TITLE" \
  --body "BODY" \
  --label "LABEL1,LABEL2" \
  --milestone "MILESTONE_TITLE" \
  --repo "$REPO"
```

5. Present final issue URL

### GH CLI rules

- Preflight: `gh auth status` and `gh api rate_limit` — stop if either fails.
- On transient error, check for duplicates (`gh issue list --search ...`) then retry **once**.
- Only claim success if a URL is returned.
