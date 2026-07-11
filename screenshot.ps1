# screenshot.ps1 — persistent, DPI-aware primary-display capture daemon for Lumshot.
#
# Spawned ONCE and kept resident (like scrollhelper.ps1). The expensive one-time
# setup — Add-Type's C# compile + DPI awareness — runs at startup; after that each
# capture is just a BitBlt + PNG encode, so repeat captures are fast (no per-grab
# PowerShell spawn or recompile).
#
# Captures the PRIMARY monitor at its TRUE physical resolution via GDI BitBlt — the
# same pixel-exact path Windows Snipping Tool uses — so captured text stays as sharp
# as the source (Electron's desktopCapturer resamples and softens text).
#
# Protocol (one command per line on stdin):
#   CAPTURE <id> <path>  → grab primary screen, save a 24-bit PNG to <path>, then
#                          reply "OK <id> <w> <h>"  (or "ERR <id> <message>")
#   EXIT                 → quit
# Prints "READY" once the engine is warmed and ready for commands.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class LumCap {
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
}
"@

# Per-Monitor-V2 (-4) when available (Win10 1703+); otherwise system-DPI-aware.
# Either way SM_CXSCREEN/SM_CYSCREEN then report the primary monitor's real
# physical pixel size and CopyFromScreen copies physical pixels (no DPI scaling).
try { [LumCap]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}
try { [LumCap]::SetProcessDPIAware() | Out-Null } catch {}

Add-Type -AssemblyName System.Drawing

# Grab the primary display to a 24bpp (opaque, no stray alpha) PNG. Returns "<w> <h>".
function Get-PrimaryCapture([string]$OutPath) {
  $w = [LumCap]::GetSystemMetrics(0)   # SM_CXSCREEN — primary width  (physical px)
  $h = [LumCap]::GetSystemMetrics(1)   # SM_CYSCREEN — primary height (physical px)
  if ($w -lt 1 -or $h -lt 1) { throw "invalid screen metrics: $w x $h" }
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  try {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen(0, 0, 0, 0, (New-Object System.Drawing.Size($w, $h)), [System.Drawing.CopyPixelOperation]::SourceCopy)
    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bmp.Dispose()
  }
  return "$w $h"
}

[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }              # stdin closed — parent gone
  $line = $line.Trim()
  if ($line -eq '') { continue }
  if ($line -eq 'EXIT') { break }

  # "CAPTURE <id> <path>" — split into 3 so a path containing spaces stays intact.
  $parts = $line -split ' ', 3
  if ($parts[0] -eq 'CAPTURE' -and $parts.Count -ge 3) {
    $id = $parts[1]
    $path = $parts[2]
    try {
      $size = Get-PrimaryCapture $path
      [Console]::Out.WriteLine("OK $id $size")
    } catch {
      $msg = ($_.Exception.Message -replace "[\r\n]", ' ')
      [Console]::Out.WriteLine("ERR $id $msg")
    }
    [Console]::Out.Flush()
  }
}
