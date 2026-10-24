package com.physicsstudio.studyroom;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.Deque;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Persistent same-LAN classroom host used by an Android teacher device.
 *
 * This is deliberately a small private-network HTTP service, not a general
 * embedded web server. It listens on the fixed classroom port, accepts only
 * /health/live and /v1 routes, limits request sizes, and never persists raw
 * owner capabilities, invite codes, access tokens, refresh tokens or device
 * identifiers. The corresponding native client additionally rejects public
 * IP literals and all non-classroom routes.
 */
final class LanClassroomHost implements Closeable {
    static final int SERVICE_PORT = 8788;
    static final int DISCOVERY_PORT = 18788;
    private static final int MAX_HEADER_BYTES = 16 * 1024;
    private static final int MAX_BODY_BYTES = 64 * 1024;
    private static final int MAX_STRING_BYTES = 1024 * 1024;
    private static final int MAX_COLLECTION_ITEMS = 10000;
    private static final int STATE_MAGIC = 0x5053434c;
    private static final int STATE_VERSION = 2;
    private static final String DISCOVERY_PREFIX = "PHYSICS_STUDIO_CLASSROOM_DISCOVER_V1:";
    private static final Pattern NONCE_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{8,80}$");
    private static final Pattern INVITE_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{22}$");
    private static final Pattern DEVICE_PATTERN = Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Object gate = new Object();
    private final File stateFile;
    private final File backupFile;
    private final int servicePort;
    private final int discoveryPort;
    private final Map<String, Deque<Long>> rateWindows = new HashMap<String, Deque<Long>>();
    private final ExecutorService workers = Executors.newFixedThreadPool(4);
    private State state;
    private volatile boolean running;
    private ServerSocket serverSocket;
    private DatagramSocket discoverySocket;
    private Thread acceptThread;
    private Thread discoveryThread;

    LanClassroomHost(File dataDirectory) throws IOException {
        this(dataDirectory, SERVICE_PORT, DISCOVERY_PORT);
    }

    /** Package-private custom ports exist only for deterministic JVM QA. */
    LanClassroomHost(File dataDirectory, int servicePort, int discoveryPort) throws IOException {
        if (dataDirectory == null) throw new IOException("classroom data directory is missing");
        if (servicePort < 1 || servicePort > 65535 || discoveryPort < 1 || discoveryPort > 65535) {
            throw new IOException("invalid classroom service port");
        }
        if (!dataDirectory.exists() && !dataDirectory.mkdirs()) {
            throw new IOException("classroom data directory cannot be created");
        }
        stateFile = new File(dataDirectory, "classroom-state-v1.bin");
        backupFile = new File(dataDirectory, "classroom-state-v1.backup.bin");
        this.servicePort = servicePort;
        this.discoveryPort = discoveryPort;
        state = loadState();
        if (isBlank(state.instanceId)) {
            state.instanceId = UUID.randomUUID().toString();
            saveLocked();
        }
    }

    void start() throws IOException {
        synchronized (gate) {
            if (running) return;
            ServerSocket nextServer = new ServerSocket();
            DatagramSocket nextDiscovery = null;
            try {
                nextServer.setReuseAddress(true);
                nextServer.bind(new InetSocketAddress(InetAddress.getByName("0.0.0.0"), servicePort));
                nextDiscovery = new DatagramSocket(null);
                nextDiscovery.setReuseAddress(true);
                nextDiscovery.bind(new InetSocketAddress(InetAddress.getByName("0.0.0.0"), discoveryPort));
            } catch (IOException error) {
                try { nextServer.close(); } catch (IOException ignored) { }
                if (nextDiscovery != null) nextDiscovery.close();
                throw error;
            }
            serverSocket = nextServer;
            discoverySocket = nextDiscovery;
            running = true;
            acceptThread = daemon("PhysicsStudioAndroidClassroomHost", new Runnable() {
                @Override public void run() { acceptLoop(); }
            });
            discoveryThread = daemon("PhysicsStudioAndroidClassroomDiscovery", new Runnable() {
                @Override public void run() { discoveryLoop(); }
            });
            acceptThread.start();
            discoveryThread.start();
        }
    }

    boolean isRunning() {
        return running;
    }

