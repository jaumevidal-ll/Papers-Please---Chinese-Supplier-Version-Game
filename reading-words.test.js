const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { splitChineseRun } = require("./reading-words.js");

const meanings = {
  对照: "compare against",
  采购: "procure",
  订单: "order",
  采购订单: "purchase order",
  检查: "inspect",
  商业: "commercial",
  发票: "invoice",
  商业发票: "commercial invoice",
  海运: "ocean shipping",
  提单: "bill of lading",
  海运提单: "ocean bill of lading",
  不一: "to vary",
  不一致: "inconsistent",
  一致: "consistent",
};

test("keeps trade document terms together for word hover", () => {
  assert.deepEqual(splitChineseRun("对照采购订单检查商业发票", meanings), [
    "对照",
    "采购订单",
    "检查",
    "商业发票",
  ]);
  assert.deepEqual(splitChineseRun("海运提单", meanings), ["海运提单"]);
});

test("uses shorter known words inside an unknown segment", () => {
  assert.deepEqual(splitChineseRun("不一致", { 一致: "consistent" }), ["不", "一致"]);
});

test("prefers the full meaning of inconsistent over the shorter word", () => {
  assert.deepEqual(splitChineseRun("不一致", meanings), ["不一致"]);
});

test("falls back to individual characters when no word is defined", () => {
  assert.deepEqual(splitChineseRun("莱万特", meanings), ["莱", "万", "特"]);
});

test("uses game-specific meanings for important inspection language", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync("word-meanings.js", "utf8"), context);
  assert.deepEqual(
    splitChineseRun("找出不一致的字段", context.window.WORD_MEANINGS),
    ["找出", "不一致", "的", "字段"]
  );
  assert.match(context.window.WORD_MEANINGS["不一致"], /inconsistent/i);
  assert.match(context.window.WORD_MEANINGS["字段"], /field/i);
});
