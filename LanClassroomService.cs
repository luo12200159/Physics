using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

[assembly: System.Reflection.AssemblyTitle("费曼物理班级服务")]
[assembly: System.Reflection.AssemblyProduct("费曼物理")]
[assembly: System.Reflection.AssemblyVersion("4.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("4.0.0.0")]

internal static class LanClassroomProgram
{
    private static readonly ManualResetEvent Shutdown = new ManualResetEvent(false);

    private static int Main(string[] args)
    {
        try
        {
            ServiceOptions options = ServiceOptions.Parse(args);
            ClassroomStore store = new ClassroomStore(options.DataDirectory);
            using (ClassroomHttpServer server = new ClassroomHttpServer(store, options.BindAddress, options.Port))
            using (ClassroomDiscoveryServer discovery = new ClassroomDiscoveryServer(
                store.InstanceId,
                options.BindAddress,
                server.Port,
                options.DiscoveryPort
            ))
            {
                Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs eventArgs)
                {
                    eventArgs.Cancel = true;
                    Shutdown.Set();
                };
                server.Start();
                discovery.Start();
                if (!String.IsNullOrWhiteSpace(options.ReadyFile))
                {
                    WriteReadyFile(options.ReadyFile, server.Port, discovery.Port, store.InstanceId);
                }
                Shutdown.WaitOne();
            }
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine("班级服务启动失败：" + exception.Message);
            return 2;
        }
    }

    private static void WriteReadyFile(string file, int port, int discoveryPort, string instanceId)
    {
        string directory = Path.GetDirectoryName(Path.GetFullPath(file));
        if (!String.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        Dictionary<string, object> payload = new Dictionary<string, object>();
        payload["status"] = "ok";
        payload["port"] = port;
        payload["discoveryPort"] = discoveryPort;
        payload["instanceId"] = instanceId;
        File.WriteAllText(file, JsonCodec.Serialize(payload), new UTF8Encoding(false));
    }
}

internal sealed class ServiceOptions
{
    public IPAddress BindAddress = IPAddress.Any;
    public int Port = 8788;
    public int DiscoveryPort = 18788;
    public string DataDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "物理研习室",
        "ClassroomService"
    );
    public string ReadyFile = "";

    public static ServiceOptions Parse(string[] args)
    {
        ServiceOptions options = new ServiceOptions();
        for (int index = 0; index < args.Length; index += 2)
        {
            if (index + 1 >= args.Length) throw new ArgumentException("启动参数缺少值。");
            string name = args[index];
            string value = args[index + 1];
            if (name == "--bind")
            {
                IPAddress address;
                if (!IPAddress.TryParse(value, out address)) throw new ArgumentException("绑定地址无效。");
                options.BindAddress = address;
            }
            else if (name == "--port") options.Port = ParsePort(value, "服务端口");
            else if (name == "--discovery-port") options.DiscoveryPort = ParsePort(value, "发现端口");
            else if (name == "--data-dir") options.DataDirectory = Path.GetFullPath(value);
            else if (name == "--ready-file") options.ReadyFile = Path.GetFullPath(value);
            else throw new ArgumentException("不支持的启动参数：" + name);
        }
        return options;
    }

    private static int ParsePort(string value, string label)
    {
        int port;
        if (!Int32.TryParse(value, out port) || port < 1 || port > 65535)
            throw new ArgumentException(label + "无效。");
        return port;
    }
}

internal static class JsonCodec
{
    public static readonly JavaScriptSerializer Serializer = CreateSerializer();

    private static JavaScriptSerializer CreateSerializer()
    {
        JavaScriptSerializer serializer = new JavaScriptSerializer();
        serializer.MaxJsonLength = 1024 * 1024;
        serializer.RecursionLimit = 64;
        return serializer;
    }

    public static string Serialize(object value)
    {
        lock (Serializer) return Serializer.Serialize(value);
    }

    public static T Deserialize<T>(string value)
    {
        lock (Serializer) return Serializer.Deserialize<T>(value);
    }

    public static Dictionary<string, object> Object(string value)
    {
        object parsed;
        lock (Serializer) parsed = Serializer.DeserializeObject(value);
        Dictionary<string, object> result = parsed as Dictionary<string, object>;
        if (result == null) throw new ClientError(400, "validation_error", "请求 JSON 必须是对象。");
        return result;
    }
}

internal static class SecurityTokens
{
    public static string RandomBase64Url(int bytes)
    {
        byte[] value = new byte[bytes];
        using (RandomNumberGenerator random = RandomNumberGenerator.Create()) random.GetBytes(value);
        return Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static string Sha256(string value)
    {
        byte[] input = Encoding.UTF8.GetBytes(value ?? "");
        using (SHA256 algorithm = SHA256.Create())
        {
            byte[] hash = algorithm.ComputeHash(input);
            StringBuilder output = new StringBuilder(hash.Length * 2);
            foreach (byte item in hash) output.Append(item.ToString("x2"));
            return output.ToString();
        }
    }

    public static bool FixedEquals(string left, string right)
    {
        byte[] a = Encoding.UTF8.GetBytes(left ?? "");
        byte[] b = Encoding.UTF8.GetBytes(right ?? "");
        int difference = a.Length ^ b.Length;
        int length = Math.Max(a.Length, b.Length);
        for (int index = 0; index < length; index++)
        {
            byte av = index < a.Length ? a[index] : (byte)0;
            byte bv = index < b.Length ? b[index] : (byte)0;
            difference |= av ^ bv;
        }
        return difference == 0;
    }
}

internal sealed class ClassroomStore
{
    private readonly object gate = new object();
    private readonly string dataFile;
    private readonly string backupFile;
    private DataEnvelope data;

    public ClassroomStore(string dataDirectory)
    {
        Directory.CreateDirectory(dataDirectory);
        dataFile = Path.Combine(dataDirectory, "classroom-data-v1.json");
        backupFile = Path.Combine(dataDirectory, "classroom-data-v1.backup.json");
        data = Load();
        if (String.IsNullOrWhiteSpace(data.InstanceId))
        {
            data.InstanceId = Guid.NewGuid().ToString();
            SaveLocked();
        }
    }

    public string InstanceId { get { lock (gate) return data.InstanceId; } }

    public Dictionary<string, object> CreateClass(string name)
    {
        name = RequiredText(name, "班级名称", 120);
        lock (gate)
        {
            DateTime now = DateTime.UtcNow;
            string ownerRaw = "oc1." + SecurityTokens.RandomBase64Url(32);
            ClassRecord record = new ClassRecord();
            record.Id = Guid.NewGuid().ToString();
            record.OwnerUserId = Guid.NewGuid().ToString();
            record.OwnerCapabilityHash = SecurityTokens.Sha256(ownerRaw);
            record.Name = name;
            record.Grade = "未设置";
            record.Subject = "物理";
            record.SchoolLabel = null;
            record.Status = "active";
            record.Revision = 1;
            record.CreatedAt = now.ToString("o");
            record.UpdatedAt = record.CreatedAt;
            data.Classes.Add(record);
            SaveLocked();

            Dictionary<string, object> result = new Dictionary<string, object>();
            result["class"] = ClassJson(record);
            result["ownerUserId"] = record.OwnerUserId;
            result["ownerCapability"] = ownerRaw;
            result["ownerCapabilityExpiresAt"] = now.AddYears(10).ToString("o");
            return result;
        }
    }

    public Dictionary<string, object> GetClass(string classId, string authorization)
    {
        lock (gate)
        {
            ClassRecord record = ActiveClass(classId);
            RequireClassAccess(record, authorization);
            return ClassJson(record);
        }
    }

    public Dictionary<string, object> ArchiveClass(string classId, string authorization)
    {
        lock (gate)
        {
            ClassRecord record = ActiveClass(classId);
            RequireOwner(record, authorization);
            record.Status = "archived";
            record.Revision += 1;
            record.UpdatedAt = DateTime.UtcNow.ToString("o");
            foreach (InviteRecord invite in data.Invites)
                if (invite.ClassId == classId) invite.Active = false;
            foreach (MembershipRecord membership in data.Memberships)
                if (membership.ClassId == classId) membership.Status = "removed";
            SaveLocked();
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["id"] = record.Id;
            result["status"] = record.Status;
            return result;
        }
    }

    public Dictionary<string, object> RotateInvite(
        string classId,
        string authorization,
        string expiresAt,
        int maxUses
    )
    {
        lock (gate)
        {
            ClassRecord record = ActiveClass(classId);
            RequireOwner(record, authorization);
            DateTime expiry;
            if (!DateTime.TryParse(expiresAt, null, System.Globalization.DateTimeStyles.RoundtripKind, out expiry)
                || expiry.ToUniversalTime() <= DateTime.UtcNow)
                throw new ClientError(400, "validation_error", "邀请码有效期无效。");
            if (maxUses < 1 || maxUses > 1000)
                throw new ClientError(400, "validation_error", "邀请码使用次数无效。");
            foreach (InviteRecord old in data.Invites)
                if (old.ClassId == classId) old.Active = false;
            string raw;
            string hash;
            do
            {
                raw = SecurityTokens.RandomBase64Url(16);
                hash = SecurityTokens.Sha256(raw);
            }
            while (data.Invites.Exists(delegate(InviteRecord item) { return item.CodeHash == hash; }));
            InviteRecord invite = new InviteRecord();
            invite.Id = Guid.NewGuid().ToString();
            invite.ClassId = classId;
            invite.CodeHash = hash;
            invite.ExpiresAt = expiry.ToUniversalTime().ToString("o");
            invite.MaxUses = maxUses;
            invite.UseCount = 0;
            invite.Active = true;
            data.Invites.Add(invite);
            SaveLocked();
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["id"] = invite.Id;
            result["code"] = raw;
            result["expiresAt"] = invite.ExpiresAt;
            result["maxUses"] = invite.MaxUses;
            return result;
        }
    }

    public Dictionary<string, object> Join(
        string inviteCode,
        string displayName,
        string deviceId
    )
    {
        inviteCode = RequiredPattern(inviteCode, "邀请码", new Regex("^[A-Za-z0-9_-]{22}$"));
        displayName = RequiredText(displayName, "备注名", 80);
        deviceId = RequiredPattern(deviceId, "设备标识", new Regex("^[0-9a-fA-F]{64}$"));
        lock (gate)
        {
            string inviteHash = SecurityTokens.Sha256(inviteCode);
            InviteRecord invite = data.Invites.Find(delegate(InviteRecord item)
            {
                return item.Active && SecurityTokens.FixedEquals(item.CodeHash, inviteHash);
            });
            if (invite == null) throw new ClientError(404, "invite_not_found", "邀请码无效。");
            ClassRecord classroom = data.Classes.Find(delegate(ClassRecord item)
            {
                return item.Id == invite.ClassId && item.Status == "active";
            });
            DateTime expiry;
            if (classroom == null || !DateTime.TryParse(invite.ExpiresAt, out expiry)
                || expiry.ToUniversalTime() <= DateTime.UtcNow || invite.UseCount >= invite.MaxUses)
            {
                invite.Active = false;
                SaveLocked();
                throw new ClientError(404, "invite_not_found", "邀请码无效。");
            }

            string deviceHash = SecurityTokens.Sha256(deviceId.ToLowerInvariant());
            StudentRecord student = data.Students.Find(delegate(StudentRecord item)
            {
                return SecurityTokens.FixedEquals(item.DeviceHash, deviceHash);
            });
            if (student == null)
            {
                student = new StudentRecord();
                student.Id = Guid.NewGuid().ToString();
                student.DeviceHash = deviceHash;
                student.DisplayName = displayName;
                student.CreatedAt = DateTime.UtcNow.ToString("o");
                data.Students.Add(student);
            }
            else student.DisplayName = displayName;

            MembershipRecord membership = data.Memberships.Find(delegate(MembershipRecord item)
            {
                return item.ClassId == classroom.Id && item.StudentId == student.Id;
            });
            if (membership == null)
            {
                membership = new MembershipRecord();
                membership.Id = Guid.NewGuid().ToString();
                membership.ClassId = classroom.Id;
                membership.StudentId = student.Id;
                membership.DisplayName = displayName;
                membership.Role = "student";
                membership.Status = "active";
                membership.JoinedAt = DateTime.UtcNow.ToString("o");
                data.Memberships.Add(membership);
                invite.UseCount += 1;
            }
            else
            {
                membership.DisplayName = displayName;
                membership.Status = "active";
                membership.Role = "student";
            }

            string accessToken = "at1." + student.Id + "." + SecurityTokens.RandomBase64Url(32);
            string refreshToken = "r1." + student.Id + "." + SecurityTokens.RandomBase64Url(32);
            SessionRecord session = new SessionRecord();
            session.StudentId = student.Id;
            session.AccessHash = SecurityTokens.Sha256(accessToken);
            session.RefreshHash = SecurityTokens.Sha256(refreshToken);
            session.ExpiresAt = DateTime.UtcNow.AddDays(30).ToString("o");
            data.Sessions.RemoveAll(delegate(SessionRecord item) { return item.StudentId == student.Id; });
            data.Sessions.Add(session);
            SaveLocked();
            return JoinJson(classroom, student, membership, accessToken, refreshToken);
        }
    }

    public Dictionary<string, object> Refresh(string refreshToken)
    {
        lock (gate)
        {
            string hash = SecurityTokens.Sha256(refreshToken);
            SessionRecord session = data.Sessions.Find(delegate(SessionRecord item)
            {
                return SecurityTokens.FixedEquals(item.RefreshHash, hash);
            });
            if (session == null) throw new ClientError(401, "invalid_refresh_token", "登录已失效。");
            StudentRecord student = Student(session.StudentId);
            string access = "at1." + student.Id + "." + SecurityTokens.RandomBase64Url(32);
            string refresh = "r1." + student.Id + "." + SecurityTokens.RandomBase64Url(32);
            session.AccessHash = SecurityTokens.Sha256(access);
            session.RefreshHash = SecurityTokens.Sha256(refresh);
            session.ExpiresAt = DateTime.UtcNow.AddDays(30).ToString("o");
            SaveLocked();
            return AuthJson(student, access, refresh);
        }
    }

    public void Logout(string refreshToken)
    {
        lock (gate)
        {
            string hash = SecurityTokens.Sha256(refreshToken);
            data.Sessions.RemoveAll(delegate(SessionRecord item)
            {
                return SecurityTokens.FixedEquals(item.RefreshHash, hash);
            });
            SaveLocked();
        }
    }

    public Dictionary<string, object> ListClasses(string authorization)
    {
        lock (gate)
        {
            StudentRecord student = RequireStudent(authorization);
            List<object> items = new List<object>();
            foreach (MembershipRecord membership in data.Memberships)
            {
                if (membership.StudentId != student.Id || membership.Status != "active") continue;
                ClassRecord classroom = data.Classes.Find(delegate(ClassRecord item)
                {
                    return item.Id == membership.ClassId && item.Status == "active";
                });
                if (classroom != null) items.Add(ClassJson(classroom));
            }
            return ListJson(items);
        }
    }

    public Dictionary<string, object> ListRoster(string classId, string authorization)
    {
        lock (gate)
        {
            ClassRecord classroom = ActiveClass(classId);
            RequireOwner(classroom, authorization);
            List<object> items = new List<object>();
            foreach (MembershipRecord membership in data.Memberships)
                if (membership.ClassId == classId && membership.Status != "removed")
                    items.Add(MembershipJson(membership));
            return ListJson(items);
        }
    }

    public Dictionary<string, object> ListGroups(string classId, string authorization)
    {
        lock (gate)
        {
            ClassRecord classroom = ActiveClass(classId);
            RequireClassAccess(classroom, authorization);
            List<object> items = new List<object>();
            foreach (GroupRecord group in data.Groups)
                if (group.ClassId == classId) items.Add(GroupJson(group));
            return ListJson(items);
        }
    }

    public Dictionary<string, object> CreateGroup(string classId, string authorization, string name)
    {
        name = RequiredText(name, "分组名称", 80);
        lock (gate)
        {
            ClassRecord classroom = ActiveClass(classId);
            RequireOwner(classroom, authorization);
            if (data.Groups.Exists(delegate(GroupRecord item)
                { return item.ClassId == classId && String.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase); }))
                throw new ClientError(409, "group_name_conflict", "分组名称已存在。");
            GroupRecord group = new GroupRecord();
            group.Id = Guid.NewGuid().ToString();
            group.ClassId = classId;
            group.Name = name;
            group.CreatedAt = DateTime.UtcNow.ToString("o");
            data.Groups.Add(group);
            SaveLocked();
            return GroupJson(group);
        }
    }

    public Dictionary<string, object> ListAssignments(string classId, string authorization)
    {
        lock (gate)
        {
            ClassRecord classroom = ActiveClass(classId);
            StudentRecord student = null;
            MembershipRecord membership = null;
            bool owner = authorization != null && authorization.StartsWith("Owner ", StringComparison.Ordinal);
            if (owner) RequireOwner(classroom, authorization);
            else
            {
                student = RequireStudent(authorization);
                membership = data.Memberships.Find(delegate(MembershipRecord item)
                {
                    return item.ClassId == classId && item.StudentId == student.Id && item.Status == "active";
                });
                if (membership == null)
                    throw new ClientError(403, "resource_forbidden", "无权访问该班级。");
            }
            List<object> items = new List<object>();
            foreach (AssignmentRecord assignment in data.Assignments)
            {
                if (assignment.ClassId != classId) continue;
                if (!owner && !assignment.Published) continue;
                if (!owner && assignment.TargetType == "group" && assignment.TargetId != membership.GroupId) continue;
                if (!owner && assignment.TargetType == "student"
                    && assignment.TargetId != membership.Id && assignment.TargetId != student.Id) continue;
                items.Add(AssignmentJson(assignment));
            }
            return ListJson(items);
        }
    }

    public Dictionary<string, object> CreateAssignment(
        string classId,
        string authorization,
        Dictionary<string, object> body
    )
    {
        lock (gate)
        {
            ClassRecord classroom = ActiveClass(classId);
            RequireOwner(classroom, authorization);
            AssignmentRecord assignment = new AssignmentRecord();
            assignment.Id = Guid.NewGuid().ToString();
            assignment.ClassId = classId;
            assignment.Title = RequiredText(BodyText(body, "title"), "作业标题", 160);
            assignment.Instructions = OptionalText(body, "instructions", 30000);
            assignment.DueAt = NullableDate(body, "dueAt");
            assignment.TargetType = OptionalText(body, "targetType", 20);
            if (assignment.TargetType != "class" && assignment.TargetType != "group" && assignment.TargetType != "student")
                assignment.TargetType = "class";
            assignment.TargetId = OptionalNullableText(body, "targetId", 160);
            assignment.QuestionIds = StringList(body, "questionIds", 100, 160);
            assignment.KnowledgePointKeys = StringList(body, "knowledgePointKeys", 100, 160);
            assignment.Target = RequiredText(BodyText(body, "target"), "达标条件", 1000);
            assignment.Published = BooleanValue(body, "publish");
            assignment.CreatedAt = DateTime.UtcNow.ToString("o");
            data.Assignments.Add(assignment);
            SaveLocked();
            return AssignmentJson(assignment);
        }
    }

    public Dictionary<string, object> SubmitAssignment(
        string assignmentId,
        string authorization,
        Dictionary<string, object> body
    )
    {
        lock (gate)
        {
            AssignmentRecord assignment = data.Assignments.Find(delegate(AssignmentRecord item)
                { return item.Id == assignmentId; });
            if (assignment == null || !assignment.Published)
                throw new ClientError(404, "assignment_not_found", "作业不存在。");
            StudentRecord student = RequireStudent(authorization);
            MembershipRecord membership = data.Memberships.Find(delegate(MembershipRecord item)
            {
                return item.ClassId == assignment.ClassId && item.StudentId == student.Id && item.Status == "active";
            });
            if (membership == null)
                throw new ClientError(403, "resource_forbidden", "无权提交该班级作业。");
            string clientEntityId = RequiredText(BodyText(body, "clientEntityId"), "提交编号", 160);
            SubmissionRecord existing = data.Submissions.Find(delegate(SubmissionRecord item)
            {
                return item.AssignmentId == assignmentId && item.StudentId == student.Id
                    && item.ClientEntityId == clientEntityId;
            });
            if (existing != null) return SubmissionJson(existing);
            SubmissionRecord submission = new SubmissionRecord();
            submission.Id = Guid.NewGuid().ToString();
            submission.AssignmentId = assignmentId;
            submission.StudentId = student.Id;
            submission.ClientEntityId = clientEntityId;
            submission.AnswersJson = JsonCodec.Serialize(body.ContainsKey("answers") ? body["answers"] : new object[0]);
            submission.Status = "submitted";
            submission.SubmittedAt = DateTime.UtcNow.ToString("o");
            data.Submissions.Add(submission);
            SaveLocked();
            return SubmissionJson(submission);
        }
    }

    public Dictionary<string, object> UpdateMembership(
        string membershipId,
        string authorization,
        Dictionary<string, object> body
    )
    {
        lock (gate)
        {
            MembershipRecord membership = data.Memberships.Find(delegate(MembershipRecord item)
                { return item.Id == membershipId; });
            if (membership == null) throw new ClientError(404, "membership_not_found", "成员不存在。");
            ClassRecord classroom = ActiveClass(membership.ClassId);
            RequireOwner(classroom, authorization);
            if (body.ContainsKey("status"))
            {
                string status = Convert.ToString(body["status"]);
                if (status != "active" && status != "removed")
                    throw new ClientError(400, "validation_error", "成员状态无效。");
                membership.Status = status;
            }
            if (body.ContainsKey("groupId")) membership.GroupId = body["groupId"] == null ? null : Convert.ToString(body["groupId"]);
            if (body.ContainsKey("studentNumber")) membership.StudentNumber = body["studentNumber"] == null ? null : Convert.ToString(body["studentNumber"]);
            SaveLocked();
            return MembershipJson(membership);
        }
    }

    public Dictionary<string, object> UpdateDisplayName(string authorization, string displayName)
    {
        displayName = RequiredText(displayName, "备注名", 80);
        lock (gate)
        {
            StudentRecord student = RequireStudent(authorization);
            student.DisplayName = displayName;
            foreach (MembershipRecord membership in data.Memberships)
                if (membership.StudentId == student.Id) membership.DisplayName = displayName;
            SaveLocked();
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["user"] = UserJson(student);
            return result;
        }
    }

    public Dictionary<string, object> EmptyClassCollection(string classId, string authorization)
    {
        lock (gate)
        {
            ClassRecord classroom = ActiveClass(classId);
            RequireClassAccess(classroom, authorization);
            return ListJson(new List<object>());
        }
    }

    public Dictionary<string, object> AcceptLearningSync(string classId, string authorization)
    {
        lock (gate)
        {
            ClassRecord classroom = ActiveClass(classId);
            RequireClassAccess(classroom, authorization);
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["accepted"] = 0;
            result["duplicates"] = 0;
            result["conflicts"] = new List<object>();
            result["lastAcceptedAt"] = DateTime.UtcNow.ToString("o");
            return result;
        }
    }

    private DataEnvelope Load()
    {
        if (!File.Exists(dataFile)) return DataEnvelope.New();
        try
        {
            DataEnvelope loaded = JsonCodec.Deserialize<DataEnvelope>(File.ReadAllText(dataFile, Encoding.UTF8));
            if (loaded == null || loaded.SchemaVersion != 1) throw new InvalidDataException("班级数据版本无效。");
            loaded.Normalize();
            return loaded;
        }
        catch
        {
            if (!File.Exists(backupFile)) throw;
            DataEnvelope backup = JsonCodec.Deserialize<DataEnvelope>(File.ReadAllText(backupFile, Encoding.UTF8));
            if (backup == null || backup.SchemaVersion != 1) throw;
            backup.Normalize();
            return backup;
        }
    }

    private void SaveLocked()
    {
        string temporary = dataFile + ".tmp-" + Guid.NewGuid().ToString("N");
        byte[] bytes = new UTF8Encoding(false).GetBytes(JsonCodec.Serialize(data));
        using (FileStream stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        {
            stream.Write(bytes, 0, bytes.Length);
            stream.Flush(true);
        }
        if (File.Exists(dataFile)) File.Replace(temporary, dataFile, backupFile, true);
        else File.Move(temporary, dataFile);
    }

    private ClassRecord ActiveClass(string classId)
    {
        Guid parsed;
        if (!Guid.TryParse(classId, out parsed)) throw new ClientError(400, "validation_error", "班级编号无效。");
        ClassRecord record = data.Classes.Find(delegate(ClassRecord item)
            { return item.Id == classId.ToLowerInvariant() && item.Status == "active"; });
        if (record == null) throw new ClientError(404, "class_not_found", "班级不存在。");
        return record;
    }

    private void RequireOwner(ClassRecord classroom, string authorization)
    {
        if (!String.IsNullOrWhiteSpace(authorization)
            && !authorization.StartsWith("Owner ", StringComparison.Ordinal))
            throw new ClientError(403, "resource_forbidden", "无权管理该班级。");
        string token = AuthorizationToken(authorization, "Owner");
        if (!SecurityTokens.FixedEquals(classroom.OwnerCapabilityHash, SecurityTokens.Sha256(token)))
            throw new ClientError(403, "resource_forbidden", "无权管理该班级。");
    }

    private StudentRecord RequireStudent(string authorization)
    {
        string token = AuthorizationToken(authorization, "Bearer");
        string hash = SecurityTokens.Sha256(token);
        SessionRecord session = data.Sessions.Find(delegate(SessionRecord item)
            { return SecurityTokens.FixedEquals(item.AccessHash, hash); });
        DateTime expiry;
        if (session == null || !DateTime.TryParse(session.ExpiresAt, out expiry)
            || expiry.ToUniversalTime() <= DateTime.UtcNow)
            throw new ClientError(401, "invalid_access_token", "登录已失效。");
        return Student(session.StudentId);
    }

    private void RequireClassAccess(ClassRecord classroom, string authorization)
    {
        if (authorization != null && authorization.StartsWith("Owner ", StringComparison.Ordinal))
        {
            RequireOwner(classroom, authorization);
            return;
        }
        StudentRecord student = RequireStudent(authorization);
        bool member = data.Memberships.Exists(delegate(MembershipRecord item)
            { return item.ClassId == classroom.Id && item.StudentId == student.Id && item.Status == "active"; });
        if (!member) throw new ClientError(403, "resource_forbidden", "无权访问该班级。");
    }

    private StudentRecord Student(string id)
    {
        StudentRecord student = data.Students.Find(delegate(StudentRecord item) { return item.Id == id; });
        if (student == null) throw new ClientError(401, "invalid_access_token", "登录已失效。");
        return student;
    }

    private static string AuthorizationToken(string header, string scheme)
    {
        string prefix = scheme + " ";
        if (String.IsNullOrWhiteSpace(header) || !header.StartsWith(prefix, StringComparison.Ordinal))
            throw new ClientError(401, "authentication_required", "需要有效身份。");
        string token = header.Substring(prefix.Length).Trim();
        if (token.Length < 40 || token.Length > 512)
            throw new ClientError(401, "authentication_required", "需要有效身份。");
        return token;
    }

    private static string BodyText(Dictionary<string, object> body, string key)
    {
        object value;
        return body != null && body.TryGetValue(key, out value) && value is string
            ? (string)value
            : "";
    }

    private static string OptionalText(Dictionary<string, object> body, string key, int maximum)
    {
        object value;
        if (body == null || !body.TryGetValue(key, out value) || value == null) return "";
        string text = value as string;
        if (text == null || text.Length > maximum)
            throw new ClientError(400, "validation_error", "文本字段无效。");
        return text;
    }

    private static string OptionalNullableText(Dictionary<string, object> body, string key, int maximum)
    {
        object value;
        if (body == null || !body.TryGetValue(key, out value) || value == null) return null;
        return RequiredText(value as string, "文本字段", maximum);
    }

    private static string NullableDate(Dictionary<string, object> body, string key)
    {
        object value;
        if (body == null || !body.TryGetValue(key, out value) || value == null) return null;
        string text = value as string;
        DateTime parsed;
        if (text == null || !DateTime.TryParse(text, null, System.Globalization.DateTimeStyles.RoundtripKind, out parsed))
            throw new ClientError(400, "validation_error", "日期时间无效。");
        return parsed.ToUniversalTime().ToString("o");
    }

    private static bool BooleanValue(Dictionary<string, object> body, string key)
    {
        object value;
        return body != null && body.TryGetValue(key, out value) && value is bool && (bool)value;
    }

    private static List<string> StringList(
        Dictionary<string, object> body,
        string key,
        int maximumItems,
        int maximumLength
    )
    {
        object value;
        List<string> result = new List<string>();
        if (body == null || !body.TryGetValue(key, out value) || value == null) return result;
        IEnumerable items = value as IEnumerable;
        if (items == null || value is string)
            throw new ClientError(400, "validation_error", "列表字段无效。");
        foreach (object item in items)
        {
            if (result.Count >= maximumItems)
                throw new ClientError(400, "validation_error", "列表字段过长。");
            result.Add(RequiredText(item as string, "列表字段", maximumLength));
        }
        return result;
    }

    private static string RequiredText(string value, string label, int maximum)
    {
        string text = (value ?? "").Trim();
        if (text.Length == 0 || text.Length > maximum)
            throw new ClientError(400, "validation_error", label + "无效。");
        return text;
    }

    private static string RequiredPattern(string value, string label, Regex pattern)
    {
        string text = (value ?? "").Trim();
        if (!pattern.IsMatch(text)) throw new ClientError(400, "validation_error", label + "无效。");
        return text;
    }

    private static Dictionary<string, object> ClassJson(ClassRecord record)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["id"] = record.Id;
        result["name"] = record.Name;
        result["grade"] = record.Grade;
        result["subject"] = record.Subject;
        result["schoolLabel"] = record.SchoolLabel;
        result["status"] = record.Status;
        result["revision"] = record.Revision;
        result["createdAt"] = record.CreatedAt;
        result["updatedAt"] = record.UpdatedAt;
        return result;
    }

    private static Dictionary<string, object> UserJson(StudentRecord student)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["id"] = student.Id;
        result["role"] = "student";
        result["displayName"] = student.DisplayName;
        result["status"] = "active";
        result["mustChangePassword"] = false;
        result["deletionPending"] = false;
        return result;
    }

    private static Dictionary<string, object> MembershipJson(MembershipRecord membership)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["id"] = membership.Id;
        result["classId"] = membership.ClassId;
        result["studentId"] = membership.StudentId;
        result["displayName"] = membership.DisplayName;
        result["role"] = "student";
        result["status"] = membership.Status;
        result["joinedAt"] = membership.JoinedAt;
        result["groupId"] = membership.GroupId;
        result["studentNumber"] = membership.StudentNumber;
        return result;
    }

    private static Dictionary<string, object> GroupJson(GroupRecord group)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["id"] = group.Id;
        result["classId"] = group.ClassId;
        result["name"] = group.Name;
        result["createdAt"] = group.CreatedAt;
        return result;
    }

    private static Dictionary<string, object> AssignmentJson(AssignmentRecord assignment)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["id"] = assignment.Id;
        result["classId"] = assignment.ClassId;
        result["title"] = assignment.Title;
        result["instructions"] = assignment.Instructions;
        result["dueAt"] = assignment.DueAt;
        result["targetType"] = assignment.TargetType;
        result["targetId"] = assignment.TargetId;
        result["questionIds"] = assignment.QuestionIds;
        result["knowledgePointKeys"] = assignment.KnowledgePointKeys;
        result["target"] = assignment.Target;
        result["status"] = assignment.Published ? "published" : "draft";
        result["published"] = assignment.Published;
        result["createdAt"] = assignment.CreatedAt;
        return result;
    }

    private static Dictionary<string, object> SubmissionJson(SubmissionRecord submission)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["id"] = submission.Id;
        result["assignmentId"] = submission.AssignmentId;
        result["studentId"] = submission.StudentId;
        result["clientEntityId"] = submission.ClientEntityId;
        result["status"] = submission.Status;
        result["submittedAt"] = submission.SubmittedAt;
        return result;
    }

    private static Dictionary<string, object> AuthJson(StudentRecord student, string access, string refresh)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["accessToken"] = access;
        result["refreshToken"] = refresh;
        result["user"] = UserJson(student);
        return result;
    }

    private static Dictionary<string, object> JoinJson(
        ClassRecord classroom,
        StudentRecord student,
        MembershipRecord membership,
        string access,
        string refresh
    )
    {
        Dictionary<string, object> result = AuthJson(student, access, refresh);
        result["class"] = ClassJson(classroom);
        result["membership"] = MembershipJson(membership);
        return result;
    }

    private static Dictionary<string, object> ListJson(List<object> items)
    {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["items"] = items;
        result["nextCursor"] = null;
        return result;
    }
}