    private static Thread daemon(String name, Runnable action) {
        Thread thread = new Thread(action, name);
        thread.setDaemon(true);
        return thread;
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket socket = serverSocket.accept();
                socket.setSoTimeout(15000);
                workers.execute(new Runnable() {
                    @Override public void run() { handleSocket(socket); }
                });
            } catch (SocketException error) {
                if (running) pauseBriefly();
            } catch (IOException error) {
                if (running) pauseBriefly();
            }
        }
    }

    private static void pauseBriefly() {
        try { Thread.sleep(20); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
    }

    private void handleSocket(Socket socket) {
        try {
            InputStream input = new BufferedInputStream(socket.getInputStream());
            OutputStream output = new BufferedOutputStream(socket.getOutputStream());
            HttpResponse response;
            try {
                if (!isSameLanPeer(socket.getInetAddress())) {
                    throw new ClientError(403, "lan_peer_required", "学生设备必须与教师设备位于同一局域网。");
                }
                HttpRequest request = HttpRequest.read(input);
                response = route(request, socket.getInetAddress());
            } catch (ClientError error) {
                response = HttpResponse.error(error.status, error.code, error.getMessage());
            } catch (Exception error) {
                response = HttpResponse.error(500, "internal_error", "班级服务暂时无法处理该请求。");
            }
            response.write(output);
        } catch (IOException ignored) {
            // The peer disconnected. No credentials or request body are logged.
        } finally {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    private HttpResponse route(HttpRequest request, InetAddress remoteAddress) throws ClientError, IOException {
        if ("OPTIONS".equals(request.method)) return HttpResponse.empty(204);
        if ("/health/live".equals(request.path) && "GET".equals(request.method)) {
            Map<String, Object> health = object();
            health.put("status", "ok");
            health.put("service", "physics-studio-lan-classroom");
            health.put("protocolVersion", Integer.valueOf(1));
            return HttpResponse.json(200, health);
        }
        if (!request.path.startsWith("/v1/")) {
            throw new ClientError(404, "not_found", "请求的班级资源不存在。");
        }
        if (!"GET".equals(request.method) && !"HEAD".equals(request.method)) requireMutationKey(request);
        if (("/v1/classes/anonymous".equals(request.path)
            || "/v1/invites/join-anonymous".equals(request.path)) && "POST".equals(request.method)) {
            rateLimit(remoteAddress == null ? "unknown" : remoteAddress.getHostAddress());
        }

        String authorization = request.header("Authorization");
        String[] segment = request.path.substring(1).split("/");
        if ("/v1/classes/anonymous".equals(request.path) && "POST".equals(request.method)) {
            return HttpResponse.json(201, createClass(text(request.jsonBody(), "name")));
        }
        if ("/v1/invites/join-anonymous".equals(request.path) && "POST".equals(request.method)) {
            Map<String, Object> body = request.jsonBody();
            return HttpResponse.json(200, join(text(body, "code"), text(body, "displayName"), text(body, "deviceId")));
        }
        if ("/v1/auth/refresh".equals(request.path) && "POST".equals(request.method)) {
            return HttpResponse.json(200, refresh(text(request.jsonBody(), "refreshToken")));
        }
        if ("/v1/auth/logout".equals(request.path) && "POST".equals(request.method)) {
            logout(text(request.jsonBody(), "refreshToken"));
            return HttpResponse.empty(204);
        }
        if ("/v1/classes".equals(request.path) && "GET".equals(request.method)) {
            return HttpResponse.json(200, listClasses(authorization));
        }
        if ("/v1/account/self".equals(request.path) && "PATCH".equals(request.method)) {
            return HttpResponse.json(200, updateDisplayName(authorization, text(request.jsonBody(), "displayName")));
        }
        if (segment.length == 3 && "v1".equals(segment[0]) && "classes".equals(segment[1])) {
            String classId = segment[2].toLowerCase(Locale.ROOT);
            if ("GET".equals(request.method)) return HttpResponse.json(200, getClass(classId, authorization));
            if ("DELETE".equals(request.method)) return HttpResponse.json(200, archiveClass(classId, authorization));
        }
        if (segment.length == 4 && "v1".equals(segment[0]) && "classes".equals(segment[1])) {
            String classId = segment[2].toLowerCase(Locale.ROOT);
            if ("invites".equals(segment[3]) && "POST".equals(request.method)) {
                Map<String, Object> body = request.jsonBody();
                return HttpResponse.json(201, rotateInvite(classId, authorization,
                    text(body, "expiresAt"), integer(body, "maxUses")));
            }
            if ("roster".equals(segment[3]) && "GET".equals(request.method)) {
                return HttpResponse.json(200, listRoster(classId, authorization));
            }
            if ("groups".equals(segment[3]) && "GET".equals(request.method)) {
                return HttpResponse.json(200, listGroups(classId, authorization));
            }
            if ("groups".equals(segment[3]) && "POST".equals(request.method)) {
                return HttpResponse.json(201, createGroup(classId, authorization, text(request.jsonBody(), "name")));
            }
            if ("assignments".equals(segment[3]) && "GET".equals(request.method)) {
                return HttpResponse.json(200, listAssignments(classId, authorization));
            }
            if ("assignments".equals(segment[3]) && "POST".equals(request.method)) {
                return HttpResponse.json(201, createAssignment(classId, authorization, request.jsonBody()));
            }
            if ("review-cases".equals(segment[3]) && "GET".equals(request.method)) {
                return HttpResponse.json(200, listReviewCases(classId, authorization));
            }
            if ("assignment-submissions".equals(segment[3]) && "GET".equals(request.method)) {
                return HttpResponse.json(200, listClassSubmissions(classId, authorization));
            }
        }
        if (segment.length == 5 && "v1".equals(segment[0]) && "classes".equals(segment[1])) {
            String classId = segment[2].toLowerCase(Locale.ROOT);
            if ("assignment-submissions".equals(segment[3]) && "me".equals(segment[4])
                && "GET".equals(request.method)) {
                return HttpResponse.json(200, listOwnClassSubmissions(classId, authorization));
            }
            if ("learning".equals(segment[3]) && "summary".equals(segment[4]) && "GET".equals(request.method)) {
                return HttpResponse.json(200, emptyClassCollection(classId, authorization));
            }
            if ("learning".equals(segment[3])
                && ("sync".equals(segment[4]) || "exams".equals(segment[4]))
                && "POST".equals(request.method)) {
                return HttpResponse.json(200, acceptLearningSync(classId, authorization));
            }
            if ("learning".equals(segment[3]) && "report-snapshots".equals(segment[4])
                && "POST".equals(request.method)) {
                return HttpResponse.json(201, acceptLearningSync(classId, authorization));
            }
        }
        if (segment.length == 6 && "v1".equals(segment[0]) && "classes".equals(segment[1])
            && "learning".equals(segment[3]) && "report-snapshots".equals(segment[4])
            && "GET".equals(request.method)) {
            return HttpResponse.json(200, emptyClassCollection(segment[2].toLowerCase(Locale.ROOT), authorization));
        }
        if (segment.length == 3 && "v1".equals(segment[0]) && "memberships".equals(segment[1])
            && "PATCH".equals(request.method)) {
            return HttpResponse.json(200, updateMembership(segment[2].toLowerCase(Locale.ROOT), authorization, request.jsonBody()));
        }
        if (segment.length == 4 && "v1".equals(segment[0]) && "assignments".equals(segment[1])
            && "submissions".equals(segment[3]) && "POST".equals(request.method)) {
            return HttpResponse.json(201, submitAssignment(segment[2].toLowerCase(Locale.ROOT), authorization, request.jsonBody()));
        }
        if (segment.length == 5 && "v1".equals(segment[0]) && "assignments".equals(segment[1])
            && "submissions".equals(segment[3]) && "me".equals(segment[4]) && "GET".equals(request.method)) {
            return HttpResponse.json(200, listOwnAssignmentSubmissions(segment[2].toLowerCase(Locale.ROOT), authorization));
        }
        if (segment.length == 3 && "v1".equals(segment[0]) && "review-cases".equals(segment[1])
            && "PATCH".equals(request.method)) {
            return HttpResponse.json(200, decideReviewCase(segment[2].toLowerCase(Locale.ROOT), authorization, request.jsonBody()));
        }
        throw new ClientError(404, "not_found", "请求的班级资源不存在。");
    }

    private Map<String, Object> createClass(String name) throws ClientError, IOException {
        name = requiredText(name, "班级名称", 120);
        synchronized (gate) {
            long now = System.currentTimeMillis();
            String ownerRaw = "oc1." + randomBase64Url(32);
            ClassRecord record = new ClassRecord();
            record.id = UUID.randomUUID().toString();
            record.ownerUserId = UUID.randomUUID().toString();
            record.ownerCapabilityHash = sha256(ownerRaw);
            record.name = name;
            record.grade = "未设置";
            record.subject = "物理";
            record.status = "active";
            record.revision = 1;
            record.createdAt = now;
            record.updatedAt = now;
            state.classes.add(record);
            saveLocked();
            Map<String, Object> result = object();
            result.put("class", classJson(record));
            result.put("ownerUserId", record.ownerUserId);
            result.put("ownerCapability", ownerRaw);
            result.put("ownerCapabilityExpiresAt", iso(now + TimeUnit.DAYS.toMillis(3650)));
            return result;
        }
    }

    private Map<String, Object> getClass(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            ClassRecord record = activeClass(classId);
            requireClassAccess(record, authorization);
            return classJson(record);
        }
    }

    private Map<String, Object> archiveClass(String classId, String authorization) throws ClientError, IOException {
        synchronized (gate) {
            ClassRecord record = activeClass(classId);
            requireOwner(record, authorization);
            record.status = "archived";
            record.revision += 1;
            record.updatedAt = System.currentTimeMillis();
            for (InviteRecord invite : state.invites) if (classId.equals(invite.classId)) invite.active = false;
            for (MembershipRecord membership : state.memberships) {
                if (classId.equals(membership.classId)) membership.status = "removed";
            }
            saveLocked();
            Map<String, Object> result = object();
            result.put("id", record.id);
            result.put("status", record.status);
            return result;
        }
    }

    private Map<String, Object> rotateInvite(String classId, String authorization, String expiresAt, int maxUses)
        throws ClientError, IOException {
        long expiry = parseDate(expiresAt);
        if (expiry <= System.currentTimeMillis()) throw validation("邀请码有效期无效。");
        if (maxUses < 1 || maxUses > 1000) throw validation("邀请码使用次数无效。");
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            requireOwner(classroom, authorization);
            for (InviteRecord old : state.invites) if (classId.equals(old.classId)) old.active = false;
            String raw;
            String hash;
            do {
                raw = randomBase64Url(16);
                hash = sha256(raw);
            } while (findInviteHash(hash) != null);
            InviteRecord invite = new InviteRecord();
            invite.id = UUID.randomUUID().toString();
            invite.classId = classId;
            invite.codeHash = hash;
            invite.expiresAt = expiry;
            invite.maxUses = maxUses;
            invite.active = true;
            state.invites.add(invite);
            saveLocked();
            Map<String, Object> result = object();
            result.put("id", invite.id);
            result.put("code", raw);
            result.put("expiresAt", iso(expiry));
            result.put("maxUses", Integer.valueOf(maxUses));
            return result;
        }
    }

    private Map<String, Object> join(String inviteCode, String displayName, String deviceId)
        throws ClientError, IOException {
        inviteCode = requiredPattern(inviteCode, INVITE_PATTERN, "邀请码无效。");
        displayName = requiredText(displayName, "备注名", 80);
        deviceId = requiredPattern(deviceId, DEVICE_PATTERN, "设备标识无效。").toLowerCase(Locale.ROOT);
        synchronized (gate) {
            InviteRecord invite = findInviteHash(sha256(inviteCode));
            if (invite == null || !invite.active) throw notFound("invite_not_found", "邀请码无效。");
            ClassRecord classroom = findActiveClass(invite.classId);
            long now = System.currentTimeMillis();
            if (classroom == null || invite.expiresAt <= now || invite.useCount >= invite.maxUses) {
                invite.active = false;
                saveLocked();
                throw notFound("invite_not_found", "邀请码无效。");
            }
            String deviceHash = sha256(deviceId);
            StudentRecord student = null;
            for (StudentRecord item : state.students) {
                if (fixedEquals(item.deviceHash, deviceHash)) { student = item; break; }
            }
            if (student == null) {
                student = new StudentRecord();
                student.id = UUID.randomUUID().toString();
                student.deviceHash = deviceHash;
                student.createdAt = now;
                state.students.add(student);
            }
            student.displayName = displayName;
            MembershipRecord membership = findMembership(classroom.id, student.id);
            if (membership == null) {
                membership = new MembershipRecord();
                membership.id = UUID.randomUUID().toString();
                membership.classId = classroom.id;
                membership.studentId = student.id;
                membership.joinedAt = now;
                state.memberships.add(membership);
                invite.useCount += 1;
            }
            membership.displayName = displayName;
            membership.role = "student";
            membership.status = "active";
            String accessToken = "at1." + student.id + "." + randomBase64Url(32);
            String refreshToken = "r1." + student.id + "." + randomBase64Url(32);
            removeSessions(student.id);
            SessionRecord session = new SessionRecord();
            session.studentId = student.id;
            session.accessHash = sha256(accessToken);
            session.refreshHash = sha256(refreshToken);
            session.expiresAt = now + TimeUnit.DAYS.toMillis(30);
            state.sessions.add(session);
            saveLocked();
            return joinJson(classroom, student, membership, accessToken, refreshToken);
        }
    }

    private Map<String, Object> refresh(String refreshToken) throws ClientError, IOException {
        synchronized (gate) {
            SessionRecord session = findRefreshSession(sha256(refreshToken));
            if (session == null || session.expiresAt <= System.currentTimeMillis()) {
                throw new ClientError(401, "invalid_refresh_token", "登录已失效。");
            }
            StudentRecord student = student(session.studentId);
            String access = "at1." + student.id + "." + randomBase64Url(32);
            String refresh = "r1." + student.id + "." + randomBase64Url(32);
            session.accessHash = sha256(access);
            session.refreshHash = sha256(refresh);
            session.expiresAt = System.currentTimeMillis() + TimeUnit.DAYS.toMillis(30);
            saveLocked();
            return authJson(student, access, refresh);
        }
    }

    private void logout(String refreshToken) throws IOException {
        synchronized (gate) {
            String hash = sha256(refreshToken);
            for (int index = state.sessions.size() - 1; index >= 0; index -= 1) {
                if (fixedEquals(state.sessions.get(index).refreshHash, hash)) state.sessions.remove(index);
            }
            saveLocked();
        }
    }

    private Map<String, Object> listClasses(String authorization) throws ClientError {
        synchronized (gate) {
            StudentRecord student = requireStudent(authorization);
            List<Object> items = new ArrayList<Object>();
            for (MembershipRecord membership : state.memberships) {
                if (!student.id.equals(membership.studentId) || !"active".equals(membership.status)) continue;
                ClassRecord classroom = findActiveClass(membership.classId);
                if (classroom != null) items.add(classJson(classroom));
            }
            return listJson(items);
        }
    }

    private Map<String, Object> listRoster(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            requireOwner(classroom, authorization);
            List<Object> items = new ArrayList<Object>();
            for (MembershipRecord membership : state.memberships) {
                if (classId.equals(membership.classId) && !"removed".equals(membership.status)) {
                    items.add(membershipJson(membership));
                }
            }
            return listJson(items);
        }
    }

    private Map<String, Object> listGroups(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            requireClassAccess(classroom, authorization);
            List<Object> items = new ArrayList<Object>();
            for (GroupRecord group : state.groups) if (classId.equals(group.classId)) items.add(groupJson(group));
            return listJson(items);
        }
    }

    private Map<String, Object> createGroup(String classId, String authorization, String name)
        throws ClientError, IOException {
        name = requiredText(name, "分组名称", 80);
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            requireOwner(classroom, authorization);
            for (GroupRecord item : state.groups) {
                if (classId.equals(item.classId) && name.equalsIgnoreCase(item.name)) {
                    throw new ClientError(409, "group_name_conflict", "分组名称已存在。");
                }
            }
            GroupRecord group = new GroupRecord();
            group.id = UUID.randomUUID().toString();
            group.classId = classId;
            group.name = name;
            group.createdAt = System.currentTimeMillis();
            state.groups.add(group);
            saveLocked();
            return groupJson(group);
        }
    }

    private Map<String, Object> updateMembership(String membershipId, String authorization, Map<String, Object> body)
        throws ClientError, IOException {
        synchronized (gate) {
            MembershipRecord membership = findMembershipById(membershipId);
            if (membership == null) throw notFound("membership_not_found", "成员不存在。");
            ClassRecord classroom = activeClass(membership.classId);
            requireOwner(classroom, authorization);
            if (body.containsKey("status")) {
                String status = String.valueOf(body.get("status"));
                if (!"active".equals(status) && !"removed".equals(status)) throw validation("成员状态无效。");
                membership.status = status;
            }
            if (body.containsKey("groupId")) {
                membership.groupId = nullableText(body.get("groupId"), 36);
            }
            if (body.containsKey("studentNumber")) {
                membership.studentNumber = nullableText(body.get("studentNumber"), 40);
            }
            saveLocked();
            return membershipJson(membership);
        }
    }

    private Map<String, Object> updateDisplayName(String authorization, String displayName)
        throws ClientError, IOException {
        displayName = requiredText(displayName, "备注名", 80);
        synchronized (gate) {
            StudentRecord student = requireStudent(authorization);
            student.displayName = displayName;
            for (MembershipRecord membership : state.memberships) {
                if (student.id.equals(membership.studentId)) membership.displayName = displayName;
            }
            saveLocked();
            Map<String, Object> result = object();
            result.put("user", userJson(student));
            return result;
        }
    }

    private Map<String, Object> listAssignments(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            StudentRecord viewer = null;
            boolean owner = authorization != null && authorization.startsWith("Owner ");
            if (owner) requireOwner(classroom, authorization);
            else viewer = requireStudent(authorization);
            MembershipRecord membership = viewer == null ? null : findMembership(classId, viewer.id);
            if (!owner && (membership == null || !"active".equals(membership.status))) {
                throw new ClientError(403, "resource_forbidden", "无权访问该班级。");
            }
            List<Object> items = new ArrayList<Object>();
            for (AssignmentRecord assignment : state.assignments) {
                if (!classId.equals(assignment.classId)) continue;
                if (!owner && !assignment.published) continue;
                if (!owner && "group".equals(assignment.targetType)
                    && !equalsNullable(assignment.targetId, membership.groupId)) continue;
                if (!owner && "student".equals(assignment.targetType)
                    && !assignment.targetId.equals(membership.id) && !assignment.targetId.equals(viewer.id)) continue;
                items.add(assignmentJson(assignment));
            }
            return listJson(items);
        }
    }

    private Map<String, Object> createAssignment(String classId, String authorization, Map<String, Object> body)
        throws ClientError, IOException {
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            requireOwner(classroom, authorization);
            AssignmentRecord assignment = new AssignmentRecord();
            assignment.id = UUID.randomUUID().toString();
            assignment.classId = classId;
            assignment.title = requiredText(valueText(body.get("title")), "作业标题", 160);
            assignment.instructions = optionalText(body.get("instructions"), 30000);
            assignment.dueAt = body.get("dueAt") == null ? 0L : parseDate(valueText(body.get("dueAt")));
            assignment.targetType = valueText(body.get("targetType"));
            if (!"class".equals(assignment.targetType) && !"group".equals(assignment.targetType)
                && !"student".equals(assignment.targetType)) assignment.targetType = "class";
            assignment.targetId = nullableText(body.get("targetId"), 160);
            assignment.questionIds = stringList(body.get("questionIds"), 100, 160);
            if (new java.util.HashSet<String>(assignment.questionIds).size() != assignment.questionIds.size()) {
                throw validation("作业题目编号不得重复。");
            }
            assignment.knowledgePointKeys = stringList(body.get("knowledgePointKeys"), 100, 160);
            assignment.target = requiredText(valueText(body.get("target")), "达标条件", 1000);
            assignment.published = Boolean.TRUE.equals(body.get("publish"));
            if (assignment.published && assignment.questionIds.isEmpty()) {
                throw validation("发布作业前必须选择题目。");
            }
            Object suppliedItems = body.get("questionItems");
            if (assignment.published && (!(suppliedItems instanceof List<?>)
                || ((List<?>)suppliedItems).size() != assignment.questionIds.size())) {
                throw validation("发布作业前必须提供每道题的完整题干快照。");
            }
            if (suppliedItems instanceof List<?>) {
                List<?> items = (List<?>)suppliedItems;
                if (!items.isEmpty() && items.size() != assignment.questionIds.size()) throw validation("题目快照与题目编号不一致。");
                List<Object> checked = new ArrayList<Object>();
                List<String> seenIds = new ArrayList<String>();
                for (Object item : items) {
                    if (!(item instanceof Map<?,?>)) throw validation("题目快照无效。");
                    Map<?,?> question = (Map<?,?>)item;
                    String id = requiredText(valueText(question.get("id")), "题目编号", 160);
                    if (!assignment.questionIds.contains(id) || seenIds.contains(id)) throw validation("题目快照与题目编号不一致。");
                    seenIds.add(id);
                    requiredText(valueText(question.get("title")), "题目标题", 240);
                    requiredText(valueText(question.get("content")), "题干", 30000);
                    requiredText(valueText(question.get("questionType")), "题型", 80);
                    if (!(question.get("options") instanceof List<?>)) throw validation("题目选项格式无效。");
                    checked.add(item);
                }
                assignment.questionItemsJson = Json.stringify(checked);
            }
            assignment.createdAt = System.currentTimeMillis();
            state.assignments.add(assignment);
            saveLocked();
            return assignmentJson(assignment);
        }
    }

    private Map<String, Object> submitAssignment(String assignmentId, String authorization, Map<String, Object> body)
        throws ClientError, IOException {
        synchronized (gate) {
            AssignmentRecord assignment = findAssignment(assignmentId);
            if (assignment == null || !assignment.published) throw notFound("assignment_not_found", "作业不存在。");
            StudentRecord student = requireStudent(authorization);
            MembershipRecord membership = findMembership(assignment.classId, student.id);
            if (membership == null || !"active".equals(membership.status)) {
                throw new ClientError(403, "resource_forbidden", "无权提交该班级作业。");
            }
            if ("group".equals(assignment.targetType) && !equalsNullable(assignment.targetId, membership.groupId)
                || "student".equals(assignment.targetType) && !assignment.targetId.equals(membership.id)
                   && !assignment.targetId.equals(student.id)) {
                throw new ClientError(403, "resource_forbidden", "作业未下发给该学生。");
            }
            String clientEntityId = requiredText(valueText(body.get("clientEntityId")), "提交编号", 160);
            for (SubmissionRecord existing : state.submissions) {
                if (assignmentId.equals(existing.assignmentId) && student.id.equals(existing.studentId)
                    && clientEntityId.equals(existing.clientEntityId)) return submissionJson(existing);
            }
            Object rawAnswers = body.get("answers");
            if (!(rawAnswers instanceof List<?>)) throw validation("必须提交真实逐题作答。");
            List<?> answers = (List<?>)rawAnswers;
            if (assignment.questionIds.isEmpty() || answers.size() != assignment.questionIds.size()) {
                throw validation("必须完成作业中的每一道题。");
            }
            List<Object> canonicalAnswers = new ArrayList<Object>();
            List<String> seen = new ArrayList<String>();
            for (Object raw : answers) {
                if (!(raw instanceof Map<?,?>)) throw validation("逐题作答格式无效。");
                Map<?,?> answer = (Map<?,?>)raw;
                String questionId = requiredText(valueText(answer.get("questionId")), "题目编号", 160);
                if (!assignment.questionIds.contains(questionId) || seen.contains(questionId)) throw validation("逐题作答编号重复或不属于本作业。");
                seen.add(questionId);
                Map<String,Object> entry = object();
                entry.put("questionId", questionId);
                entry.put("response", requiredText(valueText(answer.get("response")), "作答内容", 30000));
                entry.put("steps", optionalText(answer.get("steps"), 30000));
                entry.put("startedAt", valueText(answer.get("startedAt")));
                entry.put("hintViewCount", answer.get("hintViewCount") instanceof Number ? answer.get("hintViewCount") : Integer.valueOf(0));
                canonicalAnswers.add(entry);
            }
            SubmissionRecord latest = null;
            for (SubmissionRecord existing : state.submissions) {
                if (assignmentId.equals(existing.assignmentId) && student.id.equals(existing.studentId)
                    && (latest == null || existing.version > latest.version)) latest = existing;
            }
            if (latest != null && !"returned".equals(latest.status)) {
                throw new ClientError(409, "submission_already_active", "教师退回后才能提交订正版本。");
            }
            SubmissionRecord submission = new SubmissionRecord();
            submission.id = UUID.randomUUID().toString();
            submission.assignmentId = assignmentId;
            submission.studentId = student.id;
            submission.clientEntityId = clientEntityId;
            submission.answersJson = Json.stringify(canonicalAnswers);
            submission.status = "submitted";
            submission.submittedAt = System.currentTimeMillis();
            submission.updatedAt = submission.submittedAt;
            submission.version = latest == null ? 1 : latest.version + 1;
            submission.previousSubmissionId = latest == null ? null : latest.id;
            state.submissions.add(submission);
            saveLocked();
            return submissionJson(submission);
        }
    }

    private Map<String, Object> listOwnClassSubmissions(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            activeClass(classId);
            StudentRecord student = requireStudent(authorization);
            MembershipRecord member = findMembership(classId, student.id);
            if (member == null || !"active".equals(member.status)) throw new ClientError(403, "resource_forbidden", "无权访问该班级作业。");
            List<Object> items = new ArrayList<Object>();
            for (SubmissionRecord submission : state.submissions) {
                AssignmentRecord assignment = findAssignment(submission.assignmentId);
                if (assignment != null && classId.equals(assignment.classId) && student.id.equals(submission.studentId)) {
                    items.add(submissionJson(submission));
                }
            }
            return listJson(items);
        }
    }

    private Map<String, Object> listOwnAssignmentSubmissions(String assignmentId, String authorization) throws ClientError {
        synchronized (gate) {
            AssignmentRecord assignment = findAssignment(assignmentId);
            if (assignment == null) throw notFound("assignment_not_found", "作业不存在。");
            StudentRecord student = requireStudent(authorization);
            MembershipRecord member = findMembership(assignment.classId, student.id);
            if (member == null || !"active".equals(member.status)) throw new ClientError(403, "resource_forbidden", "无权查看该作业。");
            List<Object> items = new ArrayList<Object>();
            for (SubmissionRecord submission : state.submissions) {
                if (assignmentId.equals(submission.assignmentId) && student.id.equals(submission.studentId)) items.add(submissionJson(submission));
            }
            return listJson(items);
        }
    }

    private Map<String, Object> listClassSubmissions(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            requireOwner(activeClass(classId), authorization);
            List<Object> items = new ArrayList<Object>();
            for (SubmissionRecord submission : state.submissions) {
                AssignmentRecord assignment = findAssignment(submission.assignmentId);
                if (assignment != null && classId.equals(assignment.classId)) {
                    Map<String,Object> value = submissionJson(submission);
                    StudentRecord student = findStudent(submission.studentId);
                    if (student != null) value.put("studentDisplayName", student.displayName);
                    items.add(value);
                }
            }
            return listJson(items);
        }
    }

    private Map<String, Object> listReviewCases(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            requireOwner(activeClass(classId), authorization);
            List<Object> items = new ArrayList<Object>();
            for (SubmissionRecord submission : state.submissions) {
                AssignmentRecord assignment = findAssignment(submission.assignmentId);
                if (assignment != null && classId.equals(assignment.classId) && "pending".equals(submission.reviewStatus)) {
                    items.add(reviewJson(submission, assignment));
                }
            }
            return listJson(items);
        }
    }

    private Map<String, Object> decideReviewCase(String reviewId, String authorization, Map<String,Object> body)
        throws ClientError, IOException {
        synchronized (gate) {
            SubmissionRecord submission = findSubmission(reviewId);
            if (submission == null) throw notFound("review_case_not_found", "待批改记录不存在。");
            AssignmentRecord assignment = findAssignment(submission.assignmentId);
            if (assignment == null) throw notFound("assignment_not_found", "作业不存在。");
            requireOwner(activeClass(assignment.classId), authorization);
            String decision = requiredText(valueText(body.get("decision")), "批改决定", 20);
            if (!"approve".equals(decision) && !"return".equals(decision) && !"rejudge".equals(decision)) throw validation("批改决定无效。");
            if (!"pending".equals(submission.reviewStatus) && !"rejudge".equals(decision)) {
                throw new ClientError(409, "review_already_decided", "该提交已经批改。");
            }
            Object rawScore = body.get("score");
            double score = rawScore instanceof Number ? ((Number)rawScore).doubleValue() : Double.NaN;
            if (!Double.isFinite(score) || score < 0 || score > 100) throw validation("分数必须在 0 到 100 之间。");
            Object rawQuestionScores = body.get("perQuestionScores");
            if (!(rawQuestionScores instanceof List<?>)) throw validation("逐题评分格式无效。");
            List<Object> checkedScores = new ArrayList<Object>();
            List<String> scoredQuestionIds = new ArrayList<String>();
            List<String> submittedQuestionIds = storedSubmissionQuestionIds(submission);
            for (Object rawEntry : (List<?>)rawQuestionScores) {
                if (!(rawEntry instanceof Map<?,?>)) throw validation("逐题评分格式无效。");
                Map<?,?> entry = (Map<?,?>)rawEntry;
                String questionId = requiredText(valueText(entry.get("questionId")), "题目编号", 160);
                if (!submittedQuestionIds.contains(questionId) || scoredQuestionIds.contains(questionId)) {
                    throw validation("逐题评分编号重复或不属于本次提交。");
                }
                Object questionScore = entry.get("score");
                double numericQuestionScore = questionScore instanceof Number ? ((Number)questionScore).doubleValue() : Double.NaN;
                if (questionScore != null && (!Double.isFinite(numericQuestionScore)
                    || numericQuestionScore < 0 || numericQuestionScore > 100)) {
                    throw validation("逐题分数必须在 0 到 100 之间。");
                }
                Map<String,Object> checkedEntry = object();
                checkedEntry.put("questionId", questionId);
                checkedEntry.put("score", questionScore);
                checkedScores.add(checkedEntry);
                scoredQuestionIds.add(questionId);
            }
            String reason = requiredText(valueText(body.get("reason")), "教师反馈", 1000);
            submission.score = score;
            submission.feedback = reason;
            submission.reviewStatus = "approve".equals(decision) ? "approved" : "return".equals(decision) ? "returned" : "rejudged";
            submission.status = "return".equals(decision) ? "returned" : "accepted";
            submission.reviewRevision += 1;
            submission.updatedAt = System.currentTimeMillis();
            submission.perQuestionScoresJson = Json.stringify(checkedScores);
            saveLocked();
            return reviewJson(submission, assignment);
        }
    }

    private StudentRecord findStudent(String id) {
        for (StudentRecord item : state.students) if (item.id.equals(id)) return item;
        return null;
    }

    private SubmissionRecord findSubmission(String id) {
        for (SubmissionRecord item : state.submissions) if (item.id.equalsIgnoreCase(id)) return item;
        return null;
    }

    private Map<String,Object> reviewJson(SubmissionRecord submission, AssignmentRecord assignment) throws ClientError {
        Map<String,Object> value = object();
        value.put("id", submission.id);
        value.put("submissionId", submission.id);
        value.put("assignmentId", assignment.id);
        value.put("classId", assignment.classId);
        value.put("status", submission.reviewStatus);
        value.put("currentScore", submission.score < 0 ? null : Double.valueOf(submission.score));
        value.put("revision", Integer.valueOf(submission.reviewRevision));
        value.put("submittedAt", iso(submission.submittedAt));
        value.put("updatedAt", iso(submission.updatedAt));
        StudentRecord student = findStudent(submission.studentId);
        value.put("studentDisplayName", student == null ? "学生" : student.displayName);
        value.put("answers", Json.parse(submission.answersJson));
        value.put("submissionVersion", Integer.valueOf(submission.version));
        SubmissionRecord previous = submission.previousSubmissionId == null ? null : findSubmission(submission.previousSubmissionId);
        if (previous != null) value.put("previousAnswers", Json.parse(previous.answersJson));
        value.put("perQuestionScores", Json.parse(submission.perQuestionScoresJson == null ? "[]" : submission.perQuestionScoresJson));
        return value;
    }

    private Map<String, Object> emptyClassCollection(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            requireClassAccess(classroom, authorization);
            return listJson(new ArrayList<Object>());
        }
    }

    private Map<String, Object> acceptLearningSync(String classId, String authorization) throws ClientError {
        synchronized (gate) {
            ClassRecord classroom = activeClass(classId);
            requireClassAccess(classroom, authorization);
            Map<String, Object> result = object();
            result.put("accepted", Integer.valueOf(0));
            result.put("duplicates", Integer.valueOf(0));
            result.put("conflicts", new ArrayList<Object>());
            result.put("lastAcceptedAt", iso(System.currentTimeMillis()));
            return result;
        }
    }

    private void requireMutationKey(HttpRequest request) throws ClientError {
        String value = request.header("Idempotency-Key");
        if (isBlank(value) || value.length() > 160 || containsControl(value)) {
            throw validation("缺少有效的幂等请求编号。");
        }
    }

    private void rateLimit(String address) throws ClientError {
        synchronized (rateWindows) {
            long cutoff = System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(1);
            Deque<Long> entries = rateWindows.get(address);
            if (entries == null) {
                entries = new ArrayDeque<Long>();
                rateWindows.put(address, entries);
            }
            while (!entries.isEmpty() && entries.peekFirst().longValue() < cutoff) entries.removeFirst();
            if (entries.size() >= 60) throw new ClientError(429, "rate_limit_exceeded", "操作过于频繁。");
            entries.addLast(Long.valueOf(System.currentTimeMillis()));
        }
    }

    private ClassRecord activeClass(String classId) throws ClientError {
        try { UUID.fromString(classId); } catch (Exception error) { throw validation("班级编号无效。"); }
        ClassRecord record = findActiveClass(classId);
        if (record == null) throw notFound("class_not_found", "班级不存在。");
        return record;
    }

    private ClassRecord findActiveClass(String classId) {
        for (ClassRecord item : state.classes) {
            if (item.id.equalsIgnoreCase(classId) && "active".equals(item.status)) return item;
        }
        return null;
    }

    private InviteRecord findInviteHash(String hash) {
        for (InviteRecord item : state.invites) if (fixedEquals(item.codeHash, hash)) return item;
        return null;
    }

    private MembershipRecord findMembership(String classId, String studentId) {
        for (MembershipRecord item : state.memberships) {
            if (classId.equals(item.classId) && studentId.equals(item.studentId)) return item;
        }
        return null;
    }

    private MembershipRecord findMembershipById(String id) {
        for (MembershipRecord item : state.memberships) if (item.id.equalsIgnoreCase(id)) return item;
        return null;
    }

    private AssignmentRecord findAssignment(String id) {
        for (AssignmentRecord item : state.assignments) if (item.id.equalsIgnoreCase(id)) return item;
        return null;
    }

    private SessionRecord findRefreshSession(String hash) {
        for (SessionRecord item : state.sessions) if (fixedEquals(item.refreshHash, hash)) return item;
        return null;
    }

    private void removeSessions(String studentId) {
        for (int index = state.sessions.size() - 1; index >= 0; index -= 1) {
            if (studentId.equals(state.sessions.get(index).studentId)) state.sessions.remove(index);
        }
    }

    private StudentRecord student(String id) throws ClientError {
        for (StudentRecord item : state.students) if (item.id.equals(id)) return item;
        throw new ClientError(401, "invalid_access_token", "登录已失效。");
    }

    private StudentRecord requireStudent(String authorization) throws ClientError {
        String token = authorizationToken(authorization, "Bearer");
        String hash = sha256(token);
        for (SessionRecord session : state.sessions) {
            if (session.expiresAt > System.currentTimeMillis() && fixedEquals(session.accessHash, hash)) {
                return student(session.studentId);
            }
        }
        throw new ClientError(401, "invalid_access_token", "登录已失效。");
    }

    private void requireOwner(ClassRecord classroom, String authorization) throws ClientError {
        if (!isBlank(authorization) && !authorization.startsWith("Owner ")) {
            throw new ClientError(403, "resource_forbidden", "无权管理该班级。");
        }
        String token = authorizationToken(authorization, "Owner");
        if (!fixedEquals(classroom.ownerCapabilityHash, sha256(token))) {
            throw new ClientError(403, "resource_forbidden", "无权管理该班级。");
        }
    }

    private void requireClassAccess(ClassRecord classroom, String authorization) throws ClientError {
        if (authorization != null && authorization.startsWith("Owner ")) {
            requireOwner(classroom, authorization);
            return;
        }
        StudentRecord viewer = requireStudent(authorization);
        MembershipRecord membership = findMembership(classroom.id, viewer.id);
        if (membership == null || !"active".equals(membership.status)) {
            throw new ClientError(403, "resource_forbidden", "无权访问该班级。");
        }
    }

    private static String authorizationToken(String header, String scheme) throws ClientError {
        String prefix = scheme + " ";
        if (isBlank(header) || !header.startsWith(prefix)) {
            throw new ClientError(401, "authentication_required", "需要有效身份。");
        }
        String token = header.substring(prefix.length()).trim();
        if (token.length() < 40 || token.length() > 512 || containsControl(token)) {
            throw new ClientError(401, "authentication_required", "需要有效身份。");
        }
        return token;
    }

    private void discoveryLoop() {
        byte[] buffer = new byte[4096];
        while (running) {
            try {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                discoverySocket.receive(packet);
                if (packet.getLength() <= DISCOVERY_PREFIX.length() || packet.getLength() > 256) continue;
                String value = new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8);
                if (!value.startsWith(DISCOVERY_PREFIX)) continue;
                String nonce = value.substring(DISCOVERY_PREFIX.length());
                if (!NONCE_PATTERN.matcher(nonce).matches()) continue;
                Map<String, Object> response = object();
                response.put("protocol", "physics-studio-classroom-lan-v1");
                response.put("nonce", nonce);
                synchronized (gate) { response.put("instanceId", state.instanceId); }
                response.put("port", Integer.valueOf(servicePort));
                response.put("addresses", privateIpv4Addresses());
                byte[] output = Json.stringify(response).getBytes(StandardCharsets.UTF_8);
                discoverySocket.send(new DatagramPacket(output, output.length, packet.getAddress(), packet.getPort()));
            } catch (SocketException error) {
                if (running) pauseBriefly();
            } catch (IOException error) {
                if (running) pauseBriefly();
            }
        }
    }

    static List<String> privateIpv4Addresses() {
        List<String> preferred = new ArrayList<String>();
        List<String> fallback = new ArrayList<String>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface item = interfaces.nextElement();
                if (!item.isUp() || item.isLoopback()) continue;
                String interfaceName = String.valueOf(item.getName()).toLowerCase(Locale.ROOT);
                boolean preferredInterface = interfaceName.startsWith("wlan")
                    || interfaceName.startsWith("wifi")
                    || interfaceName.startsWith("ap")
                    || interfaceName.startsWith("swlan")
                    || interfaceName.startsWith("eth");
                Enumeration<InetAddress> addresses = item.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (!(address instanceof Inet4Address)) continue;
                    byte[] octet = address.getAddress();
                    int first = octet[0] & 255;
                    int second = octet[1] & 255;
                    boolean privateAddress = first == 10 || (first == 172 && second >= 16 && second <= 31)
                        || (first == 192 && second == 168) || (first == 169 && second == 254);
                    if (!privateAddress) continue;
                    String value = address.getHostAddress();
                    List<String> destination = preferredInterface ? preferred : fallback;
                    if (!preferred.contains(value) && !fallback.contains(value)) destination.add(value);
                }
            }
        } catch (Exception ignored) { }
        List<String> result = new ArrayList<String>(preferred.size() + fallback.size());
        result.addAll(preferred);
        result.addAll(fallback);
        return Collections.unmodifiableList(result);
    }

    static boolean isSameLanPeer(InetAddress remote) {
        if (remote == null) return false;
        if (remote.isLoopbackAddress()) return true;
        if (!(remote instanceof Inet4Address)) return false;
        byte[] remoteBytes = remote.getAddress();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface item = interfaces.nextElement();
                if (!item.isUp() || item.isLoopback()) continue;
                for (InterfaceAddress interfaceAddress : item.getInterfaceAddresses()) {
                    InetAddress local = interfaceAddress.getAddress();
                    if (!(local instanceof Inet4Address)) continue;
                    short prefix = interfaceAddress.getNetworkPrefixLength();
                    if (prefix < 0 || prefix > 32) continue;
                    byte[] localBytes = local.getAddress();
                    int fullBytes = prefix / 8;
                    int remainingBits = prefix % 8;
                    boolean matches = true;
                    for (int index = 0; index < fullBytes; index += 1) {
                        if (localBytes[index] != remoteBytes[index]) { matches = false; break; }
                    }
                    if (matches && remainingBits > 0) {
                        int mask = (0xff << (8 - remainingBits)) & 0xff;
                        matches = (localBytes[fullBytes] & mask) == (remoteBytes[fullBytes] & mask);
                    }
                    if (matches) return true;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    private State loadState() throws IOException {
        if (!stateFile.exists()) return new State();
        try {
            return readState(stateFile);
        } catch (IOException error) {
            if (!backupFile.exists()) throw error;
            return readState(backupFile);
        }
    }

    private static State readState(File file) throws IOException {
        DataInputStream input = new DataInputStream(new BufferedInputStream(new FileInputStream(file)));
        try {
            if (input.readInt() != STATE_MAGIC) {
                throw new IOException("unsupported classroom state");
            }
            int version = input.readInt();
            if (version != 1 && version != STATE_VERSION) throw new IOException("unsupported classroom state");
            State value = new State();
            value.instanceId = readString(input);
            readClasses(input, value.classes);
            readInvites(input, value.invites);
            readStudents(input, value.students);
            readMemberships(input, value.memberships);
            readSessions(input, value.sessions);
            readGroups(input, value.groups);
            readAssignments(input, value.assignments, version);
            readSubmissions(input, value.submissions, version);
            if (version == 1) {
                Map<String, Integer> versions = new HashMap<String, Integer>();
                for (SubmissionRecord submission : value.submissions) {
                    String key = submission.assignmentId + ":" + submission.studentId;
                    int next = versions.containsKey(key) ? versions.get(key).intValue() + 1 : 1;
                    versions.put(key, Integer.valueOf(next));
                    submission.version = next;
                    submission.reviewStatus = "pending";
                    submission.reviewRevision = 1;
                    submission.updatedAt = submission.submittedAt;
                }
            }
            return value;
        } catch (EOFException error) {
            throw new IOException("incomplete classroom state", error);
        } finally {
            input.close();
        }
    }

    private void saveLocked() throws IOException {
        File temporary = new File(stateFile.getParentFile(), stateFile.getName() + ".tmp-" + UUID.randomUUID().toString());
        DataOutputStream output = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(temporary)));
        try {
            output.writeInt(STATE_MAGIC);
            output.writeInt(STATE_VERSION);
            writeString(output, state.instanceId);
            writeClasses(output, state.classes);
            writeInvites(output, state.invites);
            writeStudents(output, state.students);
            writeMemberships(output, state.memberships);
            writeSessions(output, state.sessions);
            writeGroups(output, state.groups);
            writeAssignments(output, state.assignments);
            writeSubmissions(output, state.submissions);
            output.flush();
        } finally {
            output.close();
        }
        FileOutputStream sync = new FileOutputStream(temporary, true);
        try { sync.getFD().sync(); } finally { sync.close(); }
        if (backupFile.exists() && !backupFile.delete()) {
            temporary.delete();
            throw new IOException("classroom backup cannot be replaced");
        }
        if (stateFile.exists() && !stateFile.renameTo(backupFile)) {
            temporary.delete();
            throw new IOException("classroom state cannot be backed up");
        }
        if (!temporary.renameTo(stateFile)) {
            if (backupFile.exists()) backupFile.renameTo(stateFile);
            throw new IOException("classroom state cannot be committed");
        }
    }

    @Override public void close() {
        synchronized (gate) {
            running = false;
            try { if (serverSocket != null) serverSocket.close(); } catch (IOException ignored) { }
            if (discoverySocket != null) discoverySocket.close();
        }
        workers.shutdownNow();
        joinThread(acceptThread);
        joinThread(discoveryThread);
    }

    private static void joinThread(Thread thread) {
        if (thread == null) return;
        try { thread.join(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
    }

    private static Map<String, Object> classJson(ClassRecord record) {
        Map<String, Object> value = object();
        value.put("id", record.id);
        value.put("name", record.name);
        value.put("grade", record.grade);
        value.put("subject", record.subject);
        value.put("schoolLabel", record.schoolLabel);
        value.put("status", record.status);
        value.put("revision", Integer.valueOf(record.revision));
        value.put("createdAt", iso(record.createdAt));
        value.put("updatedAt", iso(record.updatedAt));
        return value;
    }

    private static Map<String, Object> userJson(StudentRecord student) {
        Map<String, Object> value = object();
        value.put("id", student.id);
        value.put("role", "student");
        value.put("displayName", student.displayName);
        value.put("status", "active");
        value.put("mustChangePassword", Boolean.FALSE);
        value.put("deletionPending", Boolean.FALSE);
        return value;
    }

    private static Map<String, Object> membershipJson(MembershipRecord membership) {
        Map<String, Object> value = object();
        value.put("id", membership.id);
        value.put("classId", membership.classId);
        value.put("studentId", membership.studentId);
        value.put("displayName", membership.displayName);
        value.put("role", "student");
        value.put("status", membership.status);
        value.put("joinedAt", iso(membership.joinedAt));
        value.put("groupId", membership.groupId);
        value.put("studentNumber", membership.studentNumber);
        return value;
    }

    private static Map<String, Object> groupJson(GroupRecord group) {
        Map<String, Object> value = object();
        value.put("id", group.id);
        value.put("classId", group.classId);
        value.put("name", group.name);
        value.put("createdAt", iso(group.createdAt));
        return value;
    }

    private static Map<String, Object> assignmentJson(AssignmentRecord assignment) throws ClientError {
        Map<String, Object> value = object();
        value.put("id", assignment.id);
        value.put("classId", assignment.classId);
        value.put("title", assignment.title);
        value.put("instructions", assignment.instructions);
        value.put("dueAt", assignment.dueAt == 0 ? null : iso(assignment.dueAt));
        value.put("targetType", assignment.targetType);
        value.put("targetId", assignment.targetId);
        value.put("questionIds", new ArrayList<String>(assignment.questionIds));
        List<Object> visibleItems = new ArrayList<Object>();
        Object parsedItems = Json.parse(assignment.questionItemsJson == null ? "[]" : assignment.questionItemsJson);
        if (parsedItems instanceof List<?>) {
            for (Object item : (List<?>)parsedItems) {
                if (!(item instanceof Map<?,?>)) continue;
                Map<?,?> raw = (Map<?,?>)item;
                Map<String,Object> visible = object();
                for (String key : new String[]{"id","title","content","questionType","options","knowledgePointId","difficulty"}) {
                    if (raw.containsKey(key)) visible.put(key, raw.get(key));
                }
                visibleItems.add(visible);
            }
        }
        value.put("questionItems", visibleItems);
        value.put("knowledgePointKeys", new ArrayList<String>(assignment.knowledgePointKeys));
        value.put("target", assignment.target);
        value.put("status", assignment.published ? "published" : "draft");
        value.put("published", Boolean.valueOf(assignment.published));
        value.put("createdAt", iso(assignment.createdAt));
        return value;
    }

    private static Map<String, Object> submissionJson(SubmissionRecord submission) throws ClientError {
        Map<String, Object> value = object();
        value.put("id", submission.id);
        value.put("assignmentId", submission.assignmentId);
        value.put("studentId", submission.studentId);
        value.put("clientEntityId", submission.clientEntityId);
        value.put("status", submission.status);
        value.put("submittedAt", iso(submission.submittedAt));
        value.put("answers", Json.parse(submission.answersJson));
        value.put("studentUserId", submission.studentId);
        value.put("version", Integer.valueOf(submission.version));
        value.put("previousSubmissionId", submission.previousSubmissionId);
        value.put("reviewStatus", submission.reviewStatus);
        value.put("score", submission.score < 0 ? null : Double.valueOf(submission.score));
        value.put("perQuestionScores", Json.parse(submission.perQuestionScoresJson == null ? "[]" : submission.perQuestionScoresJson));
        value.put("feedback", submission.feedback);
        return value;
    }

    private static Map<String, Object> authJson(StudentRecord student, String access, String refresh) {
        Map<String, Object> value = object();
        value.put("accessToken", access);
        value.put("refreshToken", refresh);
        value.put("user", userJson(student));
        return value;
    }

    private static Map<String, Object> joinJson(ClassRecord classroom, StudentRecord student,
        MembershipRecord membership, String access, String refresh) {
        Map<String, Object> value = authJson(student, access, refresh);
        value.put("class", classJson(classroom));
        value.put("membership", membershipJson(membership));
        return value;
    }

    private static Map<String, Object> listJson(List<Object> items) {
        Map<String, Object> value = object();
        value.put("items", items);
        value.put("nextCursor", null);
        return value;
    }

    private static Map<String, Object> object() { return new LinkedHashMap<String, Object>(); }
    private static String text(Map<String, Object> value, String key) throws ClientError {
        return valueText(value.get(key));
    }
    private static String valueText(Object value) { return value instanceof String ? (String)value : ""; }
    private static int integer(Map<String, Object> value, String key) throws ClientError {
        Object item = value.get(key);
        if (!(item instanceof Number)) throw validation("数值字段无效。");
        double number = ((Number)item).doubleValue();
        if (number != Math.rint(number) || number < Integer.MIN_VALUE || number > Integer.MAX_VALUE) {
            throw validation("数值字段无效。");
        }
        return (int)number;
    }
    private static String requiredText(String value, String label, int maximum) throws ClientError {
        String text = value == null ? "" : value.trim();
        if (text.length() == 0 || text.length() > maximum || containsControl(text)) {
            throw validation(label + "无效。");
        }
        return text;
    }
    private static String optionalText(Object value, int maximum) throws ClientError {
        if (value == null) return "";
        if (!(value instanceof String) || ((String)value).length() > maximum || containsControlExceptWhitespace((String)value)) {
            throw validation("文本字段无效。");
        }
        return (String)value;
    }
    private static String nullableText(Object value, int maximum) throws ClientError {
        if (value == null) return null;
        return requiredText(valueText(value), "文本字段", maximum);
    }
    private static List<String> stringList(Object value, int maximumItems, int maximumLength) throws ClientError {
        if (!(value instanceof List<?>)) return new ArrayList<String>();
        List<?> source = (List<?>)value;
        if (source.size() > maximumItems) throw validation("列表字段过长。");
        List<String> result = new ArrayList<String>();
        for (Object item : source) result.add(requiredText(valueText(item), "列表字段", maximumLength));
        return result;
    }
    private static List<String> storedSubmissionQuestionIds(SubmissionRecord submission) throws ClientError {
        final Object parsed;
        try {
            parsed = Json.parse(submission.answersJson);
        } catch (ClientError error) {
            throw new ClientError(500, "stored_submission_invalid", "已保存的作答数据无法批改。");
        }
        if (!(parsed instanceof List<?>)) {
            throw new ClientError(500, "stored_submission_invalid", "已保存的作答数据无法批改。");
        }
        List<String> result = new ArrayList<String>();
        for (Object rawAnswer : (List<?>)parsed) {
            if (!(rawAnswer instanceof Map<?,?>)) {
                throw new ClientError(500, "stored_submission_invalid", "已保存的作答数据无法批改。");
            }
            Object rawQuestionId = ((Map<?,?>)rawAnswer).get("questionId");
            if (!(rawQuestionId instanceof String)) {
                throw new ClientError(500, "stored_submission_invalid", "已保存的作答数据无法批改。");
            }
            String questionId = ((String)rawQuestionId).trim();
            if (questionId.length() == 0 || questionId.length() > 160 || containsControl(questionId) || result.contains(questionId)) {
                throw new ClientError(500, "stored_submission_invalid", "已保存的作答数据无法批改。");
            }
            result.add(questionId);
        }
        return result;
    }
    private static String requiredPattern(String value, Pattern pattern, String message) throws ClientError {
        String text = value == null ? "" : value.trim();
        if (!pattern.matcher(text).matches()) throw validation(message);
        return text;
    }
    private static boolean containsControl(String value) {
        for (int index = 0; index < value.length(); index += 1) if (value.charAt(index) < 32 || value.charAt(index) == 127) return true;
        return false;
    }
    private static boolean containsControlExceptWhitespace(String value) {
        for (int index = 0; index < value.length(); index += 1) {
            char item = value.charAt(index);
            if ((item < 32 && item != '\n' && item != '\r' && item != '\t') || item == 127) return true;
        }
        return false;
    }
    private static boolean isBlank(String value) { return value == null || value.trim().isEmpty(); }
    private static boolean equalsNullable(String left, String right) { return left == null ? right == null : left.equals(right); }
    private static ClientError validation(String message) { return new ClientError(400, "validation_error", message); }
    private static ClientError notFound(String code, String message) { return new ClientError(404, code, message); }

    private static String randomBase64Url(int bytes) {
        byte[] input = new byte[bytes];
        RANDOM.nextBytes(input);
        final char[] alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();
        StringBuilder output = new StringBuilder((bytes * 4 + 2) / 3);
        for (int index = 0; index < input.length; index += 3) {
            int value = (input[index] & 255) << 16;
            if (index + 1 < input.length) value |= (input[index + 1] & 255) << 8;
            if (index + 2 < input.length) value |= input[index + 2] & 255;
            output.append(alphabet[(value >>> 18) & 63]);
            output.append(alphabet[(value >>> 12) & 63]);
            if (index + 1 < input.length) output.append(alphabet[(value >>> 6) & 63]);
            if (index + 2 < input.length) output.append(alphabet[value & 63]);
        }
        return output.toString();
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            StringBuilder output = new StringBuilder(64);
            for (byte item : bytes) output.append(String.format(Locale.ROOT, "%02x", item & 255));
            return output.toString();
        } catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }

    private static boolean fixedEquals(String left, String right) {
        byte[] a = (left == null ? "" : left).getBytes(StandardCharsets.UTF_8);
        byte[] b = (right == null ? "" : right).getBytes(StandardCharsets.UTF_8);
        int difference = a.length ^ b.length;
        int length = Math.max(a.length, b.length);
        for (int index = 0; index < length; index += 1) {
            int av = index < a.length ? a[index] & 255 : 0;
            int bv = index < b.length ? b[index] & 255 : 0;
            difference |= av ^ bv;
        }
        return difference == 0;
    }

    private static String iso(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    private static long parseDate(String value) throws ClientError {
        String text = value == null ? "" : value.trim();
        for (String pattern : new String[] { "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'" }) {
            SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.ROOT);
            format.setLenient(false);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            try { return format.parse(text).getTime(); } catch (ParseException ignored) { }
        }
        throw validation("日期时间无效。");
    }

    private static void writeString(DataOutputStream output, String value) throws IOException {
        if (value == null) { output.writeInt(-1); return; }
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_STRING_BYTES) throw new IOException("classroom string is too large");
        output.writeInt(bytes.length);
        output.write(bytes);
    }
    private static String readString(DataInputStream input) throws IOException {
        int length = input.readInt();
        if (length == -1) return null;
        if (length < 0 || length > MAX_STRING_BYTES) throw new IOException("invalid classroom string length");
        byte[] bytes = new byte[length];
        input.readFully(bytes);
        return new String(bytes, StandardCharsets.UTF_8);
    }
    private static int readCount(DataInputStream input) throws IOException {
        int count = input.readInt();
        if (count < 0 || count > MAX_COLLECTION_ITEMS) throw new IOException("invalid classroom collection size");
        return count;
    }
    private static void writeStringList(DataOutputStream output, List<String> values) throws IOException {
        output.writeInt(values.size());
        for (String value : values) writeString(output, value);
    }
    private static List<String> readStringList(DataInputStream input) throws IOException {
        int count = readCount(input);
        List<String> values = new ArrayList<String>();
        for (int index = 0; index < count; index += 1) values.add(readString(input));
        return values;
    }

    private static void writeClasses(DataOutputStream out, List<ClassRecord> values) throws IOException {
        out.writeInt(values.size()); for (ClassRecord v : values) { writeString(out,v.id);writeString(out,v.ownerUserId);writeString(out,v.ownerCapabilityHash);writeString(out,v.name);writeString(out,v.grade);writeString(out,v.subject);writeString(out,v.schoolLabel);writeString(out,v.status);out.writeInt(v.revision);out.writeLong(v.createdAt);out.writeLong(v.updatedAt); }
    }
    private static void readClasses(DataInputStream in, List<ClassRecord> values) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){ClassRecord v=new ClassRecord();v.id=readString(in);v.ownerUserId=readString(in);v.ownerCapabilityHash=readString(in);v.name=readString(in);v.grade=readString(in);v.subject=readString(in);v.schoolLabel=readString(in);v.status=readString(in);v.revision=in.readInt();v.createdAt=in.readLong();v.updatedAt=in.readLong();values.add(v);}
    }
    private static void writeInvites(DataOutputStream out, List<InviteRecord> values) throws IOException {
        out.writeInt(values.size()); for(InviteRecord v:values){writeString(out,v.id);writeString(out,v.classId);writeString(out,v.codeHash);out.writeLong(v.expiresAt);out.writeInt(v.maxUses);out.writeInt(v.useCount);out.writeBoolean(v.active);}
    }
    private static void readInvites(DataInputStream in, List<InviteRecord> values) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){InviteRecord v=new InviteRecord();v.id=readString(in);v.classId=readString(in);v.codeHash=readString(in);v.expiresAt=in.readLong();v.maxUses=in.readInt();v.useCount=in.readInt();v.active=in.readBoolean();values.add(v);}
    }
    private static void writeStudents(DataOutputStream out, List<StudentRecord> values) throws IOException {
        out.writeInt(values.size()); for(StudentRecord v:values){writeString(out,v.id);writeString(out,v.deviceHash);writeString(out,v.displayName);out.writeLong(v.createdAt);}
    }
    private static void readStudents(DataInputStream in, List<StudentRecord> values) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){StudentRecord v=new StudentRecord();v.id=readString(in);v.deviceHash=readString(in);v.displayName=readString(in);v.createdAt=in.readLong();values.add(v);}
    }
    private static void writeMemberships(DataOutputStream out, List<MembershipRecord> values) throws IOException {
        out.writeInt(values.size()); for(MembershipRecord v:values){writeString(out,v.id);writeString(out,v.classId);writeString(out,v.studentId);writeString(out,v.displayName);writeString(out,v.role);writeString(out,v.status);out.writeLong(v.joinedAt);writeString(out,v.groupId);writeString(out,v.studentNumber);}
    }
    private static void readMemberships(DataInputStream in, List<MembershipRecord> values) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){MembershipRecord v=new MembershipRecord();v.id=readString(in);v.classId=readString(in);v.studentId=readString(in);v.displayName=readString(in);v.role=readString(in);v.status=readString(in);v.joinedAt=in.readLong();v.groupId=readString(in);v.studentNumber=readString(in);values.add(v);}
    }
    private static void writeSessions(DataOutputStream out, List<SessionRecord> values) throws IOException {
        out.writeInt(values.size()); for(SessionRecord v:values){writeString(out,v.studentId);writeString(out,v.accessHash);writeString(out,v.refreshHash);out.writeLong(v.expiresAt);}
    }
    private static void readSessions(DataInputStream in, List<SessionRecord> values) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){SessionRecord v=new SessionRecord();v.studentId=readString(in);v.accessHash=readString(in);v.refreshHash=readString(in);v.expiresAt=in.readLong();values.add(v);}
    }
    private static void writeGroups(DataOutputStream out, List<GroupRecord> values) throws IOException {
        out.writeInt(values.size()); for(GroupRecord v:values){writeString(out,v.id);writeString(out,v.classId);writeString(out,v.name);out.writeLong(v.createdAt);}
    }
    private static void readGroups(DataInputStream in, List<GroupRecord> values) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){GroupRecord v=new GroupRecord();v.id=readString(in);v.classId=readString(in);v.name=readString(in);v.createdAt=in.readLong();values.add(v);}
    }
    private static void writeAssignments(DataOutputStream out, List<AssignmentRecord> values) throws IOException {
        out.writeInt(values.size()); for(AssignmentRecord v:values){writeString(out,v.id);writeString(out,v.classId);writeString(out,v.title);writeString(out,v.instructions);out.writeLong(v.dueAt);writeString(out,v.targetType);writeString(out,v.targetId);writeStringList(out,v.questionIds);writeStringList(out,v.knowledgePointKeys);writeString(out,v.target);out.writeBoolean(v.published);out.writeLong(v.createdAt);writeString(out,v.questionItemsJson);}
    }
    private static void readAssignments(DataInputStream in, List<AssignmentRecord> values, int version) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){AssignmentRecord v=new AssignmentRecord();v.id=readString(in);v.classId=readString(in);v.title=readString(in);v.instructions=readString(in);v.dueAt=in.readLong();v.targetType=readString(in);v.targetId=readString(in);v.questionIds=readStringList(in);v.knowledgePointKeys=readStringList(in);v.target=readString(in);v.published=in.readBoolean();v.createdAt=in.readLong();v.questionItemsJson=version>=2?readString(in):"[]";values.add(v);}
    }
    private static void writeSubmissions(DataOutputStream out, List<SubmissionRecord> values) throws IOException {
        out.writeInt(values.size()); for(SubmissionRecord v:values){writeString(out,v.id);writeString(out,v.assignmentId);writeString(out,v.studentId);writeString(out,v.clientEntityId);writeString(out,v.answersJson);writeString(out,v.status);out.writeLong(v.submittedAt);out.writeInt(v.version);writeString(out,v.previousSubmissionId);writeString(out,v.reviewStatus);out.writeDouble(v.score);writeString(out,v.feedback);out.writeInt(v.reviewRevision);out.writeLong(v.updatedAt);writeString(out,v.perQuestionScoresJson);}
    }
    private static void readSubmissions(DataInputStream in, List<SubmissionRecord> values, int version) throws IOException {
        for(int i=0,n=readCount(in);i<n;i++){SubmissionRecord v=new SubmissionRecord();v.id=readString(in);v.assignmentId=readString(in);v.studentId=readString(in);v.clientEntityId=readString(in);v.answersJson=readString(in);v.status=readString(in);v.submittedAt=in.readLong();if(version>=2){v.version=in.readInt();v.previousSubmissionId=readString(in);v.reviewStatus=readString(in);v.score=in.readDouble();v.feedback=readString(in);v.reviewRevision=in.readInt();v.updatedAt=in.readLong();v.perQuestionScoresJson=readString(in);}values.add(v);}
    }

    private static final class State {
        String instanceId = UUID.randomUUID().toString();
        final List<ClassRecord> classes = new ArrayList<ClassRecord>();
        final List<InviteRecord> invites = new ArrayList<InviteRecord>();
        final List<StudentRecord> students = new ArrayList<StudentRecord>();
        final List<MembershipRecord> memberships = new ArrayList<MembershipRecord>();
        final List<SessionRecord> sessions = new ArrayList<SessionRecord>();
        final List<GroupRecord> groups = new ArrayList<GroupRecord>();
        final List<AssignmentRecord> assignments = new ArrayList<AssignmentRecord>();
        final List<SubmissionRecord> submissions = new ArrayList<SubmissionRecord>();
    }
    private static final class ClassRecord { String id,ownerUserId,ownerCapabilityHash,name,grade,subject,schoolLabel,status; int revision; long createdAt,updatedAt; }
    private static final class InviteRecord { String id,classId,codeHash; long expiresAt; int maxUses,useCount; boolean active; }
    private static final class StudentRecord { String id,deviceHash,displayName; long createdAt; }
    private static final class MembershipRecord { String id,classId,studentId,displayName,role,status,groupId,studentNumber; long joinedAt; }
    private static final class SessionRecord { String studentId,accessHash,refreshHash; long expiresAt; }
    private static final class GroupRecord { String id,classId,name; long createdAt; }
    private static final class AssignmentRecord { String id,classId,title,instructions,targetType,targetId,target,questionItemsJson="[]"; List<String> questionIds=new ArrayList<String>(),knowledgePointKeys=new ArrayList<String>(); long dueAt,createdAt; boolean published; }
    private static final class SubmissionRecord { String id,assignmentId,studentId,clientEntityId,answersJson,status,previousSubmissionId,reviewStatus="pending",feedback,perQuestionScoresJson="[]"; long submittedAt,updatedAt; int version=1,reviewRevision=1; double score=-1; }

    private static final class ClientError extends Exception {
        final int status; final String code;
        ClientError(int status, String code, String message) { super(message); this.status=status; this.code=code; }
    }

    private static final class HttpRequest {
        String method,path,body; final Map<String,String> headers=new HashMap<String,String>();
        String header(String name){return headers.get(name.toLowerCase(Locale.ROOT));}
        @SuppressWarnings("unchecked") Map<String,Object> jsonBody() throws ClientError {
            if(isBlank(body)) throw validation("缺少请求内容。");
            try { Object value=Json.parse(body); if(!(value instanceof Map<?,?>)) throw new Exception(); return (Map<String,Object>)value; }
            catch(ClientError error){throw error;} catch(Exception error){throw validation("请求 JSON 无效。");}
        }
        static HttpRequest read(InputStream input) throws IOException,ClientError {
            ByteArrayOutputStream header=new ByteArrayOutputStream(); int state=0;
            while(header.size()<MAX_HEADER_BYTES){int value=input.read();if(value<0)throw validation("请求不完整。");header.write(value);state=(state==0&&value=='\r')?1:(state==1&&value=='\n')?2:(state==2&&value=='\r')?3:(state==3&&value=='\n')?4:(value=='\r'?1:0);if(state==4)break;}
            if(state!=4)throw new ClientError(431,"headers_too_large","请求头过大。");
            String[] lines=new String(header.toByteArray(),StandardCharsets.ISO_8859_1).split("\\r\\n");
            String[] first=lines[0].split(" ");if(first.length!=3||!first[2].startsWith("HTTP/1."))throw validation("HTTP 请求无效。");
            HttpRequest request=new HttpRequest();request.method=first[0].toUpperCase(Locale.ROOT);request.path=first[1].split("\\?",2)[0];
            if(request.path.indexOf("..")>=0||request.path.indexOf('#')>=0)throw validation("请求路径无效。");
            for(int i=1;i<lines.length;i++){int separator=lines[i].indexOf(':');if(separator<=0)continue;String name=lines[i].substring(0,separator).trim().toLowerCase(Locale.ROOT);String value=lines[i].substring(separator+1).trim();if(name.length()<=80&&value.length()<=4096&&!containsControl(value))request.headers.put(name,value);}
            int length=0;String raw=request.header("Content-Length");if(raw!=null){try{length=Integer.parseInt(raw);}catch(Exception error){throw validation("Content-Length 无效。");}}
            if(length<0)throw validation("Content-Length 无效。");if(length>MAX_BODY_BYTES)throw new ClientError(413,"request_too_large","请求内容过大。");
            byte[] bytes=new byte[length];int offset=0;while(offset<length){int read=input.read(bytes,offset,length-offset);if(read<0)throw validation("请求内容不完整。");offset+=read;}request.body=new String(bytes,StandardCharsets.UTF_8);return request;
        }
    }

    private static final class HttpResponse {
        final int status; final String body;
        HttpResponse(int status,String body){this.status=status;this.body=body==null?"":body;}
        static HttpResponse json(int status,Object value){return new HttpResponse(status,Json.stringify(value));}
        static HttpResponse empty(int status){return new HttpResponse(status,"");}
        static HttpResponse error(int status,String code,String message){Map<String,Object> body=object();body.put("code",code);body.put("message",message);body.put("requestId","lan-"+UUID.randomUUID().toString().replace("-","").substring(0,16));return json(status,body);}
        void write(OutputStream output)throws IOException{byte[] bytes=body.getBytes(StandardCharsets.UTF_8);String head="HTTP/1.1 "+status+" "+reason(status)+"\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: "+bytes.length+"\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";output.write(head.getBytes(StandardCharsets.ISO_8859_1));output.write(bytes);output.flush();}
        static String reason(int status){if(status==200)return"OK";if(status==201)return"Created";if(status==204)return"No Content";if(status==400)return"Bad Request";if(status==401)return"Unauthorized";if(status==403)return"Forbidden";if(status==404)return"Not Found";if(status==409)return"Conflict";if(status==413)return"Payload Too Large";if(status==429)return"Too Many Requests";if(status==431)return"Request Header Fields Too Large";return"Internal Server Error";}
    }

    /** Small bounded JSON codec for native protocol messages. */
    private static final class Json {
        static Object parse(String source)throws ClientError{Parser parser=new Parser(source);Object value=parser.value(0);parser.space();if(parser.index!=parser.source.length())throw validation("请求 JSON 无效。");return value;}
        static String stringify(Object value){StringBuilder out=new StringBuilder();write(out,value);return out.toString();}
        static void write(StringBuilder out,Object value){if(value==null){out.append("null");return;}if(value instanceof String){quote(out,(String)value);return;}if(value instanceof Number||value instanceof Boolean){out.append(String.valueOf(value));return;}if(value instanceof Map<?,?>){out.append('{');boolean first=true;for(Map.Entry<?,?> item:((Map<?,?>)value).entrySet()){if(!first)out.append(',');first=false;quote(out,String.valueOf(item.getKey()));out.append(':');write(out,item.getValue());}out.append('}');return;}if(value instanceof Iterable<?>){out.append('[');boolean first=true;for(Object item:(Iterable<?>)value){if(!first)out.append(',');first=false;write(out,item);}out.append(']');return;}quote(out,String.valueOf(value));}
        static void quote(StringBuilder out,String value){out.append('"');for(int i=0;i<value.length();i++){char c=value.charAt(i);if(c=='"'||c=='\\')out.append('\\').append(c);else if(c=='\b')out.append("\\b");else if(c=='\f')out.append("\\f");else if(c=='\n')out.append("\\n");else if(c=='\r')out.append("\\r");else if(c=='\t')out.append("\\t");else if(c<32)out.append(String.format(Locale.ROOT,"\\u%04x",(int)c));else out.append(c);}out.append('"');}
        static final class Parser{final String source;int index;Parser(String source){this.source=source==null?"":source;}void space(){while(index<source.length()&&Character.isWhitespace(source.charAt(index)))index++;}Object value(int depth)throws ClientError{if(depth>48)throw validation("请求 JSON 层级过深。");space();if(index>=source.length())throw validation("请求 JSON 无效。");char c=source.charAt(index);if(c=='{')return objectValue(depth+1);if(c=='[')return arrayValue(depth+1);if(c=='"')return stringValue();if(source.startsWith("true",index)){index+=4;return Boolean.TRUE;}if(source.startsWith("false",index)){index+=5;return Boolean.FALSE;}if(source.startsWith("null",index)){index+=4;return null;}return numberValue();}Object objectValue(int depth)throws ClientError{Map<String,Object> out=object();index++;space();if(take('}'))return out;while(true){space();if(index>=source.length()||source.charAt(index)!='"')throw validation("请求 JSON 无效。");String key=stringValue();space();if(!take(':'))throw validation("请求 JSON 无效。");out.put(key,value(depth));space();if(take('}'))return out;if(!take(','))throw validation("请求 JSON 无效。");}}Object arrayValue(int depth)throws ClientError{List<Object> out=new ArrayList<Object>();index++;space();if(take(']'))return out;while(true){if(out.size()>=1000)throw validation("请求 JSON 列表过长。");out.add(value(depth));space();if(take(']'))return out;if(!take(','))throw validation("请求 JSON 无效。");}}String stringValue()throws ClientError{index++;StringBuilder out=new StringBuilder();while(index<source.length()){char c=source.charAt(index++);if(c=='"')return out.toString();if(c=='\\'){if(index>=source.length())throw validation("请求 JSON 无效。");char e=source.charAt(index++);if(e=='"'||e=='\\'||e=='/')out.append(e);else if(e=='b')out.append('\b');else if(e=='f')out.append('\f');else if(e=='n')out.append('\n');else if(e=='r')out.append('\r');else if(e=='t')out.append('\t');else if(e=='u'){if(index+4>source.length())throw validation("请求 JSON 无效。");try{out.append((char)Integer.parseInt(source.substring(index,index+4),16));}catch(Exception error){throw validation("请求 JSON 无效。");}index+=4;}else throw validation("请求 JSON 无效。");}else{if(c<32)throw validation("请求 JSON 无效。");out.append(c);}}throw validation("请求 JSON 无效。");}Number numberValue()throws ClientError{int start=index;if(index<source.length()&&source.charAt(index)=='-')index++;while(index<source.length()&&Character.isDigit(source.charAt(index)))index++;if(index<source.length()&&source.charAt(index)=='.'){index++;while(index<source.length()&&Character.isDigit(source.charAt(index)))index++;}if(index<source.length()&&(source.charAt(index)=='e'||source.charAt(index)=='E')){index++;if(index<source.length()&&(source.charAt(index)=='+'||source.charAt(index)=='-'))index++;while(index<source.length()&&Character.isDigit(source.charAt(index)))index++;}if(start==index)throw validation("请求 JSON 无效。");try{String raw=source.substring(start,index);return raw.indexOf('.')>=0||raw.indexOf('e')>=0||raw.indexOf('E')>=0?Double.valueOf(raw):Long.valueOf(raw);}catch(Exception error){throw validation("请求 JSON 数值无效。");}}boolean take(char expected){space();if(index<source.length()&&source.charAt(index)==expected){index++;return true;}return false;}}
    }
}
