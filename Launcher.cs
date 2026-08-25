using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("费曼物理")]
[assembly: AssemblyDescription("支持离线使用、学情档案与受控联网服务的物理学习应用")]
[assembly: AssemblyProduct("费曼物理")]
[assembly: AssemblyCompany("")]
[assembly: AssemblyVersion("3.4.1.0")]
[assembly: AssemblyFileVersion("3.4.1.0")]

internal static class Program
{
    internal const string AppName = "费曼物理";
    internal const string LegacyDataFolder = "物理研习室";

    [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr LoadLibrary(string fileName);

    [STAThread]
    private static int Main(string[] args)
    {
        string appDirectory = AppDomain.CurrentDomain.BaseDirectory;
        bool checkOnly = Array.Exists(args, delegate(string value)
        {
            return string.Equals(value, "--check", StringComparison.OrdinalIgnoreCase);
        });
        bool smokeTest = Array.Exists(args, delegate(string value)
        {
            return string.Equals(value, "--smoke-test", StringComparison.OrdinalIgnoreCase);
        });
        bool classroomHostSmoke = Array.Exists(args, delegate(string value)
        {
            return string.Equals(value, "--classroom-host-smoke", StringComparison.OrdinalIgnoreCase);
        });

        string missingFile;
        if (!RequiredFilesExist(appDirectory, out missingFile))
        {
            if (!checkOnly)
            {
                ShowError("应用文件不完整，缺少：" + missingFile + "\n请重新安装费曼物理后再试。");
            }

            return 2;
        }

        if (checkOnly)
        {
            return 0;
        }

        try
        {
            string classroomDataDirectory = ArgumentValue(args, "--classroom-data-dir")
                ?? Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    LegacyDataFolder,
                    "ClassroomService"
                );
            using (LanClassroomHost classroomHost = new LanClassroomHost(
                Path.Combine(appDirectory, "物理研习室-班级服务.exe"),
                classroomDataDirectory,
                LanEndpointPolicy.ServicePort,
                LanEndpointPolicy.DiscoveryPort
            ))
            {
                LanHostStatus classroomStatus = classroomHost.StartAndWait(TimeSpan.FromSeconds(8));
                if (classroomHostSmoke) return classroomStatus.Ready ? 0 : 5;

                LoadNativeWebView2Loader(appDirectory);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                string smokeUserDataDirectory = smokeTest
                    ? Path.Combine(
                        Path.GetTempPath(),
                        "PhysicsStudio-WebView2-Smoke-" + Guid.NewGuid().ToString("N")
                    )
                    : null;
                try
                {
                    using (StudioWindow window = new StudioWindow(
                        appDirectory,
                        smokeTest,
                        smokeUserDataDirectory,
                        classroomStatus
                    ))
                    {
                        Application.Run(window);
                    }
                    return Environment.ExitCode;
                }
                finally
                {
                    if (smokeUserDataDirectory != null)
                    {
                        TryDeleteSmokeDirectory(smokeUserDataDirectory);
                    }
                }
            }
        }
        catch (Exception exception)
        {
            ShowError("应用启动失败：" + exception.Message);
            return 4;
        }
    }

