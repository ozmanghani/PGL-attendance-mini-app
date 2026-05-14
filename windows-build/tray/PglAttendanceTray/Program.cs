using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace PglAttendanceTray;

internal static class Program
{
    public const string AppName = "PGL Attendance";
    public const string ServiceName = "PGLAttendanceSync";
    private static Mutex? _singleInstance;

    [STAThread]
    private static void Main(string[] args)
    {
        _singleInstance = new Mutex(true, "Global\\PGLAttendanceTray.SingleInstance", out bool isOwner);
        if (!isOwner)
        {
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            using var ctx = new TrayContext();
            Application.Run(ctx);
        }
        catch (Exception ex)
        {
            try
            {
                File.AppendAllText(
                    Path.Combine(Paths.LogDir, "tray-crash.log"),
                    $"[{DateTime.Now:O}] {ex}\n");
            }
            catch { /* ignore */ }
            MessageBox.Show(
                "The tray application crashed. See tray-crash.log for details.\n\n" + ex.Message,
                AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
