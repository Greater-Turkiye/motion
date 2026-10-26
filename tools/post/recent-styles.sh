#!/usr/bin/env bash
# The styles of a channel's last four videos, newest first, comma-joined ("B,B,A"), read from the
# metadata file each release carries (generate.mjs --meta). generate.mjs --recent takes it, so the next
# video takes a style none of them used (config/styles.yaml; owner, 2026-10-26).
#   tools/post/recent-styles.sh video-    # the Turkish channel's releases
#   tools/post/recent-styles.sh gt-       # @greaterturkiye
prefix="${1:?usage: recent-styles.sh <tag prefix>}"
dir=$(mktemp -d)
out=()
for tag in $(gh release list --limit 60 --json tagName --jq "[.[]|select(.tagName|startswith(\"$prefix\"))][0:4][].tagName"); do
  rm -f "$dir"/*.json
  gh release download "$tag" --dir "$dir" --pattern 'auto-*.json' --clobber 2>/dev/null || continue
  f=$(ls "$dir"/*.json 2>/dev/null | head -1); [ -n "$f" ] || continue
  s=$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(m.style||"")' "$f")
  [ -n "$s" ] && out+=("$s")
done
rm -rf "$dir"
(IFS=,; echo "${out[*]}")
