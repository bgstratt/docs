using NodalMerge.DotNetHost;
using NodalMerge.Host.Abstractions.Providers;
using NodalMerge.Host.Composition;

var app = HostApplication.Build(args);

app.MapGet("/api/host/health", () => Results.Ok(new
{
  service = "nodalmerge-demo-host",
  status = "ok",
  runtimePath = "NodalMerge.DotNetHost",
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

app.Run("http://127.0.0.1:5074");

