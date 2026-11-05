using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("费曼物理激活码管理器")]
[assembly: System.Reflection.AssemblyDescription("使用独立加密 PFX 签发离线便携激活码")]
[assembly: System.Reflection.AssemblyProduct("费曼物理激活码管理器")]
[assembly: System.Reflection.AssemblyCompany("")]
[assembly: System.Reflection.AssemblyVersion("1.2.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.2.0.0")]

internal static class ActivationManagerProgram
{
    internal const string ProductId = "physics-studio";
    internal const string KeyName = "PhysicsStudioActivationIssuerV1";
    internal const string PortableKeyName = "PhysicsStudioActivationIssuerPortableV1";
    internal static readonly CngProvider KeyProvider = CngProvider.MicrosoftSoftwareKeyStorageProvider;
    private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(false, true);
    private static readonly object AuditSync = new object();
    private static readonly byte[] SpkiPrefix =
    {
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86,
        0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A,
        0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03,
        0x42, 0x00, 0x04
    };

    [STAThread]
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0)
            {
                return RunCommandLine(args);
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (!ManagerPasswordDialog.Unlock()) return 1;
            Application.Run(new ActivationManagerWindow());
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception.ToString());
            if (args == null || args.Length == 0)
            {
                MessageBox.Show(
                    exception.Message,
                    "费曼物理激活码管理器",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            return 1;
        }
    }

    private static int RunCommandLine(string[] args)
    {
        if (args.Length == 2 && string.Equals(args[0], "--initialize", StringComparison.OrdinalIgnoreCase))
        {
            EnsureIssuerKey();
            WritePublicKeyJavaScript(args[1]);
            Console.WriteLine("可信签发密钥已就绪，公钥已写入：" + Path.GetFullPath(args[1]));
            Console.WriteLine("当前签发密钥指纹：" + GetPublicKeyFingerprint());
            return 0;
        }

        if (args.Length == 3 && string.Equals(args[0], "--initialize-exportable", StringComparison.OrdinalIgnoreCase))
        {
            string publicPath = Path.GetFullPath(args[1]);
            string backupPath = Path.GetFullPath(args[2]);
            if (!string.Equals(Path.GetExtension(publicPath), ".js", StringComparison.OrdinalIgnoreCase)
                || string.Equals(publicPath, backupPath, StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("公钥文件必须是独立的 .js 文件，不能与 PFX 归档同路径。");
            }
            if (!string.Equals(Path.GetExtension(backupPath), ".pfx", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("加密私钥归档文件必须使用 .pfx 扩展名。");
            }
            if (IssuerKeyExists())
            {
                throw new InvalidOperationException("已有签发密钥；归档只能在新密钥创建时进行，不会覆盖旧密钥。");
            }
            if (File.Exists(backupPath))
            {
                throw new IOException("归档文件已经存在；为避免覆盖唯一私钥备份，本命令不会覆盖它。");
            }
            string password = ArchivePasswordDialog.RequestPassword();
            ValidateArchivePassword(password);
            EnsureIssuerKey(true, KeyName, key => WriteEncryptedPfx(key, backupPath, password));
            WritePublicKeyJavaScript(publicPath);
            Console.WriteLine("受密码保护的 PFX 归档已建立；请离线保管归档和密码。签发密钥指纹："
                + GetPublicKeyFingerprint());
            return 0;
        }

        if (args.Length == 3 && string.Equals(args[0], "--initialize-portable", StringComparison.OrdinalIgnoreCase))
        {
            string publicPath = Path.GetFullPath(args[1]);
            string backupPath = Path.GetFullPath(args[2]);
            if (!string.Equals(Path.GetExtension(publicPath), ".js", StringComparison.OrdinalIgnoreCase)
                || !string.Equals(Path.GetExtension(backupPath), ".pfx", StringComparison.OrdinalIgnoreCase)
                || string.Equals(publicPath, backupPath, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("需分别提供公钥 .js 路径和独立私钥归档 .pfx 路径。");
            if (File.Exists(backupPath) || CngKey.Exists(PortableKeyName, KeyProvider, CngKeyOpenOptions.UserKey))
                throw new IOException("便携签发归档或同名密钥已存在；不会覆盖或重新生成信任根。");
            string password = ArchivePasswordDialog.RequestPassword();
            ValidateArchivePassword(password);
            EnsureIssuerKey(true, PortableKeyName, key => {
                WriteEncryptedPfx(key, backupPath, password);
                WritePublicKeyJavaScript(publicPath, key);
            });
            Console.WriteLine("便携签发归档和公钥已生成。请将 PFX 与密码分开保管，绝不要上传仓库。");
            return 0;
        }

        if (args.Length == 2 && string.Equals(args[0], "--export-public", StringComparison.OrdinalIgnoreCase))
        {
            RequireIssuerKey();
            WritePublicKeyJavaScript(args[1]);
            Console.WriteLine("公钥已写入：" + Path.GetFullPath(args[1]));
            Console.WriteLine("当前签发密钥指纹：" + GetPublicKeyFingerprint());
            return 0;
        }

        if (args.Length == 1 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
        {
            RequireIssuerKey();
            string device = new string('A', 64);
            using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
            {
                IssuedActivation issued = SignActivation(key, device, 1, "self-test", true);
                string[] parts = issued.Code.Split('.');
                if (parts.Length != 3 || parts[0] != "PSA1"
                    || FromBase64Url(parts[2]).Length != 64
                    || !VerifyIssuedCode(issued.Code, device, key))
                {
                    throw new InvalidOperationException("签名格式或验签自检失败。");
                }
            }
            Console.WriteLine("PSA1 前缀、64 字节 P1363 签名和验签自检通过。");
            return 0;
        }

        if (args.Length >= 3 && args.Length <= 5
            && (string.Equals(args[0], "--issue", StringComparison.OrdinalIgnoreCase)
                || string.Equals(args[0], "--issue-kid", StringComparison.OrdinalIgnoreCase)))
        {
            RequireIssuerKey();
            int? days = args.Length >= 4 ? ParseValidityDays(args[3]) : (int?)null;
            string note = args.Length >= 5 ? args[4] : "command-line";
            bool includeKid = string.Equals(args[0], "--issue-kid", StringComparison.OrdinalIgnoreCase);
            if (includeKid) Console.Error.WriteLine("提示：带 kid 的激活码不能用于尚未升级的客户端。");
            IssuedActivation issued = Issue(args[1], days, note, includeKid);
            File.WriteAllText(Path.GetFullPath(args[2]), issued.Code, new UTF8Encoding(false));
            return 0;
        }

        if (args.Length >= 3 && args.Length <= 5
            && string.Equals(args[0], "--issue-portable", StringComparison.OrdinalIgnoreCase))
        {
            int? days = args.Length >= 4 ? ParseValidityDays(args[3]) : (int?)null;
            string note = args.Length >= 5 ? args[4] : "portable-command-line";
            string password = ArchiveUnlockDialog.RequestPassword();
            IssuedActivation issued = SignPortableFromArchive(args[1], password, days, note);
            AppendAuditRecord(issued);
            File.WriteAllText(Path.GetFullPath(args[2]), issued.Code, new UTF8Encoding(false));
            return 0;
        }

        if (args.Length >= 4 && args.Length <= 6
            && string.Equals(args[0], "--issue-portable-batch", StringComparison.OrdinalIgnoreCase))
        {
            int count;
            if (!int.TryParse(args[2], NumberStyles.None, CultureInfo.InvariantCulture, out count)
                || count < 1 || count > 1000)
                throw new ArgumentException("每批激活码数量须为 1 到 1000。");
            int? days = args.Length >= 5 ? ParseValidityDays(args[4]) : (int?)null;
            string note = args.Length >= 6 ? args[5] : "portable-command-line-batch";
            string password = ArchiveUnlockDialog.RequestPassword();
            List<IssuedActivation> records = SignPortableBatchFromArchive(args[1], password,
                count, days, note);
            foreach (IssuedActivation issued in records) AppendAuditRecord(issued);
            ActivationManagerWindow.SaveCsv(Path.GetFullPath(args[3]), records);
            Console.WriteLine("已签发 " + count.ToString(CultureInfo.InvariantCulture) + " 条。");
            return 0;
        }

        if (args.Length == 3 && string.Equals(args[0], "--verify", StringComparison.OrdinalIgnoreCase))
        {
            RequireIssuerKey();
            bool valid = VerifyIssuedCode(args[1], args[2]);
            if (!valid)
            {
                Console.Error.WriteLine("激活码的签名、载荷或设备绑定验证失败。");
                return 1;
            }
            Console.WriteLine("激活码的签名、载荷和设备绑定验证通过。");
            return 0;
        }

        if (args.Length == 3 && string.Equals(args[0], "--verify-portable", StringComparison.OrdinalIgnoreCase))
        {
            string password = ArchiveUnlockDialog.RequestPassword();
            if (!VerifyPortableFromArchive(args[1], args[2], password))
            {
                Console.Error.WriteLine("便携激活码校验失败。");
                return 1;
            }
            Console.WriteLine("便携激活码签名和载荷校验通过。");
            return 0;
        }

        if (args.Length >= 3 && args.Length <= 5
            && (string.Equals(args[0], "--issue-batch", StringComparison.OrdinalIgnoreCase)
                || string.Equals(args[0], "--issue-batch-kid", StringComparison.OrdinalIgnoreCase)))
        {
            RequireIssuerKey();
            int? days = args.Length >= 4 ? ParseValidityDays(args[3]) : (int?)null;
            string note = args.Length >= 5 ? args[4] : "command-line-batch";
            bool includeKid = string.Equals(args[0], "--issue-batch-kid", StringComparison.OrdinalIgnoreCase);
            if (includeKid) Console.Error.WriteLine("提示：带 kid 的激活码不能用于尚未升级的客户端。");
            IssueBatchFile(args[1], args[2], days, note, includeKid);
            return 0;
        }

        Console.Error.WriteLine(
            "用法：\n"
            + "  --initialize <activation-public-key.js>\n"
            + "  --initialize-exportable <activation-public-key.js> <backup.pfx>\n"
            + "  --initialize-portable <activation-public-key.js> <backup.pfx>\n"
            + "  --export-public <activation-public-key.js>\n"
            + "  --self-test\n"
            + "  --issue <64位设备摘要> <输出文本文件> [validityDays] [note]\n"
            + "  --issue-kid <64位设备摘要> <输出文本文件> [validityDays] [note]\n"
            + "  --verify <code> <deviceId>\n"
            + "  --verify-portable <code> <backup.pfx>\n"
            + "  --issue-portable <backup.pfx> <output.txt> [validityDays] [note]\n"
            + "  --issue-portable-batch <backup.pfx> <count> <output.csv> [validityDays] [note]\n"
            + "  --issue-batch <input.txt> <output.csv> [validityDays] [note]\n"
            + "  --issue-batch-kid <input.txt> <output.csv> [validityDays] [note]"
        );
        return 1;
    }

    private static int? ParseValidityDays(string text)
    {
        int days;
        if (!int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out days)
            || days < 0 || days > 3650)
        {
            throw new ArgumentException("有效天数必须是 0 到 3650 的整数；0 表示永久有效。");
        }
        return days == 0 ? (int?)null : days;
    }

    internal static bool IssuerKeyExists()
    {
        return CngKey.Exists(KeyName, KeyProvider, CngKeyOpenOptions.UserKey);
    }

    internal static void EnsureIssuerKey()
    {
        EnsureIssuerKey(false, KeyName, null);
    }

    internal static void EnsureIssuerKey(bool allowArchiving, string keyName, Action<CngKey> archiveOnCreation)
    {
        if (CngKey.Exists(keyName, KeyProvider, CngKeyOpenOptions.UserKey))
        {
            if (allowArchiving)
            {
                throw new InvalidOperationException(
                    "已有同名密钥；一次性归档只能在创建密钥的原始句柄关闭前进行。不会替换现有签发密钥。"
                );
            }
            return;
        }
        if (allowArchiving && archiveOnCreation == null)
        {
            throw new ArgumentNullException("archiveOnCreation", "启用归档时必须在密钥创建期间完成归档。");
        }

        CngKeyCreationParameters parameters = new CngKeyCreationParameters
        {
            Provider = KeyProvider,
            KeyCreationOptions = CngKeyCreationOptions.None,
            // The original handle permits a one-time in-memory private-key archive.
            // X509Certificate2.Export reopens the key, so a temporary ephemeral copy is
            // needed to create the password-protected PFX (never a persistent exportable key).
            ExportPolicy = allowArchiving
                ? CngExportPolicies.AllowArchiving | CngExportPolicies.AllowPlaintextArchiving
                : CngExportPolicies.None,
            KeyUsage = CngKeyUsages.Signing
        };
        using (CngKey key = CngKey.Create(CngAlgorithm.ECDsaP256, keyName, parameters))
        {
            if (allowArchiving)
            {
                try
                {
                    archiveOnCreation(key);
                }
                catch
                {
                    key.Delete();
                    throw;
                }
            }
        }
    }

    internal static void RequireIssuerKey()
    {
        if (!IssuerKeyExists())
        {
            throw new InvalidOperationException(
                "当前 Windows 用户没有可信签发私钥。\n"
                + "请仅在所有者电脑上执行一次“--initialize activation-public-key.js”，"
                + "然后用生成的公钥重新构建用户端应用。"
            );
        }
    }

    internal static IssuedActivation Issue(string rawDeviceId, int? validityDays, string note)
    {
        return Issue(rawDeviceId, validityDays, note, false);
    }

    internal static IssuedActivation Issue(string rawDeviceId, int? validityDays,
        string note, bool includeKid)
    {
        RequireIssuerKey();
        IssuedActivation issued;
        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
        {
            issued = SignActivation(key, rawDeviceId, validityDays, note, includeKid);
        }
        AppendAuditRecord(issued);
        return issued;
    }

    internal static IssuedActivation SignActivation(
        CngKey key, string rawDeviceId, int? validityDays, string note)
    {
        return SignActivation(key, rawDeviceId, validityDays, note, false);
    }

    internal static IssuedActivation SignActivation(
        CngKey key, string rawDeviceId, int? validityDays, string note, bool includeKid)
    {
        if (key == null) throw new ArgumentNullException("key");
        if (validityDays.HasValue && (validityDays.Value < 0 || validityDays.Value > 3650))
        {
            throw new ArgumentOutOfRangeException("validityDays", "有效天数必须在 0 到 3650 之间。");
        }
        string safeNote = (note ?? "").Trim();
        if (safeNote.Length > 100) throw new ArgumentException("备注不得超过100个字符。", "note");
        string deviceId = NormalizeDeviceId(rawDeviceId);
        DateTime issuedAt = DateTime.UtcNow;
        DateTime? expiresAt = !validityDays.HasValue || validityDays.Value == 0
            ? (DateTime?)null : issuedAt.AddDays(validityDays.Value);
        string licenseId = Guid.NewGuid().ToString("N");
        string kid = GetPublicKeyFingerprint(key).Substring(0, 16);
        ActivationPayload payload = new ActivationPayload
        {
            Version = 1,
            Product = ProductId,
            LicenseId = licenseId,
            Device = deviceId,
            IssuedAt = issuedAt.ToString("o", CultureInfo.InvariantCulture),
            ExpiresAt = expiresAt.HasValue
                ? expiresAt.Value.ToString("o", CultureInfo.InvariantCulture) : null,
            Note = safeNote,
            Kid = includeKid ? kid : null
        };
        byte[] payloadBytes = SerializeJson(payload);
        byte[] signature;

        using (ECDsaCng signer = new ECDsaCng(key))
        {
            signer.HashAlgorithm = CngAlgorithm.Sha256;
            signature = signer.SignData(payloadBytes);
        }

        if (signature.Length != 64)
        {
            throw new CryptographicException("签名格式不符合 P-256 IEEE P1363（应为64字节）。");
        }

        return new IssuedActivation
        {
            DeviceId = deviceId,
            LicenseId = licenseId,
            IssuedAt = issuedAt,
            ExpiresAt = expiresAt,
            Note = safeNote,
            Code = "PSA1." + Base64Url(payloadBytes) + "." + Base64Url(signature)
        };
    }

    internal static IssuedActivation SignPortableActivation(
        CngKey key, int? validityDays, string note)
    {
        if (key == null) throw new ArgumentNullException("key");
        if (validityDays.HasValue && (validityDays.Value < 0 || validityDays.Value > 3650))
        {
            throw new ArgumentOutOfRangeException("validityDays");
        }
        string safeNote = (note ?? "").Trim();
        if (safeNote.Length > 100) throw new ArgumentException("备注不得超过100个字符。", "note");
        DateTime issuedAt = DateTime.UtcNow;
        DateTime? expiresAt = !validityDays.HasValue || validityDays.Value == 0
            ? (DateTime?)null : issuedAt.AddDays(validityDays.Value);
        string licenseId = Guid.NewGuid().ToString("N");
        ActivationPayload payload = new ActivationPayload
        {
            Version = 1, Product = ProductId, LicenseId = licenseId,
            Scope = "portable", Device = null,
            IssuedAt = issuedAt.ToString("o", CultureInfo.InvariantCulture),
            ExpiresAt = expiresAt.HasValue
                ? expiresAt.Value.ToString("o", CultureInfo.InvariantCulture) : null,
            Note = safeNote, Kid = GetPublicKeyFingerprint(key).Substring(0, 16)
        };
        byte[] payloadBytes = SerializeJson(payload);
        byte[] signature;
        using (ECDsaCng signer = new ECDsaCng(key))
        {
            signer.HashAlgorithm = CngAlgorithm.Sha256;
            signature = signer.SignData(payloadBytes);
        }
        if (signature.Length != 64)
            throw new CryptographicException("签名格式不符合 P-256 IEEE P1363（应为64字节）。");
        return new IssuedActivation
        {
            DeviceId = "", LicenseId = licenseId, IssuedAt = issuedAt,
            ExpiresAt = expiresAt, Note = safeNote,
            Code = "PSA1." + Base64Url(payloadBytes) + "." + Base64Url(signature)
        };
    }

    internal static IssuedActivation SignPortableFromArchive(
        string archivePath, string archivePassword, int? validityDays, string note)
    {
        return SignPortableBatchFromArchive(archivePath, archivePassword,
            1, validityDays, note)[0];
    }

    internal static List<IssuedActivation> SignPortableBatchFromArchive(
        string archivePath, string archivePassword, int count, int? validityDays, string note)
    {
        if (count < 1 || count > 1000) throw new ArgumentOutOfRangeException("count");
        string fullPath = Path.GetFullPath(archivePath);
        FileInfo file = new FileInfo(fullPath);
        if (!file.Exists || file.Length == 0 || file.Length > 1024 * 1024
            || !string.Equals(file.Extension, ".pfx", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("加密签发归档不存在、类型错误或大小异常。");
        }
        using (X509Certificate2 certificate = new X509Certificate2(
            fullPath, archivePassword, X509KeyStorageFlags.EphemeralKeySet))
        using (ECDsa privateKey = certificate.GetECDsaPrivateKey())
        {
            ECDsaCng cng = privateKey as ECDsaCng;
            if (cng == null || cng.Key.Algorithm != CngAlgorithm.ECDsaP256)
            {
                throw new CryptographicException("归档不包含预期的 P-256 CNG 签发私钥。");
            }
            List<IssuedActivation> records = new List<IssuedActivation>(count);
            for (int index = 0; index < count; index++)
                records.Add(SignPortableActivation(cng.Key, validityDays, note));
            return records;
        }
    }

    internal static bool VerifyPortableFromArchive(string code, string archivePath, string password)
    {
        using (X509Certificate2 certificate = new X509Certificate2(
            Path.GetFullPath(archivePath), password, X509KeyStorageFlags.EphemeralKeySet))
        using (ECDsa privateKey = certificate.GetECDsaPrivateKey())
        {
            ECDsaCng cng = privateKey as ECDsaCng;
            if (cng == null || !VerifyIssuedCode(code, new string('0', 64), cng.Key)) return false;
            string[] parts = code.Split('.');
            return DeserializePayload(FromBase64Url(parts[1])).Scope == "portable";
        }
    }

    internal static string ExportPortablePublicKeyFromArchive(
        string archivePath, string archivePassword, string outputPath)
    {
        string fullPath = Path.GetFullPath(archivePath);
        if (!File.Exists(fullPath)) throw new FileNotFoundException("加密签发归档不存在。", fullPath);
        using (X509Certificate2 certificate = new X509Certificate2(
            fullPath, archivePassword, X509KeyStorageFlags.EphemeralKeySet))
        using (ECDsa privateKey = certificate.GetECDsaPrivateKey())
        {
            ECDsaCng cng = privateKey as ECDsaCng;
            if (cng == null || cng.Key.Algorithm != CngAlgorithm.ECDsaP256)
                throw new CryptographicException("归档不包含预期的 P-256 CNG 签发私钥。");
            WritePublicKeyJavaScript(outputPath, cng.Key);
            return GetPublicKeyFingerprint(cng.Key);
        }
    }

    internal static string NormalizeDeviceId(string value)
    {
        string normalized = Regex.Replace(value ?? "", "[^0-9A-Fa-f]", "").ToUpperInvariant();
        if (normalized.StartsWith("DE", StringComparison.Ordinal) && normalized.Length == 66)
        {
            // “PSDEV”中的 D、E 可能在仅保留十六进制字符时残留。
            normalized = normalized.Substring(2);
        }
        if (normalized.Length != 64 || !Regex.IsMatch(normalized, "^[0-9A-F]{64}$"))
        {
            throw new ArgumentException("设备申请码必须包含64位十六进制设备摘要。");
        }
        return normalized;
    }

    internal static byte[] SerializeJson<T>(T value)
    {
        DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(T));
        using (MemoryStream stream = new MemoryStream())
        {
            serializer.WriteObject(stream, value);
            return stream.ToArray();
        }
    }

    internal static ActivationPayload DeserializePayload(byte[] payloadBytes)
    {
        if (payloadBytes == null || payloadBytes.Length == 0 || payloadBytes.Length > 3072)
        {
            throw new SerializationException("激活码载荷长度无效。");
        }
        // Strict UTF-8 rules out replacement characters before JSON parsing.
        StrictUtf8.GetString(payloadBytes);
        DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(ActivationPayload));
        using (MemoryStream stream = new MemoryStream(payloadBytes, false))
        {
            ActivationPayload payload = serializer.ReadObject(stream) as ActivationPayload;
            if (payload == null || stream.Position != stream.Length)
            {
                throw new SerializationException("激活码载荷不是完整的 JSON 对象。");
            }
            return payload;
        }
    }

    internal static byte[] GetSubjectPublicKeyInfo()
    {
        RequireIssuerKey();
        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
        {
            return GetSubjectPublicKeyInfo(key);
        }
    }

    internal static byte[] GetSubjectPublicKeyInfo(CngKey key)
    {
        if (key == null) throw new ArgumentNullException("key");
        byte[] blob = key.Export(CngKeyBlobFormat.EccPublicBlob);

        if (blob.Length != 72 || BitConverter.ToInt32(blob, 4) != 32)
        {
            throw new CryptographicException("无法识别 ECDSA P-256 公钥格式。");
        }

        byte[] spki = new byte[SpkiPrefix.Length + 64];
        Buffer.BlockCopy(SpkiPrefix, 0, spki, 0, SpkiPrefix.Length);
        Buffer.BlockCopy(blob, 8, spki, SpkiPrefix.Length, 64);
        return spki;
    }

    internal static string GetPublicKeyFingerprint()
    {
        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
        {
            return GetPublicKeyFingerprint(key);
        }
    }

    internal static string GetPublicKeyFingerprint(CngKey key)
    {
        using (SHA256 sha = SHA256.Create())
        {
            return ToHex(sha.ComputeHash(GetSubjectPublicKeyInfo(key)));
        }
    }

    internal static void WritePublicKeyJavaScript(string outputPath)
    {
        RequireIssuerKey();
        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
        {
            WritePublicKeyJavaScript(outputPath, key);
        }
    }

    internal static void WritePublicKeyJavaScript(string outputPath, CngKey key)
    {
        string fullPath = Path.GetFullPath(outputPath);
        if (!string.Equals(Path.GetExtension(fullPath), ".js", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("公钥文件必须使用 .js 扩展名。", "outputPath");
        }
        string directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        string fingerprint = GetPublicKeyFingerprint(key);
        string spkiBase64 = Convert.ToBase64String(GetSubjectPublicKeyInfo(key));
        List<PublicKeyRecord> previous = ReadPublicKeyRecords(fullPath);
        PublicKeyRecord issuer = new PublicKeyRecord
        {
            SpkiBase64 = spkiBase64,
            Fingerprint = fingerprint
        };
        // Preserve an already-published primary trust anchor. A different local
        // CNG key is added to history; exporting must not silently rotate users.
        PublicKeyRecord primary = previous.Count == 0 ? issuer : previous[0];
        List<PublicKeyRecord> history = previous.Skip(1)
            .Where(item => item.Fingerprint != primary.Fingerprint).ToList();
        if (issuer.Fingerprint != primary.Fingerprint
            && !history.Any(item => item.Fingerprint == issuer.Fingerprint))
        {
            history.Add(issuer);
        }
        if (history.Count > 16) throw new InvalidDataException("历史公钥过多，需要人工审核后再导出。");
        StringBuilder javascript = new StringBuilder();
        javascript.Append("(() => {\n  \"use strict\";\n");
        javascript.Append("  window.PHYSICS_STUDIO_ACTIVATION_PUBLIC_KEY = Object.freeze({\n");
        javascript.Append("    version: 1,\n    product: \"physics-studio\",\n");
        javascript.Append("    algorithm: \"ECDSA_P256_SHA256\",\n");
        javascript.Append("    spkiBase64: \"").Append(primary.SpkiBase64).Append("\",\n");
        javascript.Append("    fingerprintSha256: \"").Append(primary.Fingerprint).Append("\",\n");
        javascript.Append("    kid: \"").Append(primary.Fingerprint.Substring(0, 16)).Append("\",\n");
        javascript.Append("    historicalPublicKeys: Object.freeze([\n");
        for (int index = 0; index < history.Count; index++)
        {
            PublicKeyRecord item = history[index];
            javascript.Append("      Object.freeze({ version: 1, product: \"physics-studio\", ");
            javascript.Append("algorithm: \"ECDSA_P256_SHA256\", spkiBase64: \"");
            javascript.Append(item.SpkiBase64).Append("\", fingerprintSha256: \"");
            javascript.Append(item.Fingerprint).Append("\", kid: \"");
            javascript.Append(item.Fingerprint.Substring(0, 16)).Append("\" })");
            javascript.Append(index + 1 < history.Count ? ",\n" : "\n");
        }
        javascript.Append("    ])\n  });\n})();\n");
        string temporaryPath = Path.Combine(directory,
            "." + Path.GetFileName(fullPath) + "." + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            File.WriteAllText(temporaryPath, javascript.ToString(), new UTF8Encoding(false));
            if (File.Exists(fullPath)) File.Replace(temporaryPath, fullPath, null);
            else File.Move(temporaryPath, fullPath);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    private static List<PublicKeyRecord> ReadPublicKeyRecords(string path)
    {
        List<PublicKeyRecord> records = new List<PublicKeyRecord>();
        if (!File.Exists(path)) return records;
        FileInfo file = new FileInfo(path);
        if (file.Length > 65536) throw new InvalidDataException("原有公钥文件过大，拒绝自动合并历史公钥。");
        string previous = File.ReadAllText(path, StrictUtf8);
        if (!previous.Contains("window.PHYSICS_STUDIO_ACTIVATION_PUBLIC_KEY"))
        {
            throw new InvalidDataException("目标文件不是激活公钥脚本；不会覆盖现有文件。");
        }
        MatchCollection matches = Regex.Matches(previous,
            "spkiBase64:\\s*\"(?<spki>[A-Za-z0-9+/=]+)\"\\s*,\\s*fingerprintSha256:\\s*\"(?<fingerprint>[A-Fa-f0-9]{64})\"");
        if (matches.Count == 0)
        {
            throw new InvalidDataException("目标文件不是可识别的激活公钥脚本；不会覆盖现有文件。");
        }
        HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match match in matches)
        {
            string fingerprint = match.Groups["fingerprint"].Value.ToUpperInvariant();
            if (!seen.Add(fingerprint)) continue;
            byte[] spki = Convert.FromBase64String(match.Groups["spki"].Value);
            using (SHA256 sha = SHA256.Create())
            {
                if (ToHex(sha.ComputeHash(spki)) != fingerprint)
                {
                    throw new InvalidDataException("原有公钥文件包含指纹不匹配的公钥。");
                }
            }
            records.Add(new PublicKeyRecord { SpkiBase64 = match.Groups["spki"].Value, Fingerprint = fingerprint });
            if (records.Count > 17) throw new InvalidDataException("历史公钥过多，需要人工审核后再导出。");
        }
        return records;
    }

    internal static bool VerifyIssuedCode(string code, string expectedDeviceId)
    {
        RequireIssuerKey();
        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
        {
            return VerifyIssuedCode(code, expectedDeviceId, key);
        }
    }

    internal static bool VerifyIssuedCode(string code, string expectedDeviceId, CngKey key)
    {
        try
        {
            if (string.IsNullOrEmpty(code) || code.Length > 4096 || key == null) return false;
            string[] parts = code.Split('.');
            if (parts.Length != 3 || parts[0] != "PSA1") return false;
            byte[] payloadBytes = FromBase64Url(parts[1]);
            byte[] signature = FromBase64Url(parts[2]);
            if (signature.Length != 64) return false;
            using (ECDsaCng verifier = new ECDsaCng(key))
            {
                verifier.HashAlgorithm = CngAlgorithm.Sha256;
                if (!verifier.VerifyData(payloadBytes, signature)) return false;
            }
            // Only a valid signature is allowed to reach the typed JSON parser.
            ActivationPayload payload = DeserializePayload(payloadBytes);
            DateTime issuedAt;
            DateTime expiresAt;
            bool portable = payload.Scope == "portable";
            if (payload.Version != 1 || payload.Product != ProductId
                || (portable ? payload.Device != null
                    : payload.Scope != null || payload.Device != NormalizeDeviceId(expectedDeviceId))
                || !Regex.IsMatch(payload.LicenseId ?? "", "^[a-f0-9]{32}$")
                || !TryParseTimestamp(payload.IssuedAt, out issuedAt)
                || (payload.ExpiresAt != null
                    && (!TryParseTimestamp(payload.ExpiresAt, out expiresAt) || expiresAt <= issuedAt))
                || (payload.Kid != null && payload.Kid != GetPublicKeyFingerprint(key).Substring(0, 16)))
            {
                return false;
            }
            return true;
        }
        catch (Exception exception)
        {
            if (exception is ArgumentException || exception is FormatException
                || exception is SerializationException || exception is DecoderFallbackException
                || exception is CryptographicException)
            {
                return false;
            }
            throw;
        }
    }

    private static bool TryParseTimestamp(string value, out DateTime utc)
    {
        utc = default(DateTime);
        DateTime parsed;
        if (!DateTime.TryParseExact(value, "o", CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind, out parsed)) return false;
        utc = parsed.ToUniversalTime();
        return true;
    }

    internal static List<string> ParseDeviceLines(IEnumerable<string> lines)
    {
        List<string> devices = new List<string>();
        List<int> invalidRows = new List<int>();
        HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);
        int lineNumber = 0;
        foreach (string rawLine in lines)
        {
            lineNumber++;
            string line = (rawLine ?? "").Trim();
            if (line.Length == 0) continue;
            string device;
            try
            {
                device = NormalizeDeviceId(line);
            }
            catch (ArgumentException)
            {
                invalidRows.Add(lineNumber);
                continue;
            }
            if (seen.Add(device)) devices.Add(device);
            if (devices.Count > 1000)
            {
                throw new ArgumentException("单批最多签发1000个不同设备激活码。");
            }
        }
        if (invalidRows.Count != 0)
        {
            throw new ArgumentException("设备申请码无效，行号：" + string.Join(", ", invalidRows));
        }
        if (devices.Count == 0) throw new ArgumentException("请至少输入一个设备申请码。");
        return devices;
    }

    private static void IssueBatchFile(string inputPath, string outputPath,
        int? validityDays, string note, bool includeKid)
    {
        string input = Path.GetFullPath(inputPath);
        string destination = Path.GetFullPath(outputPath);
        if (string.Equals(input, destination, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("输入和输出文件不能相同。");
        }
        if (new FileInfo(input).Length > 1024 * 1024)
        {
            throw new ArgumentException("批量输入文件不得超过 1 MB。");
        }
        List<string> devices = ParseDeviceLines(File.ReadAllLines(input, StrictUtf8));
        List<IssuedActivation> records = new List<IssuedActivation>();
        foreach (string device in devices)
        {
            records.Add(Issue(device, validityDays, note, includeKid));
        }
        ActivationManagerWindow.SaveCsv(destination, records);
        Console.WriteLine("批量签发完成：" + records.Count.ToString(CultureInfo.InvariantCulture) + " 条。");
    }

    internal static string AuditLogPath
    {
        get
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PhysicsStudio", "ActivationManager", "audit-log.jsonl");
        }
    }

    internal static void AppendAuditRecord(IssuedActivation issued)
    {
        AppendAuditRecord(issued, AuditLogPath, true);
    }

    internal static void AppendAuditRecord(IssuedActivation issued, string path, bool protectAccess)
    {
        if (issued == null) throw new ArgumentNullException("issued");
        AuditRecord record = new AuditRecord
        {
            DeviceId = issued.DeviceId,
            LicenseId = issued.LicenseId,
            IssuedAt = issued.IssuedAt.ToString("o", CultureInfo.InvariantCulture),
            ExpiresAt = issued.ExpiresAt.HasValue
                ? issued.ExpiresAt.Value.ToString("o", CultureInfo.InvariantCulture) : null,
            Note = issued.Note,
            Code = issued.Code
        };
        byte[] json = SerializeJson(record);
        byte[] line = new byte[json.Length + 1];
        Buffer.BlockCopy(json, 0, line, 0, json.Length);
        line[line.Length - 1] = (byte)'\n';
        string fullPath = Path.GetFullPath(path);
        string directory = Path.GetDirectoryName(fullPath);
        lock (AuditSync)
        {
            if (protectAccess)
            {
                DirectorySecurity directorySecurity = CurrentUserDirectorySecurity();
                Directory.CreateDirectory(directory, directorySecurity);
                Directory.SetAccessControl(directory, directorySecurity);
            }
            else
            {
                Directory.CreateDirectory(directory);
            }
            using (FileStream file = protectAccess
                ? new FileStream(fullPath, FileMode.Append, FileSystemRights.Write,
                    FileShare.Read, 4096, FileOptions.WriteThrough, CurrentUserFileSecurity())
                : new FileStream(fullPath, FileMode.Append, FileAccess.Write, FileShare.Read))
            {
                if (protectAccess) File.SetAccessControl(fullPath, CurrentUserFileSecurity());
                file.Write(line, 0, line.Length);
                file.Flush(true);
            }
        }
    }

    internal static void ValidateArchivePassword(string password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 20)
        {
            throw new ArgumentException("PFX 归档密码至少需要20个字符。");
        }
        int classes = (password.Any(char.IsUpper) ? 1 : 0)
            + (password.Any(char.IsLower) ? 1 : 0)
            + (password.Any(char.IsDigit) ? 1 : 0)
            + (password.Any(character => !char.IsLetterOrDigit(character)) ? 1 : 0);
        if (classes < 3)
        {
            throw new ArgumentException("PFX 归档密码须至少包含大写、小写、数字、符号中的三类。");
        }
    }

    internal static void WriteEncryptedPfx(CngKey key, string outputPath, string password)
    {
        if (key == null) throw new ArgumentNullException("key");
        ValidateArchivePassword(password);
        CngExportPolicies required = CngExportPolicies.AllowArchiving
            | CngExportPolicies.AllowPlaintextArchiving;
        if ((key.ExportPolicy & required) != required)
        {
            throw new InvalidOperationException("该密钥未在创建时启用一次性归档，不能导出 PFX。");
        }
        string fullPath = Path.GetFullPath(outputPath);
        if (!string.Equals(Path.GetExtension(fullPath), ".pfx", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("归档文件必须使用 .pfx 扩展名。", "outputPath");
        }
        if (File.Exists(fullPath)) throw new IOException("归档文件已存在，不会覆盖。");
        string directory = Path.GetDirectoryName(fullPath);
        if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);

        byte[] archive = null;
        byte[] privateBlob = null;
        string temporaryPath = Path.Combine(directory,
            "." + Path.GetFileName(fullPath) + "." + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            // AllowPlaintextArchiving is available only on the creating CNG handle.
            // The raw blob exists in memory briefly; it is zeroed immediately after import.
            privateBlob = key.Export(CngKeyBlobFormat.EccPrivateBlob);
            using (CngKey temporaryKey = CngKey.Import(privateBlob,
                CngKeyBlobFormat.EccPrivateBlob, KeyProvider))
            {
                Array.Clear(privateBlob, 0, privateBlob.Length);
                privateBlob = null;
                CngExportPolicies temporaryPolicy = CngExportPolicies.AllowExport
                    | CngExportPolicies.AllowPlaintextExport;
                int status = NativeCng.NCryptSetProperty(temporaryKey.Handle.DangerousGetHandle(),
                    "Export Policy", BitConverter.GetBytes((int)temporaryPolicy),
                    sizeof(int), 0);
                GC.KeepAlive(temporaryKey);
                if (status != 0) throw new CryptographicException(status);
                using (ECDsaCng signer = new ECDsaCng(temporaryKey))
                {
                    signer.HashAlgorithm = CngAlgorithm.Sha256;
                    CertificateRequest request = new CertificateRequest(
                        new X500DistinguishedName("CN=PhysicsStudioActivationIssuerV1"),
                        signer, HashAlgorithmName.SHA256);
                    request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
                    request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
                    using (X509Certificate2 certificate = request.CreateSelfSigned(
                        DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(10)))
                    {
                        archive = certificate.Export(X509ContentType.Pfx, password);
                    }
                }
            }
            using (X509Certificate2 imported = new X509Certificate2(
                archive, password, X509KeyStorageFlags.EphemeralKeySet))
            using (ECDsa restoredKey = imported.GetECDsaPrivateKey())
            {
                if (restoredKey == null) throw new CryptographicException("PFX 不包含可恢复的 ECDSA 私钥。");
                byte[] probe = StrictUtf8.GetBytes("physics-studio-archive-check");
                byte[] signature = restoredKey.SignData(probe, HashAlgorithmName.SHA256);
                using (ECDsaCng original = new ECDsaCng(key))
                {
                    original.HashAlgorithm = CngAlgorithm.Sha256;
                    if (!original.VerifyData(probe, signature))
                    {
                        throw new CryptographicException("PFX 中的私钥与签发公钥不一致。");
                    }
                }
            }
            using (FileStream file = new FileStream(temporaryPath, FileMode.CreateNew, FileSystemRights.Write,
                FileShare.None, 4096, FileOptions.WriteThrough, CurrentUserFileSecurity()))
            {
                file.Write(archive, 0, archive.Length);
                file.Flush(true);
            }
            File.Move(temporaryPath, fullPath);
        }
        finally
        {
            if (privateBlob != null) Array.Clear(privateBlob, 0, privateBlob.Length);
            if (archive != null) Array.Clear(archive, 0, archive.Length);
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    private static class NativeCng
    {
        [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
        internal static extern int NCryptSetProperty(IntPtr keyHandle, string propertyName,
            byte[] value, int valueLength, int flags);
    }

    private static FileSecurity CurrentUserFileSecurity()
    {
        FileSecurity security = new FileSecurity();
        security.SetAccessRuleProtection(true, false);
        SecurityIdentifier user = WindowsIdentity.GetCurrent().User;
        security.AddAccessRule(new FileSystemAccessRule(user, FileSystemRights.FullControl,
            AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            FileSystemRights.FullControl, AccessControlType.Allow));
        return security;
    }

    private static DirectorySecurity CurrentUserDirectorySecurity()
    {
        DirectorySecurity security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        SecurityIdentifier user = WindowsIdentity.GetCurrent().User;
        security.AddAccessRule(new FileSystemAccessRule(user, FileSystemRights.FullControl,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
            PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            FileSystemRights.FullControl,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
            PropagationFlags.None, AccessControlType.Allow));
        return security;
    }

    private static string Base64Url(byte[] value)
    {
        return Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static byte[] FromBase64Url(string value)
    {
        if (string.IsNullOrEmpty(value) || !Regex.IsMatch(value, "^[A-Za-z0-9_-]+$"))
        {
            throw new FormatException("Base64URL 字符无效或包含填充字符。");
        }
        string padded = value.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
            case 1: throw new FormatException("Base64URL 长度无效。");
        }
        return Convert.FromBase64String(padded);
    }

    private static string ToHex(byte[] value)
    {
        StringBuilder output = new StringBuilder(value.Length * 2);
        foreach (byte item in value)
        {
            output.Append(item.ToString("X2", CultureInfo.InvariantCulture));
        }
        return output.ToString();
    }
}

internal sealed class IssuedActivation
{
    internal string DeviceId { get; set; }
    internal string LicenseId { get; set; }
    internal DateTime IssuedAt { get; set; }
    internal DateTime? ExpiresAt { get; set; }
    internal string Note { get; set; }
    internal string Code { get; set; }
}

[DataContract]
internal sealed class ActivationPayload
{
    [DataMember(Name = "v", Order = 1)]
    internal int Version { get; set; }

    [DataMember(Name = "product", Order = 2)]
    internal string Product { get; set; }

    [DataMember(Name = "licenseId", Order = 3)]
    internal string LicenseId { get; set; }

    [DataMember(Name = "device", Order = 4, EmitDefaultValue = false)]
    internal string Device { get; set; }

    [DataMember(Name = "issuedAt", Order = 5)]
    internal string IssuedAt { get; set; }

    [DataMember(Name = "expiresAt", Order = 6, EmitDefaultValue = true)]
    internal string ExpiresAt { get; set; }

    [DataMember(Name = "note", Order = 7)]
    internal string Note { get; set; }

    [DataMember(Name = "kid", Order = 8, EmitDefaultValue = false)]
    internal string Kid { get; set; }

    [DataMember(Name = "scope", Order = 9, EmitDefaultValue = false)]
    internal string Scope { get; set; }
}

[DataContract]
internal sealed class AuditRecord
{
    [DataMember(Name = "deviceId", Order = 1)]
    internal string DeviceId { get; set; }

    [DataMember(Name = "licenseId", Order = 2)]
    internal string LicenseId { get; set; }

    [DataMember(Name = "issuedAt", Order = 3)]
    internal string IssuedAt { get; set; }

    [DataMember(Name = "expiresAt", Order = 4, EmitDefaultValue = true)]
    internal string ExpiresAt { get; set; }

    [DataMember(Name = "note", Order = 5)]
    internal string Note { get; set; }

    [DataMember(Name = "code", Order = 6)]
    internal string Code { get; set; }
}

internal sealed class PublicKeyRecord
{
    internal string SpkiBase64 { get; set; }
    internal string Fingerprint { get; set; }
}

internal sealed class ArchivePasswordDialog : Form
{
    private readonly TextBox passwordInput;
    private readonly TextBox confirmationInput;

    private ArchivePasswordDialog()
    {
        Text = "设置签发密钥归档密码";
        Font = new Font("Microsoft YaHei UI", 10F);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = false;
        MaximizeBox = false;
        ClientSize = new Size(480, 185);

        TableLayoutPanel content = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 4,
            Padding = new Padding(14)
        };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105F));
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
        content.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 40F));
        Controls.Add(content);

        content.Controls.Add(new Label { Text = "归档密码", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        passwordInput = new TextBox { UseSystemPasswordChar = true, Dock = DockStyle.Fill, MaxLength = 200 };
        content.Controls.Add(passwordInput, 1, 0);
        content.Controls.Add(new Label { Text = "确认密码", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 1);
        confirmationInput = new TextBox { UseSystemPasswordChar = true, Dock = DockStyle.Fill, MaxLength = 200 };
        content.Controls.Add(confirmationInput, 1, 1);
        Label hint = new Label
        {
            Text = "至少20字符，包含至少三类字符。密码不会写入磁盘；遗失后无法恢复归档。",
            Dock = DockStyle.Fill,
            AutoSize = true
        };
        content.Controls.Add(hint, 0, 2);
        content.SetColumnSpan(hint, 2);

        FlowLayoutPanel buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Fill
        };
        Button confirm = new Button { Text = "创建归档", AutoSize = true, DialogResult = DialogResult.None };
        Button cancel = new Button { Text = "取消", AutoSize = true, DialogResult = DialogResult.Cancel };
        confirm.Click += (sender, args) =>
        {
            try
            {
                ActivationManagerProgram.ValidateArchivePassword(passwordInput.Text);
                if (passwordInput.Text != confirmationInput.Text)
                {
                    throw new ArgumentException("两次输入的归档密码不一致。");
                }
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (ArgumentException exception)
            {
                MessageBox.Show(this, exception.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        };
        buttons.Controls.Add(confirm);
        buttons.Controls.Add(cancel);
        content.Controls.Add(buttons, 0, 3);
        content.SetColumnSpan(buttons, 2);
        AcceptButton = confirm;
        CancelButton = cancel;
    }

    internal static string RequestPassword()
    {
        using (ArchivePasswordDialog dialog = new ArchivePasswordDialog())
        {
            if (dialog.ShowDialog() != DialogResult.OK)
            {
                throw new OperationCanceledException("已取消密钥归档初始化。");
            }
            return dialog.passwordInput.Text;
        }
    }
}

internal static class ManagerPasswordVerifier
{
    // PBKDF2-SHA256 verifier only. This password gates the GUI; the separate
    // encrypted PFX and its strong password protect signing authority.
    private const string SaltBase64 = "EUQkr5nETRBfwA2Ixt0vFw==";
    private const string HashBase64 = "1Qq5E24MRCNqJlhtnKkKbOtj41pGrzs9zMnCeymNQw0=";
    private const int Iterations = 210000;

    internal static bool Verify(string candidate)
    {
        if (candidate == null) return false;
        byte[] expected = Convert.FromBase64String(HashBase64);
        byte[] actual;
        using (Rfc2898DeriveBytes derivation = new Rfc2898DeriveBytes(candidate,
            Convert.FromBase64String(SaltBase64), Iterations, HashAlgorithmName.SHA256))
        {
            actual = derivation.GetBytes(expected.Length);
        }
        int difference = 0;
        for (int index = 0; index < expected.Length; index++)
            difference |= expected[index] ^ actual[index];
        Array.Clear(actual, 0, actual.Length);
        return difference == 0;
    }
}

internal sealed class ManagerPasswordDialog : Form
{
    private readonly TextBox password;

    private ManagerPasswordDialog()
    {
        Text = "费曼物理 · 管理器登录";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(380, 125);
        Font = new Font("Microsoft YaHei UI", 10F);
        Label label = new Label { Text = "管理器登录密码", Left = 16, Top = 15, AutoSize = true };
        password = new TextBox { Left = 16, Top = 42, Width = 346,
            UseSystemPasswordChar = true, MaxLength = 128 };
        Button unlock = new Button { Text = "登录", Left = 262, Top = 81, Width = 100 };
        unlock.Click += (sender, args) =>
        {
            bool valid = ManagerPasswordVerifier.Verify(password.Text);
            password.Clear();
            if (valid) { DialogResult = DialogResult.OK; Close(); }
            else MessageBox.Show(this, "密码不正确。", Text,
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        };
        Controls.Add(label);
        Controls.Add(password);
        Controls.Add(unlock);
        AcceptButton = unlock;
    }

    internal static bool Unlock()
    {
        using (ManagerPasswordDialog dialog = new ManagerPasswordDialog())
            return dialog.ShowDialog() == DialogResult.OK;
    }
}

internal sealed class ArchiveUnlockDialog : Form
{
    private readonly TextBox password;

    private ArchiveUnlockDialog()
    {
        Text = "解锁加密签发归档";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(400, 135);
        Font = new Font("Microsoft YaHei UI", 10F);
        Controls.Add(new Label { Text = "输入独立 PFX 归档密码（不保存）", Left = 16, Top = 14, AutoSize = true });
        password = new TextBox { Left = 16, Top = 43, Width = 365,
            UseSystemPasswordChar = true, MaxLength = 200 };
        Button confirm = new Button { Text = "继续", Left = 281, Top = 86, Width = 100 };
        confirm.Click += (sender, args) =>
        {
            if (password.Text.Length == 0) return;
            DialogResult = DialogResult.OK;
            Close();
        };
        Controls.Add(password);
        Controls.Add(confirm);
        AcceptButton = confirm;
    }

    internal static string RequestPassword()
    {
        using (ArchiveUnlockDialog dialog = new ArchiveUnlockDialog())
        {
            if (dialog.ShowDialog() != DialogResult.OK)
                throw new OperationCanceledException("未输入签发归档密码。");
            return dialog.password.Text;
        }
    }
}

internal sealed class ActivationManagerWindow : Form
{
    private readonly Label keyStatus;
    private readonly TextBox archivePathInput;
    private readonly NumericUpDown licenseCount;
    private readonly NumericUpDown validityDays;
    private readonly CheckBox permanentCheckBox;
    private readonly TextBox noteInput;
    private readonly Button generateButton;
    private readonly TextBox output;
    private readonly Label resultStatus;
    private readonly List<IssuedActivation> issued = new List<IssuedActivation>();

    internal ActivationManagerWindow()
    {
        Text = "费曼物理 · 激活码管理器（仅限所有者）";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(880, 650);
        ClientSize = new Size(1080, 760);
        BackColor = Color.FromArgb(245, 247, 243);
        Font = new Font("Microsoft YaHei UI", 10F);

        TableLayoutPanel layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(24),
            ColumnCount = 1,
            RowCount = 9,
            AutoScroll = true
        };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 42F));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(layout);

        Label heading = new Label
        {
            AutoSize = true,
            Text = "离线便携激活码批量签发",
            Font = new Font(Font.FontFamily, 20F, FontStyle.Bold),
            ForeColor = Color.FromArgb(25, 73, 57),
            Margin = new Padding(0, 0, 0, 10)
        };
        layout.Controls.Add(heading);

        keyStatus = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(1000, 0),
            Margin = new Padding(0, 0, 0, 12)
        };
        layout.Controls.Add(keyStatus);

        FlowLayoutPanel archiveChoice = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill, AutoSize = true, WrapContents = true
        };
        archiveChoice.Controls.Add(new Label { Text = "加密私钥归档", AutoSize = true,
            Margin = new Padding(0, 8, 8, 0) });
        archivePathInput = new TextBox { Width = 600, ReadOnly = true };
        archiveChoice.Controls.Add(archivePathInput);
        Button chooseArchive = new Button { Text = "选择 PFX", AutoSize = true };
        chooseArchive.Click += (sender, args) =>
        {
            using (OpenFileDialog dialog = new OpenFileDialog { Filter = "加密签发归档 (*.pfx)|*.pfx" })
            {
                if (dialog.ShowDialog(this) == DialogResult.OK)
                    archivePathInput.Text = dialog.FileName;
            }
        };
        archiveChoice.Controls.Add(chooseArchive);
        layout.Controls.Add(archiveChoice);

        FlowLayoutPanel options = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true,
            Margin = new Padding(0, 12, 0, 8)
        };
        options.Controls.Add(new Label { Text = "有效天数", AutoSize = true, Margin = new Padding(0, 8, 8, 0) });
        validityDays = new NumericUpDown
        {
            Minimum = 1,
            Maximum = 3650,
            Value = 365,
            Width = 110
        };
        options.Controls.Add(validityDays);
        permanentCheckBox = new CheckBox
        {
            Text = "永久有效",
            AutoSize = true,
            Checked = true,
            Margin = new Padding(12, 7, 0, 0)
        };
        validityDays.Enabled = false;
        permanentCheckBox.CheckedChanged += (sender, args) =>
        {
            validityDays.Enabled = !permanentCheckBox.Checked;
        };
        options.Controls.Add(permanentCheckBox);
        options.Controls.Add(new Label { Text = "生成数量", AutoSize = true,
            Margin = new Padding(20, 8, 8, 0) });
        licenseCount = new NumericUpDown { Minimum = 1, Maximum = 1000, Value = 1, Width = 100 };
        options.Controls.Add(licenseCount);
        options.Controls.Add(new Label { Text = "批次备注", AutoSize = true, Margin = new Padding(22, 8, 8, 0) });
        noteInput = new TextBox { Width = 300, MaxLength = 100 };
        options.Controls.Add(noteInput);
        layout.Controls.Add(options);

        generateButton = new Button
        {
            Text = "批量生成便携激活码",
            AutoSize = true,
            Padding = new Padding(14, 8, 14, 8),
            BackColor = Color.FromArgb(25, 91, 67),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(0, 4, 0, 10)
        };
        generateButton.FlatAppearance.BorderSize = 0;
        generateButton.Click += GenerateCodes;
        layout.Controls.Add(generateButton);

        Label outputHeading = new Label
        {
            AutoSize = true,
            Text = "签发结果（授权编号 → 激活码）",
            Font = new Font(Font, FontStyle.Bold),
            Margin = new Padding(0, 4, 0, 6)
        };
        layout.Controls.Add(outputHeading);

        output = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Font = new Font("Consolas", 9F)
        };
        layout.Controls.Add(output);

        FlowLayoutPanel actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true,
            Margin = new Padding(0, 10, 0, 6)
        };
        Button copyButton = new Button { Text = "复制全部", AutoSize = true, Padding = new Padding(8, 5, 8, 5) };
        Button csvButton = new Button { Text = "导出 CSV", AutoSize = true, Padding = new Padding(8, 5, 8, 5) };
        Button publicButton = new Button { Text = "导出当前公钥", AutoSize = true, Padding = new Padding(8, 5, 8, 5) };
        copyButton.Click += (sender, args) =>
        {
            if (!string.IsNullOrWhiteSpace(output.Text)) Clipboard.SetText(output.Text);
        };
        csvButton.Click += ExportCsv;
        publicButton.Click += ExportPublicKey;
        actions.Controls.Add(copyButton);
        actions.Controls.Add(csvButton);
        actions.Controls.Add(publicButton);
        layout.Controls.Add(actions);

        resultStatus = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(1000, 0),
            ForeColor = Color.FromArgb(91, 81, 62),
            Text = "便携码可跨设备使用，离线无法限制复制次数。PFX 和归档密码须分开保管。",
            Margin = new Padding(0, 2, 0, 0)
        };
        layout.Controls.Add(resultStatus);

        UpdateKeyStatus();
    }

    private void UpdateKeyStatus()
    {
        generateButton.Enabled = true;
        keyStatus.ForeColor = Color.FromArgb(25, 91, 67);
        keyStatus.Text =
            "请选择所有者独立保管的加密 PFX 归档；签发时再输入归档密码。"
            + "本管理器不携带私钥，换电脑时需要复制该归档。";
    }

    private void GenerateCodes(object sender, EventArgs args)
    {
        string archivePath;
        string archivePassword;
        int count;
        int? days;
        string note;
        try
        {
            archivePath = archivePathInput.Text;
            if (!File.Exists(archivePath)) throw new FileNotFoundException("请先选择有效的 PFX 归档。");
            archivePassword = ArchiveUnlockDialog.RequestPassword();
            count = Decimal.ToInt32(licenseCount.Value);
            days = permanentCheckBox.Checked ? (int?)null : Decimal.ToInt32(validityDays.Value);
            note = noteInput.Text;
        }
        catch (Exception exception)
        {
            MessageBox.Show(exception.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        generateButton.Enabled = false;
        resultStatus.Text = "正在签发 " + count.ToString(CultureInfo.InvariantCulture)
            + " 个便携激活码，请勿关闭窗口……";
        Task.Factory.StartNew(() =>
        {
            List<IssuedActivation> batch = ActivationManagerProgram.SignPortableBatchFromArchive(
                archivePath, archivePassword, count, days, note);
            foreach (IssuedActivation item in batch) ActivationManagerProgram.AppendAuditRecord(item);
            return batch;
        }).ContinueWith(task =>
        {
            if (IsDisposed) return;
            generateButton.Enabled = true;
            if (task.IsFaulted)
            {
                resultStatus.Text = "批量签发未完成；已成功签发的记录仍保存在审计台账中。";
                MessageBox.Show(task.Exception.GetBaseException().Message, Text,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (task.IsCanceled)
            {
                resultStatus.Text = "批量签发已取消。";
                return;
            }
            issued.AddRange(task.Result);
            output.Text = string.Join(Environment.NewLine + Environment.NewLine,
                task.Result.Select(item => item.LicenseId
                    + Environment.NewLine + item.Code).ToArray());
            resultStatus.Text = "本批已签发 " + task.Result.Count.ToString(CultureInfo.InvariantCulture)
                + " 个；本次会话累计 " + issued.Count.ToString(CultureInfo.InvariantCulture)
                + " 个。审计台账已逐条追加。";
        }, TaskScheduler.FromCurrentSynchronizationContext());
    }

    private void ExportCsv(object sender, EventArgs args)
    {
        if (issued.Count == 0)
        {
            MessageBox.Show("请先生成激活码。", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using (SaveFileDialog dialog = new SaveFileDialog
        {
            Filter = "CSV 文件 (*.csv)|*.csv",
            FileName = "费曼物理-激活码-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".csv"
        })
        {
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            SaveCsv(dialog.FileName, issued);
            resultStatus.Text = "CSV 已导出：" + dialog.FileName;
        }
    }

    private void ExportPublicKey(object sender, EventArgs args)
    {
        try
        {
            if (!File.Exists(archivePathInput.Text))
                throw new FileNotFoundException("请先选择加密签发归档。");
            using (SaveFileDialog dialog = new SaveFileDialog
            {
                Filter = "JavaScript 文件 (*.js)|*.js",
                FileName = "activation-public-key.js"
            })
            {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                string password = ArchiveUnlockDialog.RequestPassword();
                string fingerprint = ActivationManagerProgram.ExportPortablePublicKeyFromArchive(
                    archivePathInput.Text, password, dialog.FileName);
                resultStatus.Text = "公钥已导出；指纹 " + fingerprint + "。发布前须重新构建客户端。";
            }
        }
        catch (Exception exception)
        {
            MessageBox.Show(exception.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    internal static string BuildCsv(IEnumerable<IssuedActivation> records)
    {
        StringBuilder csv = new StringBuilder();
        csv.AppendLine("device_id,license_id,issued_at,expires_at,note,activation_code");
        foreach (IssuedActivation item in records)
        {
            csv.Append(Csv(item.DeviceId)).Append(',');
            csv.Append(Csv(item.LicenseId)).Append(',');
            csv.Append(Csv(item.IssuedAt.ToString("o", CultureInfo.InvariantCulture))).Append(',');
            csv.Append(Csv(item.ExpiresAt.HasValue
                ? item.ExpiresAt.Value.ToString("o", CultureInfo.InvariantCulture) : "")).Append(',');
            csv.Append(Csv(item.Note)).Append(',');
            csv.Append(Csv(item.Code)).AppendLine();
        }
        return csv.ToString();
    }

    internal static void SaveCsv(string path, IEnumerable<IssuedActivation> records)
    {
        File.WriteAllText(path, BuildCsv(records),
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
    }

    internal static string Csv(string value)
    {
        string original = value ?? "";
        string escaped = original.Replace("\"", "\"\"");
        if (original.Length != 0 && IsFormulaPrefix(original[0]))
        {
            escaped = "'" + escaped;
        }
        return "\"" + escaped + "\"";
    }

    private static bool IsFormulaPrefix(char first)
    {
        return first == '=' || first == '+' || first == '-' || first == '@'
            || first == '\t' || first == '\r' || first == '\n'
            || first == '＝' || first == '＋' || first == '－' || first == '＠';
    }

    private static string FormatDeviceId(string value)
    {
        IEnumerable<string> groups = Enumerable.Range(0, value.Length / 8)
            .Select(index => value.Substring(index * 8, 8));
        return "PSDEV-" + string.Join("-", groups.ToArray());
    }
}
