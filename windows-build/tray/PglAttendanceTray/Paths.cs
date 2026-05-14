using System;
using System.IO;

namespace PglAttendanceTray;

internal static class Paths
{
    public static string DataDir
    {
        get
        {
            var programData = Environment.GetEnvironmentVariable("ProgramData")
                              ?? @"C:\ProgramData";
            return Path.Combine(programData, "PGL Attendance");
        }
    }

    public static string SettingsFile => Path.Combine(DataDir, "settings.json");
    public static string LogDir => Path.Combine(DataDir, "logs");

    public static void EnsureDirs()
    {
        Directory.CreateDirectory(DataDir);
        Directory.CreateDirectory(LogDir);
    }
}
