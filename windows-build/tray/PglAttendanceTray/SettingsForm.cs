using System;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PglAttendanceTray;

internal sealed class SettingsForm : Form
{
    private readonly TextBox _hrmisBox;
    private readonly NumericUpDown _portBox;
    private readonly CheckBox _autostartBox;
    private readonly Button _saveBtn;
    private readonly Button _cancelBtn;
    private readonly Label _hint;
    private readonly AppSettings _initial;

    public SettingsForm(AppSettings current)
    {
        _initial = current;
        Text = $"{Program.AppName} — Settings";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = false;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(460, 240);
        Font = new Font("Segoe UI", 9F);

        var hrmisLabel = new Label
        {
            Text = "HRMIS API URL",
            Location = new Point(18, 18),
            AutoSize = true,
        };
        _hrmisBox = new TextBox
        {
            Location = new Point(18, 40),
            Width = 420,
            Text = current.HrmisUrl,
        };

        var portLabel = new Label
        {
            Text = "Local listening port",
            Location = new Point(18, 78),
            AutoSize = true,
        };
        _portBox = new NumericUpDown
        {
            Location = new Point(18, 100),
            Width = 120,
            Minimum = 1,
            Maximum = 65535,
            Value = Math.Clamp(current.Port, 1, 65535),
        };

        _autostartBox = new CheckBox
        {
            Text = "Launch tray icon when I log in",
            Location = new Point(18, 138),
            AutoSize = true,
            Checked = Autostart.IsEnabled(),
        };

        _hint = new Label
        {
            Text = "Changing the port will restart the background service.",
            Location = new Point(18, 168),
            AutoSize = true,
            ForeColor = SystemColors.GrayText,
        };

        _saveBtn = new Button
        {
            Text = "Save",
            Location = new Point(266, 195),
            Width = 80,
            DialogResult = DialogResult.OK,
        };
        _cancelBtn = new Button
        {
            Text = "Cancel",
            Location = new Point(358, 195),
            Width = 80,
            DialogResult = DialogResult.Cancel,
        };

        _saveBtn.Click += async (_, _) => await OnSaveAsync();
        _cancelBtn.Click += (_, _) => Close();
        AcceptButton = _saveBtn;
        CancelButton = _cancelBtn;

        Controls.AddRange(new Control[]
        {
            hrmisLabel, _hrmisBox, portLabel, _portBox, _autostartBox, _hint, _saveBtn, _cancelBtn,
        });
    }

    private async Task OnSaveAsync()
    {
        var url = _hrmisBox.Text.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(url) ||
            !Uri.TryCreate(url, UriKind.Absolute, out var parsed) ||
            (parsed.Scheme != "http" && parsed.Scheme != "https"))
        {
            MessageBox.Show(this, "Please enter a valid http(s) URL.",
                Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var newPort = (int)_portBox.Value;
        var portChanged = newPort != _initial.Port;

        SetBusy(true);

        try
        {
            Autostart.Set(_autostartBox.Checked);

            bool updated = await ServiceClient.UpdateSettingsAsync(_initial.Port, url, newPort);

            if (!updated)
            {
                var direct = new AppSettings { HrmisUrl = url, Port = newPort };
                direct.SaveToDisk();
            }

            if (portChanged)
            {
                var ok = ServiceControl.RestartWithFirewallElevated(newPort);
                if (!ok)
                {
                    MessageBox.Show(this,
                        "Settings saved, but the service / firewall could not be updated automatically. " +
                        "Run as administrator: net stop / net start \"PGL Attendance Sync\" and " +
                        "update the firewall rule for the new port.",
                        Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }

            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Could not save: " + ex.Message,
                Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void SetBusy(bool busy)
    {
        _saveBtn.Enabled = !busy;
        _cancelBtn.Enabled = !busy;
        _hrmisBox.Enabled = !busy;
        _portBox.Enabled = !busy;
        _autostartBox.Enabled = !busy;
        UseWaitCursor = busy;
    }
}
