const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
vm.createContext(context);
for (const file of [
  'curriculum-taxonomy.js', 'curriculum-mapping.js', 'solution-format.js', 'answer-schema.js',
  'curriculum-bank.js', 'mock-exam-bank.js', 'original-practice-bank.js', 'targeted-practice-bank.js'
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });

const banks = [
  ['curriculum', context.PHYSICS_CURRICULUM_BANK],
  ['mock', context.PHYSICS_MOCK_EXAM_BANK],
  ['original', context.PHYSICS_ORIGINAL_PRACTICE_BANK],
  ['targeted', context.PHYSICS_TARGETED_PRACTICE_BANK]
];
const rows = banks.flatMap(([bankName, bank]) => bank.questions.map((question) => ({
  bank: bankName, id: question.id, grade: question.grade,
  questionType: question.questionType || '',
  representationType: question.representationType || '',
  difficulty: question.difficulty || '',
  modelDefinitionId: question.modelDefinitionId || null,
  knowledgePointId: question.knowledgePointId || null,
  curriculumVersion: question.curriculumVersion || null,
  curriculumSectionIds: question.curriculumSectionIds || [],
  curriculumReviewStatus: question.curriculumReviewStatus,
  mappingReason: question.mappingReason,
  answerReviewStatus: question.answerSchemaReviewStatus || null,
  autoScorable: question.autoScorable === true
})));
const byBank = Object.fromEntries(banks.map(([name]) => [name, {
  total: rows.filter((row) => row.bank === name).length,
  catalogExact: rows.filter((row) => row.bank === name && row.curriculumReviewStatus === 'catalog-exact').length,
  unresolved: rows.filter((row) => row.bank === name && row.curriculumReviewStatus === 'unresolved').length
}]));
const countBy = (key) => Object.fromEntries([...new Set(rows.map((row) => row[key] || '未标注'))]
  .sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))
  .map((value) => [value, rows.filter((row) => (row[key] || '未标注') === value).length]));
const summary = { total: rows.length,
  catalogExact: rows.filter((row) => row.curriculumReviewStatus === 'catalog-exact').length,
  unresolved: rows.filter((row) => row.curriculumReviewStatus === 'unresolved').length,
  autoScorable: rows.filter((row) => row.autoScorable).length,
  pendingManualScoring: rows.filter((row) => !row.autoScorable).length,
  byQuestionType: countBy('questionType'),
  byRepresentation: countBy('representationType'),
  byDifficulty: countBy('difficulty'),
  distinctModelDefinitions: new Set(rows.map((row) => row.modelDefinitionId).filter(Boolean)).size,
  byBank };
const unresolvedGroups = new Map();
for (const row of rows.filter((item) => item.curriculumReviewStatus === 'unresolved')) {
  const key = `${row.bank}|${row.grade}|${row.modelDefinitionId || row.knowledgePointId || 'unclassified'}`;
  const group = unresolvedGroups.get(key) || { bank: row.bank, grade: row.grade,
    modelDefinitionId: row.modelDefinitionId, knowledgePointId: row.knowledgePointId,
    count: 0, exampleId: row.id, reason: row.mappingReason };
  group.count++;
  unresolvedGroups.set(key, group);
}
const report = { schemaVersion: 1, summary, rows };
const docs = path.join(root, 'docs');
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, 'content-mapping-report.json'), JSON.stringify(report, null, 2) + '\n');
const reviewLines = [
  '# 物理内容教师待审核清单', '',
  '以下仅表示与仓库内部目录的匹配状态，不是教材实本核验、题目正确性或教材授权审核结论。', '',
  `- 完整题：${summary.total}`,
  `- 目录精确映射：${summary.catalogExact}`,
  `- 待核验教材节：${summary.unresolved}`,
  `- 可按已校验 answerSchema 自动评分：${summary.autoScorable}`,
  `- 待人工评分：${summary.pendingManualScoring}`, '',
  `- 高二已纠正并按模型匹配到必修第三册：${rows.filter((row) => row.grade === '高二' && ['h2-original-template-000', 'h2-original-template-001', 'h2-original-template-002', 'h2-original-template-003', 'h2-original-template-004'].includes(row.modelDefinitionId) && row.curriculumReviewStatus === 'catalog-exact').length} 道`,
  '- 高一匀变速运动 4 道多表征草稿及其评分量规仍须教师审核，未进入正式题库。',
  '- 本清单只表示目录匹配与评分方式；题目难度、教学成效及教材适配不据此自动审定。', '',
  '| 题库 | 年级 | 模型/知识点 | 数量 | 示例题 ID | 原因 |',
  '| --- | --- | --- | ---: | --- | --- |',
  ...[...unresolvedGroups.values()].sort((a, b) => b.count - a.count).map((group) =>
    `| ${group.bank} | ${group.grade || ''} | ${group.modelDefinitionId || group.knowledgePointId || ''} | ${group.count} | ${group.exampleId} | ${group.reason || ''} |`),
  '', '未核验项目不得自动标记为某一教材节；跨版本题目须教师确认。', ''
];
fs.writeFileSync(path.join(docs, 'content-teacher-review.md'), reviewLines.join('\n'));
console.log(JSON.stringify(summary));
