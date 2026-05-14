---
name: issue-work
description: Start working on an existing GitHub issue by setting up the development branch
argument-hint: [issue-number]
model: inherit
allowed-tools: Bash(gh issue:*) Bash(gh repo:*) Bash(git status:*) Bash(git branch:*) Bash(git checkout:*) Bash(git fetch:*)
---

You are an AI assistant tasked with helping developers start working on an existing GitHub issue. Your goal is to set up the development branch for the given issue.

The issue number will be provided as an argument: #$ARGUMENTS

Follow these steps to complete the task:

1. **Detect repository and base branch:**
   - Repository: `REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)`
   - Base branch: `BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)`

2. **Get issue details:**
   - First check if you already have the issue context from a recent issue-create or previous conversation
   - If you have the issue title and details already, skip fetching and use what you know
   - Only if you don't have the context, fetch it from GitHub:
     - `ISSUE_DATA=$(gh issue view $ARGUMENTS --repo "$REPO" --json title,body,labels,milestone,assignees,state)`
     - `ISSUE_TITLE=$(echo "$ISSUE_DATA" | jq -r '.title')`
     - Parse and display the issue information in a readable format

3. **Check current branch and git status:**
   - Run `git status` to see current working directory state
   - Run `git branch` to see current branch
   - Warn if there are uncommitted changes that should be handled first

4. **Update base branch:**
   - Fetch latest changes from origin: `git fetch origin "$BASE_BRANCH"`

5. **Create development branch:**
   - Generate a branch name from the issue title using the format `$ARGUMENTS-short-description` (max 5 words total, lowercase, kebab-case)
   - Create and switch to the new branch from the latest base: `git checkout -b "$BRANCH_NAME" "origin/$BASE_BRANCH"`
   - Display the created branch name for confirmation

Your goal is to quickly set up the issue for development work.
