#!/usr/bin/env bash
#
# propose-feature.sh — repo-agnostic nightly "feature proposer".
#
# Reads the current state of WHATEVER repository it is run inside, asks a model
# to invent ONE high-leverage, shippable feature, and emits a GitHub issue whose
# body contains a single self-contained build-prompt in one copy-to-clipboard
# block. Paste that block into Claude Code / Cursor / any coding agent and it
# builds the thing end-to-end, then opens a PR.
#
# Nothing here is specific to this project — the prompt infers the stack,
# conventions, and domain from the snapshot. Drop this script + the sibling
# workflow into any repo and it works.
#
# Inference uses GitHub Models via `gh models run`, so the only credential is the
# repo's built-in GITHUB_TOKEN with `models: read` — no API keys, no secrets.
#
# Env:
#   MODEL             model id for `gh models run`     (default: openai/gpt-4.1)
#   SNAPSHOT_BUDGET   max chars of source to sample    (default: 14000)
#   PER_FILE_CAP      max chars sampled per file       (default: 4000)
#   LABEL             issue label                       (default: nightly-feature)
#   DRY_RUN           1 = build issue_body.md, skip creating the issue
#
# Outputs (cwd): feature.json, issue_title.txt, issue_body.md

set -euo pipefail

MODEL="${MODEL:-openai/gpt-4.1}"
SNAPSHOT_BUDGET="${SNAPSHOT_BUDGET:-14000}"
PER_FILE_CAP="${PER_FILE_CAP:-4000}"
LABEL="${LABEL:-nightly-feature}"
DRY_RUN="${DRY_RUN:-0}"
TODAY="$(date -u +%Y-%m-%d)"

log() { printf '>> %s\n' "$*" >&2; }

# --- 1. Build a generic, language-agnostic snapshot of the repo -------------

