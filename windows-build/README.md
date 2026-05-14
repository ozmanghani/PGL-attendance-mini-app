# PGL Attendance — Windows packaging

Builds a single `PGL-Attendance-Setup-x.y.z.exe` setup file. Run it once on a
Windows machine and the installer drops a Windows service plus a native
WinForms tray app onto the target PC. **Not Electron.**

## Runtime architecture (post-install)

```
┌───────────────────────────────────────────────────────────────┐
│                  Windows host (target machine)                │
│                                                               │
│   ┌─────────────────────────────┐                             │
│   │  PGLAttendanceSync          │  <─ Windows service         │
│   │  (LocalSystem, autostart)   │     wrapped by NSSM         │
│   │                             │     auto-restarts on crash  │
│   │  node.exe  dist/src/main.js │                             │
│   │   ├─ HTTP/Socket.IO :4001   │ <── attendance devices POST │
│   │   ├─ serves frontend out/   │     /iclock/cdata           │
│   │   └─ SQLite via Prisma      │                             │
│   └──────────┬──────────────────┘                             │
│              │   reads/writes                                 │
│              ▼                                                │
│   C:\ProgramData\PGL Attendance\                              │
│   ├─ settings.json      (HRMIS URL, port — watched live)      │
│   ├─ attendance.db      (SQLite — survives uninstalls)        │
│   └─ logs\              (service.log, service.err.log)        │
│                                                               │
│   ┌─────────────────────────────┐                             │
│   │  PglAttendanceTray.exe      │  <─ runs in the user's      │
│   │  (C# WinForms self-contained) │   session (not a service) │
│   │  • status polling (/api/health)                            │
│   │  • Open Web Dashboard       │                             │
│   │  • Settings dialog          │  ── PUT /api/settings ──┐   │
│   │  • Restart Service (UAC)    │  ── net stop/start ─────┤   │
│   │  • Open Logs Folder         │                         │   │
│   └──────────┬──────────────────┘                         │   │
│              └───────────────────────────────────────────►│   │
└───────────────────────────────────────────────────────────────┘
```

**Settings can also be changed from the web UI** at `http://localhost:4001/`
— click the **Settings** button (gear icon) in the top-right corner. The web
UI talks to the same `/api/settings` endpoint the tray uses.

**Why this design**

- **Windows service via NSSM** — runs before any user logs in, restarts on
  crash (`AppExit Default Restart`, 3 s back-off, 5 s throttle). Survives
  reboots and Windows updates. Closing the tray icon **does not** stop sync —
  its Exit menu literally says "Exit (service keeps running)".
- **node.exe bundled** — no Node install needed on the target PC.
- **Tray is a separate process** — UI bugs can't take down the sync service.
- **Settings live in `%PROGRAMDATA%\PGL Attendance\settings.json`** — the
  backend `fs.watch`-es it. Editing HRMIS URL hot-reloads in ~250 ms; editing
  the port makes the service self-exit and NSSM restarts it on the new port.
- **SQLite DB in `%PROGRAMDATA%`** — survives uninstall/upgrade.

## Build the installer (inside a Windows machine or VM)

### One-time setup on the build machine

| Tool                  | Where to get it                                              |
| --------------------- | ------------------------------------------------------------ |
| **Node.js 20 LTS+**   | <https://nodejs.org/>                                        |
| **.NET 8 SDK**        | <https://dotnet.microsoft.com/download/dotnet/8.0>           |
| **Inno Setup 6**      | <https://jrsoftware.org/isdl.php>                            |
| **Git** *(optional)*  | to clone this repo into the VM                               |

Make sure `node`, `npm`, and `dotnet` are on the `PATH`. Inno Setup is detected
in any of these locations:

- `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`
- `C:\Program Files\Inno Setup 6\ISCC.exe`
- `%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe` *(per-user install)*

### Build command

Open PowerShell in the repo root (or any subdirectory under it) and run:

```powershell
pwsh -ExecutionPolicy Bypass -File .\windows-build\scripts\build.ps1
```

or with options:

```powershell
.\windows-build\scripts\build.ps1 -Version 1.2.0 -NodeWinVersion 20.18.1 -NssmVersion 2.24
```

Output:

```
windows-build\dist\PGL-Attendance-Setup-1.0.0.exe     (~80–120 MB)
```

That single `.exe` is the only file you ship to end users.

## What the installer does on the target PC

1. Installs files to `C:\Program Files\PGL Attendance\`:
   - `node\node.exe`              — bundled Windows Node runtime
   - `app\backend\`               — compiled NestJS + Prisma engines + prod node_modules
   - `app\attendance-frontend\out\` — static Next.js export
   - `nssm\nssm.exe`              — service wrapper
   - `service\run-service.cmd`    — NSSM entry point
   - `tray\PglAttendanceTray.exe` + `app.ico`
2. Creates `C:\ProgramData\PGL Attendance\{settings.json, attendance.db, logs\}`
   on first install (DB and settings are kept on subsequent upgrades).
3. Adds a Windows Firewall **inbound** rule for TCP `4001`.
4. Registers the service `PGLAttendanceSync` (LocalSystem, AutoStart, restart
   on failure) and starts it.
5. Optionally adds the tray to HKCU `Run` (user picks the task during install)
   and launches both the tray and the dashboard.

## Day-to-day operation

- **Open Web Dashboard** → `http://localhost:4001/` from the host, or
  `http://<PC_IP>:4001/` from any device on the LAN (firewall rule is added).
