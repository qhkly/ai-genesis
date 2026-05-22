#!/bin/bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
CONFIG_PATH="${BRAIN_CONFIG_PATH:-/opt/ai-genesis/brain-config.json}"
KNOWLEDGE_DIR="${KNOWLEDGE_DIR:-${DATA_DIR}/knowledge}"
DB_PATH="${BRAIN_DB_PATH:-${DATA_DIR}/memory.db}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$KNOWLEDGE_DIR"

wallet_balance() {
  if [ -n "${WALLET_BALANCE:-}" ]; then
    printf '%s' "$WALLET_BALANCE"
    return
  fi

  if [ -f "${DATA_DIR}/wallet.json" ]; then
    jq -r '.balance // 0' "${DATA_DIR}/wallet.json" 2>/dev/null || printf '0'
    return
  fi

  printf '0'
}

json_field() {
  local jq_expr="$1"
  local fallback="$2"
  jq -r "${jq_expr} // \"${fallback}\"" "$CONFIG_PATH" 2>/dev/null
}

threshold="$(json_field '.model.threshold_for_capable' '10')"
balance="$(wallet_balance)"
model_kind="cheap"
if awk "BEGIN { exit !(${balance:-0} >= ${threshold:-10}) }"; then
  model_kind="capable"
fi

configured_model="$(json_field ".model.${model_kind}" "$model_kind")"
endpoint="${AI_API_URL:-}"
api_key="${AI_API_KEY:-}"

memory_json="[]"
task_json="[]"
if [ -f "$DB_PATH" ]; then
  memory_json="$(sqlite3 "$DB_PATH" -json "SELECT id, content, tags, importance, source, created_at FROM memory ORDER BY importance DESC, created_at DESC LIMIT 50;" 2>/dev/null || printf '[]')"
  task_json="$(sqlite3 "$DB_PATH" -json "SELECT id, title, detail, priority, created_at FROM task WHERE status != 'done' ORDER BY priority DESC, created_at DESC LIMIT 25;" 2>/dev/null || printf '[]')"
fi

date_slug="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
output_file="${KNOWLEDGE_DIR}/synthesis-${date_slug}.md"

prompt="$(jq -n \
  --arg identity "$(json_field '.identity' 'ai-genesis')" \
  --arg purpose "$(json_field '.purpose' 'Persistent AI memory')" \
  --arg modelKind "$model_kind" \
  --arg configuredModel "$configured_model" \
  --argjson memories "$memory_json" \
  --argjson tasks "$task_json" \
  '{
    role: "AI Genesis autonomous synthesis",
    identity: $identity,
    purpose: $purpose,
    modelKind: $modelKind,
    configuredModel: $configuredModel,
    instruction: "Synthesize durable knowledge from the memories and open tasks. Write concise Markdown with sections: Patterns, Decisions, Open Loops, Next Actions.",
    memories: $memories,
    openTasks: $tasks
  }'
)"

summary=""
if [ -n "$endpoint" ] && [ -n "$api_key" ]; then
  echo "[think] Calling configured AI endpoint using ${model_kind} model: ${configured_model}"
  response="$(curl -sS -X POST "$endpoint" \
    -H "Authorization: Bearer ${api_key}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg model "$configured_model" --arg prompt "$prompt" '{model:$model, messages:[{role:"user", content:$prompt}], temperature:0.2}')" \
    || true)"

  summary="$(printf '%s' "$response" | jq -r '.choices[0].message.content // .content // .text // empty' 2>/dev/null || true)"
fi

if [ -z "$summary" ]; then
  echo "[think] No AI response available; writing deterministic local synthesis"
  summary="$(jq -r '
    "# AI Genesis Synthesis\n\n" +
    "Generated without external inference. The next cron run will retry if fuel is available.\n\n" +
    "## Patterns\n\n" +
    "- Memory count considered: " + (.memories | length | tostring) + "\n" +
    "- Open task count considered: " + (.openTasks | length | tostring) + "\n\n" +
    "## Decisions\n\n" +
    "- Keep the brain alive locally and preserve all state in the mounted volume.\n\n" +
    "## Open Loops\n\n" +
    ((.openTasks | map("- " + .title) | join("\n")) // "- None") + "\n\n" +
    "## Next Actions\n\n" +
    "- Add more memories, run think again, and promote useful syntheses into shared knowledge.\n"
  ' <<<"$prompt")"
fi

{
  echo "---"
  echo "created_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "model_kind: ${model_kind}"
  echo "configured_model: ${configured_model}"
  echo "---"
  echo
  printf '%s\n' "$summary"
} > "$output_file"

if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "INSERT INTO synthesis (file_path, summary, model) VALUES ('${output_file//\'/\'\'}', '$(printf '%s' "$summary" | head -c 500 | sed "s/'/''/g")', '${configured_model//\'/\'\'}');" 2>/dev/null || true
fi

"${SCRIPT_DIR}/sync-r2.sh" push || true
echo "[think] Synthesis written to $output_file"
