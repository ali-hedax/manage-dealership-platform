#!/usr/bin/env bash
# The only way Claude Code may merge a pull request (see .claude/settings.json):
# the PR must target `rebuild`, be open, and have every check passed on its current head.
# Merges into main stay with the owner.
set -euo pipefail
REPO=ali-hedax/manage-dealership-platform
pr="${1:?usage: merge-into-rebuild.sh <pr-number>}"
[[ "$pr" =~ ^[0-9]+$ ]] || { echo "Refused: give a PR number only" >&2; exit 2; }
q() { gh pr view "$pr" --repo "$REPO" --json baseRefName,state,headRefOid,statusCheckRollup --jq "$1"; }
base=$(q .baseRefName); state=$(q .state); head=$(q .headRefOid)
[ "$base" = rebuild ] || { echo "Refused: PR #$pr targets '$base'; only 'rebuild' is allowed" >&2; exit 3; }
[ "$state" = OPEN ] || { echo "Refused: PR #$pr is $state" >&2; exit 4; }
total=$(q ".statusCheckRollup | length")
bad=$(q '[.statusCheckRollup[] | (.conclusion // .state) | select(. != "SUCCESS" and . != "SKIPPED" and . != "NEUTRAL")] | length')
[ "$total" -gt 0 ] && [ "$bad" -eq 0 ] || { echo "Refused: PR #$pr has $bad unfinished or failed checks (of $total)" >&2; exit 5; }
gh pr merge "$pr" --repo "$REPO" --merge --match-head-commit "$head"
echo "Merged PR #$pr into rebuild at head $head"
