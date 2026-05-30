using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

internal sealed class RuntimeRoomService
{
  private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, WebSocket>> _rooms =
    new(StringComparer.OrdinalIgnoreCase);

  public async Task HandleWebSocketAsync(HttpContext context)
  {
    if (!context.WebSockets.IsWebSocketRequest)
    {
      context.Response.StatusCode = StatusCodes.Status400BadRequest;
      await context.Response.WriteAsync("WebSocket upgrade required");
      return;
    }

    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    var first = await ReceiveTextAsync(socket, context.RequestAborted);
    if (first is null)
    {
      return;
    }

    string roomId;
    string peerId;
    if (!TryParseHello(first, context, out roomId, out peerId))
    {
      await SendJsonAsync(socket, new { type = "error", msg = "expected hello" }, context.RequestAborted);
      await socket.CloseOutputAsync(WebSocketCloseStatus.PolicyViolation, "expected hello", CancellationToken.None);
      return;
    }

    var roomPeers = _rooms.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, WebSocket>(StringComparer.OrdinalIgnoreCase));
    roomPeers[peerId] = socket;
    try
    {
      var peerList = roomPeers.Keys.Where(id => !string.Equals(id, peerId, StringComparison.OrdinalIgnoreCase)).ToArray();
      await SendJsonAsync(socket, new
      {
        type = "welcome",
        room = roomId,
        peerId,
        peers = peerList,
        caps = new[] { "subscribe", "presence", "relay" }
      }, context.RequestAborted);

      await BroadcastAsync(roomPeers, new { type = "peer-joined", room = roomId, peerId, from = peerId }, peerId, context.RequestAborted);

      while (socket.State == WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
      {
        var message = await ReceiveTextAsync(socket, context.RequestAborted);
        if (message is null)
        {
          break;
        }

        using var doc = JsonDocument.Parse(message);
        var root = doc.RootElement;
        var type = root.TryGetProperty("type", out var typeElement) && typeElement.ValueKind == JsonValueKind.String
          ? typeElement.GetString()
          : "unknown";
        var to = root.TryGetProperty("to", out var toElement) && toElement.ValueKind == JsonValueKind.String
          ? toElement.GetString()
          : null;

        if (string.Equals(type, "presence-set", StringComparison.OrdinalIgnoreCase))
        {
          object? data = null;
          if (root.TryGetProperty("data", out var dataElement))
          {
            data = JsonSerializer.Deserialize<object>(dataElement.GetRawText());
          }
          await BroadcastAsync(roomPeers, new { type = "presence", room = roomId, from = peerId, peerId, data }, null, context.RequestAborted);
          continue;
        }

        if (!string.IsNullOrWhiteSpace(to) && roomPeers.TryGetValue(to, out var targetSocket))
        {
          await SendJsonAsync(targetSocket, new
          {
            type,
            room = roomId,
            from = peerId,
            peerId,
            to
          }, context.RequestAborted);
          continue;
        }

        await SendJsonAsync(socket, new { type = "runtime-message", msg = "ack", originalType = type }, context.RequestAborted);
      }
    }
    finally
    {
      if (roomPeers.TryGetValue(peerId, out var current) && ReferenceEquals(current, socket))
      {
        roomPeers.TryRemove(peerId, out _);
      }

      await BroadcastAsync(roomPeers, new { type = "peer-left", room = roomId, peerId, from = peerId }, peerId, CancellationToken.None);

      if (roomPeers.IsEmpty)
      {
        _rooms.TryRemove(roomId, out _);
      }

      if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
      {
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None);
      }
    }
  }

  private static bool TryParseHello(string text, HttpContext context, out string roomId, out string peerId)
  {
    roomId = "demo-room";
    peerId = $"peer-{Guid.NewGuid():N}";
    try
    {
      using var doc = JsonDocument.Parse(text);
      var root = doc.RootElement;
      var type = root.TryGetProperty("type", out var typeElement) && typeElement.ValueKind == JsonValueKind.String
        ? typeElement.GetString()
        : null;
      if (!string.Equals(type, "hello", StringComparison.OrdinalIgnoreCase))
      {
        return false;
      }

      if (root.TryGetProperty("room", out var roomElement) && roomElement.ValueKind == JsonValueKind.String)
      {
        roomId = roomElement.GetString() ?? roomId;
      }
      else if (context.Request.RouteValues.TryGetValue("roomId", out var routeRoom)
        && routeRoom is not null
        && !string.Equals(routeRoom.ToString(), "runtime", StringComparison.OrdinalIgnoreCase))
      {
        roomId = Uri.UnescapeDataString(routeRoom.ToString()!);
      }

      if (root.TryGetProperty("pubkey", out var pubkeyElement) && pubkeyElement.ValueKind == JsonValueKind.String)
      {
        peerId = pubkeyElement.GetString() ?? peerId;
      }

      return true;
    }
    catch
    {
      return false;
    }
  }

  private static async Task<string?> ReceiveTextAsync(WebSocket socket, CancellationToken cancellationToken)
  {
    var buffer = new byte[64 * 1024];
    var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);
    if (result.MessageType == WebSocketMessageType.Close)
    {
      return null;
    }

    if (result.MessageType != WebSocketMessageType.Text || result.Count == 0)
    {
      return string.Empty;
    }

    return Encoding.UTF8.GetString(buffer, 0, result.Count);
  }

  private static async Task SendJsonAsync(WebSocket socket, object payload, CancellationToken cancellationToken)
  {
    if (socket.State != WebSocketState.Open)
    {
      return;
    }

    await socket.SendAsync(
      JsonSerializer.SerializeToUtf8Bytes(payload),
      WebSocketMessageType.Text,
      endOfMessage: true,
      cancellationToken
    );
  }

  private static async Task BroadcastAsync(
    ConcurrentDictionary<string, WebSocket> roomPeers,
    object payload,
    string? excludePeerId,
    CancellationToken cancellationToken)
  {
    foreach (var (peerId, socket) in roomPeers)
    {
      if (!string.IsNullOrWhiteSpace(excludePeerId) && string.Equals(peerId, excludePeerId, StringComparison.OrdinalIgnoreCase))
      {
        continue;
      }
      try
      {
        await SendJsonAsync(socket, payload, cancellationToken);
      }
      catch
      {
        // best effort broadcast
      }
    }
  }
}

