# focushelper.ps1 — persistent focus-restore + paste helper for "Capture to AI".
#
# Spawned ONCE and kept resident (like screenshot.ps1 / scrollhelper.ps1) so the
# one-time Add-Type C# compile is paid at startup, off the capture path. After
# warm-up each command is a handful of user32 calls (~ms).
#
# Protocol (one command per line on stdin):
#   ENUM <id>          → list candidate paste targets: every visible, titled,
#                        non-tool, non-cloaked top-level window in Z-ORDER (top
#                        first — Z-order encodes activation recency, so the
#                        first match per app is the most recently used window).
#                        Reply "OK <id> <hwnd> <pid> <exePath>|<title>" records
#                        joined by U+001E. The helper reports ALL windows; the
#                        AI-app whitelist is policy and lives in aiPaste.js, so
#                        list changes never touch this file.
#   TARGET <id>        → describe the current foreground window, reply
#                        "OK <id> <hwnd> <pid> <elevated:0|1> <exePath>|<title>"
#                        (exe paths cannot contain '|', so the FIRST '|' is the
#                        separator even if the title itself contains one)
#   PASTE <id> <hwnd>  → restore/focus <hwnd>, wait until it is actually
#                        foreground (≤1200ms, retrying the unlock tricks every
#                        150ms — Win11 24H2+ refuses cross-process
#                        SetForegroundWindow more aggressively, so one attempt
#                        is not enough), then SendInput Ctrl+V.
#                        Reply "OK <id>" or "ERR <id> <reason>" where reason is
#                        one of: target-gone | target-elevated | focus-timeout |
#                        focus-lost | sendinput-failed (typed so the caller can
#                        log precisely; every ERR triggers the same
#                        clipboard-fallback toast).
#   EXIT               → quit
# Prints "READY" once compiled and ready for commands.
#
# Why the checks, in order:
# - target-elevated: UIPI silently discards SendInput when the foreground window
#   belongs to a higher-integrity (admin) process — SendInput even reports
#   success — so the only reliable handling is detecting elevation up front and
#   letting the caller fall back to "Copied to clipboard, press Ctrl+V".
# - AttachThreadInput: SetForegroundWindow is refused for background processes
#   (the foreground lock). Attaching our input queue to both the current
#   foreground thread and the target's thread is the classic unlock (and lets
#   us SetFocus the target directly); every 150ms without focus an ALT tap
#   (which makes us the last-input process) precedes the next attempt.
# - Foreground poll: never paste blind — if the target isn't verifiably
#   foreground within the budget, report focus-timeout instead of typing Ctrl+V
#   into whatever window happens to have focus. A transient flip during the
#   post-focus settle re-enters the focus loop instead of giving up: the caller
#   deliberately leaves its own (invisible) overlay foreground when it asks us
#   to paste, so a late activation from the OS must be out-raced, not fatal.

