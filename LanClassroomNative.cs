using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class LanEndpointPolicy
{
    public const int ServicePort = 8788;
    public const int DiscoveryPort = 18788;

    public static bool TryBuild(string serverUrl, string path, out Uri result)
    {
        result = null;
        Uri server;
        if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out server)) return false;
        if (!String.Equals(server.Scheme, "http", StringComparison.OrdinalIgnoreCase)) return false;
        if (!String.IsNullOrEmpty(server.UserInfo) || !String.IsNullOrEmpty(server.Query)
            || !String.IsNullOrEmpty(server.Fragment) || server.Port != ServicePort) return false;
        if (server.AbsolutePath != "/" && server.AbsolutePath != "") return false;
        if (!IsPrivateHost(server.Host)) return false;
        if (String.IsNullOrWhiteSpace(path) || !path.StartsWith("/", StringComparison.Ordinal)
            || path.StartsWith("//", StringComparison.Ordinal) || path.IndexOf('#') >= 0) return false;
        Uri candidate;
        if (!Uri.TryCreate(server.GetLeftPart(UriPartial.Authority) + path, UriKind.Absolute, out candidate)) return false;
        if (!String.Equals(candidate.Host, server.Host, StringComparison.OrdinalIgnoreCase)
            || candidate.Port != ServicePort || candidate.Scheme != "http") return false;
        string absolutePath = candidate.AbsolutePath;
        if (absolutePath != "/health/live" && !absolutePath.StartsWith("/v1/", StringComparison.Ordinal)) return false;
        if (absolutePath.IndexOf("..", StringComparison.Ordinal) >= 0 || candidate.UserInfo.Length > 0) return false;
        result = candidate;
        return true;
    }

    public static bool IsPrivateHost(string host)
    {
        if (String.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)) return true;
        IPAddress address;
        if (!IPAddress.TryParse(host, out address)) return false;
        if (IPAddress.IsLoopback(address)) return true;
        byte[] bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            return bytes[0] == 10
                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
                || (bytes[0] == 192 && bytes[1] == 168)
                || (bytes[0] == 169 && bytes[1] == 254);
        }
        return bytes.Length == 16
            && ((bytes[0] & 0xfe) == 0xfc || (bytes[0] == 0xfe && (bytes[1] & 0xc0) == 0x80));
    }
}

internal sealed class LanBridgeRequest
{
    public string ServerUrl { get; set; }
    public string Path { get; set; }
    public string Method { get; set; }
    public Dictionary<string, string> Headers { get; set; }
    public string BodyText { get; set; }
    public int TimeoutMilliseconds { get; set; }
}

internal sealed class LanBridgeResponse
{
    public int Status { get; set; }
    public string BodyText { get; set; }
}

internal sealed class LanBridgeException : Exception
{
    public readonly string Code;

    public LanBridgeException(string code, string message) : base(message)
    {
        Code = code;
    }
}

internal static class LanHttpBridge
{
    private const int MaximumRequestBytes = 64 * 1024;
    private const int MaximumResponseBytes = 1024 * 1024;

