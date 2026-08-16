package com.physicsstudio.studyroom;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Restricted native transport for the same-LAN classroom service.
 *
 * The WebView remains HTTPS-only and MIXED_CONTENT_NEVER_ALLOW.  This class
 * uses a raw socket only after validating a literal private/loopback address,
 * the fixed classroom port and the API path allowlist.  Consequently enabling
 * classroom LAN access does not enable arbitrary clear-text browsing.
 */
final class LanClassroomTransport {
    static final int SERVICE_PORT = 8788;
    static final int DISCOVERY_PORT = 18788;
    private static final int MAX_REQUEST_BYTES = 64 * 1024;
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    private static final int MAX_HEADER_BYTES = 16 * 1024;
    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");
    private static final Pattern RESPONSE_IPV4 = Pattern.compile("\"((?:\\d{1,3}\\.){3}\\d{1,3})\"");
    private static final String DISCOVERY_PREFIX = "PHYSICS_STUDIO_CLASSROOM_DISCOVER_V1:";

    static final class Response {
        final int status;
        final String bodyText;

        Response(int status, String bodyText) {
            this.status = status;
            this.bodyText = bodyText;
        }
    }

    static final class TransportException extends Exception {
        final String code;

        TransportException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private LanClassroomTransport() { }

    static boolean isAllowedServer(String serverUrl) {
        try {
            return validateServer(serverUrl) != null;
        } catch (TransportException error) {
            return false;
        }
    }

