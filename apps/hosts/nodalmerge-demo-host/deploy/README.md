# Deploy files for nodalmerge-demo-host

Canonical copies of the Docker, nginx, and systemd config from
[`plans/demo-host-public-deploy-guardrails.md`](../../../../plans/demo-host-public-deploy-guardrails.md).
That plan doc has the reasoning; these files are what actually gets copied onto the box.

**Start here: [`EC2-SETUP.md`](EC2-SETUP.md)** — the copy-paste runbook for the
t3a.small box (swap, Docker, image build/load, compose, nginx/certbot, nightly
recycle timer, smoke test).

## docker (the deployed path)

- `docker/Dockerfile` — multi-stage build; restores NodalMerge 0.1.4 from
  nuget.org (linux-x64 natives come from the NuGet package), runs as the
  unprivileged app user with a `/api/host/health` healthcheck.
- `docker/docker-compose.yml` — memory guardrails for the 2 GB instance
  (1200 MB hard / 900 MB reservation), `restart: on-failure`, port published on
  host loopback only, capped log files.
- `systemd/nodalmerge-demo-host-docker-restart.{service,timer}` — nightly
  container recycle (04:00 UTC).

## nginx

`nginx/api.nodalmerge.com.conf` — reverse proxy + guardrails (idle timeout, per-IP/per-room
connection caps, per-connection throughput throttle). Assumes TLS termination via certbot is
already configured for `api.nodalmerge.com`; the two `limit_conn_zone`/one `limit_req_zone`
lines at the top of the file need to go in the main `http {}` block once (commented inline
where they'd normally live), the rest is the `server {}` block itself.

## systemd (bare-metal alternative — don't install alongside the Docker path)

- `systemd/nodalmerge-demo-host.service` — runs the published host binary, `Production`
  environment, memory cgroup cap + `Restart=on-failure`.
- `systemd/nodalmerge-demo-host-restart.service` + `.timer` — nightly recycle to reclaim
  in-memory room/blob state (safe: see "why this is fine" in the plan doc — persistence is
  client-side IndexedDB, not server-side).

Install:

```bash
sudo cp systemd/*.service systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nodalmerge-demo-host.service
sudo systemctl enable --now nodalmerge-demo-host-restart.timer
```

`MemoryMax`/`MemoryHigh` in `nodalmerge-demo-host.service` are sized for a t3a.small
(2 GB): 1200M hard / 900M soft — same budget as the Docker compose file. Retune both
together if the instance type changes.