- **Devices POST** → `http://<PC_IP>:4001/iclock/cdata` (plain text body).
- **Change HRMIS URL** → either:
  - Web UI → **Settings** (gear icon) → save. Hot-reloads.
  - System tray → **Settings…** → save.
- **Change port** → same Settings dialog. Service self-exits and NSSM
  restarts it on the new port; the firewall rule is updated automatically
  when the change is made from the tray (the web UI's change does not update
  the firewall — run the tray's Settings to refresh the rule, or do
  `netsh advfirewall firewall ...` manually).
- **Logs** → `C:\ProgramData\PGL Attendance\logs\service.log`
  (rotated at 10 MiB by NSSM) or tray → **Open Logs Folder**.
- **Manual service ops** → `services.msc` → "PGL Attendance Sync".

## Updating the app later

Build a new installer with a higher `-Version` and run it on the target.
Inno Setup detects the same `AppId` and upgrades in place:

1. Service is stopped
2. Files are replaced
3. Service is restarted

`settings.json` and `attendance.db` in `%PROGRAMDATA%` are **not** touched.

## Uninstall

The installer adds an entry to *Apps & Features* — uninstall from there.
The service is stopped + removed, the firewall rule is deleted, the tray
process is killed, and `%ProgramFiles%\PGL Attendance\` is removed.

`%PROGRAMDATA%\PGL Attendance\` is intentionally **kept** so the DB and
unsynced records survive uninstall. Delete that folder manually to wipe data.

## Automated builds + one-line install via GitHub Releases

A GitHub Actions workflow in [.github/workflows/build-installer.yml](../.github/workflows/build-installer.yml)
builds the installer on every tag push and uploads it to a GitHub Release.
You never have to set up Node / .NET / Inno Setup on a build PC again.

### Cutting a release

```bash
# From any machine with git access to the repo:
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions then:
1. Spins up a `windows-latest` runner
2. Installs Node 20, .NET 8 SDK, and Inno Setup (via Chocolatey)
3. Runs `windows-build\scripts\build.ps1 -Version 1.0.0`
4. Computes SHA-256 of the resulting `.exe`
5. Creates Release `v1.0.0` with three assets attached:
   - `PGL-Attendance-Setup-1.0.0.exe`  (versioned filename)
   - `PGL-Attendance-Setup.exe`         (stable filename — always the newest)
   - `SHA256SUMS.txt`

Manually trigger a build (no Release) from the **Actions** tab → *Build
Windows Installer* → *Run workflow*. The .exe is uploaded as a workflow
artifact you can download.

### Install on any Windows PC — one PowerShell line

Stable URL (always grabs the newest release):

```powershell
irm https://github.com/ozmanghani/PGL-attendance-mini-app/releases/latest/download/PGL-Attendance-Setup.exe -OutFile $env:TEMP\pgl.exe; & $env:TEMP\pgl.exe
```

Specific version:

```powershell
irm https://github.com/ozmanghani/PGL-attendance-mini-app/releases/download/v1.0.0/PGL-Attendance-Setup-1.0.0.exe -OutFile $env:TEMP\pgl.exe; & $env:TEMP\pgl.exe
```

Silent install (no UI, for unattended provisioning):

```powershell
irm https://github.com/ozmanghani/PGL-attendance-mini-app/releases/latest/download/PGL-Attendance-Setup.exe -OutFile $env:TEMP\pgl.exe; & $env:TEMP\pgl.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

> If the repo is **private**, the user's PowerShell call needs a GitHub token —
> add `-Headers @{Authorization='token ghp_xxx'}` to the `irm` call, or make
> the *release* assets public (you can keep the repo private and release
> assets are still individually downloadable with the right URL pattern,
> but the latest-download redirect requires repo read access).

### Verify the download (optional but recommended)

```powershell
irm https://github.com/ozmanghani/PGL-attendance-mini-app/releases/latest/download/SHA256SUMS.txt -OutFile $env:TEMP\sums.txt
$expected = (Get-Content $env:TEMP\sums.txt | Select-String 'PGL-Attendance-Setup.exe').ToString().Split(' ')[0]
$actual   = (Get-FileHash $env:TEMP\pgl.exe -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) { throw "SHA256 mismatch" } else { Write-Host "OK" }
```

## Common gotchas

- **`prisma generate` fetches Windows engines on first run** — needs internet
  on the build machine.
- **`dotnet publish` errors about Windows targeting** — install the .NET 8
  SDK (the **SDK**, not just the runtime). Verify with `dotnet --list-sdks`.
- **AV flags the unsigned installer/tray** — ship with a code-signing cert.
  Inno Setup supports `[Setup] SignTool=` (not configured here).