    public static LanBridgeResponse Send(LanBridgeRequest input)
    {
        if (input == null) throw new LanBridgeException("invalid_request", "班级请求无效。");
        Uri uri;
        if (!LanEndpointPolicy.TryBuild(input.ServerUrl, input.Path, out uri))
            throw new LanBridgeException("lan_endpoint_rejected", "局域网班级地址被拒绝。");
        string method = (input.Method ?? "GET").Trim().ToUpperInvariant();
        if (method != "GET" && method != "HEAD" && method != "POST" && method != "PATCH" && method != "DELETE")
            throw new LanBridgeException("invalid_request", "班级请求方法无效。");
        byte[] body = Encoding.UTF8.GetBytes(input.BodyText ?? "");
        if (body.Length > MaximumRequestBytes)
            throw new LanBridgeException("request_too_large", "班级请求内容过大。");

        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(uri);
        request.Method = method;
        request.AllowAutoRedirect = false;
        request.Proxy = null;
        request.KeepAlive = false;
        request.Timeout = ClampTimeout(input.TimeoutMilliseconds);
        request.ReadWriteTimeout = ClampTimeout(input.TimeoutMilliseconds);
        request.Accept = "application/json";
        request.UserAgent = "PhysicsStudioWindows/LanClassroom";
        if (input.Headers != null)
        {
            string value;
            if (input.Headers.TryGetValue("Authorization", out value) && IsSafeHeader(value))
                request.Headers[HttpRequestHeader.Authorization] = value;
            if (input.Headers.TryGetValue("Idempotency-Key", out value) && IsSafeHeader(value))
                request.Headers["Idempotency-Key"] = value;
            if (input.Headers.TryGetValue("X-Physics-Studio-Client", out value) && IsSafeHeader(value))
                request.Headers["X-Physics-Studio-Client"] = value;
        }
        if (body.Length > 0)
        {
            request.ContentType = "application/json; charset=utf-8";
            request.ContentLength = body.Length;
            using (Stream stream = request.GetRequestStream()) stream.Write(body, 0, body.Length);
        }
        try
        {
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                return ReadResponse(response);
        }
        catch (WebException exception)
        {
            HttpWebResponse response = exception.Response as HttpWebResponse;
            if (response != null)
            {
                using (response) return ReadResponse(response);
            }
            if (exception.Status == WebExceptionStatus.Timeout)
                throw new LanBridgeException("request_timeout", "班级服务请求超时。");
            throw new LanBridgeException("network_error", "无法连接局域网班级服务。");
        }
    }

    private static LanBridgeResponse ReadResponse(HttpWebResponse response)
    {
        using (Stream stream = response.GetResponseStream())
        using (MemoryStream output = new MemoryStream())
        {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.Read(buffer, 0, buffer.Length)) > 0)
            {
                if (output.Length + count > MaximumResponseBytes)
                    throw new LanBridgeException("response_too_large", "班级服务响应过大。");
                output.Write(buffer, 0, count);
            }
            LanBridgeResponse result = new LanBridgeResponse();
            result.Status = (int)response.StatusCode;
            result.BodyText = Encoding.UTF8.GetString(output.ToArray());
            return result;
        }
    }

    private static int ClampTimeout(int value)
    {
        if (value < 500) return 500;
        if (value > 15000) return 15000;
        return value;
    }

    private static bool IsSafeHeader(string value)
    {
        if (String.IsNullOrEmpty(value) || value.Length > 4096) return false;
        foreach (char character in value)
            if (character < 32 || character == 127) return false;
        return true;
    }
}

internal sealed class LanHostStatus
{
    public bool Ready { get; set; }
    public bool ReusedExisting { get; set; }
    public int Port { get; set; }
    public string ErrorCode { get; set; }
}

internal sealed class LanClassroomHost : IDisposable
{
    private readonly string executable;
    private readonly string dataDirectory;
    private readonly int port;
    private readonly int discoveryPort;
    private Process child;

    public LanClassroomHost(string executable, string dataDirectory, int port, int discoveryPort)
    {
        this.executable = Path.GetFullPath(executable);
        this.dataDirectory = Path.GetFullPath(dataDirectory);
        this.port = port;
        this.discoveryPort = discoveryPort;
    }

    public LanHostStatus StartAndWait(TimeSpan timeout)
    {
        if (port != LanEndpointPolicy.ServicePort)
            return Failure("invalid_service_port");
        if (CheckHealth()) return Success(true);
        if (!File.Exists(executable)) return Failure("service_executable_missing");
        Directory.CreateDirectory(dataDirectory);
        ProcessStartInfo start = new ProcessStartInfo();
        start.FileName = executable;
        start.Arguments = "--bind 0.0.0.0 --port " + port
            + " --discovery-port " + discoveryPort
            + " --data-dir \"" + dataDirectory.Replace("\"", "") + "\"";
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.WindowStyle = ProcessWindowStyle.Hidden;
        child = Process.Start(start);
        DateTime deadline = DateTime.UtcNow.Add(timeout);
        while (DateTime.UtcNow < deadline)
        {
            if (child == null || child.HasExited) return Failure("service_process_exited");
            if (CheckHealth()) return Success(false);
            Thread.Sleep(80);
        }
        return Failure("service_start_timeout");
    }

