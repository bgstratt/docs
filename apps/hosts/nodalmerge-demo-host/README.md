# NodalMerge demo host (NuGet package mode)

## Purpose

Run a local `.NET` host from this repository using NodalMerge NuGet packages, including native runtime package references.

This is the baseline for host integration slices and avoids direct project references into `nodalmerge`.

## Package prerequisites

Build local package artifacts in the sibling `nodalmerge` repo:

```powershell
cd C:\Users\bgstr\source\repos\nodalmerge
pwsh -File .\pack-local-artifacts.ps1 -Version 0.1.0-local -SkipNpm -SkipCrates
```

Expected output:

- `C:\Users\bgstr\source\repos\nodalmerge\artifacts\package-local\nuget`

## Restore and run

From this folder:

```powershell
dotnet restore .\NodalMerge.DemoHost.csproj --configfile .\NuGet.config -p:NodalMergePackageVersion=0.1.0-local
dotnet run --project .\NodalMerge.DemoHost.csproj -p:NodalMergePackageVersion=0.1.0-local
```

Host endpoint:

- `http://127.0.0.1:5074/api/host/health`

## Notes

- Current program is a package-mode host baseline with health endpoints.
- Next slice wires host composition/runtime services and room endpoints.
- NuGet package versions can be overridden via `-p:NodalMergePackageVersion=<version>`.

