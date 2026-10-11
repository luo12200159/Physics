"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "learning-engine.js"), "utf8");
let settleWrite;
const repository = {
  getItem: () => null,
  stageLearningState: () => new Promise((resolve, reject) => { settleWrite = { resolve, reject }; })
};
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp,
  String, Number, Boolean, PhysicsStudioStorageRepository: repository };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "learning-engine.js" });

(async () => {
  const engine = context.PHYSICS_LEARNING_ENGINE;
  const returned = engine.saveState(engine.defaultState());
  assert.ok(returned && typeof returned === "object" && typeof returned.then !== "function",
    "旧同步调用仍须得到规范化 state，而不是意外取得 Promise");
  assert.equal(typeof engine.awaitLastSave, "function", "业务界面须能等待存储事务完成");
  let status = "pending";
  const committed = engine.awaitLastSave().then((result) => {
    status = "saved";
    return result;
  });
  await Promise.resolve();
  assert.equal(status, "pending", "请求发起不能显示已保存");
  settleWrite.resolve({ saved: true, revision: "r-committed" });
  const result = await committed;
  assert.equal(result.revision, "r-committed");

  engine.saveState(engine.defaultState());
  const failed = engine.awaitLastSave();
  settleWrite.reject(new Error("quota full"));
  await assert.rejects(failed, /quota full/);
  console.log("qa_save_commit_v402: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