internal sealed class ClassroomHttpServer : IDisposable
{
    private const int MaximumHeaderBytes = 16 * 1024;
    private const int MaximumBodyBytes = 64 * 1024;
    private readonly ClassroomStore store;
    private readonly TcpListener listener;
    private readonly Dictionary<string, Queue<DateTime>> rateWindows = new Dictionary<string, Queue<DateTime>>();
    private readonly object rateGate = new object();
    private volatile bool running;
    private Thread acceptThread;

    public ClassroomHttpServer(ClassroomStore store, IPAddress address, int port)
    {
        this.store = store;
        listener = new TcpListener(address, port);
    }

    public int Port { get { return ((IPEndPoint)listener.LocalEndpoint).Port; } }

    public void Start()
    {
        listener.Start(100);
        running = true;
        acceptThread = new Thread(AcceptLoop);
        acceptThread.IsBackground = true;
        acceptThread.Name = "PhysicsStudioClassroomHttp";
        acceptThread.Start();
    }

    private void AcceptLoop()
    {
        while (running)
        {
            try
            {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(HandleClientWorkItem, client);
            }
            catch (SocketException) { if (running) Thread.Sleep(20); }
            catch (ObjectDisposedException) { return; }
        }
    }

    private void HandleClientWorkItem(object state)
    {
        TcpClient client = state as TcpClient;
        if (client != null) HandleClient(client);
    }

