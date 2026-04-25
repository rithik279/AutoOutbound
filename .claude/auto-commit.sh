#!/bin/bash
# Auto-commit any staged/modified tracked files after every Edit or Write tool use.
INPUT=$(cat)

# Extract the file path from the hook JSON (handles new files too)
FILE=$(echo "$INPUT" | node -e '
let d="";
process.stdin.on("data",c=>d+=c);
process.stdin.on("end",()=>{
  try { process.stdout.write(JSON.parse(d).tool_input.file_path || ""); }
  catch(e) { process.stdout.write(""); }
});
' 2>/dev/null)

# Stage all tracked modifications
git add -u 2>/dev/null || true

# Also stage the specific file if it is new/untracked
if [ -n "$FILE" ]; then
  git add "$FILE" 2>/dev/null || true
fi

# Commit only if something is staged
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "auto: save changes" 2>/dev/null || true
fi