    private bool CheckHealth()
    {
        try
        {
            LanBridgeResponse response = LanHttpBridge.Send(new LanBridgeRequest {
                ServerUrl = "http://127.0.0.1:" + port,
                Path = "/health/live",
                Method = "GET",
                BodyText = "",
                TimeoutMilliseconds = 500
            });
            return response.Status == 200
                && response.BodyText.IndexOf("physics-studio-lan-classroom", StringComparison.Ordinal) >= 0;
        }
        catch { return false; }
    }

    private LanHostStatus Success(bool reused)
    {
        LanHostStatus result = new LanHostStatus();
        result.Ready = true;
        result.ReusedExisting = reused;
        result.Port = port;
        result.ErrorCode = "";
        return result;
    }

    private LanHostStatus Failure(string code)
    {
        LanHostStatus result = new LanHostStatus();
        result.Ready = false;
        result.ReusedExisting = false;
        result.Port = port;
        result.ErrorCode = code;
        return result;
    }

    public void Dispose()
    {
        if (child == null) return;
        try
        {
            if (!child.HasExited)
            {
                child.CloseMainWindow();
                if (!child.WaitForExit(800)) child.Kill();
            }
        }
        catch { }
        finally { child.Dispose(); child = null; }
    }
}

internal static class LanDiscoveryClient
{
    private const string Prefix = "PHYSICS_STUDIO_CLASSROOM_DISCOVER_V1:";

    public static List<string> Discover(int timeoutMilliseconds)
    {
        string nonce = Guid.NewGuid().ToString("N");
        byte[] packet = Encoding.UTF8.GetBytes(Prefix + nonce);
        List<string> result = new List<string>();
        AddHealthyLocalService(result);
        using (UdpClient socket = new UdpClient())
        {
            socket.EnableBroadcast = true;
            int boundedTimeout = Math.Max(200, Math.Min(timeoutMilliseconds, 3000));
            // The Windows host normally has its own verified service.  Keep a
            // short discovery window for other teachers on the LAN without
            // making local class creation wait for the full network timeout.
            socket.Client.ReceiveTimeout = result.Count > 0 ? Math.Min(boundedTimeout, 400) : boundedTimeout;
            socket.Send(packet, packet.Length, new IPEndPoint(IPAddress.Broadcast, LanEndpointPolicy.DiscoveryPort));
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(socket.Client.ReceiveTimeout);
            while (DateTime.UtcNow < deadline && result.Count < 20)
            {
                try
                {
                    IPEndPoint sender = new IPEndPoint(IPAddress.Any, 0);
                    byte[] response = socket.Receive(ref sender);
                    AddResponse(result, response, nonce);
                }
                catch (SocketException) { break; }
            }
        }
        return result;
    }

    private static void AddHealthyLocalService(List<string> result)
    {
        const string localServer = "http://127.0.0.1:8788";
        try
        {
            LanBridgeResponse response = LanHttpBridge.Send(new LanBridgeRequest {
                ServerUrl = localServer,
                Path = "/health/live",
                Method = "GET",
                BodyText = "",
                TimeoutMilliseconds = 500
            });
            if (response.Status == 200
                && response.BodyText.IndexOf("physics-studio-lan-classroom", StringComparison.Ordinal) >= 0)
                result.Add(localServer);
        }
        catch { }
    }

    private static void AddResponse(List<string> result, byte[] bytes, string nonce)
    {
        if (bytes == null || bytes.Length == 0 || bytes.Length > 4096) return;
        Dictionary<string, object> value;
        try
        {
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            value = serializer.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(bytes));
        }
        catch { return; }
        object protocolValue;
        object nonceValue;
        object portValue;
        object addressesValue;
        if (!value.TryGetValue("protocol", out protocolValue)
            || Convert.ToString(protocolValue) != "physics-studio-classroom-lan-v1"
            || !value.TryGetValue("nonce", out nonceValue) || Convert.ToString(nonceValue) != nonce
            || !value.TryGetValue("port", out portValue) || Convert.ToInt32(portValue) != LanEndpointPolicy.ServicePort
            || !value.TryGetValue("addresses", out addressesValue)) return;
        object[] addresses = addressesValue as object[];
        if (addresses == null) return;
        foreach (object addressValue in addresses)
        {
            string serverUrl = "http://" + Convert.ToString(addressValue) + ":" + LanEndpointPolicy.ServicePort;
            Uri ignored;
            if (LanEndpointPolicy.TryBuild(serverUrl, "/health/live", out ignored) && !result.Contains(serverUrl))
                result.Add(serverUrl);
        }
    }
}