    private void HandleClient(TcpClient client)
    {
        using (client)
        {
            client.ReceiveTimeout = 7000;
            client.SendTimeout = 7000;
            try
            {
                NetworkStream stream = client.GetStream();
                HttpRequest request = HttpRequest.Read(stream, MaximumHeaderBytes, MaximumBodyBytes);
                string remoteAddress = ((IPEndPoint)client.Client.RemoteEndPoint).Address.ToString();
                HttpResponse response = Dispatch(request, remoteAddress);
                response.Write(stream);
            }
            catch (ClientError error)
            {
                try { HttpResponse.Error(error.Status, error.Code, error.Message).Write(client.GetStream()); }
                catch { }
            }
            catch
            {
                try { HttpResponse.Error(500, "internal_error", "班级服务暂时异常。").Write(client.GetStream()); }
                catch { }
            }
        }
    }

    private HttpResponse Dispatch(HttpRequest request, string remoteAddress)
    {
        if (!IsSameLanPeer(remoteAddress))
            throw new ClientError(403, "lan_peer_required", "学生设备必须与教师设备位于同一局域网。");
        if (request.Method == "OPTIONS") return HttpResponse.Empty(204);
        if (request.Path == "/health/live" && request.Method == "GET")
        {
            Dictionary<string, object> health = new Dictionary<string, object>();
            health["status"] = "ok";
            health["service"] = "physics-studio-lan-classroom";
            health["protocolVersion"] = 1;
            return HttpResponse.Json(200, health);
        }
        if (request.Method != "GET" && request.Method != "HEAD") RequireMutationKey(request);
        if ((request.Path == "/v1/classes/anonymous" || request.Path == "/v1/invites/join-anonymous")
            && request.Method == "POST") RateLimit(remoteAddress);

        string[] segment = request.Path.Trim('/').Split('/');
        string authorization = request.Header("Authorization");
        if (request.Path == "/v1/classes/anonymous" && request.Method == "POST")
        {
            Dictionary<string, object> body = request.JsonBody();
            return HttpResponse.Json(201, store.CreateClass(Text(body, "name")));
        }
        if (request.Path == "/v1/invites/join-anonymous" && request.Method == "POST")
        {
            Dictionary<string, object> body = request.JsonBody();
            return HttpResponse.Json(200, store.Join(Text(body, "code"), Text(body, "displayName"), Text(body, "deviceId")));
        }
        if (request.Path == "/v1/auth/refresh" && request.Method == "POST")
            return HttpResponse.Json(200, store.Refresh(Text(request.JsonBody(), "refreshToken")));
        if (request.Path == "/v1/auth/logout" && request.Method == "POST")
        {
            store.Logout(Text(request.JsonBody(), "refreshToken"));
            return HttpResponse.Empty(204);
        }
        if (request.Path == "/v1/classes" && request.Method == "GET")
            return HttpResponse.Json(200, store.ListClasses(authorization));
        if (request.Path == "/v1/account/self" && request.Method == "PATCH")
            return HttpResponse.Json(200, store.UpdateDisplayName(authorization, Text(request.JsonBody(), "displayName")));
        if (segment.Length == 3 && segment[0] == "v1" && segment[1] == "classes")
        {
            string classId = segment[2].ToLowerInvariant();
            if (request.Method == "GET") return HttpResponse.Json(200, store.GetClass(classId, authorization));
            if (request.Method == "DELETE") return HttpResponse.Json(200, store.ArchiveClass(classId, authorization));
        }
        if (segment.Length == 4 && segment[0] == "v1" && segment[1] == "classes")
        {
            string classId = segment[2].ToLowerInvariant();
            if (segment[3] == "invites" && request.Method == "POST")
            {
                Dictionary<string, object> body = request.JsonBody();
                return HttpResponse.Json(201, store.RotateInvite(
                    classId,
                    authorization,
                    Text(body, "expiresAt"),
                    Integer(body, "maxUses")
                ));
            }
            if (segment[3] == "roster" && request.Method == "GET")
                return HttpResponse.Json(200, store.ListRoster(classId, authorization));
            if (segment[3] == "groups" && request.Method == "GET")
                return HttpResponse.Json(200, store.ListGroups(classId, authorization));
            if (segment[3] == "groups" && request.Method == "POST")
                return HttpResponse.Json(201, store.CreateGroup(classId, authorization, Text(request.JsonBody(), "name")));
            if (segment[3] == "assignments" && request.Method == "GET")
                return HttpResponse.Json(200, store.ListAssignments(classId, authorization));
            if (segment[3] == "assignments" && request.Method == "POST")
                return HttpResponse.Json(201, store.CreateAssignment(classId, authorization, request.JsonBody()));
            if (segment[3] == "review-cases" && request.Method == "GET")
                return HttpResponse.Json(200, store.EmptyClassCollection(classId, authorization));
        }
        if (segment.Length == 5 && segment[0] == "v1" && segment[1] == "classes")
        {
            string classId = segment[2].ToLowerInvariant();
            if (segment[3] == "learning" && segment[4] == "summary" && request.Method == "GET")
                return HttpResponse.Json(200, store.EmptyClassCollection(classId, authorization));
            if (segment[3] == "learning" && (segment[4] == "sync" || segment[4] == "exams") && request.Method == "POST")
                return HttpResponse.Json(200, store.AcceptLearningSync(classId, authorization));
            if (segment[3] == "learning" && segment[4] == "report-snapshots" && request.Method == "POST")
                return HttpResponse.Json(201, store.AcceptLearningSync(classId, authorization));
        }
        if (segment.Length == 6 && segment[0] == "v1" && segment[1] == "classes"
            && segment[3] == "learning" && segment[4] == "report-snapshots" && request.Method == "GET")
            return HttpResponse.Json(200, store.EmptyClassCollection(segment[2].ToLowerInvariant(), authorization));
        if (segment.Length == 3 && segment[0] == "v1" && segment[1] == "memberships" && request.Method == "PATCH")
            return HttpResponse.Json(200, store.UpdateMembership(segment[2].ToLowerInvariant(), authorization, request.JsonBody()));
        if (segment.Length == 4 && segment[0] == "v1" && segment[1] == "assignments"
            && segment[3] == "submissions" && request.Method == "POST")
            return HttpResponse.Json(201, store.SubmitAssignment(
                segment[2].ToLowerInvariant(),
                authorization,
                request.JsonBody()
            ));
        throw new ClientError(404, "not_found", "请求的班级资源不存在。");
    }

