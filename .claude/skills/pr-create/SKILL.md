---
name: pr-create
description: Create a pull request with comprehensive description following conventional commit format
model: inherit
allowed-tools: Bash(git branch:*) Bash(git log:*) Bash(git diff:*) Bash(git fetch:*) Bash(gh issue:*) Bash(git push:*) Bash(gh pr:*) Bash(gh repo:*)
---

You are an AI assistant tasked with creating a pull request using **Conventional Commits** format for PR titles.

## PR Title Format

```
type(scope): description
```

**Examples:**
- `feat(api): add user authentication service`
- `fix(web): resolve button hover state`
- `feat: implement user dashboard`

**Allowed Types:** feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

**Scope:** optional — include only when changes are clearly bounded to a specific area (e.g. a module, package, or top-level directory). Omit for repo-wide changes.

## IMPORTANT: Sync With Base Branch Before PR Creation

**Before proceeding with PR creation, check whether the branch is behind the base branch:**

1. Detect the repository's default base branch and remote:
   ```bash
   BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
   git fetch origin "$BASE_BRANCH"
   ```

2. Check whether the base branch has advanced:
   ```bash
   git log "HEAD..origin/$BASE_BRANCH" --oneline
   ```

3. If the above command shows any commits, **STOP** and inform the user:
   ```
   The base branch (BASE_BRANCH) has advanced since your branch was created.

   Please rebase or merge the base branch into your branch first to ensure
   a clean merge and prevent conflicts during PR review.

   After updating successfully, run `/pr-create` again.
   ```

4. Only proceed with PR creation if the base branch is up to date or the user explicitly confirms to skip.

---

## PR Creation Workflow

Follow these steps to complete the task:

1. **Detect repository and base branch:**
   - Repository: `REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)`
   - Base branch: `BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)`

2. **Get current branch and issue info:**
   - Get current branch name: `git branch --show-current`
   - Try to extract issue number from branch name (first part before the dash, e.g., from `123-user-dashboard` get `123`)
   - If no issue number is found in branch name, try commit messages/body for `#123` style references; if still missing, ask the user for the issue number (or proceed without one if there is no related issue)
   - Get issue details when available: `gh issue view ISSUE_NUMBER --repo "$REPO" --json title,body`
   - Analyze commit history: `git log "origin/$BASE_BRANCH..HEAD" --format="%B"`
   - Review changes: `git diff "origin/$BASE_BRANCH...HEAD" --stat` and `git diff "origin/$BASE_BRANCH...HEAD" --name-only`

3. **Determine PR title components:**
   - **Type**: Infer from commits/changes (feat for new features, fix for bugs, docs, test, ci, refactor, etc.)
   - **Scope** (optional): Detect from file paths — use the most specific top-level directory or module the change touches. Omit when repo-wide.
   - **Description**: Use a short, clear description based on issue title and implemented changes (minimum 3 characters)
   - **Format**: `type(scope): description` or `type: description`

4. **Create pull request:**
   - Check if a PR already exists for the current branch: `gh pr view --head CURRENT_BRANCH --repo "$REPO"`
   - If a PR already exists, display the URL and stop (do not create a duplicate PR)
   - Push current branch to origin with upstream tracking: `git push -u origin "$(git branch --show-current)"`
   - Create PR with comprehensive description using this template:

```
gh pr create --title "type(scope): description" --body "$(cat <<'EOF'
## Summary

[1-2 sentence overview of what this PR accomplishes and why]

## Changes Made

### What Changed
- [Specific change 1]
- [Specific change 2]
- [Specific change 3]

### Why These Changes
[Brief explanation of the motivation and context]

### How It Works
[High-level technical approach, if complex]

## Testing

### Tests Added/Modified
- [Test 1 description]
- [Test 2 description]

### Manual Testing Performed
- [ ] [Test scenario 1]
- [ ] [Test scenario 2]
- [ ] [Test scenario 3]

### Test Results
- All tests passing: [yes/no]
- Test coverage: [percentage or N/A]

## Review Guidance

### Where to Start
1. Start with [file/component] to understand [key concept]
2. Then review [file/component] for [specific logic]
3. Pay special attention to [area of concern]

### Focus Areas
- [Area 1]: [Why it needs attention]
- [Area 2]: [Why it needs attention]

## Related Links

- Related PR: #[number] (if applicable)
- Documentation: [link] (if applicable)
- Design/Spec: [link] (if applicable)

## Security Considerations

[Note any security implications, dependency changes, or "None" if not applicable]

## Breaking Changes

[Describe any breaking changes or "None"]

---

Closes #ISSUE_NUMBER
EOF
)" --head CURRENT_BRANCH --base "$BASE_BRANCH" --repo "$REPO"
```

5. **Confirm success:**
   - Display the created PR URL
   - Remind reviewer of key focus areas

**IMPORTANT:**
- **PR title format**: `type(scope): description` (standard Conventional Commits)
- **Issue reference**: Goes in the PR body only (`Closes #ISSUE`), NOT in the title
- **Scope is optional**: Include only when meaningful
- **Keep it focused**: PR should address a single issue/feature
- **Provide context**: Help reviewers understand what, why, and how
- **Guide reviewers**: Tell them where to start and what to focus on
- **Link properly**: Use closing keywords to auto-link issues (Closes #ISSUE in body)
- **Security check**: Note any dependency changes or security implications
- **Be specific**: Use concrete examples and details in descriptions
- **No AI attribution**: NEVER add "Generated with Claude Code" or similar

**Closing Keywords (case insensitive):**
- close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved
- Syntax: `KEYWORD #ISSUE-NUMBER` (e.g., "Closes #10", "Fixes: #10", "RESOLVES #10")
- Multiple issues: use full syntax for each (e.g., "Resolves #10, resolves #123")
- Issue will be automatically closed when PR is merged into the default branch
- Keywords work in both PR descriptions and commit messages
