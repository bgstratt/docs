# Deploy files for nodalmerge-demo-host

Canonical copies of the nginx and systemd config from
[`plans/demo-host-public-deploy-guardrails.md`](../../../../plans/demo-host-public-deploy-guardrails.md).
That plan doc has the reasoning; these files are what actually gets copied onto the box.

## nginx

`nginx/api.nodalmerge.com.conf` — reverse proxy + guardrails (idle timeout, per-IP/per-room
connection caps, per-connection throughput throttle). Assumes TLS termination via certbot is
already configured for `api.nodalmerge.com`; the two `limit_conn_zone`/one `limit_req_zone`
lines at the top of the file need to go in the main `http {}` block once (commented inline
where they'd normally live), the rest is the `server {}` block itself.

## systemd

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

`MemoryMax`/`MemoryHigh` in `nodalmerge-demo-host.service` are placeholder values — tune to
the actual EC2 instance size before deploying.