Add-Type @"
using System;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class LumFocus {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] public static extern int GetWindowLongW(IntPtr hWnd, int nIndex);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out int val, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr hObject);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref int lpdwSize);
  [DllImport("advapi32.dll")] public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);
  [DllImport("advapi32.dll")] public static extern bool GetTokenInformation(IntPtr TokenHandle, int TokenInformationClass, out uint TokenInformation, uint TokenInformationLength, out uint ReturnLength);

  // INPUT must be sized for the LARGEST union member (MOUSEINPUT), or SendInput
  // rejects the array with ERROR_INVALID_PARAMETER on x64.
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  public struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public INPUTUNION U; }

  const uint INPUT_KEYBOARD = 1;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const ushort VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12, VK_V = 0x56;
  const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const uint TOKEN_QUERY = 0x0008;
  const int TOKEN_ELEVATION = 20;
  const int SW_RESTORE = 9;

  static bool selfElevated = CheckSelfElevated();

  static bool CheckSelfElevated() {
    try {
      IntPtr tok;
      if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, out tok)) return false;
      try {
        uint elev; uint ret;
        return GetTokenInformation(tok, TOKEN_ELEVATION, out elev, 4, out ret) && elev != 0;
      } finally { CloseHandle(tok); }
    } catch { return false; }
  }

  // 1 = elevated, 0 = not elevated, -1 = could not determine (treated as not
  // elevated: the paste is attempted and the foreground poll still gates it).
  static int ProcessElevation(uint pid) {
    IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (h == IntPtr.Zero) return -1;
    try {
      IntPtr tok;
      if (!OpenProcessToken(h, TOKEN_QUERY, out tok)) return -1;
      try {
        uint elev; uint ret;
        if (!GetTokenInformation(tok, TOKEN_ELEVATION, out elev, 4, out ret)) return -1;
        return elev != 0 ? 1 : 0;
      } finally { CloseHandle(tok); }
    } finally { CloseHandle(h); }
  }

  static string ExeForPid(uint pid) {
    IntPtr ph = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (ph == IntPtr.Zero) return "";
    try {
      StringBuilder sb = new StringBuilder(1024);
      int len = sb.Capacity;
      return QueryFullProcessImageName(ph, 0, sb, ref len) ? sb.ToString() : "";
    } finally { CloseHandle(ph); }
  }

  public static string DescribeForeground() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return "ERR no-foreground-window";
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    if (pid == 0) return "ERR no-process";
    string exe = ExeForPid(pid);
    StringBuilder t = new StringBuilder(512);
    GetWindowText(h, t, t.Capacity);
    string title = t.ToString().Replace("\r", " ").Replace("\n", " ");
    int elevated = ProcessElevation(pid);
    return "OK " + h.ToInt64().ToString() + " " + pid.ToString() + " "
         + (elevated == 1 ? "1" : "0") + " " + exe + "|" + title;
  }

  // All plausible paste targets in Z-order (top = most recently activated).
  // Skips invisible, untitled, tool (WS_EX_TOOLWINDOW) and DWM-cloaked windows
  // (suspended UWP apps report visible but are not actually on screen).
  // Elevation is deliberately NOT checked here (one token query per window is
  // waste) — FocusAndPaste re-checks the chosen target at paste time.
  public static string EnumTargets() {
    StringBuilder outp = new StringBuilder();
    Dictionary<uint, string> exeCache = new Dictionary<uint, string>();
    EnumWindows(delegate(IntPtr h, IntPtr lp) {
      if (!IsWindowVisible(h)) return true;
      if ((GetWindowLongW(h, -20) & 0x80) != 0) return true;  // GWL_EXSTYLE / WS_EX_TOOLWINDOW
      int cloaked = 0;
      try { DwmGetWindowAttribute(h, 14, out cloaked, 4); } catch { }  // DWMWA_CLOAKED
      if (cloaked != 0) return true;
      StringBuilder t = new StringBuilder(512);
      if (GetWindowText(h, t, t.Capacity) == 0) return true;
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid == 0) return true;
      string exe;
      if (!exeCache.TryGetValue(pid, out exe)) { exe = ExeForPid(pid); exeCache[pid] = exe; }
      if (exe.Length == 0) return true;
      string title = t.ToString().Replace("\r", " ").Replace("\n", " ").Replace("\u001E", " ");
      if (outp.Length > 0) outp.Append('\u001E');
      outp.Append(h.ToInt64()).Append(' ').Append(pid).Append(' ').Append(exe).Append('|').Append(title);
      return true;
    }, IntPtr.Zero);
    return "OK " + outp.ToString();
  }

  // The target counts as foreground if its exact HWND has focus, or another
  // top-level window of the SAME process does (some apps activate a sibling —
  // pasting into the right app is what matters).
  static bool IsForeground(IntPtr hwnd, uint pid) {
    IntPtr fg = GetForegroundWindow();
    if (fg == hwnd) return true;
    if (fg == IntPtr.Zero) return false;
    uint fgPid;
    GetWindowThreadProcessId(fg, out fgPid);
    return fgPid == pid;
  }

  static void ForceForeground(IntPtr hwnd, uint targetThread) {
    uint our = GetCurrentThreadId();
    uint fgPid;
    IntPtr fg = GetForegroundWindow();
    uint fgThread = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, out fgPid) : 0;
    bool aFg = false, aTgt = false;
    if (fgThread != 0 && fgThread != our) aFg = AttachThreadInput(our, fgThread, true);
    if (targetThread != 0 && targetThread != our && targetThread != fgThread)
      aTgt = AttachThreadInput(our, targetThread, true);
    BringWindowToTop(hwnd);
    SetForegroundWindow(hwnd);
    // While attached to the target's queue we may assign keyboard focus
    // directly — activation alone doesn't always route it (fails harmlessly
    // when the attach didn't take).
    SetFocus(hwnd);
    if (aTgt) AttachThreadInput(our, targetThread, false);
    if (aFg) AttachThreadInput(our, fgThread, false);
  }

  static INPUT Key(ushort vk, bool up) {
    INPUT i = new INPUT();
    i.type = INPUT_KEYBOARD;
    i.U.ki.wVk = vk;
    i.U.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
    return i;
  }

  static void AltTap() {
    INPUT[] seq = new INPUT[] { Key(VK_MENU, false), Key(VK_MENU, true) };
    SendInput((uint)seq.Length, seq, Marshal.SizeOf(typeof(INPUT)));
  }

  static bool SendCtrlV() {
    // Leading key-ups clear modifiers the user may still be holding from the
    // capture hotkey (a held Shift would turn the paste into Ctrl+Shift+V);
    // a key-up for an already-released key is a no-op.
    INPUT[] seq = new INPUT[] {
      Key(VK_SHIFT, true), Key(VK_MENU, true),
      Key(VK_CONTROL, false), Key(VK_V, false), Key(VK_V, true), Key(VK_CONTROL, true)
    };
    return SendInput((uint)seq.Length, seq, Marshal.SizeOf(typeof(INPUT))) == (uint)seq.Length;
  }

  public static string FocusAndPaste(long hwndValue) {
    IntPtr hwnd = new IntPtr(hwndValue);
    if (!IsWindow(hwnd)) return "ERR target-gone";
    uint pid;
    uint targetThread = GetWindowThreadProcessId(hwnd, out pid);
    if (!selfElevated && ProcessElevation(pid) == 1) return "ERR target-elevated";
    if (IsIconic(hwnd)) { ShowWindow(hwnd, SW_RESTORE); Thread.Sleep(150); }

    // Focus loop with a total budget: force-foreground, poll, and re-run the
    // unlock tricks (ALT tap + attach + SetForegroundWindow) every 150ms while
    // focus hasn't landed. After focus lands, a 90ms settle lets the target
    // finish activation (caret/input routing); if focus flips away during the
    // settle (a late activation the OS queued for another window), the loop
    // re-steals it instead of giving up — but NEVER pastes until the target is
    // verifiably foreground after a full settle. The happy path is one
    // iteration: ~0ms when already foreground-ish, ~115ms when stolen cleanly.
    int total = 0;
    bool everFocused = false;
    while (true) {
      if (!IsWindow(hwnd)) return "ERR target-gone";
      if (!IsForeground(hwnd, pid)) {
        ForceForeground(hwnd, targetThread);
        int sinceAttempt = 0;
        while (!IsForeground(hwnd, pid)) {
          if (total >= 1200) return everFocused ? "ERR focus-lost" : "ERR focus-timeout";
          if (sinceAttempt >= 150) { AltTap(); ForceForeground(hwnd, targetThread); sinceAttempt = 0; }
          Thread.Sleep(25);
          total += 25; sinceAttempt += 25;
        }
      }
      everFocused = true;
      Thread.Sleep(90);
      total += 90;
      if (IsForeground(hwnd, pid)) break;   // settled — safe to type
      if (total >= 1200) return "ERR focus-lost";
    }
    if (!SendCtrlV()) return "ERR sendinput-failed";
    return "OK";
  }
}
"@