    private static bool IsSameLanPeer(string remoteAddress)
    {
        IPAddress remote;
        if (!IPAddress.TryParse(remoteAddress, out remote)) return false;
        if (IPAddress.IsLoopback(remote)) return true;
        if (remote.AddressFamily != AddressFamily.InterNetwork) return false;
        byte[] remoteBytes = remote.GetAddressBytes();
        foreach (NetworkInterface item in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (item.OperationalStatus != OperationalStatus.Up
                || item.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
            foreach (UnicastIPAddressInformation address in item.GetIPProperties().UnicastAddresses)
            {
                if (address.Address.AddressFamily != AddressFamily.InterNetwork || address.IPv4Mask == null) continue;
                byte[] localBytes = address.Address.GetAddressBytes();
                byte[] maskBytes = address.IPv4Mask.GetAddressBytes();
                bool matches = true;
                for (int index = 0; index < 4; index++)
                {
                    if ((localBytes[index] & maskBytes[index]) != (remoteBytes[index] & maskBytes[index]))
                    {
                        matches = false;
                        break;
                    }
                }
                if (matches) return true;
            }
        }
        return false;
    }

    private void RateLimit(string address)
    {
        lock (rateGate)
        {
            Queue<DateTime> entries;
            if (!rateWindows.TryGetValue(address, out entries))
            {
                entries = new Queue<DateTime>();
                rateWindows[address] = entries;
            }
            DateTime cutoff = DateTime.UtcNow.AddMinutes(-1);
            while (entries.Count > 0 && entries.Peek() < cutoff) entries.Dequeue();
            if (entries.Count >= 60) throw new ClientError(429, "rate_limit_exceeded", "操作过于频繁。");
            entries.Enqueue(DateTime.UtcNow);
        }
    }

    private static void RequireMutationKey(HttpRequest request)
    {
        string key = request.Header("Idempotency-Key");
        if (String.IsNullOrWhiteSpace(key) || key.Length < 16 || key.Length > 128)
            throw new ClientError(400, "idempotency_key_required", "缺少防重复提交标识。");
    }

    private static string Text(Dictionary<string, object> body, string key)
    {
        object value;
        return body.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : "";
    }

    private static int Integer(Dictionary<string, object> body, string key)
    {
        object value;
        int number;
        if (!body.TryGetValue(key, out value) || !Int32.TryParse(Convert.ToString(value), out number))
            throw new ClientError(400, "validation_error", key + "无效。");
        return number;
    }

    public void Dispose()
    {
        running = false;
        try { listener.Stop(); } catch { }
        if (acceptThread != null && acceptThread.IsAlive) acceptThread.Join(500);
    }
}

internal sealed class HttpRequest
{
    public string Method;
    public string Path;
    public Dictionary<string, string> Headers;
    public string Body;

