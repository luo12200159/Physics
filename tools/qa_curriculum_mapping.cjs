const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
vm.createContext(context);
for (const file of ['curriculum-taxonomy.js', 'curriculum-mapping.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const mapping = context.PHYSICS_CURRICULUM_MAPPING;
const grade8 = mapping.resolve({ grade: '八年级', topic: '平均速度',
  curriculumBook: '八年级上册', curriculumChapter: '机械运动', curriculumSection: '测量平均速度' });
assert.equal(grade8.curriculumReviewStatus, 'catalog-exact');
assert.deepEqual(Array.from(grade8.curriculumSectionIds), ['pep-g8-1-c01-s04']);
assert.equal(grade8.curriculumVersion, 'pep-junior-legacy-catalog');

const grade9 = mapping.resolve({ grade: '九年级', topic: '欧姆定律',
  curriculumBook: '九年级全一册', curriculumChapter: '欧姆定律', curriculumSection: '欧姆定律' });
assert.deepEqual(Array.from(grade9.curriculumSectionIds), ['pep-g9-c05-s02']);
assert.deepEqual(Array.from(mapping.resolve({ grade: '八年级',
  modelDefinitionId: 'g8-original-template-001', topic: '机械运动' }).curriculumSectionIds),
['pep-g8-1-c01-s04']);
assert.deepEqual(Array.from(mapping.resolve({ grade: '高一',
  modelDefinitionId: 'h1-original-template-000', topic: '匀变速直线运动' }).curriculumSectionIds),
['pep-h-2019-required-1-c02-s02']);
assert.equal(mapping.resolve({ grade: '高二', modelDefinitionId: 'h2-original-template-000',
  topic: '静电场', curriculumBook: '选择性必修第三册',
  curriculumChapter: '静电场' }).curriculumReviewStatus, 'unresolved');
assert.deepEqual(Array.from(mapping.resolve({ grade: '高二', modelDefinitionId: 'h2-original-template-000',
  topic: '静电场', curriculumBook: '必修第三册',
  curriculumChapter: '静电场及其应用' }).curriculumSectionIds), ['pep-h-required-3-c01-s02']);

const high1 = mapping.resolve({ grade: '高一', topic: '匀变速直线运动',
  curriculumSectionIds: ['pep-h-2019-required-1-c02-s02'] });
assert.equal(high1.curriculumReviewStatus, 'catalog-exact');
assert.equal(high1.curriculumVersion, 'pep-high-2019');

const broad = mapping.resolve({ grade: '八年级', topic: '机械运动',
  curriculumBook: '八年级上册', curriculumChapter: '机械运动' });
assert.equal(broad.curriculumReviewStatus, 'unresolved');
assert.equal(broad.curriculumSectionIds.length, 0);
assert.ok(broad.mappingReason);

const conflicting = mapping.resolve({ grade: '九年级', topic: '欧姆定律',
  curriculumSectionIds: ['pep-g8-1-c01-s04'] });
assert.equal(conflicting.curriculumReviewStatus, 'unresolved',
  'a valid section ID in another grade cannot be silently assigned');
console.log('qa_curriculum_mapping: passed');
