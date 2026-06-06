# kantu-win32-host.ps1
# Native messaging host: get window rect by title (Win32 API)
# Protocol: 4-byte little-endian length + JSON body

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class KantuWin32 {
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] static extern int  GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc fn, IntPtr lp);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lp);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    public static string FindWindowRectJson(string titlePart) {
        string found = null;
        EnumWindows((hwnd, lp) => {
            if (!IsWindowVisible(hwnd)) return true;
            var sb = new StringBuilder(512);
            GetWindowText(hwnd, sb, 512);
            var title = sb.ToString();
            if (title.Length == 0) return true;
            if (title.IndexOf(titlePart, StringComparison.OrdinalIgnoreCase) < 0) return true;
            RECT r;
            GetWindowRect(hwnd, out r);
            int w = r.Right - r.Left, h = r.Bottom - r.Top;
            if (w > 50 && h > 50) {
                found = "{\"x\":" + r.Left + ",\"y\":" + r.Top + ",\"width\":" + w + ",\"height\":" + h + ",\"title\":\"" + title.Replace("\"","\\\"") + "\"}";
                return false; // stop
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@

$stdin  = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()
[Console]::OutputEncoding = [Text.Encoding]::UTF8

while ($true) {
    # 讀 4-byte 長度
    $hdrBuf = [byte[]]::new(4)
    $read = 0
    while ($read -lt 4) {
        $r = $stdin.Read($hdrBuf, $read, 4 - $read)
        if ($r -le 0) { exit 0 }
        $read += $r
    }
    $len = [BitConverter]::ToInt32($hdrBuf, 0)
    if ($len -le 0 -or $len -gt 1MB) { exit 1 }

    # 讀 body
    $bodyBuf = [byte[]]::new($len)
    $read = 0
    while ($read -lt $len) {
        $r = $stdin.Read($bodyBuf, $read, $len - $read)
        if ($r -le 0) { exit 0 }
        $read += $r
    }

    $msg = [Text.Encoding]::UTF8.GetString($bodyBuf) | ConvertFrom-Json
    $id  = $msg.id
    $method = $msg.method

    $responseJson = $null

    switch ($method) {
        'get_version' {
            $responseJson = "{`"id`":$id,`"result`":`"1.0.0`"}"
        }
        'get_window_rect' {
            $titlePart = $msg.params.title
            if ([string]::IsNullOrEmpty($titlePart)) {
                $responseJson = "{`"id`":$id,`"error`":`"title param required`"}"
            } else {
                $rectJson = [KantuWin32]::FindWindowRectJson($titlePart)
                if ($rectJson) {
                    $responseJson = "{`"id`":$id,`"result`":$rectJson}"
                } else {
                    $responseJson = "{`"id`":$id,`"error`":`"Window not found: $titlePart`"}"
                }
            }
        }
        default {
            $responseJson = "{`"id`":$id,`"error`":`"Unknown method: $method`"}"
        }
    }

    $respBytes = [Text.Encoding]::UTF8.GetBytes($responseJson)
    $lenBytes  = [BitConverter]::GetBytes([int]$respBytes.Length)
    $stdout.Write($lenBytes, 0, 4)
    $stdout.Write($respBytes, 0, $respBytes.Length)
    $stdout.Flush()
}