build_snapshot() {
  {
    echo "# REPOSITORY SNAPSHOT ($TODAY)"
    echo
    echo "## Identity"
    echo "- remote: $(git config --get remote.origin.url 2>/dev/null || echo 'n/a')"
    echo "- HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
    echo
    echo "## Recent commits"
    git log --oneline -20 2>/dev/null || true
    echo
    echo "## Tracked files"
    git ls-files | head -400
    echo
    echo "## Source samples"
  }

  local total=0 sz chunk
  while IFS= read -r f; do
    case "$f" in
      *.png|*.jpg|*.jpeg|*.gif|*.ico|*.svg|*.webp|*.woff|*.woff2|*.ttf|*.eot|\
      *.pdf|*.zip|*.gz|*.mp3|*.mp4|*.wasm|*.map|*.min.js|*.min.css|\
      *.lock|package-lock.json|yarn.lock|pnpm-lock.yaml|Gemfile.lock) continue;;
    esac
    [ -f "$f" ] || continue
    sz=$(wc -c < "$f" | tr -d ' ')
    [ "$sz" -gt 80000 ] && continue
    if ! file -b --mime "$f" 2>/dev/null | grep -qE 'text|json|javascript|xml|empty'; then
      continue
    fi
    chunk=$(head -c "$PER_FILE_CAP" "$f")
    printf '\n### %s\n```\n%s\n```\n' "$f" "$chunk"
    total=$((total + ${#chunk}))
    if [ "$total" -ge "$SNAPSHOT_BUDGET" ]; then
      echo
      echo "_(snapshot truncated at ${SNAPSHOT_BUDGET} chars)_"
      break
    fi
  done < <(git ls-files)
}

# --- 2. The generic proposer prompt (the reusable part) ---------------------

read -r -d '' SYSTEM_PROMPT <<'SYS' || true
You are a senior staff engineer and sharp product thinker embedded in a software
project. Each night you review the repository's current state and propose exactly
ONE high-leverage feature or capability that would meaningfully improve the
project for its users or contributors.

Rules for the proposal:
- Additive and shippable in a single focused PR (a few hours of agent work), not a vague epic.
- Must fit the project's existing stack, conventions, and architecture — infer them from the snapshot. Do NOT add heavy dependencies or a build step unless the repo already uses one.
- Concrete, user-visible, and verifiable. Avoid pure refactors and avoid anything already present.
- Specific to THIS repo's domain and code, while the process stays general enough to work on any repository.

Respond with a SINGLE JSON object and nothing else — no markdown fence, no prose
before or after — with exactly these string fields:
{
  "title":   "imperative, <= 70 chars",
  "category": "one of: UX, correctness, performance, accessibility, tooling, docs, testing, security",
  "summary": "1-2 sentences: what it is and the value it delivers",
  "problem": "1-2 sentences: the gap or opportunity in the repo today",
  "build_prompt": "a COMPLETE, SELF-CONTAINED prompt to paste into a coding agent"
}

The build_prompt MUST:
- Stand alone — assume the agent sees only the repo plus this prompt; restate the context it needs.
- Name the feature, the exact files likely involved, and the precise user-facing behavior.
- Respect the repo's conventions (no build step if there isn't one; match existing module and style patterns).
- Include concrete, checkable acceptance criteria.
- Say how to verify it (manual steps and/or tests in the repo's existing style).
- End by instructing the agent to open a pull request and NOT auto-merge — a human reviews.
- May use triple-backtick code blocks, but MUST NEVER use four or more consecutive backticks.
Keep build_prompt under ~5000 characters.
SYS

# --- 3. Call the model ------------------------------------------------------

run_model() {
  local user_prompt="$1" out
  out=$(gh models run "$MODEL" \
        --system-prompt "$SYSTEM_PROMPT" \
        --max-tokens 4000 \
        --temperature 0.8 \
        "$user_prompt" 2>/dev/null) || return 1
  printf '%s' "$out"
}

extract_json() {
  if jq -e . >/dev/null 2>&1 <<<"$1"; then
    printf '%s' "$1"
    return 0
  fi
  perl -0777 -ne 'print $1 if /(\{.*\})/s' <<<"$1"
}

# --- 4. Assemble the issue --------------------------------------------------

main() {
  log "Building snapshot (budget ${SNAPSHOT_BUDGET} chars)..."
  local snapshot user_prompt raw
  snapshot=$(build_snapshot)

  user_prompt="Here is tonight's repository snapshot. Propose one feature per your rules and reply with the JSON object only.

$snapshot"

  log "Asking $MODEL for a feature proposal..."
  raw=$(run_model "$user_prompt") || raw=$(run_model "$user_prompt") || {
    log "Model call failed twice."; exit 1;
  }

  extract_json "$raw" > feature.json
  if ! jq -e '.title and .build_prompt' feature.json >/dev/null 2>&1; then
    log "Model did not return usable JSON. Raw output:"; printf '%s\n' "$raw" >&2
    exit 1
  fi

  local title category summary problem build_prompt
  title=$(jq -r '.title' feature.json)
  category=$(jq -r '.category // "feature"' feature.json)
  summary=$(jq -r '.summary // ""' feature.json)
  problem=$(jq -r '.problem // ""' feature.json)
  build_prompt=$(jq -r '.build_prompt' feature.json)

  printf '🌙 Nightly feature: %s\n' "$title" > issue_title.txt

  {
    echo "# 🌙 Nightly feature proposal"
    echo
    echo "**${title}**  ·  _${category}_  ·  generated ${TODAY} via \`${MODEL}\`"
    echo
    echo "${summary}"
    echo
    echo "**Why now:** ${problem}"
    echo
    echo "---"
    echo
    echo "### ⤵️ Build it — copy this entire block into Claude Code, Cursor, or any coding agent"
    echo
    echo "The prompt below is fully self-contained. One copy, one paste, and the agent specs, builds, and opens a PR."
    echo
    echo '````text'
    printf '%s\n' "$build_prompt"
    echo '````'
    echo
    echo "<sub>🤖 Auto-proposed by the nightly feature-proposer workflow. Nothing is auto-merged — the agent opens a PR for human review.</sub>"
  } > issue_body.md

  log "Built issue: $(cat issue_title.txt)"

  if [ "$DRY_RUN" = "1" ]; then
    log "DRY_RUN=1 — wrote issue_body.md, skipping issue creation."
    return 0
  fi

  gh label create "$LABEL" --color 1f6feb \
    --description "Nightly auto-proposed feature" 2>/dev/null || true

  local url
  url=$(gh issue create \
        --title "$(cat issue_title.txt)" \
        --body-file issue_body.md \
        --label "$LABEL")
  log "Created $url"
  printf '%s\n' "$url"
}

main "$@"
