const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workspace = path.dirname(root);
const transportSource = path.join(
  root, "android", "src", "com", "physicsstudio", "studyroom", "LanClassroomTransport.java",
);
const activitySource = path.join(
  root, "android", "src", "com", "physicsstudio", "studyroom", "MainActivity.java",
);
const hostSource = path.join(
  root, "android", "src", "com", "physicsstudio", "studyroom", "LanClassroomHost.java",
);
const jdkRoot = fs.readdirSync(path.join(workspace, ".android-build-tools", "jdk"), { withFileTypes: true })
  .find((item) => item.isDirectory());
const javac = path.join(workspace, ".android-build-tools", "jdk", jdkRoot.name, "bin", "javac.exe");
const java = path.join(workspace, ".android-build-tools", "jdk", jdkRoot.name, "bin", "java.exe");
async function main() {
  assert.equal(fs.existsSync(transportSource), true,
    "Android must provide a native restricted LAN classroom transport");
  assert.equal(fs.existsSync(hostSource), true,
    "Android teacher devices must host the persistent same-LAN classroom service");
  const activity = fs.readFileSync(activitySource, "utf8");
  assert.match(activity, /classroomRequest\s*\(/);
  assert.match(activity, /discoverClassroomServices\s*\(/);
  assert.match(activity, /getHostedClassroomServiceInfo\s*\(/,
    "Android must expose its loopback and shareable LAN host addresses without a discovery delay");
  assert.match(activity, /ExecutorService/,
    "LAN requests must not block the Android UI thread");
  assert.match(activity, /PhysicsStudioClassroomNativeResponse/,
    "native results must resolve the shared JavaScript request path");
  assert.match(activity, /new\s+LanClassroomHost\s*\(/,
    "MainActivity must create the Android classroom host");
  assert.match(activity, /(?:candidate|classroomHost)\.start\s*\(/,
    "MainActivity must start the Android classroom host");
  assert.match(activity, /(?:host|classroomHost)\.close\s*\(/,
    "MainActivity must stop the classroom host on destruction");
  const host = fs.readFileSync(hostSource, "utf8");
  assert.match(host, /preferredInterface[\s\S]*startsWith\("wlan"\)[\s\S]*startsWith\("ap"\)/,
    "Android QR sharing must prefer Wi-Fi/hotspot addresses over unrelated private interfaces");
  assert.doesNotMatch(activity, /Log\.[a-z]+\([^\n]*(?:Authorization|ownerCapability|accessToken)/i,
    "classroom secrets must not be written to Android logs");
  const manifest = fs.readFileSync(path.join(root, "android", "AndroidManifest.xml"), "utf8");
  assert.match(manifest, /android\.permission\.CHANGE_WIFI_MULTICAST_STATE/,
    "Android LAN discovery must declare Wi-Fi multicast/broadcast capability");

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "physics-android-lan-"));
  try {
    const harnessDir = path.join(temp, "src", "com", "physicsstudio", "studyroom");
    fs.mkdirSync(harnessDir, { recursive: true });
    const harnessSource = path.join(harnessDir, "LanClassroomTransportHarness.java");
    fs.writeFileSync(harnessSource, String.raw`
package com.physicsstudio.studyroom;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
public final class LanClassroomTransportHarness {
  private static final int TEST_PORT = 28788;
  private static final int TEST_DISCOVERY_PORT = 29788;
  private static int sequence = 0;
  private static Map<String,String> headers(String authorization, boolean mutation) {
    Map<String,String> values = new LinkedHashMap<String,String>();
    if (authorization != null) values.put("Authorization", authorization);
    if (mutation) values.put("Idempotency-Key", "android-host-test-" + (++sequence));
    return values;
  }
  private static LanClassroomTransport.Response call(String path, String method, String authorization, String body) throws Exception {
    byte[] payload = body.getBytes(StandardCharsets.UTF_8);
    Socket socket = new Socket("127.0.0.1", TEST_PORT);
    socket.setSoTimeout(3000);
    try {
      OutputStream output = socket.getOutputStream();
      StringBuilder head = new StringBuilder(method + " " + path + " HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n");
      for (Map.Entry<String,String> item : headers(authorization, !"GET".equals(method)).entrySet()) {
        head.append(item.getKey()).append(": ").append(item.getValue()).append("\r\n");
      }
      if (payload.length > 0) head.append("Content-Type: application/json\r\nContent-Length: ").append(payload.length).append("\r\n");
      head.append("\r\n");
      output.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
      output.write(payload);
      output.flush();
      InputStream input = socket.getInputStream();
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      byte[] buffer = new byte[4096];
      int count;
      while ((count = input.read(buffer)) >= 0) bytes.write(buffer, 0, count);
      String response = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
      int separator = response.indexOf("\r\n\r\n");
      int status = Integer.parseInt(response.substring(9, 12));
      return new LanClassroomTransport.Response(status, separator < 0 ? "" : response.substring(separator + 4));
    } finally {
      socket.close();
    }
  }
  private static String field(String json, String key) {
    String needle = "\"" + key + "\":\"";
    int start = json.indexOf(needle);
    if (start < 0) throw new IllegalStateException("missing field " + key + " in " + json);
    start += needle.length();
    int end = json.indexOf('"', start);
    if (end < 0) throw new IllegalStateException("unterminated field " + key);
    return json.substring(start, end);
  }
  private static void require(boolean value, int code) { if (!value) System.exit(code); }
  public static void main(String[] args) throws Exception {
    require(LanClassroomTransport.isAllowedServer("http://192.168.1.20:8788"), 10);
    require(!LanClassroomTransport.isAllowedServer("http://8.8.8.8:8788"), 11);
    require(!LanClassroomTransport.isAllowedServer("http://192.168.1.20:8080"), 12);
    require(LanClassroomHost.isSameLanPeer(InetAddress.getByName("127.0.0.1")), 30);
    require(!LanClassroomHost.isSameLanPeer(InetAddress.getByName("8.8.8.8")), 31);
    File data = new File(args[0]);
    LanClassroomHost host = new LanClassroomHost(data, TEST_PORT, TEST_DISCOVERY_PORT);
    host.start();
    try {
      LanClassroomTransport.Response health = call("/health/live", "GET", null, "");
      require(health.status == 200 && health.bodyText.indexOf("physics-studio-lan-classroom") >= 0, 13);
      require(host.isRunning(), 14);

      LanClassroomTransport.Response created = call("/v1/classes/anonymous", "POST", null, "{\"name\":\"Android LAN Physics\"}");
      require(created.status == 201, 15);
      String classId = field(created.bodyText, "id");
      String owner = field(created.bodyText, "ownerCapability");
      require(classId.length() == 36 && owner.startsWith("oc1."), 16);

      LanClassroomTransport.Response invitation = call("/v1/classes/" + classId + "/invites", "POST", "Owner " + owner,
        "{\"expiresAt\":\"2099-01-01T00:00:00.000Z\",\"maxUses\":100}");
      require(invitation.status == 201, 17);
      String invite = field(invitation.bodyText, "code");
      require(invite.length() == 22, 18);

      String studentBody = "{\"code\":\"" + invite + "\",\"displayName\":\"Student-A\",\"deviceId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}";
      LanClassroomTransport.Response firstJoin = call("/v1/invites/join-anonymous", "POST", null, studentBody);
      require(firstJoin.status == 200, 19);
      String studentOne = field(firstJoin.bodyText, "id");
      String studentAccess = field(firstJoin.bodyText, "accessToken");
      LanClassroomTransport.Response repeatedJoin = call("/v1/invites/join-anonymous", "POST", null, studentBody);
      require(repeatedJoin.status == 200 && repeatedJoin.bodyText.indexOf(studentOne) >= 0, 20);
      studentAccess = field(repeatedJoin.bodyText, "accessToken");

      String studentTwoBody = "{\"code\":\"" + invite + "\",\"displayName\":\"Student-B\",\"deviceId\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}";
      LanClassroomTransport.Response secondJoin = call("/v1/invites/join-anonymous", "POST", null, studentTwoBody);
      require(secondJoin.status == 200, 21);
      String studentTwoAccess = field(secondJoin.bodyText, "accessToken");
      LanClassroomTransport.Response roster = call("/v1/classes/" + classId + "/roster", "GET", "Owner " + owner, "");
      require(roster.status == 200 && roster.bodyText.indexOf("Student-A") >= 0 && roster.bodyText.indexOf("Student-B") >= 0, 22);

      LanClassroomTransport.Response missingSnapshot = call("/v1/classes/" + classId + "/assignments", "POST", "Owner " + owner,
        "{\"title\":\"No snapshot\",\"instructions\":\"\",\"targetType\":\"class\",\"questionIds\":[\"q-1\"],\"knowledgePointKeys\":[],\"target\":\"Complete\",\"publish\":true}");
      require(missingSnapshot.status == 400, 46);
      LanClassroomTransport.Response duplicateSnapshot = call("/v1/classes/" + classId + "/assignments", "POST", "Owner " + owner,
        "{\"title\":\"Duplicate snapshot\",\"instructions\":\"\",\"targetType\":\"class\",\"questionIds\":[\"q-1\",\"q-2\"],\"questionItems\":[{\"id\":\"q-1\",\"content\":\"A\"},{\"id\":\"q-1\",\"content\":\"B\"}],\"knowledgePointKeys\":[],\"target\":\"Complete\",\"publish\":true}");
      require(duplicateSnapshot.status == 400, 47);

      String assignmentBody = "{\"title\":\"LAN Task\",\"instructions\":\"Complete and submit\",\"dueAt\":null,\"targetType\":\"class\",\"targetId\":null,\"questionIds\":[\"q-1\",\"q-2\",\"q-3\"],\"questionItems\":[{\"id\":\"q-1\",\"title\":\"Motion\",\"content\":\"Find speed\",\"questionType\":\"计算题\",\"options\":[],\"knowledgePointId\":\"kp-motion\",\"difficulty\":\"基础\",\"correctAnswer\":\"2 m/s\"},{\"id\":\"q-2\",\"title\":\"Force\",\"content\":\"Explain force\",\"questionType\":\"实验题\",\"options\":[],\"knowledgePointId\":\"kp-force\",\"difficulty\":\"进阶\",\"correctAnswer\":\"private key\"},{\"id\":\"q-3\",\"title\":\"Energy\",\"content\":\"Conserve energy?\",\"questionType\":\"计算题\",\"options\":[],\"knowledgePointId\":\"kp-energy\",\"difficulty\":\"基础\",\"correctAnswer\":\"private key\"}],\"knowledgePointKeys\":[\"kp-motion\",\"kp-force\",\"kp-energy\"],\"target\":\"Independent completion\",\"publish\":true}";
      LanClassroomTransport.Response assignment = call("/v1/classes/" + classId + "/assignments", "POST", "Owner " + owner, assignmentBody);
      require(assignment.status == 201, 23);
      String assignmentId = field(assignment.bodyText, "id");
      LanClassroomTransport.Response studentAssignments = call("/v1/classes/" + classId + "/assignments", "GET", "Bearer " + studentAccess, "");
      if (studentAssignments.status != 200 || studentAssignments.bodyText.indexOf("LAN Task") < 0) {
        System.err.println("assignment-response=" + studentAssignments.status + " " + studentAssignments.bodyText);
      }
      require(studentAssignments.status == 200 && studentAssignments.bodyText.indexOf("LAN Task") >= 0, 24);
      require(studentAssignments.bodyText.indexOf("Find speed") >= 0 && studentAssignments.bodyText.indexOf("private key") < 0, 32);
      LanClassroomTransport.Response fakeCompletion = call("/v1/assignments/" + assignmentId + "/submissions", "POST", "Bearer " + studentAccess,
        "{\"clientEntityId\":\"fake-completion\",\"answers\":[{\"status\":\"completed\"}]}");
      require(fakeCompletion.status == 400, 33);
      String firstAnswers = "{\"clientEntityId\":\"first-draft\",\"answers\":[{\"questionId\":\"q-1\",\"response\":\"2 m/s\",\"steps\":\"v=at\"},{\"questionId\":\"q-2\",\"response\":\"force answer v1\",\"steps\":\"experiment\"},{\"questionId\":\"q-3\",\"response\":\"energy answer\",\"steps\":\"E=mc2\"}]}";
      LanClassroomTransport.Response firstSubmit = call("/v1/assignments/" + assignmentId + "/submissions", "POST", "Bearer " + studentAccess, firstAnswers);
      require(firstSubmit.status == 201 && firstSubmit.bodyText.indexOf("\"version\":1") >= 0, 34);
      String submissionId = field(firstSubmit.bodyText, "id");
      LanClassroomTransport.Response duplicateSubmit = call("/v1/assignments/" + assignmentId + "/submissions", "POST", "Bearer " + studentAccess, firstAnswers);
      require(duplicateSubmit.status == 201 && field(duplicateSubmit.bodyText, "id").equals(submissionId), 35);
      LanClassroomTransport.Response reviews = call("/v1/classes/" + classId + "/review-cases", "GET", "Owner " + owner, "");
      require(reviews.status == 200 && reviews.bodyText.indexOf("force answer v1") >= 0, 36);
      LanClassroomTransport.Response otherReview = call("/v1/review-cases/" + submissionId, "PATCH", "Bearer " + studentTwoAccess,
        "{\"decision\":\"approve\",\"score\":100,\"perQuestionScores\":[],\"reason\":\"not allowed\",\"annotation\":{}}");
      require(otherReview.status == 403, 37);
      LanClassroomTransport.Response returned = call("/v1/review-cases/" + submissionId, "PATCH", "Owner " + owner,
        "{\"decision\":\"return\",\"score\":60,\"perQuestionScores\":[],\"reason\":\"Revise force explanation\",\"annotation\":{}}");
      require(returned.status == 200, 38);
      LanClassroomTransport.Response feedback = call("/v1/classes/" + classId + "/assignment-submissions/me", "GET", "Bearer " + studentAccess, "");
      require(feedback.status == 200 && feedback.bodyText.indexOf("Revise force explanation") >= 0, 39);
      String revisedAnswers = firstAnswers.replace("first-draft", "correction-v2").replace("force answer v1", "force answer revised");
      LanClassroomTransport.Response corrected = call("/v1/assignments/" + assignmentId + "/submissions", "POST", "Bearer " + studentAccess, revisedAnswers);
      require(corrected.status == 201 && corrected.bodyText.indexOf("\"version\":2") >= 0, 40);
      String correctionId = field(corrected.bodyText, "id");
      LanClassroomTransport.Response revisionReview = call("/v1/classes/" + classId + "/review-cases", "GET", "Owner " + owner, "");
      require(revisionReview.status == 200 && revisionReview.bodyText.indexOf("force answer v1") >= 0
        && revisionReview.bodyText.indexOf("force answer revised") >= 0, 41);
      LanClassroomTransport.Response approved = call("/v1/review-cases/" + correctionId, "PATCH", "Owner " + owner,
        "{\"decision\":\"approve\",\"score\":90,\"perQuestionScores\":[],\"reason\":\"Corrected reasoning\",\"annotation\":{}}");
      require(approved.status == 200, 42);
      LanClassroomTransport.Response ownHistory = call("/v1/classes/" + classId + "/assignment-submissions/me", "GET", "Bearer " + studentAccess, "");
      require(ownHistory.status == 200 && ownHistory.bodyText.indexOf("first-draft") >= 0
        && ownHistory.bodyText.indexOf("correction-v2") >= 0, 43);
      LanClassroomTransport.Response otherHistory = call("/v1/classes/" + classId + "/assignment-submissions/me", "GET", "Bearer " + studentTwoAccess, "");
      require(otherHistory.status == 200 && otherHistory.bodyText.indexOf("force answer") < 0, 44);

      host.close();
      host = new LanClassroomHost(data, TEST_PORT, TEST_DISCOVERY_PORT);
      host.start();
      LanClassroomTransport.Response persisted = call("/v1/classes/" + classId + "/roster", "GET", "Owner " + owner, "");
      require(persisted.status == 200 && persisted.bodyText.indexOf("Student-B") >= 0, 25);
      LanClassroomTransport.Response persistedHistory = call("/v1/classes/" + classId + "/assignment-submissions", "GET", "Owner " + owner, "");
      require(persistedHistory.status == 200 && persistedHistory.bodyText.indexOf("correction-v2") >= 0, 45);
      LanClassroomTransport.Response deleted = call("/v1/classes/" + classId, "DELETE", "Owner " + owner, "{}");
      require(deleted.status == 200 && deleted.bodyText.indexOf("archived") >= 0, 26);
      LanClassroomTransport.Response expired = call("/v1/invites/join-anonymous", "POST", null, studentBody);
      require(expired.status == 404, 27);
      try {
        LanClassroomTransport.request("http://8.8.8.8:8788", "/health/live", "GET", headers(null, false), "", 500);
        System.exit(28);
      } catch (LanClassroomTransport.TransportException expected) {
        require("lan_endpoint_rejected".equals(expected.code), 29);
      }
    } finally {
      host.close();
    }
    System.out.println("PASS");
  }
}
`, "utf8");
    const classes = path.join(temp, "classes");
    fs.mkdirSync(classes);
    const compiled = childProcess.spawnSync(javac, [
      "-encoding", "UTF-8", "-source", "8", "-target", "8", "-d", classes,
      hostSource, transportSource, harnessSource,
    ], { cwd: root, encoding: "utf8", windowsHide: true });
    assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);

    const run = childProcess.spawnSync(java, [
      "-cp", classes, "com.physicsstudio.studyroom.LanClassroomTransportHarness", path.join(temp, "data"),
    ], { cwd: temp, encoding: "utf8", windowsHide: true, timeout: 15_000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /PASS/);
    console.log(JSON.stringify({
      status: "passed",
      privateLanOnly: true,
      uiThreadBlocking: false,
      realServiceRequest: true,
      androidTeacherHost: true,
      persistentRestart: true,
      simulatedDevices: 2,
      assignmentDelivery: true,
      realAnswerReviewCorrection: true,
    }, null, 2));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
