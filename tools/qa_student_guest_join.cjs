const fs = require('fs');

const shell = fs.readFileSync('experience-shell.js', 'utf8');
const client = fs.readFileSync('classroom-client.js', 'utf8');
const routes = fs.readFileSync('server/src/modules/invites/routes.ts', 'utf8');
const contracts = fs.readFileSync('server/src/modules/invites/contracts.ts', 'utf8');
const service = fs.readFileSync('server/src/modules/invites/service.ts', 'utf8');
const repository = fs.readFileSync('server/src/modules/invites/repository.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`[student-guest-join] ${message}`);
}

const rendererStart = shell.lastIndexOf('function renderClassroomLogin(status, disabled)');
const formStart = shell.indexOf('id="classroomStudentJoinForm"', rendererStart);
const formEnd = shell.indexOf('</form>', formStart);
assert(rendererStart >= 0 && formStart >= 0 && formEnd > formStart, 'guest join form is missing');
const guestForm = shell.slice(formStart, formEnd);
assert(!/name="(?:login|password|deviceName)"/.test(guestForm), 'guest join must not ask for login/password/device name');
assert(/data-classroom-join-code/.test(guestForm), 'invite code input is missing');
assert(/classroomInviteQrInput/.test(guestForm), 'QR input is missing');
assert(/displayName|备注名|昵称/.test(guestForm), 'student remark name input is missing');
assert(/join-anonymous/.test(client), 'client must call anonymous invite join endpoint');
assert(/JoinInviteAnonymousRequestSchema/.test(contracts), 'anonymous join request contract is missing');
assert(/join-anonymous/.test(routes), 'anonymous join route is missing');
assert(!/app\.authenticate[^\n]*join-anonymous/.test(routes), 'anonymous join route must not require bearer authentication');
assert(/insertActiveMembership/.test(service) && /status = "active"|status = 'active'/.test(repository), 'invite join must activate a student membership');
assert(/updateDisplayName/.test(client) && /PATCH/.test(client), 'student remark-name update is missing');
assert(/async function joinClassByInviteCode\(/.test(shell), 'manual and QR join must share one business function');
const joinHelperStart = shell.indexOf('async function joinClassByInviteCode(');
const joinHelperEnd = shell.indexOf('\n  }', joinHelperStart);
const joinHelper = shell.slice(joinHelperStart, joinHelperEnd);
assert(/parseInvitePayload/.test(joinHelper) && /client\.joinInvite/.test(joinHelper), 'shared join helper must parse and submit the invite');
assert(/client\.joinInvite\(\{ code: rawPayload,/.test(joinHelper),
  'shared join helper must preserve the QR server/class payload when submitting');
assert(/decodeClassroomInviteQr\(file\)[\s\S]{0,500}joinClassByInviteCode/.test(shell), 'QR image result must enter the shared join flow');
assert(/startClassroomQrCamera[\s\S]{0,2500}joinClassByInviteCode/.test(shell), 'camera result must enter the shared join flow');
assert(/function invitePayloadFromQr\(/.test(shell), 'QR parsing must preserve the structured join payload');
assert(/return parsed\?\.serverUrl \|\| parsed\?\.classId \? value : parsed\?\.code/.test(shell),
  'QR parsing must not discard the teacher server address before the shared join flow');
assert(/data-classroom-action="delete-class"/.test(shell), 'teacher class detail must provide a real delete action');
assert(/client\.deleteClass/.test(shell), 'delete action must call the server-backed class client');
assert(/filter\(\(\[value\]\)\s*=>\s*value !== "parent"/.test(shell), 'parent role must not be offered in onboarding');
assert(/normalized\.role === "parent"/.test(shell), 'legacy parent role migration is missing');

console.log('qa_student_guest_join: PASS');
