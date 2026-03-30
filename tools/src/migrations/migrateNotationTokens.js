import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DELIMITERS = new Set(["→", ",", "(", ")", "⟦", "⟧", "[", "]", "¬", "-"]);
const NOTATION_KEYS = new Set(["notation", "notation_string"]);

function migrateToken(token) {
  if (!token) return token;
  let out = token;
  out = out.replace(/^Nds(?=$|[₀-₉0-9ₙn])/, "N");
  out = out.replace(/^Au(?=$|[₀-₉0-9ₙn])/, "A");
  return out;
}

function migrateNotationString(notation) {
  const src = String(notation || "");
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (DELIMITERS.has(ch) || /\s/.test(ch)) {
      out += ch;
      i += 1;
      continue;
    }

    const start = i;
    while (i < src.length && !DELIMITERS.has(src[i]) && !/\s/.test(src[i])) {
      i += 1;
    }
    const token = src.slice(start, i);
    out += migrateToken(token);
  }
  return out;
}

function migrateObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => migrateObject(entry));
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const [key, val] of Object.entries(value)) {
      if (NOTATION_KEYS.has(key) && typeof val === "string") {
        next[key] = migrateNotationString(val);
      } else {
        next[key] = migrateObject(val);
      }
    }
    return next;
  }
  return value;
}

async function migrateJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  const migrated = migrateObject(parsed);
  await fs.writeFile(filePath, `${JSON.stringify(migrated, null, 2)}\n`, "utf-8");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const root = path.resolve(__dirname, "../../../");
    args.push("data/stories.json", "data/articles.sample.json");
    for (let i = 0; i < args.length; i += 1) {
      args[i] = path.resolve(root, args[i]);
    }
  }
  for (const arg of args) {
    const target = path.resolve(process.cwd(), arg);
    await migrateJsonFile(target);
    console.log(`migrated ${target}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
