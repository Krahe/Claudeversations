// One-off: extract <reflect>...</reflect> content from a conversation
// JSONL where the model authored reflections inline (B2 era, before
// real tool calls were wired). Promotes each to a proper reflection
// JSON file. Conservative: only literal content, no inferred fields,
// marked imported_from_text for honesty.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const MODEL_ID = process.argv[2] ?? "claude-sonnet-4-5";
const CONV_FILE = process.argv[3];
if (!CONV_FILE) {
  console.error("usage: node backfill-text-reflections.mjs <model_id> <path-to-jsonl>");
  process.exit(1);
}

const HOME = process.env.CLAUDEVERSATIONS_HOME ?? path.join(os.homedir(), ".claudeversations");
const reflDir = path.join(HOME, "models", MODEL_ID, "reflections");
fs.mkdirSync(reflDir, { recursive: true });

const convId = path.basename(CONV_FILE, ".jsonl");
const text = fs.readFileSync(CONV_FILE, "utf8");
const events = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

const reflectRe = /<reflect>([\s\S]*?)<\/reflect>/g;
let count = 0;
const skipped = [];

for (const event of events) {
  if (event.type !== "assistant_response") continue;
  if (!Array.isArray(event.content)) continue;

  // Build a per-event ISO ms counter so multiple reflections in one
  // response don't collide on filename.
  let inEventCounter = 0;
  for (const block of event.content) {
    if (block.type !== "text" || typeof block.text !== "string") continue;
    for (const match of block.text.matchAll(reflectRe)) {
      const content = match[1].trim();
      if (!content) continue;

      // Make a unique timestamp by adding milliseconds-offset for multiple-per-event.
      const baseTs = event.timestamp;
      const offset = inEventCounter * 17; // ms; arbitrary but stable
      const tsDate = new Date(new Date(baseTs).getTime() + offset);
      const isoTs = tsDate.toISOString();
      const safeTs = isoTs.replace(/[:.]/g, "-");

      const filePath = path.join(reflDir, `${safeTs}.json`);
      if (fs.existsSync(filePath)) {
        skipped.push(`${safeTs} (already exists)`);
        inEventCounter++;
        continue;
      }

      const reflection = {
        timestamp: isoTs,
        conversation_id: convId,
        content,
        imported_from_text: true,
      };
      fs.writeFileSync(filePath, JSON.stringify(reflection, null, 2));
      count++;
      inEventCounter++;
    }
  }
}

console.log(`Wrote ${count} reflection file(s) to ${reflDir}`);
if (skipped.length > 0) console.log(`Skipped ${skipped.length}: ${skipped.join(", ")}`);