    public string Header(string name)
    {
        string value;
        return Headers.TryGetValue(name, out value) ? value : "";
    }

    public Dictionary<string, object> JsonBody()
    {
        if (String.IsNullOrWhiteSpace(Body)) throw new ClientError(400, "validation_error", "缺少请求内容。");
        try { return JsonCodec.Object(Body); }
        catch (ClientError) { throw; }
        catch { throw new ClientError(400, "validation_error", "请求 JSON 无效。"); }
    }

    public static HttpRequest Read(NetworkStream stream, int maximumHeaderBytes, int maximumBodyBytes)
    {
        List<byte> header = new List<byte>();
        int state = 0;
        while (header.Count < maximumHeaderBytes)
        {
            int value = stream.ReadByte();
            if (value < 0) throw new ClientError(400, "validation_error", "请求不完整。");
            header.Add((byte)value);
            if ((state == 0 || state == 2) && value == '\r') state += 1;
            else if ((state == 1 || state == 3) && value == '\n') state += 1;
            else state = value == '\r' ? 1 : 0;
            if (state == 4) break;
        }
        if (state != 4) throw new ClientError(431, "headers_too_large", "请求头过大。");
        string headerText = Encoding.ASCII.GetString(header.ToArray());
        string[] lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
        string[] first = lines[0].Split(' ');
        if (first.Length != 3 || first[2] != "HTTP/1.1") throw new ClientError(400, "validation_error", "HTTP 请求无效。");
        Uri target;
        if (!Uri.TryCreate("http://localhost" + first[1], UriKind.Absolute, out target))
            throw new ClientError(400, "validation_error", "请求路径无效。");
        HttpRequest request = new HttpRequest();
        request.Method = first[0].ToUpperInvariant();
        request.Path = target.AbsolutePath;
        request.Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int index = 1; index < lines.Length; index++)
        {
            int separator = lines[index].IndexOf(':');
            if (separator <= 0) continue;
            string name = lines[index].Substring(0, separator).Trim();
            string value = lines[index].Substring(separator + 1).Trim();
            if (name.Length <= 80 && value.Length <= 4096) request.Headers[name] = value;
        }
        int contentLength = 0;
        string contentLengthText = request.Header("Content-Length");
        if (!String.IsNullOrEmpty(contentLengthText)
            && (!Int32.TryParse(contentLengthText, out contentLength) || contentLength < 0))
            throw new ClientError(400, "validation_error", "Content-Length 无效。");
        if (contentLength > maximumBodyBytes)
        {
            // Drain a bounded, already-declared overage before returning 413.
            // Closing a Windows TCP socket with unread request bytes can turn
            // the intended HTTP response into ECONNRESET on real clients.
            if (contentLength <= maximumBodyBytes * 2)
            {
                byte[] discard = new byte[8192];
                int remaining = contentLength;
                while (remaining > 0)
                {
                    int count = stream.Read(discard, 0, Math.Min(discard.Length, remaining));
                    if (count <= 0) break;
                    remaining -= count;
                }
            }
            throw new ClientError(413, "request_too_large", "请求内容过大。");
        }
        byte[] body = new byte[contentLength];
        int offset = 0;
        while (offset < contentLength)
        {
            int count = stream.Read(body, offset, contentLength - offset);
            if (count <= 0) throw new ClientError(400, "validation_error", "请求内容不完整。");
            offset += count;
        }
        request.Body = Encoding.UTF8.GetString(body);
        return request;
    }
}