    private static string ArgumentValue(string[] args, string name)
    {
        for (int index = 0; index + 1 < args.Length; index++)
        {
            if (String.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                return args[index + 1];
        }
        return null;
    }

    private static bool RequiredFilesExist(string appDirectory, out string missingFile)
    {
        string[] requiredFiles =
        {
            "index.html",
            "styles.css",
            "learning-lab.css",
            "experience-shell.css",
            "activation.css",
            "activation-public-key.js",
            "activation.js",
            "storage-repository.js",
            "curriculum-taxonomy.js",
            "curriculum-bank.js",
            "exam-question-index.js",
            "mock-exam-bank.js",
            "original-practice-bank.js",
            "targeted-practice-bank.js",
            @"vendor\jsQR.js",
            @"vendor\fflate.js",
            "security.js",
            "backup.js",
            "backup-validator.js",
            "ai-tutor.js",
            "document-import.js",
            "content-catalog.js",
            "classroom-config.js",
            "classroom-client.js",
            "物理研习室-班级服务.exe",
            "question-answer-service.js",
            "learning-engine.js",
                "physics-visuals.js",
                "variant-generator.js",
            "teacher-mode-lock.js",
            "app.js",
            "learning-lab.js",
            "experience-shell.js",
            "Microsoft.Web.WebView2.Core.dll",
            "Microsoft.Web.WebView2.WinForms.dll",
            GetLoaderRelativePath()
        };

        foreach (string relativePath in requiredFiles)
        {
            if (!File.Exists(Path.Combine(appDirectory, relativePath)))
            {
                missingFile = relativePath;
                return false;
            }
        }

        missingFile = null;
        return true;
    }

    private static string GetLoaderRelativePath()
    {
        string processorArchitecture = Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "";
        string processArchitecture;
        if (processorArchitecture.Equals("ARM64", StringComparison.OrdinalIgnoreCase))
        {
            processArchitecture = "win-arm64";
        }
        else
        {
            processArchitecture = Environment.Is64BitProcess ? "win-x64" : "win-x86";
        }

        return Path.Combine("runtimes", processArchitecture, "native", "WebView2Loader.dll");
    }

    private static void LoadNativeWebView2Loader(string appDirectory)
    {
        string loaderPath = Path.Combine(appDirectory, GetLoaderRelativePath());
        if (LoadLibrary(loaderPath) == IntPtr.Zero)
        {
            throw new InvalidOperationException(
                "WebView2 本机组件加载失败（系统错误 " + Marshal.GetLastWin32Error() + "）。"
            );
        }
    }

    private static void TryDeleteSmokeDirectory(string path)
    {
        try
        {
            string temporaryRoot = Path.GetFullPath(Path.GetTempPath())
                .TrimEnd(Path.DirectorySeparatorChar);
            string target = Path.GetFullPath(path)
                .TrimEnd(Path.DirectorySeparatorChar);
            if (target.StartsWith(
                    temporaryRoot + Path.DirectorySeparatorChar,
                    StringComparison.OrdinalIgnoreCase)
                && Path.GetFileName(target).StartsWith(
                    "PhysicsStudio-WebView2-Smoke-",
                    StringComparison.Ordinal))
            {
                Directory.Delete(target, true);
            }
        }
        catch
        {
            // WebView2 可能仍在释放缓存句柄；临时目录由系统后续清理。
        }
    }

    internal static bool OpenExternal(Uri uri)
    {
        if (uri == null || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return false;
        }

        string edgePath = FindMicrosoftEdge();
        try
        {
            if (!string.IsNullOrEmpty(edgePath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = edgePath,
                    Arguments = "\"" + uri.AbsoluteUri + "\"",
                    UseShellExecute = true
                });
                return true;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = uri.AbsoluteUri,
                UseShellExecute = true
            });
            return true;
        }
        catch
        {
            return false;
        }
    }

    internal static void OpenLegacyFallback(string appDirectory)
    {
        string indexPath = Path.Combine(appDirectory, "index.html");
        string edgePath = FindMicrosoftEdge();
        ProcessStartInfo startInfo;
        if (!string.IsNullOrEmpty(edgePath))
        {
            startInfo = new ProcessStartInfo
            {
                FileName = edgePath,
                Arguments = "--app=\"" + new Uri(indexPath).AbsoluteUri + "\" --no-first-run",
                WorkingDirectory = appDirectory,
                UseShellExecute = true
            };
        }
        else
        {
            startInfo = new ProcessStartInfo
            {
                FileName = indexPath,
                WorkingDirectory = appDirectory,
                UseShellExecute = true
            };
        }

        Process.Start(startInfo);
    }

    private static string FindMicrosoftEdge()
    {
        string[] candidates =
        {
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Microsoft\Edge\Application\msedge.exe"
            ),
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Microsoft\Edge\Application\msedge.exe"
            ),
            ReadAppPath(Registry.CurrentUser, "msedge.exe"),
            ReadAppPath(Registry.LocalMachine, "msedge.exe")
        };

        foreach (string candidate in candidates)
        {
            if (!string.IsNullOrEmpty(candidate) && File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static string ReadAppPath(RegistryKey root, string executableName)
    {
        try
        {
            using (RegistryKey key = root.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + executableName))
            {
                return key == null ? null : key.GetValue(null) as string;
            }
        }
        catch
        {
            return null;
        }
    }

    internal static void ShowError(string message)
    {
        MessageBox.Show(message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}

internal static class ActivationStorage
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("PhysicsStudioActivationStorageV1");

    private static string StorageDirectory
    {
        get
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Program.LegacyDataFolder,
                "Activation"
            );
        }
    }

    internal static string GetDeviceId()
    {
        string path = Path.Combine(StorageDirectory, "device.dat");
        byte[] secret = ReadProtected(path);
        if (secret == null || secret.Length != 32)
        {
            secret = new byte[32];
            using (RandomNumberGenerator random = RandomNumberGenerator.Create())
            {
                random.GetBytes(secret);
            }
            WriteProtected(path, secret);
        }

        using (SHA256 sha = SHA256.Create())
        {
            return ToHex(sha.ComputeHash(secret));
        }
    }

    internal static string GetActivationCode()
    {
        byte[] value = ReadProtected(Path.Combine(StorageDirectory, "license.dat"));
        if (value == null || value.Length == 0 || value.Length > 8192)
        {
            return "";
        }
        try
        {
            string code = Encoding.UTF8.GetString(value);
            return IsSafeActivationCode(code) ? code : "";
        }
        catch
        {
            return "";
        }
    }

    internal static bool SaveActivationCode(string code)
    {
        if (!IsSafeActivationCode(code))
        {
            return false;
        }
        WriteProtected(
            Path.Combine(StorageDirectory, "license.dat"),
            Encoding.UTF8.GetBytes(code)
        );
        return string.Equals(GetActivationCode(), code, StringComparison.Ordinal);
    }

    internal static bool IsSafeActivationCode(string code)
    {
        if (string.IsNullOrEmpty(code)
            || code.Length < 80
            || code.Length > 4096
            || !code.StartsWith("PSA1.", StringComparison.Ordinal))
        {
            return false;
        }
        foreach (char character in code)
        {
            bool allowed = character == '.'
                || character == '-'
                || character == '_'
                || (character >= '0' && character <= '9')
                || (character >= 'A' && character <= 'Z')
                || (character >= 'a' && character <= 'z');
            if (!allowed) return false;
        }
        return true;
    }

    private static byte[] ReadProtected(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            byte[] encrypted = File.ReadAllBytes(path);
            if (encrypted.Length == 0 || encrypted.Length > 16384) return null;
            return ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
        }
        catch
        {
            return null;
        }
    }

    private static void WriteProtected(string path, byte[] value)
    {
        Directory.CreateDirectory(StorageDirectory);
        byte[] encrypted = ProtectedData.Protect(value, Entropy, DataProtectionScope.CurrentUser);
        string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllBytes(temporary, encrypted);
        try
        {
            if (File.Exists(path))
            {
                File.Replace(temporary, path, null);
            }
            else
            {
                File.Move(temporary, path);
            }
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }

    private static string ToHex(byte[] value)
    {
        StringBuilder output = new StringBuilder(value.Length * 2);
        foreach (byte item in value)
        {
            output.Append(item.ToString("X2"));
        }
        return output.ToString();
    }
}