    static Response request(
        String serverUrl,
        String path,
        String method,
        Map<String, String> headers,
        String bodyText,
        int timeoutMilliseconds
    ) throws TransportException {
        URI server = validateServer(serverUrl);
        String safePath = validatePath(path);
        String safeMethod = method == null ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        if (!safeMethod.equals("GET") && !safeMethod.equals("HEAD") && !safeMethod.equals("POST")
            && !safeMethod.equals("PATCH") && !safeMethod.equals("DELETE")) {
            throw new TransportException("invalid_request", "班级请求方法无效。");
        }
        byte[] body = (bodyText == null ? "" : bodyText).getBytes(StandardCharsets.UTF_8);
        if (body.length > MAX_REQUEST_BYTES) {
            throw new TransportException("request_too_large", "班级请求内容过大。");
        }
        int timeout = Math.max(500, Math.min(timeoutMilliseconds, 15000));
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(server.getHost(), SERVICE_PORT), timeout);
            socket.setSoTimeout(timeout);
            OutputStream output = socket.getOutputStream();
            StringBuilder requestHead = new StringBuilder();
            requestHead.append(safeMethod).append(' ').append(safePath).append(" HTTP/1.1\r\n");
            requestHead.append("Host: ").append(server.getHost()).append(':').append(SERVICE_PORT).append("\r\n");
            requestHead.append("Accept: application/json\r\n");
            requestHead.append("User-Agent: PhysicsStudioAndroid/LanClassroom\r\n");
            requestHead.append("Connection: close\r\n");
            appendHeader(requestHead, headers, "Authorization");
            appendHeader(requestHead, headers, "Idempotency-Key");
            appendHeader(requestHead, headers, "X-Physics-Studio-Client");
            if (body.length > 0) {
                requestHead.append("Content-Type: application/json; charset=utf-8\r\n");
                requestHead.append("Content-Length: ").append(body.length).append("\r\n");
            }
            requestHead.append("\r\n");
            output.write(requestHead.toString().getBytes(StandardCharsets.ISO_8859_1));
            if (body.length > 0) output.write(body);
            output.flush();
            return readResponse(socket.getInputStream(), safeMethod.equals("HEAD"));
        } catch (SocketTimeoutException error) {
            throw new TransportException("request_timeout", "班级服务请求超时。");
        } catch (IOException error) {
            throw new TransportException("network_error", "无法连接局域网班级服务。");
        } finally {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    static List<String> discover(int timeoutMilliseconds) throws TransportException {
        int timeout = Math.max(300, Math.min(timeoutMilliseconds, 3000));
        String nonce = UUID.randomUUID().toString().replace("-", "");
        byte[] payload = (DISCOVERY_PREFIX + nonce).getBytes(StandardCharsets.UTF_8);
        Set<String> services = new LinkedHashSet<String>();
        // A teacher's Android device may itself be the classroom host. Probe
        // loopback first so creation never depends on Wi-Fi broadcast being
        // reflected back to the sender. If healthy, also publish each private
        // address so the generated QR can be used by peer devices on this LAN.
        if (isLocalHostHealthy()) {
            services.add("http://127.0.0.1:" + SERVICE_PORT);
            for (String address : LanClassroomHost.privateIpv4Addresses()) {
                String candidate = "http://" + address + ":" + SERVICE_PORT;
                if (isAllowedServer(candidate)) services.add(candidate);
            }
        }
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            socket.setBroadcast(true);
            for (InetAddress address : broadcastAddresses()) {
                try {
                    socket.send(new DatagramPacket(payload, payload.length, address, DISCOVERY_PORT));
                } catch (IOException ignored) { }
            }
            long deadline = System.currentTimeMillis() + timeout;
            byte[] buffer = new byte[4096];
            while (System.currentTimeMillis() < deadline && services.size() < 20) {
                int remaining = (int)Math.max(50, deadline - System.currentTimeMillis());
                socket.setSoTimeout(remaining);
                DatagramPacket response = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(response);
                } catch (SocketTimeoutException timeoutError) {
                    break;
                }
                addDiscoveryResponse(services, response, nonce);
            }
        } catch (IOException error) {
            throw new TransportException("network_error", "无法发现局域网班级服务。");
        } finally {
            if (socket != null) socket.close();
        }
        return Collections.unmodifiableList(new ArrayList<String>(services));
    }

    private static boolean isLocalHostHealthy() {
        try {
            Response response = request(
                "http://127.0.0.1:" + SERVICE_PORT,
                "/health/live",
                "GET",
                Collections.<String, String>emptyMap(),
                "",
                500
            );
            return response.status == 200
                && response.bodyText.indexOf("physics-studio-lan-classroom") >= 0;
        } catch (TransportException error) {
            return false;
        }
    }

    private static URI validateServer(String serverUrl) throws TransportException {
        try {
            URI uri = new URI(serverUrl == null ? "" : serverUrl.trim());
            String path = uri.getRawPath();
            if (!"http".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getPort() != SERVICE_PORT || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (path != null && !path.isEmpty() && !"/".equals(path))
                || !isPrivateLiteral(uri.getHost())) {
                throw new TransportException("lan_endpoint_rejected", "局域网班级地址被拒绝。");
            }
            return uri;
        } catch (TransportException error) {
            throw error;
        } catch (Exception error) {
            throw new TransportException("lan_endpoint_rejected", "局域网班级地址被拒绝。");
        }
    }

    private static String validatePath(String value) throws TransportException {
        String path = value == null ? "" : value.trim();
        if (!path.startsWith("/") || path.startsWith("//") || path.indexOf("..") >= 0
            || path.indexOf('#') >= 0 || path.indexOf('?') >= 0
            || (!path.equals("/health/live") && !path.startsWith("/v1/"))) {
            throw new TransportException("lan_endpoint_rejected", "班级请求路径被拒绝。");
        }
        return path;
    }

    private static boolean isPrivateLiteral(String rawHost) {
        String host = rawHost == null ? "" : rawHost.toLowerCase(Locale.ROOT);
        if ("localhost".equals(host) || "::1".equals(host)) return true;
        Matcher match = IPV4.matcher(host);
        if (match.matches()) {
            int[] octet = new int[4];
            for (int index = 0; index < 4; index += 1) {
                octet[index] = Integer.parseInt(match.group(index + 1));
                if (octet[index] > 255) return false;
            }
            return octet[0] == 10 || octet[0] == 127
                || (octet[0] == 169 && octet[1] == 254)
                || (octet[0] == 172 && octet[1] >= 16 && octet[1] <= 31)
                || (octet[0] == 192 && octet[1] == 168);
        }
        return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
    }

    private static void appendHeader(StringBuilder output, Map<String, String> headers, String name)
        throws TransportException {
        if (headers == null || !headers.containsKey(name)) return;
        String value = headers.get(name);
        if (!isSafeHeader(value)) throw new TransportException("invalid_request", "班级请求头无效。");
        output.append(name).append(": ").append(value).append("\r\n");
    }

    private static boolean isSafeHeader(String value) {
        if (value == null || value.isEmpty() || value.length() > 4096) return false;
        for (int index = 0; index < value.length(); index += 1) {
            char item = value.charAt(index);
            if (item < 32 || item == 127) return false;
        }
        return true;
    }

    private static Response readResponse(InputStream input, boolean headRequest)
        throws IOException, TransportException {
        ByteArrayOutputStream headerBytes = new ByteArrayOutputStream();
        int state = 0;
        while (state < 4) {
            int value = input.read();
            if (value < 0) throw new TransportException("invalid_server_response", "班级服务响应不完整。");
            headerBytes.write(value);
            if (headerBytes.size() > MAX_HEADER_BYTES)
                throw new TransportException("response_too_large", "班级服务响应头过大。");
            state = state == 0 && value == '\r' ? 1
                : state == 1 && value == '\n' ? 2
                : state == 2 && value == '\r' ? 3
                : state == 3 && value == '\n' ? 4
                : value == '\r' ? 1 : 0;
        }
        String headers = new String(headerBytes.toByteArray(), StandardCharsets.ISO_8859_1);
        String firstLine = headers.split("\\r\\n", 2)[0];
        Matcher statusMatch = Pattern.compile("^HTTP/1\\.[01] (\\d{3})(?: |$)").matcher(firstLine);
        if (!statusMatch.find())
            throw new TransportException("invalid_server_response", "班级服务响应状态无效。");
        int status = Integer.parseInt(statusMatch.group(1));
        if (headRequest) return new Response(status, "");
        int contentLength = contentLength(headers);
        if (contentLength > MAX_RESPONSE_BYTES)
            throw new TransportException("response_too_large", "班级服务响应过大。");
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        while (contentLength < 0 || body.size() < contentLength) {
            int wanted = contentLength < 0 ? buffer.length : Math.min(buffer.length, contentLength - body.size());
            int read = input.read(buffer, 0, wanted);
            if (read < 0) break;
            if (body.size() + read > MAX_RESPONSE_BYTES)
                throw new TransportException("response_too_large", "班级服务响应过大。");
            body.write(buffer, 0, read);
        }
        if (contentLength >= 0 && body.size() != contentLength)
            throw new TransportException("invalid_server_response", "班级服务响应不完整。");
        return new Response(status, new String(body.toByteArray(), StandardCharsets.UTF_8));
    }

    private static int contentLength(String headers) throws TransportException {
        Matcher match = Pattern.compile("(?im)^Content-Length:\\s*(\\d+)\\s*$").matcher(headers);
        if (!match.find()) return -1;
        try {
            return Integer.parseInt(match.group(1));
        } catch (NumberFormatException error) {
            throw new TransportException("invalid_server_response", "班级服务响应长度无效。");
        }
    }

    private static List<InetAddress> broadcastAddresses() {
        LinkedHashSet<InetAddress> result = new LinkedHashSet<InetAddress>();
        try { result.add(InetAddress.getByName("255.255.255.255")); } catch (Exception ignored) { }
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface item = interfaces.nextElement();
                if (!item.isUp() || item.isLoopback()) continue;
                for (InterfaceAddress address : item.getInterfaceAddresses()) {
                    InetAddress broadcast = address.getBroadcast();
                    if (broadcast instanceof Inet4Address) result.add(broadcast);
                }
            }
        } catch (Exception ignored) { }
        return new ArrayList<InetAddress>(result);
    }

    private static void addDiscoveryResponse(Set<String> services, DatagramPacket packet, String nonce) {
        if (packet.getLength() <= 0 || packet.getLength() > 4096) return;
        String text = new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8);
        if (text.indexOf("\"protocol\":\"physics-studio-classroom-lan-v1\"") < 0
            || text.indexOf("\"nonce\":\"" + nonce + "\"") < 0
            || text.indexOf("\"port\":" + SERVICE_PORT) < 0) return;
        Matcher match = RESPONSE_IPV4.matcher(text);
        while (match.find()) {
            String serverUrl = "http://" + match.group(1) + ":" + SERVICE_PORT;
            if (isAllowedServer(serverUrl)) services.add(serverUrl);
        }
    }
}