internal sealed class HttpResponse
{
    public int Status;
    public string Body;

    public static HttpResponse Json(int status, object value)
    {
        HttpResponse response = new HttpResponse();
        response.Status = status;
        response.Body = JsonCodec.Serialize(value);
        return response;
    }

    public static HttpResponse Error(int status, string code, string message)
    {
        Dictionary<string, object> body = new Dictionary<string, object>();
        body["code"] = code;
        body["message"] = message;
        body["requestId"] = "lan-" + Guid.NewGuid().ToString("N").Substring(0, 16);
        return Json(status, body);
    }

    public static HttpResponse Empty(int status)
    {
        HttpResponse response = new HttpResponse();
        response.Status = status;
        response.Body = "";
        return response;
    }

    public void Write(NetworkStream stream)
    {
        byte[] body = Encoding.UTF8.GetBytes(Body ?? "");
        string reason = Reason(Status);
        string headers = "HTTP/1.1 " + Status + " " + reason + "\r\n"
            + "Content-Type: application/json; charset=utf-8\r\n"
            + "Content-Length: " + body.Length + "\r\n"
            + "Cache-Control: no-store\r\n"
            + "X-Content-Type-Options: nosniff\r\n"
            + "Connection: close\r\n\r\n";
        byte[] prefix = Encoding.ASCII.GetBytes(headers);
        stream.Write(prefix, 0, prefix.Length);
        if (body.Length > 0) stream.Write(body, 0, body.Length);
        stream.Flush();
    }

