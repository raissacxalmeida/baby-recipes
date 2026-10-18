---
name: start-task
description: Use when starting any new task in baby-recipes (feature, fix, chore), before brainstorming, planning or writing code, so the work happens on its own BR-{N} branch cut from an up-to-date master.
---

# Starting a Task

## Overview

Every task gets its own branch named `BR-{N}`, cut from the latest master. N is one more than the highest `BR-N` that already exists, locally or on the remote. There is no counter file: the branches are the counter.

## Steps

1. **Check the working tree is clean:** `git status --porcelain` prints nothing. If it prints anything, stop and tell the user what is uncommitted. Do not stash, commit or carry changes onto the new branch.
2. **Fetch:** `git fetch --prune origin`, so branches that only exist on the remote are counted.
3. **Update master:** `git checkout master && git merge --ff-only origin/master`.
4. **Pick the number:**

   ```bash
   git branch -a --format='%(refname:short)' \
     | sed 's#^origin/##' \
     | grep -E '^BR-[0-9]+$' \
     | sed 's/^BR-//' | sort -n | tail -1
   ```

   N is that number plus one. If it prints nothing, N is 1.
5. **Create the branch:** `git checkout -b BR-{N}`.
6. **Report** the branch name in one line.

## If something fails

If the fetch or the fast-forward fails (no network, master has diverged from the remote), stop and report the error. Never branch from a stale or diverged master to keep going.

## Not part of this skill

Do not push the branch. It only exists locally until the user decides to push.
