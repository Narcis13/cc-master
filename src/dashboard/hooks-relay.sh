#!/bin/bash
# Relays Claude Code hook events to the monitoring dashboard event stream.
# Receives JSON on stdin, appends to events.jsonl with timestamp and job ID.
# Installed to ~/.cc-agent/hooks/relay-event.sh by `cc-agent dashboard --setup-hooks`

set -e

EVENTS_FILE="${HOME}/.cc-agent/events.jsonl"
INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
EVENT_NAME=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
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

# Build event JSON
EVENT=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg sid "$SESSION_ID" \
  --arg event "$EVENT_NAME" \
  --arg tool "$TOOL_NAME" \
  --arg job "$JOB_ID" \
  --arg cwd "$CWD" \
  --argjson raw "$INPUT" \
  '{
    timestamp: $ts,
    session_id: $sid,
    event_type: $event,
    tool_name: $tool,
    job_id: $job,
    cwd: $cwd,
    data: $raw
  }')

# Append to events file (atomic append)
echo "$EVENT" >> "$EVENTS_FILE"
