using NodalMerge.Host.Abstractions.Providers;
using NodalMerge.Host.Composition;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddNodalMergeHostProviders(builder.Configuration);
builder.Services.AddSingleton<RuntimeRoomService>();
var app = builder.Build();
app.UseWebSockets();

app.MapGet("/", () => Results.Ok(new
{
  service = "nodalmerge-demo-host",
  status = "ready",
  timestampUtc = DateTimeOffset.UtcNow
}));

app.MapGet("/api/host/health", () => Results.Ok(new
{
  service = "nodalmerge-demo-host",
  status = "ok",
  packageMode = true,
  timestampUtc = DateTimeOffset.UtcNow
}));

app.MapGet("/api/host/providers", (
  NodalMergeHostProviderOptions options,
  INodeStoreProvider nodeStore,
  IBlobStoreProvider blobStore,
  IBlobUrlResolverProvider blobUrlResolver,
  IRoomTokenAuthProvider tokenAuth) => Results.Ok(new
{
  nodeStorage = options.NodeStorageProvider,
  blobStorage = options.BlobStorageProvider,
  auth = options.AuthProvider,
  resolved = new
  {
    nodeStore = nodeStore.GetType().Name,
    blobStore = blobStore.GetType().Name,
    blobUrlResolver = blobUrlResolver.GetType().Name,
    tokenAuth = tokenAuth.GetType().Name
  }
}));

app.Map("/ws/runtime", (HttpContext context, RuntimeRoomService runtime) => runtime.HandleWebSocketAsync(context));
app.Map("/ws/{roomId}", (HttpContext context, RuntimeRoomService runtime) => runtime.HandleWebSocketAsync(context));

app.Run("http://127.0.0.1:5074");