internal sealed class LanNativeMessageRouter
{
    private static readonly System.Text.RegularExpressions.Regex RequestIdPattern =
        new System.Text.RegularExpressions.Regex("^[A-Za-z0-9-]{8,80}$");

    public string Handle(string message)
    {
        string requestId = "";
        try
        {
            if (String.IsNullOrEmpty(message) || message.Length > 100000)
                throw new LanBridgeException("invalid_request", "班级桥接请求无效。");
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            serializer.MaxJsonLength = 150000;
            Dictionary<string, object> root = serializer.Deserialize<Dictionary<string, object>>(message);
            if (root == null || Text(root, "channel") != "physics-studio-classroom")
                throw new LanBridgeException("invalid_request", "班级桥接请求无效。");
            requestId = Text(root, "requestId");
            if (!RequestIdPattern.IsMatch(requestId))
                throw new LanBridgeException("invalid_request", "班级桥接请求无效。");
            string action = Text(root, "action");
            Dictionary<string, object> result = new Dictionary<string, object>();
            if (action == "discover")
            {
                result["services"] = LanDiscoveryClient.Discover(2500).ToArray();
                return Response(requestId, true, result, "");
            }
            if (action != "request")
                throw new LanBridgeException("invalid_request", "班级桥接操作无效。");
            object payloadValue;
            Dictionary<string, object> payload = root.TryGetValue("payload", out payloadValue)
                ? payloadValue as Dictionary<string, object>
                : null;
            if (payload == null) throw new LanBridgeException("invalid_request", "班级桥接内容无效。");
            LanBridgeRequest request = new LanBridgeRequest();
            request.ServerUrl = Text(payload, "serverUrl");
            request.Path = Text(payload, "path");
            request.Method = Text(payload, "method");
            request.BodyText = Text(payload, "bodyText");
            request.TimeoutMilliseconds = Integer(payload, "timeoutMs", 15000);
            request.Headers = Headers(payload);
            LanBridgeResponse response = LanHttpBridge.Send(request);
            result["status"] = response.Status;
            result["bodyText"] = response.BodyText;
            return Response(requestId, true, result, "");
        }
        catch (LanBridgeException error)
        {
            return Response(requestId, false, null, error.Code);
        }
        catch
        {
            return Response(requestId, false, null, "invalid_request");
        }
    }

    private static Dictionary<string, string> Headers(Dictionary<string, object> payload)
    {
        Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        object value;
        Dictionary<string, object> source = payload.TryGetValue("headers", out value)
            ? value as Dictionary<string, object>
            : null;
        if (source == null) return result;
        foreach (string name in new[] { "Authorization", "Idempotency-Key", "X-Physics-Studio-Client" })
        {
            object item;
            if (source.TryGetValue(name, out item) && item != null) result[name] = Convert.ToString(item);
        }
        return result;
    }

    private static string Text(Dictionary<string, object> value, string key)
    {
        object item;
        return value != null && value.TryGetValue(key, out item) && item != null
            ? Convert.ToString(item)
            : "";
    }

    private static int Integer(Dictionary<string, object> value, string key, int fallback)
    {
        object item;
        int parsed;
        return value != null && value.TryGetValue(key, out item)
            && Int32.TryParse(Convert.ToString(item), out parsed) ? parsed : fallback;
    }

    private static string Response(string requestId, bool ok, object result, string error)
    {
        Dictionary<string, object> body = new Dictionary<string, object>();
        body["channel"] = "physics-studio-classroom";
        body["requestId"] = RequestIdPattern.IsMatch(requestId ?? "") ? requestId : "rejected-request";
        body["ok"] = ok;
        if (ok) body["result"] = result ?? new Dictionary<string, object>();
        else body["error"] = String.IsNullOrEmpty(error) ? "invalid_request" : error;
        return new JavaScriptSerializer().Serialize(body);
    }
}
