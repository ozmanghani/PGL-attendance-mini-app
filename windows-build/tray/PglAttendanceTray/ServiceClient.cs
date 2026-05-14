using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace PglAttendanceTray;

internal class HealthResponse
{
    public bool Ok { get; set; }
    public int Port { get; set; }
    public string HrmisUrl { get; set; } = "";
    public int UptimeSeconds { get; set; }
}

internal class ServiceClient
{
    private static readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(3)
    };

    public static string BaseUrl(int port) => $"http://127.0.0.1:{port}";

    public static async Task<HealthResponse?> HealthAsync(int port, CancellationToken ct = default)
    {
        try
        {
            using var resp = await _http.GetAsync($"{BaseUrl(port)}/api/health", ct);
            if (!resp.IsSuccessStatusCode) return null;
            var body = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var r = doc.RootElement;
            return new HealthResponse
            {
                Ok = r.TryGetProperty("ok", out var ok) && ok.GetBoolean(),
                Port = r.TryGetProperty("port", out var p) && p.TryGetInt32(out var pi) ? pi : port,
                HrmisUrl = r.TryGetProperty("hrmisUrl", out var h) ? (h.GetString() ?? "") : "",
                UptimeSeconds = r.TryGetProperty("uptimeSeconds", out var u) && u.TryGetInt32(out var ui) ? ui : 0,
            };
        }
        catch
        {
            return null;
        }
    }

    public static async Task<bool> UpdateSettingsAsync(int port, string hrmisUrl, int newPort, CancellationToken ct = default)
    {
        try
        {
            var payload = JsonSerializer.Serialize(new { hrmisUrl, port = newPort });
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var req = new HttpRequestMessage(HttpMethod.Put, $"{BaseUrl(port)}/api/settings") { Content = content };
            using var resp = await _http.SendAsync(req, ct);
            return resp.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}
