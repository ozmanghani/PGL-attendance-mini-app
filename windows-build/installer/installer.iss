; PGL Attendance — Inno Setup installer
; Builds a single .exe that installs the Node backend (as a Windows service via NSSM),
; the C# WinForms tray app, and the bundled Node runtime.

#define MyAppName        "PGL Attendance"
#define MyAppShortName   "PGLAttendance"
#define MyAppPublisher   "PGL"
#define MyAppExeName     "PglAttendanceTray.exe"
#define MyServiceName    "PGLAttendanceSync"
#define MyServiceDisplay "PGL Attendance Sync"
#ifndef MyAppVersion
  #define MyAppVersion   "1.0.0"
#endif

#ifndef StagingDir
  ; Filled in by build.ps1 via /DStagingDir=...
  #define StagingDir "..\dist\staging"
#endif

[Setup]
AppId={{2C7B6F32-9F1A-4F8B-9C53-PGLATT-0001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppSupportURL=https://pglsystem.com
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
OutputBaseFilename=PGL-Attendance-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\tray\{#MyAppExeName}
SetupIconFile={#StagingDir}\tray\app.ico
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "autostarttray"; Description: "Launch tray icon at sign-in"; GroupDescription: "Startup:"

[Dirs]
Name: "{commonappdata}\{#MyAppName}"; Permissions: users-modify
Name: "{commonappdata}\{#MyAppName}\logs"; Permissions: users-modify

[Files]
; Bundled Node.js runtime
Source: "{#StagingDir}\node\*"; DestDir: "{app}\node"; Flags: recursesubdirs createallsubdirs ignoreversion

; NSSM service wrapper
Source: "{#StagingDir}\nssm\nssm.exe"; DestDir: "{app}\nssm"; Flags: ignoreversion

; Backend (NestJS compiled + node_modules + prisma)
Source: "{#StagingDir}\app\backend\*"; DestDir: "{app}\app\backend"; Flags: recursesubdirs createallsubdirs ignoreversion

; Frontend static export
Source: "{#StagingDir}\app\attendance-frontend\out\*"; DestDir: "{app}\app\attendance-frontend\out"; Flags: recursesubdirs createallsubdirs ignoreversion

; Service launcher
Source: "{#StagingDir}\service\run-service.cmd"; DestDir: "{app}\service"; Flags: ignoreversion

; Tray app (single self-contained .exe)
Source: "{#StagingDir}\tray\{#MyAppExeName}"; DestDir: "{app}\tray"; Flags: ignoreversion
Source: "{#StagingDir}\tray\app.ico"; DestDir: "{app}\tray"; Flags: ignoreversion onlyifdoesntexist

; Initial settings.json — only if it doesn't already exist in ProgramData
Source: "{#StagingDir}\seed\settings.json"; DestDir: "{commonappdata}\{#MyAppName}"; Flags: onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\Open {#MyAppName} Dashboard"; Filename: "http://localhost:4001/"
Name: "{group}\{#MyAppName} Tray"; Filename: "{app}\tray\{#MyAppExeName}"; IconFilename: "{app}\tray\app.ico"
Name: "{group}\Settings"; Filename: "{app}\tray\{#MyAppExeName}"; IconFilename: "{app}\tray\app.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "http://localhost:4001/"; IconFilename: "{app}\tray\app.ico"; Tasks: desktopicon

[Run]
; --- Install and start the Windows service via NSSM ---
Filename: "{app}\nssm\nssm.exe"; Parameters: "install ""{#MyServiceName}"" ""{app}\service\run-service.cmd"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" DisplayName ""{#MyServiceDisplay}"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" Description ""Receives attendance device data on the configured port and forwards it to HRMIS. Installed by {#MyAppName}."""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppDirectory ""{app}\service"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppEnvironmentExtra APP_ROOT=""{app}"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppStdout ""{commonappdata}\{#MyAppName}\logs\service.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppStderr ""{commonappdata}\{#MyAppName}\logs\service.err.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppRotateFiles 1"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppRotateOnline 1"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppRotateBytes 10485760"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppExit Default Restart"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppRestartDelay 3000"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm\nssm.exe"; Parameters: "set ""{#MyServiceName}"" AppThrottle 5000"; Flags: runhidden waituntilterminated

; --- Run the Prisma migrations once on first install (creates schema if DB is new) ---
Filename: "{cmd}"; Parameters: "/c set ""DATABASE_URL=file:{commonappdata}\{#MyAppName}\attendance.db"" && ""{app}\node\node.exe"" ""{app}\app\backend\node_modules\prisma\build\index.js"" migrate deploy --schema=""{app}\app\backend\prisma\schema.prisma"""; Flags: runhidden waituntilterminated; StatusMsg: "Preparing the database..."

; --- Open firewall on configured port ---
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""{#MyAppName}"" dir=in action=allow protocol=TCP localport=4001"; Flags: runhidden waituntilterminated

; --- Start the service ---
Filename: "{app}\nssm\nssm.exe"; Parameters: "start ""{#MyServiceName}"""; Flags: runhidden waituntilterminated; StatusMsg: "Starting {#MyAppName} service..."

; --- Launch tray + open browser ---
Filename: "{app}\tray\{#MyAppExeName}"; Description: "Launch tray icon now"; Flags: nowait postinstall skipifsilent
Filename: "http://localhost:4001/"; Description: "Open the web dashboard"; Flags: nowait shellexec postinstall skipifsilent

[UninstallRun]
Filename: "{app}\nssm\nssm.exe"; Parameters: "stop ""{#MyServiceName}"""; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{app}\nssm\nssm.exe"; Parameters: "remove ""{#MyServiceName}"" confirm"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""{#MyAppName}"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewallRule"
Filename: "taskkill"; Parameters: "/f /im {#MyAppExeName}"; Flags: runhidden waituntilterminated; RunOnceId: "KillTray"

[Registry]
; HKCU autostart for the tray (only if the user ticked the task)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PGLAttendanceTray"; ValueData: """{app}\tray\{#MyAppExeName}"""; Tasks: autostarttray; Flags: uninsdeletevalue

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app\backend\node_modules\.cache"
; NOTE: we intentionally do NOT delete {commonappdata}\{#MyAppName} so the SQLite database and settings survive uninstalls.

[Code]
function NeedRestart(): Boolean;
begin
  Result := False;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    // Make sure ProgramData log files have sensible ACLs (NSSM writes as LocalSystem,
    // but if the user later opens "Open Logs" we want them to be readable).
    Exec(ExpandConstant('{cmd}'),
      '/c icacls "' + ExpandConstant('{commonappdata}\{#MyAppName}') +
      '" /grant *S-1-5-32-545:(OI)(CI)RX /T',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
