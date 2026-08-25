using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("卸载费曼物理")]
[assembly: AssemblyDescription("费曼物理卸载程序")]
[assembly: AssemblyProduct("费曼物理")]
[assembly: AssemblyCompany("")]
[assembly: AssemblyVersion("3.4.1.0")]
[assembly: AssemblyFileVersion("3.4.1.0")]

internal static class UninstallerProgram
{
    private const string AppName = "费曼物理";
    private const string UninstallKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\PhysicsStudio";
    private const int MoveFileDelayUntilReboot = 0x4;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool MoveFileEx(string existingFileName, string newFileName, int flags);

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        bool silent = HasArgument(args, "--silent");

        if (HasArgument(args, "--check"))
        {
            return RequiredFilesExist(AppDomain.CurrentDomain.BaseDirectory) ? 0 : 2;
        }

        if (HasArgument(args, "--cleanup"))
        {
            return RunCleanup(args, silent);
        }

        if (!silent)
        {
            DialogResult answer = MessageBox.Show(
                "确定卸载“费曼物理”吗？\n\n"
                + "应用文件和快捷方式将被移除。浏览器中保存的个人题库数据不会主动清除，重新安装后仍可继续使用。",
                "卸载" + AppName,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (answer != DialogResult.Yes) return 1;
        }

        try
        {
            string installDirectory = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string temporaryCopy = Path.Combine(Path.GetTempPath(),
                "PhysicsStudioUninstall-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(Assembly.GetExecutingAssembly().Location, temporaryCopy, true);

            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = temporaryCopy,
                Arguments = "--cleanup --target " + Quote(installDirectory)
                    + " --parent " + Process.GetCurrentProcess().Id
                    + (silent ? " --silent" : ""),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(startInfo);
            return 0;
        }
        catch (Exception exception)
        {
            if (!silent) ShowError("无法启动卸载：" + exception.Message);
            return 2;
        }
    }

    private static int RunCleanup(string[] args, bool silent)
    {
        string target = GetArgumentValue(args, "--target");
        string parentValue = GetArgumentValue(args, "--parent");
        int parentId;
        if (string.IsNullOrEmpty(target) || !int.TryParse(parentValue, out parentId)) return 3;

        string expected = Path.GetFullPath(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            @"Programs\物理研习室")).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string actual = Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!string.Equals(expected, actual, StringComparison.OrdinalIgnoreCase)) return 3;

        try
        {
            try
            {
                Process parent = Process.GetProcessById(parentId);
                parent.WaitForExit(10000);
            }
            catch
            {
                Thread.Sleep(500);
            }

            DeleteIfExists(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), AppName + ".lnk"));
            string startMenuDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName);
            DeleteIfExists(Path.Combine(startMenuDirectory, AppName + ".lnk"));
            if (Directory.Exists(startMenuDirectory)
                && Directory.GetFileSystemEntries(startMenuDirectory).Length == 0)
            {
                Directory.Delete(startMenuDirectory);
            }

            Registry.CurrentUser.DeleteSubKeyTree(UninstallKeyPath, false);
            if (Directory.Exists(actual)) Directory.Delete(actual, true);

            string temporaryExecutable = Assembly.GetExecutingAssembly().Location;
            MoveFileEx(temporaryExecutable, null, MoveFileDelayUntilReboot);

            if (!silent)
            {
                MessageBox.Show("“费曼物理”已卸载。", "卸载" + AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }

            return 0;
        }
        catch (Exception exception)
        {
            if (!silent) ShowError("卸载失败：" + exception.Message);
            return 4;
        }
    }

    private static bool RequiredFilesExist(string directory)
    {
        return File.Exists(Path.Combine(directory, "物理研习室.exe"))
            && File.Exists(Path.Combine(directory, "物理研习室-班级服务.exe"))
            && File.Exists(Path.Combine(directory, "index.html"))
            && File.Exists(Path.Combine(directory, "styles.css"))
            && File.Exists(Path.Combine(directory, "learning-lab.css"))
            && File.Exists(Path.Combine(directory, "experience-shell.css"))
            && File.Exists(Path.Combine(directory, "activation.css"))
            && File.Exists(Path.Combine(directory, "activation-public-key.js"))
            && File.Exists(Path.Combine(directory, "activation.js"))
            && File.Exists(Path.Combine(directory, "storage-repository.js"))
            && File.Exists(Path.Combine(directory, "curriculum-taxonomy.js"))
            && File.Exists(Path.Combine(directory, "curriculum-bank.js"))
            && File.Exists(Path.Combine(directory, "exam-question-index.js"))
            && File.Exists(Path.Combine(directory, "mock-exam-bank.js"))
            && File.Exists(Path.Combine(directory, "original-practice-bank.js"))
            && File.Exists(Path.Combine(directory, "targeted-practice-bank.js"))
            && File.Exists(Path.Combine(directory, @"vendor\jsQR.js"))
            && File.Exists(Path.Combine(directory, @"vendor\fflate.js"))
            && File.Exists(Path.Combine(directory, "security.js"))
            && File.Exists(Path.Combine(directory, "backup.js"))
            && File.Exists(Path.Combine(directory, "backup-validator.js"))
            && File.Exists(Path.Combine(directory, "ai-tutor.js"))
            && File.Exists(Path.Combine(directory, "document-import.js"))
            && File.Exists(Path.Combine(directory, "content-catalog.js"))
            && File.Exists(Path.Combine(directory, "learning-engine.js"))
            && File.Exists(Path.Combine(directory, "physics-visuals.js"))
            && File.Exists(Path.Combine(directory, "variant-generator.js"))
            && File.Exists(Path.Combine(directory, "teacher-mode-lock.js"))
            && File.Exists(Path.Combine(directory, "app.js"))
            && File.Exists(Path.Combine(directory, "learning-lab.js"))
            && File.Exists(Path.Combine(directory, "experience-shell.js"))
            && File.Exists(Path.Combine(directory, "Microsoft.Web.WebView2.Core.dll"))
            && File.Exists(Path.Combine(directory, "Microsoft.Web.WebView2.WinForms.dll"));
    }

    private static bool HasArgument(string[] args, string name)
    {
        return Array.Exists(args, delegate(string value)
        {
            return string.Equals(value, name, StringComparison.OrdinalIgnoreCase);
        });
    }

    private static string GetArgumentValue(string[] args, string name)
    {
        for (int index = 0; index < args.Length - 1; index += 1)
        {
            if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                return args[index + 1];
        }

        return null;
    }

    private static void DeleteIfExists(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }

    private static string Quote(string value)
    {
        return "\"" + value + "\"";
    }

    private static void ShowError(string message)
    {
        MessageBox.Show(message, "卸载" + AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