internal sealed class StudioWindow : Form
{
    private const string VirtualHost = "physics-studio.local";
    private const string StartUrl = "https://physics-studio.local/index.html";
    private readonly string appDirectory;
    private readonly WebView2 webView;
    private readonly bool smokeTest;
    private readonly string userDataDirectory;
    private readonly LanHostStatus classroomStatus;
    private readonly Timer smokeTimer;
    private bool initialized;

    internal StudioWindow(
        string applicationDirectory,
        bool runSmokeTest,
        string smokeUserDataDirectory,
        LanHostStatus lanClassroomStatus
    )
    {
        appDirectory = applicationDirectory;
        smokeTest = runSmokeTest;
        userDataDirectory = smokeUserDataDirectory;
        classroomStatus = lanClassroomStatus;
                Text = "费曼物理";
        StartPosition = FormStartPosition.CenterScreen;
        Rectangle workArea = Screen.PrimaryScreen == null
            ? new Rectangle(0, 0, 1360, 860)
            : Screen.PrimaryScreen.WorkingArea;
        int clientWidth = Math.Min(1360, Math.Max(760, workArea.Width - 32));
        int clientHeight = Math.Min(860, Math.Max(520, workArea.Height - 64));
        MinimumSize = new Size(Math.Min(960, clientWidth), Math.Min(680, clientHeight));
        ClientSize = new Size(clientWidth, clientHeight);
        BackColor = Color.FromArgb(244, 246, 242);

        webView = new WebView2
        {
            Dock = DockStyle.Fill,
            BackColor = BackColor
        };
        Controls.Add(webView);
        // WebView2 首次创建用户数据目录时，在低配置或受管电脑上可能超过 15 秒。
        // 冒烟测试只用于发布验收，45 秒门限可减少正常首启被误判为失败。
        smokeTimer = new Timer { Interval = 45000 };
        smokeTimer.Tick += delegate
        {
            smokeTimer.Stop();
            Environment.ExitCode = 7;
            Close();
        };
        Shown += async delegate { await InitializeWebViewAsync(); };
        if (smokeTest)
        {
            Opacity = 0;
            ShowInTaskbar = false;
            smokeTimer.Start();
        }
    }