[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }              # stdin closed — parent gone
  $line = $line.Trim()
  if ($line -eq '') { continue }
  if ($line -eq 'EXIT') { break }

  $parts = $line -split ' ', 3
  $cmd = $parts[0]
  $id = if ($parts.Count -ge 2) { $parts[1] } else { '?' }
  try {
    if ($cmd -eq 'ENUM') {
      $r = [LumFocus]::EnumTargets()
      [Console]::Out.WriteLine("OK $id " + $r.Substring(3))
    } elseif ($cmd -eq 'TARGET') {
      $r = [LumFocus]::DescribeForeground()
      if ($r.StartsWith('OK ')) { [Console]::Out.WriteLine("OK $id " + $r.Substring(3)) }
      else                      { [Console]::Out.WriteLine("ERR $id " + $r.Substring(4)) }
    } elseif ($cmd -eq 'PASTE' -and $parts.Count -ge 3) {
      $r = [LumFocus]::FocusAndPaste([long]$parts[2])
      if ($r -eq 'OK') { [Console]::Out.WriteLine("OK $id") }
      else             { [Console]::Out.WriteLine("ERR $id " + $r.Substring(4)) }
    } else {
      [Console]::Out.WriteLine("ERR $id unknown-command")
    }
  } catch {
    $msg = ($_.Exception.Message -replace "[\r\n]", ' ')
    [Console]::Out.WriteLine("ERR $id $msg")
  }
  [Console]::Out.Flush()
}
