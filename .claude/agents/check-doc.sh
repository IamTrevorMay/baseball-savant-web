#!/usr/bin/env bash
# Verify a specialist-brain reference doc against .claude/agents/BUILD.md.
# Usage: check-doc.sh <agent> <file>...   e.g. check-doc.sh Li Li/entity-resolution/*.md
# Checks contract structure locally; --links additionally probes every Source URL.

AGENT="$1"; shift
CHECK_LINKS=0
LIGHT=0
# Flags may appear in any order before the file list.
while :; do
  case "$1" in
    --links) CHECK_LINKS=1; shift ;;
    --light) LIGHT=1; shift ;;
    *) break ;;
  esac
done

# Tiers. "standard" is the original contract; "light" is the reduced-depth tier
# (see BUILD.md § Doc tiers) — same structure, less length and fewer sources.
if [ "$LIGHT" = "1" ]; then
  MAX_BYTES=15872; MIN_BYTES=9000; MIN_SRC=10; MAX_SRC=14; TIER="light"
else
  MAX_BYTES=22528; MIN_BYTES=15000; MIN_SRC=17; MAX_SRC=24; TIER="standard"
fi

case "$AGENT" in
  Jo) GOOD="measured|documented|inferred|folklore" ;;
  Li) GOOD="established|computed|estimated|folk-sabermetrics" ;;
  Cas) GOOD="verified|documented|inferred|cargo-cult" ;;
  *) echo "unknown agent: $AGENT"; exit 1 ;;
esac
ALL="measured|documented|inferred|folklore|established|computed|estimated|folk-sabermetrics|verified|cargo-cult"

for f in "$@"; do
  [ -f "$f" ] || { echo "MISSING FILE: $f"; continue; }
  probs=()
  bytes=$(wc -c < "$f" | tr -d ' ')
  [ "$bytes" -gt "$MAX_BYTES" ] && probs+=("oversize ${bytes}B > ${MAX_BYTES} (${TIER})")
  [ "$bytes" -lt "$MIN_BYTES" ] && probs+=("suspiciously small ${bytes}B < ${MIN_BYTES} (${TIER})")

  grep -q '^title:'   "$f" || probs+=("no title:")
  grep -q '^domain:'  "$f" || probs+=("no domain:")
  grep -q '^sources_reviewed:' "$f" || probs+=("no sources_reviewed:")
  grep -q '^last_updated:'     "$f" || probs+=("no last_updated:")

  # Block form:  tags:\n  - a\n  - b     Inline form:  tags: [a, b]
  # Both are valid YAML; count whichever the doc uses.
  tags=$(awk '/^tags:/{f=1;next} /^[a-z_]+:/{f=0} f&&/^ *- /' "$f" | wc -l | tr -d ' ')
  if [ "$tags" = "0" ]; then
    tags=$(grep -m1 '^tags: *\[' "$f" | sed 's/^tags: *\[//; s/\] *$//' | tr ',' '\n' | grep -c '[^[:space:]]')
  fi
  { [ "$tags" -lt 6 ] || [ "$tags" -gt 8 ]; } && probs+=("tags=$tags (want 6-8)")

  grep -q '^## TL;DR' "$f" || probs+=("no TL;DR")
  tldr=$(awk '/^## TL;DR/{f=1;next} /^## /{f=0} f&&/^- /' "$f" | wc -l | tr -d ' ')
  { [ "$tldr" -lt 8 ] || [ "$tldr" -gt 12 ]; } && probs+=("TL;DR bullets=$tldr (want 8-12)")

  grep -qi 'What Triton should do, in order' "$f" || probs+=("no 'What Triton should do, in order'")
  grep -qi 'Anti-recommendation' "$f" || probs+=("no Anti-recommendation")
  grep -q  '^## Sources' "$f" || probs+=("no Sources section")
  grep -qi 'Triton-internal evidence' "$f" || probs+=("no Triton-internal evidence")

  # grade vocabulary: flag any grade belonging to another agent
  bad=$(grep -oE "\(($ALL)\)" "$f" | sort -u | grep -vE "\(($GOOD)\)" | tr '\n' ' ')
  [ -n "$bad" ] && probs+=("foreign grades: $bad")

  # Cross-agent handoffs are cited by path (e.g. `Jo/data-reliability/`). A doc that points at a
  # domain directory which does not exist sends the reader nowhere, and no link probe catches it.
  while read -r ref; do
    [ -z "$ref" ] && continue
    [ -d "$ref" ] || probs+=("dead cross-reference: $ref")
  done < <(grep -oE '\b(Jo|Li|Cas|Soto)/[a-z0-9-]+/' "$f" | sort -u)

  n_src=$(awk '/^## Sources/{f=1;next} /^## /{f=0} f' "$f" | grep -cE 'https?://')
  { [ "$n_src" -lt "$MIN_SRC" ] || [ "$n_src" -gt "$MAX_SRC" ]; } && probs+=("sources=$n_src (want ${MIN_SRC}-${MAX_SRC}, ${TIER})")

  if [ ${#probs[@]} -eq 0 ]; then
    printf "PASS  %-58s %6sB  %2d src\n" "$(basename "$f")" "$bytes" "$n_src"
  else
    printf "FAIL  %-58s %6sB  %2d src\n" "$(basename "$f")" "$bytes" "$n_src"
    for p in "${probs[@]}"; do echo "        - $p"; done
  fi

  if [ "$CHECK_LINKS" = "1" ]; then
    awk '/^## Sources/{f=1;next} /^## /{f=0} f' "$f" \
      | perl -ne 'while(m{\]\((https?://(?:[^()\s]|\([^()\s]*\))*)\)}g){print "$1\n"}' | sort -u \
      | while read -r u; do
          c=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 12 -A 'Mozilla/5.0' "$u" 2>/dev/null)
          # 403/401/429 are anti-bot, not dead. 000 = DNS/TLS failure.
          # 203 = bot-mitigation interstitial (pubmed.ncbi.nlm.nih.gov serves one): the body is a
          # challenge page, not the article, so the URL is neither confirmed alive nor confirmed
          # dead from here. Report it, do not silently pass it.
          case "$c" in
            200|301|302|403|401|406|429|202) ;;
            000) echo "        UNVERIFIABLE[net-blocked] $u" ;;
            203) echo "        UNVERIFIABLE[bot-challenge] $u" ;;
            *) echo "        DEAD[$c] $u" ;;
          esac
        done
  fi
done
