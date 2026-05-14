using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PglAttendanceTray;

internal sealed class TrayContext : ApplicationContext
{
    private readonly NotifyIcon _icon;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _openWebItem;
    private readonly ToolStripMenuItem _settingsItem;
    private readonly ToolStripMenuItem _restartItem;
    private readonly ToolStripMenuItem _openLogsItem;
    private readonly ToolStripMenuItem _exitItem;

    private AppSettings _settings;
    private SettingsForm? _settingsForm;
    private bool _lastHealthy;
    private bool _firstPoll = true;

    public TrayContext()
    {
        Paths.EnsureDirs();
        _settings = AppSettings.Load();

        var menu = new ContextMenuStrip();
        _statusItem = new ToolStripMenuItem("Status: checking...") { Enabled = false };
        _openWebItem = new ToolStripMenuItem("Open Web Dashboard", null, OnOpenWeb);
        _settingsItem = new ToolStripMenuItem("Settings...", null, OnOpenSettings);
        _restartItem = new ToolStripMenuItem("Restart Service", null, OnRestart);
        _openLogsItem = new ToolStripMenuItem("Open Logs Folder", null, OnOpenLogs);
        _exitItem = new ToolStripMenuItem("Exit (service keeps running)", null, OnExit);

        menu.Items.Add(_statusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(_openWebItem);
        menu.Items.Add(_settingsItem);
        menu.Items.Add(_restartItem);
        menu.Items.Add(_openLogsItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(_exitItem);

        _icon = new NotifyIcon
        {
            Icon = LoadIcon(),
            Visible = true,
            Text = Program.AppName,
            ContextMenuStrip = menu,
        };
        _icon.DoubleClick += OnOpenWeb;

        _pollTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        _pollTimer.Tick += async (_, _) => await PollAsync();
        _pollTimer.Start();
        _ = PollAsync();
    }

    private static Icon LoadIcon()
    {
        try
        {
            var asmDir = AppContext.BaseDirectory;
            var path = Path.Combine(asmDir, "app.ico");
            if (File.Exists(path)) return new Icon(path);
        }
        catch { /* fall through */ }
        return SystemIcons.Application;
    }

    private async Task PollAsync()
    {
        var settings = AppSettings.Load();
        _settings = settings;
        var health = await ServiceClient.HealthAsync(settings.Port);
        bool healthy = health is { Ok: true };

        _statusItem.Text = healthy
            ? $"Running on port {health!.Port}  (uptime {FormatUptime(health.UptimeSeconds)})"
            : "Service not responding";
        _icon.Text = healthy
            ? $"{Program.AppName} — port {health!.Port}"
            : $"{Program.AppName} — offline";

        if (_firstPoll)
        {
            _firstPoll = false;
            _lastHealthy = healthy;
        }
        else if (healthy != _lastHealthy)
        {
            _lastHealthy = healthy;
            try
            {
                _icon.ShowBalloonTip(
                    3000,
                    Program.AppName,
                    healthy ? "Sync service is online." : "Sync service is offline.",
                    healthy ? ToolTipIcon.Info : ToolTipIcon.Warning);
            }
            catch { /* ignore */ }
        }
    }

    private static string FormatUptime(int seconds)
    {
        if (seconds < 60) return $"{seconds}s";
        if (seconds < 3600) return $"{seconds / 60}m";
        if (seconds < 86400) return $"{seconds / 3600}h{(seconds % 3600) / 60}m";
        return $"{seconds / 86400}d{(seconds % 86400) / 3600}h";
    }

    private void OnOpenWeb(object? sender, EventArgs e)
    {
        try
        {
            var url = $"http://localhost:{_settings.Port}/";
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show("Could not open browser: " + ex.Message, Program.AppName,
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OnOpenSettings(object? sender, EventArgs e)
    {
        if (_settingsForm is { IsDisposed: false })
        {
            _settingsForm.Activate();
            return;
        }
        _settingsForm = new SettingsForm(_settings);
        _settingsForm.FormClosed += (_, _) => _settingsForm = null;
        _settingsForm.Show();
    }

    private void OnRestart(object? sender, EventArgs e)
    {
        var ok = ServiceControl.RestartElevated();
        _icon.ShowBalloonTip(3000, Program.AppName,
            ok ? "Service restarted." : "Could not restart service. Run as administrator.",
            ok ? ToolTipIcon.Info : ToolTipIcon.Warning);
    }

    private void OnOpenLogs(object? sender, EventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo(Paths.LogDir) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show("Could not open logs folder: " + ex.Message, Program.AppName);
        }
    }

    private void OnExit(object? sender, EventArgs e)
    {
        _icon.Visible = false;
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pollTimer.Stop();
            _pollTimer.Dispose();
            _icon.Visible = false;
            _icon.Dispose();
        }
        base.Dispose(disposing);
    }
}
