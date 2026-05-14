using System;
using Microsoft.Win32;

namespace PglAttendanceTray;

internal static class Autostart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "PGLAttendanceTray";

    public static bool IsEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: false);
            return key?.GetValue(ValueName) is string;
        }
        catch
        {
            return false;
        }
    }

    public static void Set(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true);
            if (key == null) return;
            if (enabled)
            {
                var exe = Environment.ProcessPath
                          ?? System.IO.Path.Combine(AppContext.BaseDirectory, "PglAttendanceTray.exe");
                key.SetValue(ValueName, "\"" + exe + "\"");
            }
            else
            {
                if (key.GetValue(ValueName) != null) key.DeleteValue(ValueName, false);
            }
        }
        catch { /* ignore */ }
    }
}