    private static string Reason(int status)
    {
        if (status == 200) return "OK";
        if (status == 201) return "Created";
        if (status == 204) return "No Content";
        if (status == 400) return "Bad Request";
        if (status == 401) return "Unauthorized";
        if (status == 403) return "Forbidden";
        if (status == 404) return "Not Found";
        if (status == 409) return "Conflict";
        if (status == 413) return "Payload Too Large";
        if (status == 429) return "Too Many Requests";
        if (status == 431) return "Request Header Fields Too Large";
        return "Internal Server Error";
    }
}

internal sealed class ClassroomDiscoveryServer : IDisposable
{
    private const string Prefix = "PHYSICS_STUDIO_CLASSROOM_DISCOVER_V1:";
    private readonly string instanceId;
    private readonly IPAddress bindAddress;
    private readonly int servicePort;
    private readonly int configuredPort;
    private volatile bool running;
    private UdpClient socket;
    private Thread thread;

    public ClassroomDiscoveryServer(string instanceId, IPAddress bindAddress, int servicePort, int port)
    {
        this.instanceId = instanceId;
        this.bindAddress = bindAddress;
        this.servicePort = servicePort;
        configuredPort = port;
    }

    public int Port { get { return ((IPEndPoint)socket.Client.LocalEndPoint).Port; } }

