using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("物理研习室激活码管理器")]
[assembly: System.Reflection.AssemblyDescription("使用当前 Windows 用户的不可导出签名密钥批量签发设备绑定激活码")]
[assembly: System.Reflection.AssemblyProduct("物理研习室激活码管理器")]
[assembly: System.Reflection.AssemblyCompany("")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]

internal static class ActivationManagerProgram
{
    internal const string ProductId = "physics-studio";
    internal const string KeyName = "PhysicsStudioActivationIssuerV1";
    internal static readonly CngProvider KeyProvider = CngProvider.MicrosoftSoftwareKeyStorageProvider;

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0)
            {
                return RunCommandLine(args);
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ActivationManagerWindow());
            return 0;
        }
        catch (Exception exception)
        {
            if (args != null && args.Length > 0)
            {
                Console.Error.WriteLine(exception.ToString());
                return 2;
            }
            MessageBox.Show(
                exception.Message,
                "物理研习室激活码管理器",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return 2;
        }
    }

    private static int RunCommandLine(string[] args)
    {
        if (args.Length == 2 && string.Equals(args[0], "--initialize", StringComparison.OrdinalIgnoreCase))
        {
            EnsureIssuerKey();
            WritePublicKeyJavaScript(args[1]);
            Console.WriteLine("可信签发密钥已就绪，公钥已写入：" + Path.GetFullPath(args[1]));
            Console.WriteLine("公钥指纹：" + GetPublicKeyFingerprint());
            return 0;
        }

        if (args.Length == 2 && string.Equals(args[0], "--export-public", StringComparison.OrdinalIgnoreCase))
        {
            RequireIssuerKey();
            WritePublicKeyJavaScript(args[1]);
            Console.WriteLine("公钥已写入：" + Path.GetFullPath(args[1]));
            Console.WriteLine("公钥指纹：" + GetPublicKeyFingerprint());
            return 0;
        }

        if (args.Length == 1 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
        {
            RequireIssuerKey();
            string device = new string('A', 64);
            IssuedActivation issued = Issue(device, 1, "self-test");
            if (!VerifyIssuedCode(issued.Code, device))
            {
                throw new InvalidOperationException("签名自检失败。");
            }
            Console.WriteLine("签名、验签自检通过。");
            return 0;
        }

        if (args.Length == 3 && string.Equals(args[0], "--issue", StringComparison.OrdinalIgnoreCase))
        {
            RequireIssuerKey();
            IssuedActivation issued = Issue(args[1], 0, "command-line");
            File.WriteAllText(Path.GetFullPath(args[2]), issued.Code, new UTF8Encoding(false));
            return 0;
        }

        Console.Error.WriteLine(
            "用法：\n"
            + "  --initialize <activation-public-key.js>\n"
            + "  --export-public <activation-public-key.js>\n"
            + "  --self-test\n"
            + "  --issue <64位设备摘要> <输出文本文件>"
        );
        return 1;
    }

    internal static bool IssuerKeyExists()
    {
        return CngKey.Exists(KeyName, KeyProvider, CngKeyOpenOptions.UserKey);
    }

    internal static void EnsureIssuerKey()
    {
        if (IssuerKeyExists())
        {
            return;
        }

        CngKeyCreationParameters parameters = new CngKeyCreationParameters
        {
            Provider = KeyProvider,
            KeyCreationOptions = CngKeyCreationOptions.None,
            ExportPolicy = CngExportPolicies.None,
            KeyUsage = CngKeyUsages.Signing
        };
        using (CngKey.Create(CngAlgorithm.ECDsaP256, KeyName, parameters))
        {
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

    internal static IssuedActivation Issue(string rawDeviceId, int validityDays, string note)
    {
        RequireIssuerKey();
        string deviceId = NormalizeDeviceId(rawDeviceId);
        DateTime issuedAt = DateTime.UtcNow;
        DateTime? expiresAt = validityDays <= 0 ? (DateTime?)null : issuedAt.AddDays(validityDays);
        string licenseId = Guid.NewGuid().ToString("N");
        string payload = BuildPayload(licenseId, deviceId, issuedAt, expiresAt, note);
        byte[] payloadBytes = Encoding.UTF8.GetBytes(payload);
        byte[] signature;

        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
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
            Note = note ?? "",
            Code = "PSA1." + Base64Url(payloadBytes) + "." + Base64Url(signature)
        };
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

    private static string BuildPayload(
        string licenseId,
        string deviceId,
        DateTime issuedAt,
        DateTime? expiresAt,
        string note
    )
    {
        string expiresJson = expiresAt.HasValue
            ? "\"" + expiresAt.Value.ToString("o", CultureInfo.InvariantCulture) + "\""
            : "null";
        return "{"
            + "\"v\":1,"
            + "\"product\":\"" + ProductId + "\","
            + "\"licenseId\":\"" + licenseId + "\","
            + "\"device\":\"" + deviceId + "\","
            + "\"issuedAt\":\"" + issuedAt.ToString("o", CultureInfo.InvariantCulture) + "\","
            + "\"expiresAt\":" + expiresJson + ","
            + "\"note\":\"" + EscapeJson((note ?? "").Trim()) + "\""
            + "}";
    }

    private static string EscapeJson(string value)
    {
        StringBuilder output = new StringBuilder(value.Length + 8);
        foreach (char character in value)
        {
            switch (character)
            {
                case '\\': output.Append("\\\\"); break;
                case '"': output.Append("\\\""); break;
                case '\r': output.Append("\\r"); break;
                case '\n': output.Append("\\n"); break;
                case '\t': output.Append("\\t"); break;
                default:
                    if (character < 32)
                    {
                        output.Append("\\u");
                        output.Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        output.Append(character);
                    }
                    break;
            }
        }
        return output.ToString();
    }

    internal static byte[] GetSubjectPublicKeyInfo()
    {
        RequireIssuerKey();
        byte[] blob;
        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
        {
            blob = key.Export(CngKeyBlobFormat.EccPublicBlob);
        }

        if (blob.Length != 72 || BitConverter.ToInt32(blob, 4) != 32)
        {
            throw new CryptographicException("无法识别 ECDSA P-256 公钥格式。");
        }

        byte[] prefix =
        {
            0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86,
            0x48, 0xCE, 0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A,
            0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03,
            0x42, 0x00, 0x04
        };
        byte[] spki = new byte[prefix.Length + 64];
        Buffer.BlockCopy(prefix, 0, spki, 0, prefix.Length);
        Buffer.BlockCopy(blob, 8, spki, prefix.Length, 64);
        return spki;
    }

    internal static string GetPublicKeyFingerprint()
    {
        using (SHA256 sha = SHA256.Create())
        {
            return ToHex(sha.ComputeHash(GetSubjectPublicKeyInfo()));
        }
    }

    internal static void WritePublicKeyJavaScript(string outputPath)
    {
        string fullPath = Path.GetFullPath(outputPath);
        string directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        byte[] spki = GetSubjectPublicKeyInfo();
        string fingerprint = GetPublicKeyFingerprint();
        string javascript =
            "(() => {\n"
            + "  \"use strict\";\n"
            + "  window.PHYSICS_STUDIO_ACTIVATION_PUBLIC_KEY = Object.freeze({\n"
            + "    version: 1,\n"
            + "    product: \"physics-studio\",\n"
            + "    algorithm: \"ECDSA_P256_SHA256\",\n"
            + "    spkiBase64: \"" + Convert.ToBase64String(spki) + "\",\n"
            + "    fingerprintSha256: \"" + fingerprint + "\"\n"
            + "  });\n"
            + "})();\n";
        File.WriteAllText(fullPath, javascript, new UTF8Encoding(false));
    }

    internal static bool VerifyIssuedCode(string code, string expectedDeviceId)
    {
        string[] parts = (code ?? "").Split('.');
        if (parts.Length != 3 || parts[0] != "PSA1")
        {
            return false;
        }
        byte[] payload = FromBase64Url(parts[1]);
        byte[] signature = FromBase64Url(parts[2]);
        string payloadText = Encoding.UTF8.GetString(payload);
        if (payloadText.IndexOf(
                "\"device\":\"" + NormalizeDeviceId(expectedDeviceId) + "\"",
                StringComparison.Ordinal
            ) < 0)
        {
            return false;
        }
        using (CngKey key = CngKey.Open(KeyName, KeyProvider, CngKeyOpenOptions.UserKey))
        using (ECDsaCng verifier = new ECDsaCng(key))
        {
            verifier.HashAlgorithm = CngAlgorithm.Sha256;
            return verifier.VerifyData(payload, signature);
        }
    }

    private static string Base64Url(byte[] value)
    {
        return Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static byte[] FromBase64Url(string value)
    {
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

internal sealed class ActivationManagerWindow : Form
{
    private readonly Label keyStatus;
    private readonly TextBox deviceInput;
    private readonly NumericUpDown validityDays;
    private readonly TextBox noteInput;
    private readonly Button generateButton;
    private readonly TextBox output;
    private readonly Label resultStatus;
    private readonly List<IssuedActivation> issued = new List<IssuedActivation>();

    internal ActivationManagerWindow()
    {
        Text = "物理研习室 · 激活码管理器（仅限所有者）";
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
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 32F));
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
            Text = "设备绑定激活码批量签发",
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

        deviceInput = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Vertical,
            AcceptsReturn = true,
            Font = new Font("Consolas", 10F)
        };
        layout.Controls.Add(deviceInput);

        FlowLayoutPanel options = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            WrapContents = true,
            Margin = new Padding(0, 12, 0, 8)
        };
        options.Controls.Add(new Label { Text = "有效天数（0=永久）", AutoSize = true, Margin = new Padding(0, 8, 8, 0) });
        validityDays = new NumericUpDown
        {
            Minimum = 0,
            Maximum = 3650,
            Value = 0,
            Width = 110
        };
        options.Controls.Add(validityDays);
        options.Controls.Add(new Label { Text = "批次备注", AutoSize = true, Margin = new Padding(22, 8, 8, 0) });
        noteInput = new TextBox { Width = 300, MaxLength = 100 };
        options.Controls.Add(noteInput);
        layout.Controls.Add(options);

        generateButton = new Button
        {
            Text = "批量生成设备绑定激活码",
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
            Text = "签发结果（设备申请码 → 激活码）",
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
        copyButton.Click += delegate
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
            Text = "每个激活码只对签发时指定的设备申请码有效；不要向用户分发本管理器。",
            Margin = new Padding(0, 2, 0, 0)
        };
        layout.Controls.Add(resultStatus);

        UpdateKeyStatus();
    }

    private void UpdateKeyStatus()
    {
        bool exists = ActivationManagerProgram.IssuerKeyExists();
        generateButton.Enabled = exists;
        if (!exists)
        {
            keyStatus.ForeColor = Color.DarkRed;
            keyStatus.Text =
                "未找到当前用户的可信签发私钥。为避免误签发，本界面不会自动创建密钥。"
                + "请仅在所有者电脑上通过命令行执行一次 --initialize。";
            return;
        }

        keyStatus.ForeColor = Color.FromArgb(25, 91, 67);
        keyStatus.Text =
            "可信私钥：当前 Windows 用户的不可导出 CNG 密钥\n"
            + "公钥 SHA-256：" + ActivationManagerProgram.GetPublicKeyFingerprint();
    }

    private void GenerateCodes(object sender, EventArgs args)
    {
        try
        {
            string[] lines = deviceInput.Lines
                .Select(delegate(string line) { return line.Trim(); })
                .Where(delegate(string line) { return line.Length > 0; })
                .ToArray();
            if (lines.Length == 0)
            {
                throw new ArgumentException("请至少粘贴一个设备申请码。");
            }
            if (lines.Length > 1000)
            {
                throw new ArgumentException("单批最多签发1000个设备激活码。");
            }

            List<string> devices = new List<string>();
            HashSet<string> seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (string line in lines)
            {
                string device = ActivationManagerProgram.NormalizeDeviceId(line);
                if (seen.Add(device))
                {
                    devices.Add(device);
                }
            }

            issued.Clear();
            foreach (string device in devices)
            {
                issued.Add(ActivationManagerProgram.Issue(
                    device,
                    Decimal.ToInt32(validityDays.Value),
                    noteInput.Text
                ));
            }

            output.Text = string.Join(
                Environment.NewLine + Environment.NewLine,
                issued.Select(delegate(IssuedActivation item)
                {
                    return FormatDeviceId(item.DeviceId) + Environment.NewLine + item.Code;
                }).ToArray()
            );
            resultStatus.Text =
                "已签发 " + issued.Count.ToString(CultureInfo.InvariantCulture)
                + " 个设备绑定激活码；重复设备申请码已合并。";
        }
        catch (Exception exception)
        {
            MessageBox.Show(exception.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
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
            FileName = "物理研习室-激活码-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".csv"
        })
        {
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            StringBuilder csv = new StringBuilder();
            csv.AppendLine("device_id,license_id,issued_at,expires_at,note,activation_code");
            foreach (IssuedActivation item in issued)
            {
                csv.Append(Csv(item.DeviceId)).Append(',');
                csv.Append(Csv(item.LicenseId)).Append(',');
                csv.Append(Csv(item.IssuedAt.ToString("o", CultureInfo.InvariantCulture))).Append(',');
                csv.Append(Csv(item.ExpiresAt.HasValue ? item.ExpiresAt.Value.ToString("o", CultureInfo.InvariantCulture) : "")).Append(',');
                csv.Append(Csv(item.Note)).Append(',');
                csv.Append(Csv(item.Code)).AppendLine();
            }
            File.WriteAllText(dialog.FileName, csv.ToString(), new UTF8Encoding(true));
            resultStatus.Text = "CSV 已导出：" + dialog.FileName;
        }
    }

    private void ExportPublicKey(object sender, EventArgs args)
    {
        try
        {
            using (SaveFileDialog dialog = new SaveFileDialog
            {
                Filter = "JavaScript 文件 (*.js)|*.js",
                FileName = "activation-public-key.js"
            })
            {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                ActivationManagerProgram.WritePublicKeyJavaScript(dialog.FileName);
                resultStatus.Text = "公钥已导出：" + dialog.FileName;
            }
        }
        catch (Exception exception)
        {
            MessageBox.Show(exception.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static string Csv(string value)
    {
        return "\"" + (value ?? "").Replace("\"", "\"\"") + "\"";
    }

    private static string FormatDeviceId(string value)
    {
        IEnumerable<string> groups = Enumerable.Range(0, value.Length / 8)
            .Select(delegate(int index) { return value.Substring(index * 8, 8); });
        return "PSDEV-" + string.Join("-", groups.ToArray());
    }
}
