const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const context = vm.createContext({
  window: {},
  document: { addEventListener() {} },
  console,
  setTimeout,
  clearTimeout
});

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(project, file), "utf8"), context, { filename: file });
}

load("curriculum-bank.js");
load("mock-exam-bank.js");
load("original-practice-bank.js");
load("targeted-practice-bank.js");
load("exam-question-index.js");
load("app.js");

const seedQuestions = vm.runInContext("seedQuestions", context);
const groups = [
  ["seed", seedQuestions],
  ["curriculum", context.window.PHYSICS_CURRICULUM_BANK.questions],
  ["mock", context.window.PHYSICS_MOCK_EXAM_BANK.questions],
  ["original", context.window.PHYSICS_ORIGINAL_PRACTICE_BANK.questions],
  ["targeted", context.window.PHYSICS_TARGETED_PRACTICE_BANK.questions]
];
const incomplete = groups.flatMap(([collection, questions]) => questions
  .filter((question) => {
    return !question.resourceOnly
      && question.fullTextIncluded !== false
      && String(question.content || "").trim()
      && String(question.solution || "").trim()
      && String(question.answer || "").trim()
      && question.solution.split(/\r?\n/).filter((line) => line.trim()).length < 3;
  })
  .map((question) => ({
    collection,
    id: question.id,
    grade: question.grade,
    title: question.title,
    solution: question.solution
  })));

console.log(JSON.stringify({
  incompleteCount: incomplete.length,
  byCollection: Object.fromEntries(groups.map(([name]) => [
    name,
    incomplete.filter((item) => item.collection === name).length
  ])),
  questions: incomplete
}, null, 2));
