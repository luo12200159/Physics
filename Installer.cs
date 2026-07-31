using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("物理研习室安装程序")]
[assembly: AssemblyDescription("物理研习室 Windows 单文件安装程序")]
[assembly: AssemblyProduct("物理研习室")]
[assembly: AssemblyCompany("")]
[assembly: AssemblyVersion("2.6.0.0")]
[assembly: AssemblyFileVersion("2.6.0.0")]

internal static class InstallerProgram
{
    private const string AppName = "物理研习室";
    private const string AppVersion = "2.6.0";
    private const string UninstallKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\PhysicsStudio";

    private static readonly PayloadFile[] Payload =
    {
        new PayloadFile("PhysicsStudio.Payload.Launcher", "物理研习室.exe"),
        new PayloadFile("PhysicsStudio.Payload.Uninstaller", "卸载物理研习室.exe"),
        new PayloadFile("PhysicsStudio.Payload.Index", "index.html"),
        new PayloadFile("PhysicsStudio.Payload.Styles", "styles.css"),
        new PayloadFile("PhysicsStudio.Payload.LearningLabStyles", "learning-lab.css"),
        new PayloadFile("PhysicsStudio.Payload.ExperienceStyles", "experience-shell.css"),
        new PayloadFile("PhysicsStudio.Payload.ActivationStyles", "activation.css"),
        new PayloadFile("PhysicsStudio.Payload.ActivationPublicKey", "activation-public-key.js"),
        new PayloadFile("PhysicsStudio.Payload.ActivationScript", "activation.js"),
        new PayloadFile("PhysicsStudio.Payload.CurriculumTaxonomy", "curriculum-taxonomy.js"),
        new PayloadFile("PhysicsStudio.Payload.CurriculumBank", "curriculum-bank.js"),
        new PayloadFile("PhysicsStudio.Payload.ExamQuestionIndex", "exam-question-index.js"),
        new PayloadFile("PhysicsStudio.Payload.MockExamBank", "mock-exam-bank.js"),
        new PayloadFile("PhysicsStudio.Payload.OriginalPracticeBank", "original-practice-bank.js"),
        new PayloadFile("PhysicsStudio.Payload.TargetedPracticeBank", "targeted-practice-bank.js"),
        new PayloadFile("PhysicsStudio.Payload.JsQr", @"vendor\jsQR.js"),
        new PayloadFile("PhysicsStudio.Payload.JsQrLicense", @"vendor\jsQR-LICENSE.txt"),
        new PayloadFile("PhysicsStudio.Payload.Fflate", @"vendor\fflate.js"),
        new PayloadFile("PhysicsStudio.Payload.FflateLicense", @"vendor\fflate-LICENSE.txt"),
        new PayloadFile("PhysicsStudio.Payload.WebView2Core", "Microsoft.Web.WebView2.Core.dll"),
        new PayloadFile("PhysicsStudio.Payload.WebView2WinForms", "Microsoft.Web.WebView2.WinForms.dll"),
        new PayloadFile("PhysicsStudio.Payload.WebView2LoaderX64", @"runtimes\win-x64\native\WebView2Loader.dll"),
        new PayloadFile("PhysicsStudio.Payload.WebView2LoaderX86", @"runtimes\win-x86\native\WebView2Loader.dll"),
        new PayloadFile("PhysicsStudio.Payload.WebView2LoaderArm64", @"runtimes\win-arm64\native\WebView2Loader.dll"),
        new PayloadFile("PhysicsStudio.Payload.WebView2License", @"vendor\webview2\LICENSE.txt"),
        new PayloadFile("PhysicsStudio.Payload.WebView2Notice", @"vendor\webview2\NOTICE.txt"),
        new PayloadFile("PhysicsStudio.Payload.Security", "security.js"),
        new PayloadFile("PhysicsStudio.Payload.Backup", "backup.js"),
        new PayloadFile("PhysicsStudio.Payload.BackupValidator", "backup-validator.js"),
        new PayloadFile("PhysicsStudio.Payload.AiTutor", "ai-tutor.js"),
        new PayloadFile("PhysicsStudio.Payload.DocumentImport", "document-import.js"),
        new PayloadFile("PhysicsStudio.Payload.ContentCatalog", "content-catalog.js"),
        new PayloadFile("PhysicsStudio.Payload.LearningEngine", "learning-engine.js"),
        new PayloadFile("PhysicsStudio.Payload.Script", "app.js"),
        new PayloadFile("PhysicsStudio.Payload.LearningLab", "learning-lab.js"),
        new PayloadFile("PhysicsStudio.Payload.ExperienceScript", "experience-shell.js"),
        new PayloadFile("PhysicsStudio.Payload.Readme", "README.md"),
        new PayloadFile("PhysicsStudio.Payload.Favicon", @"assets\favicon.svg"),
        new PayloadFile("PhysicsStudio.Payload.Icon", @"assets\app.ico")
    };

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        InstallOptions options = InstallOptions.Parse(args);
        string installDirectory = options.InstallDirectory
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                @"Programs\物理研习室");

        if (!options.Silent)
        {
            DialogResult answer = MessageBox.Show(
                "将把“物理研习室”安装到当前 Windows 用户。\n\n"
                + "核心题库和本地视频可离线使用；互联网题源、互联网搜索和在线视频在联网时可用。\n\n"
                + "安装不需要管理员权限。是否继续？",
                AppName + " 安装程序",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information);
            if (answer != DialogResult.Yes) return 1;
        }

        try
        {
            InstallPayload(installDirectory);
            string targetPath = Path.Combine(installDirectory, "物理研习室.exe");
            string uninstallerPath = Path.Combine(installDirectory, "卸载物理研习室.exe");

            if (!options.NoShortcuts)
            {
                CreateShortcuts(targetPath, installDirectory);
            }

            if (!options.NoRegister)
            {
                RegisterUninstaller(installDirectory, targetPath, uninstallerPath);
            }

            if (!options.Silent)
            {
                MessageBox.Show(
                    "安装完成。\n\n已创建桌面和开始菜单入口。联网时可使用“互联网题源”和互联网检索。",
                    AppName + " 安装程序",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }

            if (!options.NoLaunch)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = targetPath,
                    WorkingDirectory = installDirectory,
                    UseShellExecute = true
                });
            }

            return 0;
        }
        catch (Exception exception)
        {
            if (!options.Silent)
            {
                MessageBox.Show(
                    "安装失败：" + exception.Message,
                    AppName + " 安装程序",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }

            return 2;
        }
    }

    private static void InstallPayload(string installDirectory)
    {
        string fullInstallDirectory = Path.GetFullPath(installDirectory);
        Directory.CreateDirectory(fullInstallDirectory);

        Assembly assembly = Assembly.GetExecutingAssembly();
        foreach (PayloadFile file in Payload)
        {
            string destination = Path.GetFullPath(Path.Combine(fullInstallDirectory, file.RelativePath));
            if (!destination.StartsWith(fullInstallDirectory + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("安装文件路径无效。");
            }

            string destinationDirectory = Path.GetDirectoryName(destination);
            if (!string.IsNullOrEmpty(destinationDirectory))
            {
                Directory.CreateDirectory(destinationDirectory);
            }

            using (Stream source = assembly.GetManifestResourceStream(file.ResourceName))
            {
                if (source == null)
                {
                    throw new InvalidOperationException("安装包缺少资源：" + file.RelativePath);
                }

                string temporaryPath = destination + ".installing";
                using (FileStream target = new FileStream(temporaryPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    source.CopyTo(target);
                }

                if (File.Exists(destination)) File.Delete(destination);
                File.Move(temporaryPath, destination);
            }
        }
    }

    private static void CreateShortcuts(string targetPath, string installDirectory)
    {
        string desktopShortcut = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk");
        string startMenuDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName);
        Directory.CreateDirectory(startMenuDirectory);
        string startMenuShortcut = Path.Combine(startMenuDirectory, AppName + ".lnk");

        CreateShortcut(desktopShortcut, targetPath, installDirectory);
        CreateShortcut(startMenuShortcut, targetPath, installDirectory);
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) throw new InvalidOperationException("系统快捷方式组件不可用。");

        object shell = null;
        object shortcut = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell,
                new object[] { shortcutPath });
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut,
                new object[] { targetPath });
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut,
                new object[] { workingDirectory });
            shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut,
                new object[] { targetPath + ",0" });
            shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut,
                new object[] { "支持离线使用与联网检索的初高中物理题库" });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
        finally
        {
            if (shortcut != null && Marshal.IsComObject(shortcut)) Marshal.FinalReleaseComObject(shortcut);
            if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
        }
    }

    private static void RegisterUninstaller(string installDirectory, string targetPath, string uninstallerPath)
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKeyPath))
        {
            if (key == null) throw new InvalidOperationException("无法登记卸载信息。");
            key.SetValue("DisplayName", AppName);
            key.SetValue("DisplayVersion", AppVersion);
            key.SetValue("DisplayIcon", targetPath + ",0");
            key.SetValue("InstallLocation", installDirectory);
            key.SetValue("UninstallString", Quote(uninstallerPath));
            key.SetValue("QuietUninstallString", Quote(uninstallerPath) + " --silent");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            key.SetValue("EstimatedSize", CalculateInstalledSizeKilobytes(installDirectory), RegistryValueKind.DWord);
            key.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
        }
    }

    private static int CalculateInstalledSizeKilobytes(string installDirectory)
    {
        long bytes = 0;
        foreach (string file in Directory.GetFiles(installDirectory, "*", SearchOption.AllDirectories))
        {
            bytes += new FileInfo(file).Length;
        }

        return (int)Math.Max(1, Math.Ceiling(bytes / 1024d));
    }

    private static string Quote(string value)
    {
        return "\"" + value + "\"";
    }

    private sealed class PayloadFile
    {
        public readonly string ResourceName;
        public readonly string RelativePath;

        public PayloadFile(string resourceName, string relativePath)
        {
            ResourceName = resourceName;
            RelativePath = relativePath;
        }
    }

    private sealed class InstallOptions
    {
        public bool Silent;
        public bool NoLaunch;
        public bool NoShortcuts;
        public bool NoRegister;
        public string InstallDirectory;

        public static InstallOptions Parse(string[] args)
        {
            InstallOptions options = new InstallOptions();
            for (int index = 0; index < args.Length; index += 1)
            {
                string argument = args[index];
                if (string.Equals(argument, "--silent", StringComparison.OrdinalIgnoreCase))
                    options.Silent = true;
                else if (string.Equals(argument, "--no-launch", StringComparison.OrdinalIgnoreCase))
                    options.NoLaunch = true;
                else if (string.Equals(argument, "--no-shortcuts", StringComparison.OrdinalIgnoreCase))
                    options.NoShortcuts = true;
                else if (string.Equals(argument, "--no-register", StringComparison.OrdinalIgnoreCase))
                    options.NoRegister = true;
                else if (string.Equals(argument, "--install-dir", StringComparison.OrdinalIgnoreCase)
                    && index + 1 < args.Length)
                    options.InstallDirectory = args[++index];
            }

            return options;
        }
    }
}
