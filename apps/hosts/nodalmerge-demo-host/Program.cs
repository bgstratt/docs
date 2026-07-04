using NodalMerge.DotNetHost;
using NodalMerge.DotNetHost.Runtime;
using NodalMerge.Host.Abstractions.Providers;
using NodalMerge.Host.Composition;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicyName = "NodalMergeDemoHostClients";

var allowedOrigins = builder.Configuration.GetSection("NodalMerge:Cors:AllowedOrigins").Get<string[]>();
if (allowedOrigins is null || allowedOrigins.Length == 0)
{
  throw new InvalidOperationException(
    "NodalMerge:Cors:AllowedOrigins is not configured. Set it in appsettings.json to the localhost dev " +
    "origins and the deployed site origins (https://nodalmerge.com, https://www.nodalmerge.com) allowed to call this host."
  );
}

builder.Services.AddCors(options =>
{
  options.AddPolicy(CorsPolicyName, policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod());
});

builder.Services.AddNodalMergeHostProviders(builder.Configuration);
builder.Services.AddNodalMergeRuntimeCore(builder.Configuration);

var app = builder.Build();

// Server-side enforcement of the same allowlist CORS uses. CORS alone only hides the
// response from browser JS on a disallowed origin — the server still processes the
// request. This middleware actually rejects it. A request with no Origin header at all
// (curl, health checks, server-to-server) is not a browser cross-origin call and is left
// alone; a forged Origin can't be produced by a real browser unless the request really
// does come from a page served at that origin.
var allowedOriginSet = new HashSet<string>(allowedOrigins, StringComparer.OrdinalIgnoreCase);
app.Use(async (context, next) =>
{
  var origin = context.Request.Headers.Origin.ToString();
  if (!string.IsNullOrEmpty(origin) && !allowedOriginSet.Contains(origin))
  {
    context.Response.StatusCode = StatusCodes.Status403Forbidden;
    await context.Response.WriteAsync("origin not allowed");
    return;
  }
  await next();
});

app.UseCors(CorsPolicyName);

app.MapNodalMergeEndpoints();

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

app.Run();
