using System;
using System.Diagnostics;
using System.ServiceProcess;

namespace PglAttendanceTray;

internal static class ServiceControl
{
    public const string ServiceName = "PGLAttendanceSync";

    public static ServiceControllerStatus? GetStatus()
    {
        try
        {
            using var sc = new ServiceController(ServiceName);
            return sc.Status;
        }
        catch
        {
            return null;
        }
    }

    public static bool RestartElevated()
    {
        return RunElevated("cmd.exe", $"/c net stop \"{ServiceName}\" && net start \"{ServiceName}\"");
    }

    public static bool RestartWithFirewallElevated(int newPort)
    {
        var ruleName = "PGL Attendance";
        var cmd =
            $"/c netsh advfirewall firewall delete rule name=\"{ruleName}\" >NUL 2>&1 && " +
            $"netsh advfirewall firewall add rule name=\"{ruleName}\" dir=in action=allow protocol=TCP localport={newPort} && " +
            $"net stop \"{ServiceName}\" && net start \"{ServiceName}\"";
        return RunElevated("cmd.exe", cmd);
    }

    public static bool StartElevated()
    {
        return RunElevated("net.exe", $"start \"{ServiceName}\"");
    }

    public static bool StopElevated()
    {
        return RunElevated("net.exe", $"stop \"{ServiceName}\"");
    }

    private static bool RunElevated(string file, string args)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = file,
                Arguments = args,
                UseShellExecute = true,
                Verb = "runas",
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            var p = Process.Start(psi);
            if (p == null) return false;
            p.WaitForExit(15000);
            return p.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }
}
