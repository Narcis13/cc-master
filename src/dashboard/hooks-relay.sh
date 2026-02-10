#!/bin/bash
# Relays Claude Code hook events to the monitoring dashboard event stream.
# Receives JSON on stdin, appends to events.jsonl with timestamp and job ID.
# On Stop/SessionEnd events, archives the full JSONL transcript alongside job files.
# Installed to ~/.cc-agent/hooks/relay-event.sh by `cc-agent dashboard --setup-hooks`

set -e

EVENTS_FILE="${HOME}/.cc-agent/events.jsonl"
JOBS_DIR="${HOME}/.cc-agent/jobs"
INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
EVENT_NAME=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Try to determine job ID from tmux session name
JOB_ID=""
TMUX_SESSION="${TMUX_PANE:-}"
if [ -n "$TMUX_SESSION" ]; then
  CURRENT_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null || true)
  if [[ "$CURRENT_SESSION" == cc-agent-* ]]; then
    JOB_ID="${CURRENT_SESSION#cc-agent-}"
  fi
fi

# Archive transcript on Stop or SessionEnd events
if [ -n "$JOB_ID" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  if [ "$EVENT_NAME" = "Stop" ] || [ "$EVENT_NAME" = "SessionEnd" ]; then
    DEST="${JOBS_DIR}/${JOB_ID}.session.jsonl"
    cp "$TRANSCRIPT_PATH" "$DEST" 2>/dev/null || true

    # Also copy any subagent transcripts if they exist
    SUBAGENT_DIR="${TRANSCRIPT_PATH%.jsonl}-subagents"
    if [ -d "$SUBAGENT_DIR" ]; then
      DEST_SUBAGENT_DIR="${JOBS_DIR}/${JOB_ID}-subagents"
      mkdir -p "$DEST_SUBAGENT_DIR" 2>/dev/null || true
      cp "$SUBAGENT_DIR"/*.jsonl "$DEST_SUBAGENT_DIR/" 2>/dev/null || true
    fi
  fi
fi

# Build event JSON
EVENT=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg sid "$SESSION_ID" \
  --arg event "$EVENT_NAME" \
  --arg tool "$TOOL_NAME" \
  --arg job "$JOB_ID" \
  --arg cwd "$CWD" \
  --arg transcript "$TRANSCRIPT_PATH" \
  --argjson raw "$INPUT" \
  '{
    timestamp: $ts,
    session_id: $sid,
    event_type: $event,
    tool_name: $tool,
    job_id: $job,
    cwd: $cwd,
    transcript_path: $transcript,
    data: $raw
  }')

# Append to events file (atomic append)
echo "$EVENT" >> "$EVENTS_FILE"
