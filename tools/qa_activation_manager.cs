using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Windows.Forms;

internal static class ActivationManagerQa
{
    private static int checks;

    [STAThread]
    public static int Main(string[] args)
    {
        string keyName = "PhysicsStudioActivationQa-" + Guid.NewGuid().ToString("N");
        string workspace = Path.Combine(Path.GetTempPath(), "PhysicsStudioActivationQa-"
            + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(workspace);
        try
        {
            string archive = Path.Combine(workspace, "backup.pfx");
            ActivationManagerProgram.EnsureIssuerKey(true, keyName,
                key => ActivationManagerProgram.WriteEncryptedPfx(
                    key, archive, "QaArchive-Password-2026!"));
            using (CngKey key = CngKey.Open(keyName, ActivationManagerProgram.KeyProvider,
                CngKeyOpenOptions.UserKey))
            {
                TestCodeAndTypedVerification(key);
                TestCsvAndDeviceRows();
                TestAuditAndPublicKey(key, workspace);
                TestPfxArchive(archive);
                string portablePublicPath = Path.Combine(workspace, "portable-public.js");
                string portableFingerprint = ActivationManagerProgram.ExportPortablePublicKeyFromArchive(
                    archive, "QaArchive-Password-2026!", portablePublicPath);
                Check(portableFingerprint == ActivationManagerProgram.GetPublicKeyFingerprint(key)
                    && File.ReadAllText(portablePublicPath).Contains(portableFingerprint),
                    "archive exports the same trusted public key");
                IssuedActivation restoredPortable = ActivationManagerProgram.SignPortableFromArchive(
                    archive, "QaArchive-Password-2026!", 7, "restored-on-another-pc");
                Check(ActivationManagerProgram.VerifyIssuedCode(restoredPortable.Code,
                    new string('B', 64), key), "encrypted archive signs portable code without named key lookup");
                Check(ActivationManagerProgram.VerifyPortableFromArchive(restoredPortable.Code,
                    archive, "QaArchive-Password-2026!"), "portable archive CLI verification path");
                bool wrongPasswordRejected = false;
                try { ActivationManagerProgram.SignPortableFromArchive(archive, "incorrect", 7, "qa"); }
                catch (CryptographicException) { wrongPasswordRejected = true; }
                Check(wrongPasswordRejected, "wrong archive password rejected");
            }
            TestDefaultKeyPolicy();
            Check(!ManagerPasswordVerifier.Verify("incorrect-password"),
                "manager GUI rejects a wrong password");
            string managerTestPassword = Environment.GetEnvironmentVariable("PHYSICS_STUDIO_MANAGER_TEST_PASSWORD");
            if (!string.IsNullOrEmpty(managerTestPassword))
                Check(ManagerPasswordVerifier.Verify(managerTestPassword),
                    "manager GUI accepts the configured password");
            if (Environment.UserInteractive) TestGuiOptions();
            Console.WriteLine("PASS activation-manager checks=" + checks.ToString(CultureInfo.InvariantCulture));
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine("FAIL activation-manager: " + exception);
            return 1;
        }
        finally
        {
            if (CngKey.Exists(keyName, ActivationManagerProgram.KeyProvider, CngKeyOpenOptions.UserKey))
            {
                using (CngKey key = CngKey.Open(keyName, ActivationManagerProgram.KeyProvider,
                    CngKeyOpenOptions.UserKey)) key.Delete();
            }
            if (Directory.Exists(workspace)) Directory.Delete(workspace, true);
        }
    }

    private static void TestCodeAndTypedVerification(CngKey key)
    {
        string device = new string('A', 64);
        IssuedActivation issued = ActivationManagerProgram.SignActivation(key, device,
            null, "qa-permanent", true);
        string[] segments = issued.Code.Split('.');
        Check(segments.Length == 3 && segments[0] == "PSA1", "PSA1 framing");
        Check(!segments[1].Contains("=") && !segments[2].Contains("=")
            && !segments[1].Contains("+") && !segments[2].Contains("/"), "unpadded base64url");
        Check(Decode(segments[2]).Length == 64, "P1363 signature length");
        Check(ActivationManagerProgram.VerifyIssuedCode(issued.Code, device, key), "valid code");
        Check(!ActivationManagerProgram.VerifyIssuedCode(issued.Code, new string('B', 64), key),
            "other device cannot redeem");
        ActivationPayload payload = ActivationManagerProgram.DeserializePayload(Decode(segments[1]));
        Check(payload.ExpiresAt == null &&
            Encoding.UTF8.GetString(Decode(segments[1])).Contains("\"expiresAt\":null"),
            "permanent payload serializes expiresAt null");
        Check(payload.Kid == ActivationManagerProgram.GetPublicKeyFingerprint(key).Substring(0, 16),
            "key identifier matches fingerprint");

        payload.Product = "another-product";
        Check(!ActivationManagerProgram.VerifyIssuedCode(SignPayload(payload, key), device, key),
            "signed wrong product rejected");
        payload.Product = ActivationManagerProgram.ProductId;
        payload.Device = device + "00";
        Check(!ActivationManagerProgram.VerifyIssuedCode(SignPayload(payload, key), device, key),
            "signed device substring rejected");
        payload.Device = device;
        payload.ExpiresAt = payload.IssuedAt;
        Check(!ActivationManagerProgram.VerifyIssuedCode(SignPayload(payload, key), device, key),
            "non-increasing expiration rejected");
        payload.ExpiresAt = null;
        payload.Kid = "0000000000000000";
        Check(!ActivationManagerProgram.VerifyIssuedCode(SignPayload(payload, key), device, key),
            "wrong kid rejected");
        payload.Kid = null;
        Check(ActivationManagerProgram.VerifyIssuedCode(SignPayload(payload, key), device, key),
            "legacy payload without kid accepted");
        Check(!ActivationManagerProgram.VerifyIssuedCode(issued.Code + "=", device, key),
            "padded signature rejected");
        IssuedActivation compatible = ActivationManagerProgram.SignActivation(
            key, device, null, "legacy-client-compatible");
        byte[] compatibleBytes = Decode(compatible.Code.Split('.')[1]);
        Check(ActivationManagerProgram.DeserializePayload(compatibleBytes).Kid == null
            && !Encoding.UTF8.GetString(compatibleBytes).Contains("\"kid\""),
            "default payload omits optional kid for installed clients");
        Check(ActivationManagerProgram.VerifyIssuedCode(compatible.Code, device, key),
            "default compatibility code verifies");
        IssuedActivation portable = ActivationManagerProgram.SignPortableActivation(
            key, 30, "portable-test");
        ActivationPayload portablePayload = ActivationManagerProgram.DeserializePayload(
            Decode(portable.Code.Split('.')[1]));
        Check(portablePayload.Scope == "portable" && portablePayload.Device == null,
            "portable payload has signed scope without device binding");
        Check(ActivationManagerProgram.VerifyIssuedCode(portable.Code, device, key)
            && ActivationManagerProgram.VerifyIssuedCode(portable.Code, new string('B', 64), key),
            "portable code verifies on two devices");
        portablePayload.Scope = "unknown";
        Check(!ActivationManagerProgram.VerifyIssuedCode(SignPayload(portablePayload, key), device, key),
            "unknown signed scope rejected");
    }

    private static void TestCsvAndDeviceRows()
    {
        Check(ActivationManagerWindow.Csv("=cmd|' /C calc'!A0")
            == "\"'=cmd|' /C calc'!A0\"", "CSV formula escaped exactly");
        foreach (string prefix in new[] { "+", "-", "@", "\t", "\r", "\n", "＝", "＋", "－", "＠" })
        {
            Check(ActivationManagerWindow.Csv(prefix + "x").StartsWith("\"'", StringComparison.Ordinal),
                "CSV formula prefix " + ((int)prefix[0]).ToString(CultureInfo.InvariantCulture));
        }
        Check(ActivationManagerWindow.Csv("a\"b") == "\"a\"\"b\"", "CSV quotes doubled");
        try
        {
            ActivationManagerProgram.ParseDeviceLines(new[] { new string('A', 64), "bad", "", "bad" });
            throw new Exception("invalid rows should fail");
        }
        catch (ArgumentException exception)
        {
            Check(exception.Message.Contains("2") && exception.Message.Contains("4"),
                "all original line numbers reported");
        }
        List<string> devices = ActivationManagerProgram.ParseDeviceLines(new[]
            { new string('A', 64), new string('A', 64) });
        Check(devices.Count == 1, "duplicate device deduplicated");
    }

    private static void TestAuditAndPublicKey(CngKey key, string workspace)
    {
        IssuedActivation first = ActivationManagerProgram.SignActivation(key,
            new string('A', 64), 30, "first");
        IssuedActivation second = ActivationManagerProgram.SignActivation(key,
            new string('B', 64), null, "second");
        string log = Path.Combine(workspace, "audit.jsonl");
        ActivationManagerProgram.AppendAuditRecord(first, log, false);
        ActivationManagerProgram.AppendAuditRecord(second, log, false);
        string[] lines = File.ReadAllLines(log, new UTF8Encoding(false, true));
        Check(lines.Length == 2 && lines[0].Contains(first.LicenseId)
            && lines[1].Contains(second.LicenseId), "JSONL is append only");
        string protectedLog = Path.Combine(workspace, "private", "audit-log.jsonl");
        ActivationManagerProgram.AppendAuditRecord(first, protectedLog, true);
        Check(File.Exists(protectedLog), "protected local audit log can be appended");
        IssuedActivation formula = ActivationManagerProgram.SignActivation(key,
            new string('C', 64), null, "=cmd|' /C calc'!A0");
        string csvPath = Path.Combine(workspace, "records.csv");
        ActivationManagerWindow.SaveCsv(csvPath, new[] { formula });
        byte[] csvBytes = File.ReadAllBytes(csvPath);
        Check(csvBytes.Length > 3 && csvBytes[0] == 0xEF && csvBytes[1] == 0xBB
            && csvBytes[2] == 0xBF, "CSV carries UTF-8 BOM");
        Check(File.ReadAllText(csvPath, Encoding.UTF8).Contains("\"'=cmd|' /C calc'!A0\""),
            "exported CSV blocks formula note");
        string publicPath = Path.Combine(workspace, "activation-public-key.js");
        ActivationManagerProgram.WritePublicKeyJavaScript(publicPath, key);
        string source = File.ReadAllText(publicPath);
        Check(source.Contains("version: 1") && source.Contains("product: \"physics-studio\"")
            && source.Contains("algorithm: \"ECDSA_P256_SHA256\"")
            && source.Contains("spkiBase64") && source.Contains("fingerprintSha256")
            && source.Contains("historicalPublicKeys") && source.Contains("kid"),
            "public key object retains all legacy fields and extends history");
        string previousFingerprint = ActivationManagerProgram.GetPublicKeyFingerprint(key);
        using (CngKey replacement = CngKey.Create(CngAlgorithm.ECDsaP256,
            "PhysicsStudioActivationQaRotation-" + Guid.NewGuid().ToString("N"),
            new CngKeyCreationParameters
            {
                Provider = ActivationManagerProgram.KeyProvider,
                ExportPolicy = CngExportPolicies.None,
                KeyUsage = CngKeyUsages.Signing
            }))
        {
            try
            {
                ActivationManagerProgram.WritePublicKeyJavaScript(publicPath, replacement);
                string rotated = File.ReadAllText(publicPath);
                int historyStart = rotated.IndexOf("historicalPublicKeys", StringComparison.Ordinal);
                string replacementFingerprint = ActivationManagerProgram.GetPublicKeyFingerprint(replacement);
                Check(historyStart > 0
                    && rotated.IndexOf(previousFingerprint, StringComparison.Ordinal) < historyStart
                    && rotated.IndexOf(replacementFingerprint, StringComparison.Ordinal) > historyStart,
                    "key export preserves published primary and adds issuer to history");
            }
            finally
            {
                replacement.Delete();
            }
        }
    }

    private static void TestPfxArchive(string archive)
    {
        string password = "QaArchive-Password-2026!";
        Check(File.Exists(archive) && new FileInfo(archive).Length > 0,
            "encrypted PFX archive exists");
        bool wrongPasswordRejected = false;
        try
        {
            using (X509Certificate2 ignored = new X509Certificate2(
                archive, "WrongPassword-2026!!", X509KeyStorageFlags.EphemeralKeySet))
            {
            }
        }
        catch (CryptographicException)
        {
            wrongPasswordRejected = true;
        }
        Check(wrongPasswordRejected, "wrong PFX password rejected");
        using (X509Certificate2 restored = new X509Certificate2(
            archive, password, X509KeyStorageFlags.EphemeralKeySet))
        {
            Check(restored.HasPrivateKey, "PFX restore retains signing private key");
        }
    }

    private static void TestGuiOptions()
    {
        using (ActivationManagerWindow form = new ActivationManagerWindow())
        {
            BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic;
            CheckBox permanent = (CheckBox)typeof(ActivationManagerWindow)
                .GetField("permanentCheckBox", flags).GetValue(form);
            NumericUpDown days = (NumericUpDown)typeof(ActivationManagerWindow)
                .GetField("validityDays", flags).GetValue(form);
            Check(permanent.Checked && !days.Enabled,
                "GUI defaults to permanent validity with days disabled");
            permanent.Checked = false;
            Check(days.Enabled, "GUI enables days when permanent is unchecked");
        }
    }

    private static void TestDefaultKeyPolicy()
    {
        string name = "PhysicsStudioActivationQaDefault-" + Guid.NewGuid().ToString("N");
        ActivationManagerProgram.EnsureIssuerKey(false, name, null);
        using (CngKey key = CngKey.Open(name, ActivationManagerProgram.KeyProvider,
            CngKeyOpenOptions.UserKey))
        {
            try
            {
                string fingerprint = ActivationManagerProgram.GetPublicKeyFingerprint(key);
                Check(key.ExportPolicy == CngExportPolicies.None,
                    "ordinary key remains non-exportable");
                bool refused = false;
                try
                {
                    ActivationManagerProgram.EnsureIssuerKey(true, name, ignored =>
                        { throw new Exception("must not archive existing key"); });
                }
                catch (InvalidOperationException)
                {
                    refused = true;
                }
                Check(refused && ActivationManagerProgram.GetPublicKeyFingerprint(key) == fingerprint,
                    "archive command never replaces an existing issuer key");
            }
            finally
            {
                key.Delete();
            }
        }
    }

    private static string SignPayload(ActivationPayload payload, CngKey key)
    {
        byte[] bytes = ActivationManagerProgram.SerializeJson(payload);
        byte[] signature;
        using (ECDsaCng signer = new ECDsaCng(key))
        {
            signer.HashAlgorithm = CngAlgorithm.Sha256;
            signature = signer.SignData(bytes);
        }
        return "PSA1." + Encode(bytes) + "." + Encode(signature);
    }

    private static string Encode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static byte[] Decode(string input)
    {
        string padded = input.Replace('-', '+').Replace('_', '/');
        while (padded.Length % 4 != 0) padded += "=";
        return Convert.FromBase64String(padded);
    }

    private static void Check(bool condition, string description)
    {
        checks++;
        if (!condition) throw new Exception(description);
    }
}
