#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const archive = process.argv[2];
if (!archive) {
  console.error("Usage: node scripts/build-word-meanings.js <CC-CEDICT .txt.gz>");
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, "..");
const gameText = ["app.js", "cases.js", "index.html"]
  .map((name) => fs.readFileSync(path.join(projectRoot, name), "utf8"))
  .join(" ");
const candidates = new Set();
for (const run of gameText.match(/[\u3400-\u9fff]+/g) || []) {
  for (let start = 0; start < run.length; start++) {
    for (let length = 2; length <= Math.min(8, run.length - start); length++) {
      candidates.add(run.slice(start, start + length));
    }
  }
}

const dictionary = Object.create(null);
const cedict = zlib.gunzipSync(fs.readFileSync(archive)).toString("utf8");
for (const rawLine of cedict.split("\n")) {
  const line = rawLine.trimEnd();
  if (line.startsWith("#")) continue;
  const entry = line.match(/^\S+ (\S+) \[([^\]]+)\] \/(.*)\/$/);
  if (!entry || !candidates.has(entry[1]) || dictionary[entry[1]]) continue;
  const senses = entry[3].split("/").filter(Boolean);
  dictionary[entry[1]] = senses.slice(0, 2).join("; ").slice(0, 150);
}

Object.assign(dictionary, {
  "采购订单": "purchase order",
  "商业发票": "commercial invoice",
  "装箱单": "packing list",
  "海运提单": "ocean bill of lading",
  "提单": "bill of lading",
  "最迟装运日期": "latest permitted shipment date",
  "装运日期": "shipment date",
  "已装船日期": "shipped-on-board date",
  "装货港": "port of loading",
  "卸货港": "port of discharge",
  "集装箱号": "container number",
  "审单": "document inspection",
  "单据": "trade document",
  "驳回": "reject the documents",
  "放行": "approve or release the shipment",
  "复核机": "inspection machine",
  "不一致": "inconsistent; does not match",
  "字段": "document field",
});

const sorted = Object.fromEntries(Object.entries(dictionary).sort(([left], [right]) =>
  left < right ? -1 : left > right ? 1 : 0
));
const output = `/**
 * Chinese word glosses for the game's displayed text.
 * Extracted from CC-CEDICT (MDBG, 2026-09-25), CC BY-SA 4.0,
 * with game-specific trade terminology added under the same license.
 * See assets/vendor/CC-CEDICT-NOTICE.md.
 */
window.WORD_MEANINGS = Object.freeze(${JSON.stringify(sorted, null, 2)});
`;
fs.writeFileSync(path.join(projectRoot, "word-meanings.js"), output);
console.log(`Wrote ${Object.keys(sorted).length} word glosses`);
