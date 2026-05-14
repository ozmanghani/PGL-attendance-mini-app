using System;
using System.IO;
using System.Text.Json;

namespace PglAttendanceTray;

internal class AppSettings
{
    public string HrmisUrl { get; set; } = "https://people-api.pglsystem.com";
    public int Port { get; set; } = 4001;

    public static AppSettings Load()
    {
        try
        {
            var file = Paths.SettingsFile;
            if (!File.Exists(file)) return new AppSettings();
            var json = File.ReadAllText(file);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var s = new AppSettings();
            if (root.TryGetProperty("hrmisUrl", out var h) && h.ValueKind == JsonValueKind.String)
            {
                var v = h.GetString();
                if (!string.IsNullOrWhiteSpace(v)) s.HrmisUrl = v.TrimEnd('/');
            }
            if (root.TryGetProperty("port", out var p) && p.ValueKind == JsonValueKind.Number
                && p.TryGetInt32(out var pi))
            {
                s.Port = pi;
            }
            return s;
        }
        catch
        {
            return new AppSettings();
        }
    }

    public string Serialize()
    {
        return JsonSerializer.Serialize(
            new { hrmisUrl = HrmisUrl.TrimEnd('/'), port = Port },
            new JsonSerializerOptions { WriteIndented = true });
    }

    public void SaveToDisk()
    {
        Paths.EnsureDirs();
        var file = Paths.SettingsFile;
        var tmp = file + ".tmp";
        File.WriteAllText(tmp, Serialize());
        if (File.Exists(file)) File.Delete(file);
        File.Move(tmp, file);
    }
}
