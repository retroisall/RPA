using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

class KantuWin32Host
{
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern int  GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc fn, IntPtr lp);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);

    delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }

    static Stream stdin;
    static Stream stdout;

    static void Main()
    {
        stdin  = Console.OpenStandardInput();
        stdout = Console.OpenStandardOutput();

        while (true)
        {
            byte[] hdr = ReadFull(4);
            if (hdr == null) return;
            int len = BitConverter.ToInt32(hdr, 0);
            byte[] body = ReadFull(len);
            if (body == null) return;

            string json = Encoding.UTF8.GetString(body);
            int id = ParseId(json);
            string method = ParseString(json, "method");
            string response;

            if (method == "get_version")
            {
                response = "{\"id\":" + id + ",\"result\":\"1.0.0\"}";
            }
            else if (method == "get_window_rect")
            {
                string title = ParseNestedString(json, "params", "title");
                response = FindWindow(id, title);
            }
            else
            {
                response = "{\"id\":" + id + ",\"error\":\"Unknown method\"}";
            }

            byte[] rb = Encoding.UTF8.GetBytes(response);
            byte[] rh = BitConverter.GetBytes(rb.Length);
            stdout.Write(rh, 0, 4);
            stdout.Write(rb, 0, rb.Length);
            stdout.Flush();
        }
    }

    static string FindWindow(int id, string titlePart)
    {
        if (string.IsNullOrEmpty(titlePart))
            return "{\"id\":" + id + ",\"error\":\"title param required\"}";

        string found = null;
        EnumWindows((hwnd, lp) =>
        {
            if (!IsWindowVisible(hwnd)) return true;
            var sb = new StringBuilder(512);
            GetWindowText(hwnd, sb, 512);
            string t = sb.ToString();
            if (t.Length == 0) return true;
            if (t.IndexOf(titlePart, StringComparison.OrdinalIgnoreCase) < 0) return true;
            RECT r;
            GetWindowRect(hwnd, out r);
            int w = r.R - r.L, h = r.B - r.T;
            if (w > 50 && h > 50)
            {
                string escaped = t.Replace("\\", "\\\\").Replace("\"", "\\\"");
                found = "{\"id\":" + id + ",\"result\":{\"x\":" + r.L +
                        ",\"y\":" + r.T + ",\"width\":" + w + ",\"height\":" + h +
                        ",\"title\":\"" + escaped + "\"}}";
                return false;
            }
            return true;
        }, IntPtr.Zero);

        return found ?? ("{\"id\":" + id + ",\"error\":\"Window not found: " +
               titlePart.Replace("\"","\\\"") + "\"}");
    }

    static byte[] ReadFull(int n)
    {
        byte[] buf = new byte[n];
        int read = 0;
        while (read < n)
        {
            int r = stdin.Read(buf, read, n - read);
            if (r <= 0) return null;
            read += r;
        }
        return buf;
    }

    static int ParseId(string json)
    {
        int i = json.IndexOf("\"id\"");
        if (i < 0) return 0;
        i = json.IndexOf(':', i) + 1;
        while (i < json.Length && (json[i] == ' ' || json[i] == '\t')) i++;
        int j = i;
        while (j < json.Length && (char.IsDigit(json[j]) || json[j] == '-')) j++;
        int v; return int.TryParse(json.Substring(i, j - i), out v) ? v : 0;
    }

    static string ParseString(string json, string key)
    {
        string search = "\"" + key + "\"";
        int i = json.IndexOf(search);
        if (i < 0) return "";
        i = json.IndexOf('"', i + search.Length + 1);
        if (i < 0) return "";
        int j = i + 1;
        while (j < json.Length && json[j] != '"') j++;
        return json.Substring(i + 1, j - i - 1);
    }

    static string ParseNestedString(string json, string key1, string key2)
    {
        string search1 = "\"" + key1 + "\"";
        int i = json.IndexOf(search1);
        if (i < 0) return "";
        int brace = json.IndexOf('{', i + search1.Length);
        if (brace < 0) return "";
        string sub = json.Substring(brace);
        return ParseString(sub, key2);
    }
}
