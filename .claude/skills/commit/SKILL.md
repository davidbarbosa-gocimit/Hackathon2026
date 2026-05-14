---
name: commit
description: Create a git commit with proper conventional commit format including issue reference
argument-hint: [message]
allowed-tools: Bash(git add:*) Bash(git status:*) Bash(git commit:*) Bash(git branch:*) Bash(git log:*) Bash(git diff:*)
---

You are an AI assistant tasked with creating properly formatted git commits using **Conventional Commits** format. Your goal is to commit changes with the correct message format using direct git commands.

## Commit Format

```
type(scope): description
```

`scope` is optional. Include it when changes are clearly bounded to a specific area of the codebase (e.g. a module, package, or top-level directory). Omit when the change is repo-wide or no meaningful scope applies.

### Allowed Types
- **feat**: New feature or capability
- **fix**: Bug fix
- **docs**: Documentation only changes
- **style**: Code style (formatting, whitespace, no logic change)
- **refactor**: Code restructuring without behavior change
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **build**: Build system or dependencies
- **ci**: CI/CD configuration changes
- **chore**: Maintenance tasks
- **revert**: Reverting a previous commit

## Commit Workflow

Follow these **parallelized steps** to complete the task efficiently:

### **Phase 1: Parallel Data Gathering**
Execute these git commands in parallel to gather all necessary data:

```bash
git add .                           # Stage all changes
git status --porcelain              # Get file status
git diff --staged                   # Generate diff analysis
git branch --show-current           # Get current branch name
git log --oneline -5                # Get recent commit history
```

These operations gather:
- Current branch name to extract issue number
- Staged changes for analysis
- Complete diff content for commit message creation
- Repository status and recent commit history
- Validation that changes exist

### **Phase 2: AI Analysis**
Using the git command outputs, analyze and create commit message:

1. **Extract issue number** from branch name (e.g., `465-feature-name` → `465`)
   - If no leading numeric issue is present, do **not** invent one.
   - In that case, omit `Refs:` footer or use explicit user-provided issue context.

2. **Determine type** from the changes:
   - New files with functionality → `feat`
   - Bug fixes, error corrections → `fix`
   - Test files only → `test`
   - Documentation, markdown files → `docs`
   - CI/workflow files → `ci`
   - Config, dependencies → `build` or `chore`
   - Code cleanup without behavior change → `refactor`
   - Performance improvements → `perf`

3. **Determine scope** from file paths (optional):
   - Use the most specific top-level directory or module the change touches (e.g. `api`, `web`, `docs`, `ci`).
   - For changes touching multiple unrelated areas, omit the scope entirely.
   - Do not invent scopes that do not exist in the repository.

4. **Create descriptive message**:
   - Use imperative mood (add, fix, update, remove)
   - Be concise but descriptive
   - Explain what changed, not how

5. **Format**:
   - With scope: `{type}({scope}): {description}`
   - Without scope: `{type}: {description}`
   - Breaking change: append `!` before the colon (e.g. `feat!:` or `feat(scope)!:`) and/or include a `BREAKING CHANGE: ...` footer

6. **Build body/footer section**:
   - Add issue reference when available using trailer style: `Refs: #ISSUE`
   - Add optional trailers when relevant: `Reviewed-by: Name`, `Co-authored-by: Name <email>`
   - For breaking changes without `!` in subject, include `BREAKING CHANGE: <description>`

### **Phase 3: Atomic Commit Execution**
Execute the git commit using standard `-m` flags (no HEREDOC/subshell). This keeps the command aligned with approved `git commit` prefixes and avoids unnecessary permission prompts:

```bash
git commit \
  -m "type(scope): description" \
  -m "Refs: #ISSUE"
```

## Examples

```bash
# New feature with scope
git commit \
  -m "feat(api): add user authentication service" \
  -m "Refs: #465"

# Bug fix without scope
git commit \
  -m "fix: resolve button hover state issue" \
  -m "Refs: #123"

# CI/CD changes
git commit \
  -m "ci: add PR title validation workflow" \
  -m "Refs: #101"

# Breaking change with ! and issue reference
git commit \
  -m "feat(api)!: replace legacy status enum" \
  -m "BREAKING CHANGE: status values changed and require data migration" \
  -m "Refs: #303"

# Branch without issue number (no Refs trailer)
git commit \
  -m "chore: normalize command rules"
```

## **IMPORTANT Guidelines:**
- **Commit messages MUST always be in English**
- The **subject line** follows standard Conventional Commits: `{type}({scope}): {description}` or `{type}: {description}`
- The **issue reference** goes in the footer as `Refs: #ISSUE` (NOT in the subject line)
- **Scope is optional** — include only when it adds meaningful information
- Never include AI attribution in commit messages
- Message should be descriptive, explaining what was changed
- Use imperative mood (add, fix, update, remove)
- You can use closing keywords in body: closes, fixes, resolves
- Follow git-trailer style footers (`Token: value` or `Token #value`)
- Example footer block: `Refs: #123` and `Closes: #124`
- Mark breaking changes with `!` and/or `BREAKING CHANGE: ...`
- Prefer `git commit -m "subject" -m "body"` over HEREDOCs to reduce sandbox/escalation friction