    private async Task InitializeWebViewAsync()
    {
        if (initialized)
        {
            return;
        }

        initialized = true;
        try
        {
            string effectiveUserDataDirectory = userDataDirectory ?? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Program.LegacyDataFolder,
                "UserData"
            );
            Directory.CreateDirectory(effectiveUserDataDirectory);

            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                null,
                effectiveUserDataDirectory
            );
            await webView.EnsureCoreWebView2Async(environment);
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                VirtualHost,
                appDirectory,
                CoreWebView2HostResourceAccessKind.DenyCors
            );
            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = true;
            webView.CoreWebView2.Settings.AreHostObjectsAllowed = false;
            webView.CoreWebView2.NavigationStarting += HandleNavigationStarting;
            webView.CoreWebView2.NavigationCompleted += HandleNavigationCompleted;
            webView.CoreWebView2.NewWindowRequested += HandleNewWindowRequested;
            webView.CoreWebView2.PermissionRequested += HandlePermissionRequested;
            webView.CoreWebView2.WebMessageReceived += HandleWebMessageReceived;
            webView.CoreWebView2.Navigate(StartUrl);
        }
        catch (Exception exception)
        {
            if (smokeTest)
            {
                smokeTimer.Stop();
                Environment.ExitCode = 5;
                Close();
                return;
            }
            DialogResult result = MessageBox.Show(
                "无法启动安全的 WebView2 本地宿主。\n\n"
                + exception.Message
                + "\n\n是否改用 Edge 或系统默认浏览器打开？",
                Program.AppName,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning
            );
            if (result == DialogResult.Yes)
            {
                Program.OpenLegacyFallback(appDirectory);
            }
            Close();
        }
    }

    private void HandleNavigationCompleted(
        object sender,
        CoreWebView2NavigationCompletedEventArgs args
    )
    {
        if (!smokeTest)
        {
            return;
        }

        smokeTimer.Stop();
        Environment.ExitCode = args.IsSuccess ? 0 : 6;
        Close();
    }

    private static bool IsInternalUri(Uri uri)
    {
        return uri != null
            && uri.Scheme == Uri.UriSchemeHttps
            && string.Equals(uri.Host, VirtualHost, StringComparison.OrdinalIgnoreCase);
    }

    private void HandleNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs args)
    {
        Uri uri;
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out uri))
        {
            args.Cancel = true;
            return;
        }

        if (IsInternalUri(uri) || string.Equals(uri.Scheme, "about", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        args.Cancel = true;
        Program.OpenExternal(uri);
    }

    private void HandleNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        Uri uri;
        if (Uri.TryCreate(args.Uri, UriKind.Absolute, out uri))
        {
            Program.OpenExternal(uri);
        }
    }

    private void HandlePermissionRequested(object sender, CoreWebView2PermissionRequestedEventArgs args)
    {
        Uri uri;
        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out uri) || !IsInternalUri(uri))
        {
            args.State = CoreWebView2PermissionState.Deny;
            return;
        }

        if (args.PermissionKind != CoreWebView2PermissionKind.Camera
            && args.PermissionKind != CoreWebView2PermissionKind.Microphone)
        {
            args.State = CoreWebView2PermissionState.Deny;
        }
    }

    private void HandleWebMessageReceived(
        object sender,
        CoreWebView2WebMessageReceivedEventArgs args
    )
    {
        Uri source;
        if (!Uri.TryCreate(args.Source, UriKind.Absolute, out source) || !IsInternalUri(source))
        {
            return;
        }

        string message;
        try
        {
            message = args.TryGetWebMessageAsString();
        }
        catch
        {
            return;
        }
        if (string.IsNullOrEmpty(message) || message.Length > 100000)
        {
            return;
        }
        if (message[0] == '{')
        {
            HandleClassroomWebMessage(message);
            return;
        }
        if (message.Length > 5000) return;

        string[] parts = message.Split(new[] { ':' }, 4);
        if (parts.Length < 3
            || !string.Equals(parts[0], "activation", StringComparison.Ordinal)
            || !IsSafeRequestId(parts[2]))
        {
            return;
        }

        string action = parts[1];
        string requestId = parts[2];
        try
        {
            if (string.Equals(action, "get", StringComparison.Ordinal) && parts.Length == 3)
            {
                PostActivationMessage(
                    requestId,
                    ActivationStorage.GetDeviceId(),
                    ActivationStorage.GetActivationCode(),
                    null,
                    null
                );
                return;
            }
            if (string.Equals(action, "save", StringComparison.Ordinal) && parts.Length == 4)
            {
                bool saved = ActivationStorage.SaveActivationCode(parts[3]);
                PostActivationMessage(requestId, null, null, saved, saved ? null : "激活信息格式不正确。");
            }
        }
        catch (Exception exception)
        {
            PostActivationMessage(requestId, null, null, false, exception.Message);
        }
    }

    private async void HandleClassroomWebMessage(string message)
    {
        string response;
        try
        {
            response = await Task.Run(delegate
            {
                return new LanNativeMessageRouter().Handle(message);
            });
        }
        catch
        {
            return;
        }
        if (IsDisposed || Disposing || webView.CoreWebView2 == null) return;
        webView.CoreWebView2.PostWebMessageAsJson(response);
    }

    private static bool IsSafeRequestId(string value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 80) return false;
        foreach (char character in value)
        {
            bool allowed = character == '-'
                || (character >= '0' && character <= '9')
                || (character >= 'A' && character <= 'Z')
                || (character >= 'a' && character <= 'z');
            if (!allowed) return false;
        }
        return true;
    }

    private void PostActivationMessage(
        string requestId,
        string deviceId,
        string code,
        bool? saved,
        string error
    )
    {
        if (webView.CoreWebView2 == null) return;
        StringBuilder json = new StringBuilder();
        json.Append("{\"channel\":\"physics-studio-activation\"");
        json.Append(",\"requestId\":\"").Append(JsonEscape(requestId)).Append("\"");
        if (deviceId != null)
        {
            json.Append(",\"deviceId\":\"").Append(JsonEscape(deviceId)).Append("\"");
        }
        if (code != null)
        {
            json.Append(",\"code\":\"").Append(JsonEscape(code)).Append("\"");
        }
        if (saved.HasValue)
        {
            json.Append(",\"saved\":").Append(saved.Value ? "true" : "false");
        }
        if (!string.IsNullOrEmpty(error))
        {
            json.Append(",\"error\":\"").Append(JsonEscape(error)).Append("\"");
        }
        json.Append("}");
        webView.CoreWebView2.PostWebMessageAsJson(json.ToString());
    }

    private static string JsonEscape(string value)
    {
        StringBuilder output = new StringBuilder((value ?? "").Length + 8);
        foreach (char character in value ?? "")
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
                        output.Append("\\u").Append(((int)character).ToString("x4"));
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
}
