# scrollhelper.ps1 — persistent stdin-driven input helper for Scroll Capture.
#
# Lumshot's main process spawns this once per scroll-capture session and pipes it
# simple commands so it can auto-scroll the window under the cursor without any
# native node modules. Commands (one per line):
#   MOVE <x> <y>   — move the cursor to physical pixel (x, y)
#   WHEEL <delta>  — send a mouse-wheel event (negative delta = scroll down)
#   EXIT           — quit the helper
#
# SetProcessDPIAware() makes SetCursorPos use physical pixels, matching the
# coordinates Lumshot computes from the display scale factor.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class LumScroll {
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, IntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@

[LumScroll]::SetProcessDPIAware() | Out-Null
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Trim().Split(' ')
  switch ($p[0]) {
    'MOVE'  { if ($p.Length -ge 3) { [LumScroll]::SetCursorPos([int]$p[1], [int]$p[2]) | Out-Null } }
    'WHEEL' { if ($p.Length -ge 2) { [LumScroll]::mouse_event(0x0800, 0, 0, [int]$p[1], [IntPtr]::Zero) } }
    'EXIT'  { break }
  }
}