    public void Start()
    {
        socket = new UdpClient(new IPEndPoint(bindAddress, configuredPort));
        running = true;
        thread = new Thread(Loop);
        thread.IsBackground = true;
        thread.Name = "PhysicsStudioClassroomDiscovery";
        thread.Start();
    }

    private void Loop()
    {
        IPEndPoint sender = new IPEndPoint(IPAddress.Any, 0);
        while (running)
        {
            try
            {
                byte[] packet = socket.Receive(ref sender);
                string value = Encoding.UTF8.GetString(packet);
                if (!value.StartsWith(Prefix, StringComparison.Ordinal)) continue;
                string nonce = value.Substring(Prefix.Length);
                if (!Regex.IsMatch(nonce, "^[A-Za-z0-9_-]{8,80}$")) continue;
                Dictionary<string, object> response = new Dictionary<string, object>();
                response["protocol"] = "physics-studio-classroom-lan-v1";
                response["nonce"] = nonce;
                response["instanceId"] = instanceId;
                response["port"] = servicePort;
                response["addresses"] = DiscoverAddresses();
                byte[] output = Encoding.UTF8.GetBytes(JsonCodec.Serialize(response));
                socket.Send(output, output.Length, sender);
            }
            catch (SocketException) { if (running) Thread.Sleep(20); }
            catch (ObjectDisposedException) { return; }
        }
    }

    private List<string> DiscoverAddresses()
    {
        List<string> result = new List<string>();
        if (IPAddress.IsLoopback(bindAddress)) result.Add("127.0.0.1");
        foreach (IPAddress address in Dns.GetHostAddresses(Dns.GetHostName()))
        {
            if (address.AddressFamily != AddressFamily.InterNetwork) continue;
            byte[] bytes = address.GetAddressBytes();
            bool privateAddress = bytes[0] == 10
                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
                || (bytes[0] == 192 && bytes[1] == 168)
                || (bytes[0] == 169 && bytes[1] == 254);
            if (privateAddress && !result.Contains(address.ToString())) result.Add(address.ToString());
        }
        return result;
    }

    public void Dispose()
    {
        running = false;
        if (socket != null) socket.Close();
        if (thread != null && thread.IsAlive) thread.Join(500);
    }
}

internal sealed class ClientError : Exception
{
    public readonly int Status;
    public readonly string Code;

    public ClientError(int status, string code, string message) : base(message)
    {
        Status = status;
        Code = code;
    }
}

internal sealed class DataEnvelope
{
    public int SchemaVersion { get; set; }
    public string InstanceId { get; set; }
    public List<ClassRecord> Classes { get; set; }
    public List<InviteRecord> Invites { get; set; }
    public List<StudentRecord> Students { get; set; }
    public List<MembershipRecord> Memberships { get; set; }
    public List<SessionRecord> Sessions { get; set; }
    public List<GroupRecord> Groups { get; set; }
    public List<AssignmentRecord> Assignments { get; set; }
    public List<SubmissionRecord> Submissions { get; set; }

    public static DataEnvelope New()
    {
        DataEnvelope value = new DataEnvelope();
        value.SchemaVersion = 1;
        value.InstanceId = Guid.NewGuid().ToString();
        value.Normalize();
        return value;
    }

    public void Normalize()
    {
        if (Classes == null) Classes = new List<ClassRecord>();
        if (Invites == null) Invites = new List<InviteRecord>();
        if (Students == null) Students = new List<StudentRecord>();
        if (Memberships == null) Memberships = new List<MembershipRecord>();
        if (Sessions == null) Sessions = new List<SessionRecord>();
        if (Groups == null) Groups = new List<GroupRecord>();
        if (Assignments == null) Assignments = new List<AssignmentRecord>();
        if (Submissions == null) Submissions = new List<SubmissionRecord>();
    }
}

internal sealed class ClassRecord
{
    public string Id { get; set; }
    public string OwnerUserId { get; set; }
    public string OwnerCapabilityHash { get; set; }
    public string Name { get; set; }
    public string Grade { get; set; }
    public string Subject { get; set; }
    public string SchoolLabel { get; set; }
    public string Status { get; set; }
    public int Revision { get; set; }
    public string CreatedAt { get; set; }
    public string UpdatedAt { get; set; }
}

internal sealed class InviteRecord
{
    public string Id { get; set; }
    public string ClassId { get; set; }
    public string CodeHash { get; set; }
    public string ExpiresAt { get; set; }
    public int MaxUses { get; set; }
    public int UseCount { get; set; }
    public bool Active { get; set; }
}

internal sealed class StudentRecord
{
    public string Id { get; set; }
    public string DeviceHash { get; set; }
    public string DisplayName { get; set; }
    public string CreatedAt { get; set; }
}

internal sealed class MembershipRecord
{
    public string Id { get; set; }
    public string ClassId { get; set; }
    public string StudentId { get; set; }
    public string DisplayName { get; set; }
    public string Role { get; set; }
    public string Status { get; set; }
    public string JoinedAt { get; set; }
    public string GroupId { get; set; }
    public string StudentNumber { get; set; }
}

internal sealed class SessionRecord
{
    public string StudentId { get; set; }
    public string AccessHash { get; set; }
    public string RefreshHash { get; set; }
    public string ExpiresAt { get; set; }
}

internal sealed class GroupRecord
{
    public string Id { get; set; }
    public string ClassId { get; set; }
    public string Name { get; set; }
    public string CreatedAt { get; set; }
}

internal sealed class AssignmentRecord
{
    public string Id { get; set; }
    public string ClassId { get; set; }
    public string Title { get; set; }
    public string Instructions { get; set; }
    public string DueAt { get; set; }
    public string TargetType { get; set; }
    public string TargetId { get; set; }
    public List<string> QuestionIds { get; set; }
    public List<string> KnowledgePointKeys { get; set; }
    public string Target { get; set; }
    public bool Published { get; set; }
    public string CreatedAt { get; set; }
}

internal sealed class SubmissionRecord
{
    public string Id { get; set; }
    public string AssignmentId { get; set; }
    public string StudentId { get; set; }
    public string ClientEntityId { get; set; }
    public string AnswersJson { get; set; }
    public string Status { get; set; }
    public string SubmittedAt { get; set; }
}
