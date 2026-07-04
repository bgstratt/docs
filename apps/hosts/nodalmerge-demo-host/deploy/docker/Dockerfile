# nodalmerge-demo-host container image.
#
# Build from the app directory (one level above deploy/):
#   cd apps/hosts/nodalmerge-demo-host
#   docker build -t nodalmerge-demo-host:0.1.4 -f deploy/docker/Dockerfile .
#
# NuGet packages (NodalMerge.* 0.1.4 incl. the linux-x64 native runtime) restore
# from nuget.org during the build — no local feeds or Rust toolchain needed.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first so the package graph caches as its own layer.
COPY NodalMerge.DemoHost.csproj .
COPY nuget.config* ./
RUN dotnet restore NodalMerge.DemoHost.csproj

COPY . .
RUN dotnet publish NodalMerge.DemoHost.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_PRINT_TELEMETRY_MESSAGE=false \
    # appsettings.json binds 127.0.0.1 for bare-metal runs; inside the container
    # Kestrel must bind all interfaces (the compose file publishes the port on
    # the host's loopback only, so this is not publicly exposed).
    Kestrel__Endpoints__Http__Url=http://0.0.0.0:5074

EXPOSE 5074

# Unprivileged runtime user (mirrors User=nodalmerge in the bare-metal unit).
USER $APP_UID

# The aspnet base image ships no wget/curl; bash's /dev/tcp does the probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/bin/bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/5074 && printf 'GET /api/host/health HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q ' 200 ' <&3"]

ENTRYPOINT ["dotnet", "NodalMerge.DemoHost.dll"]
