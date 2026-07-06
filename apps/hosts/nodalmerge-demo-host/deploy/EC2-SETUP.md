# api.nodalmerge.com — EC2 setup runbook (copy-paste)

Target: **t3a.small (2 GB RAM) · 20 GB gp3 · Ubuntu 24.04 LTS**, Docker-packaged
demo host behind nginx + certbot. Guardrail reasoning lives in
[`plans/demo-host-public-deploy-guardrails.md`](../../../../plans/demo-host-public-deploy-guardrails.md).

Prereqs before starting:
- DNS `A` record for `api.nodalmerge.com` → the instance's Elastic IP.
- Security group: inbound 22 (your IP), 80, 443. **Do not open 5074** — the
  container binds host loopback only; nginx is the public face.

## 1. Swap (2 GB file, safety net not working set)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
sudo sysctl -p /etc/sysctl.d/99-swap.conf
```

## 2. Docker + nginx + certbot

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl nginx certbot python3-certbot-nginx
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER   # re-login (or `newgrp docker`) to take effect
```

## 3. Build or load the image

Option A — build on the box (needs the repo's demo-host folder; the build
restores NodalMerge 0.1.4 from nuget.org, no Rust toolchain involved):

```bash
# from a checkout of the docs repo on the box:
cd docs/apps/hosts/nodalmerge-demo-host
docker build -t nodalmerge-demo-host:0.1.5 -f deploy/docker/Dockerfile .
```

Option B — build locally, ship the tarball (keeps the box small):

```bash
# local machine (repo: docs/apps/hosts/nodalmerge-demo-host):
docker build -t nodalmerge-demo-host:0.1.5 -f deploy/docker/Dockerfile .
docker save nodalmerge-demo-host:0.1.5 | gzip > nodalmerge-demo-host-0.1.5.tar.gz
scp nodalmerge-demo-host-0.1.5.tar.gz ubuntu@api.nodalmerge.com:/tmp/

# box:
gunzip -c /tmp/nodalmerge-demo-host-0.2.0.tar.gz | docker load
```

## 4. Run it

```bash
sudo mkdir -p /opt/nodalmerge-demo-host
# copy deploy/docker/docker-compose.yml from this repo into it, then:
cd /opt/nodalmerge-demo-host
docker compose up -d
curl -s http://127.0.0.1:5074/api/host/health   # expect 200 JSON
```

Memory guardrails are in the compose file (hard cap 1200 MB, reservation
900 MB, `restart: on-failure`, capped json logs).

## 5. nginx + TLS

```bash
# copy deploy/nginx/api.nodalmerge.com.conf from this repo, then:
sudo cp api.nodalmerge.com.conf /etc/nginx/sites-available/api.nodalmerge.com.conf

# The three shared zones go in the main http {} block ONCE:
sudo tee /etc/nginx/conf.d/nodalmerge-limits.conf > /dev/null <<'EOF'
limit_conn_zone $binary_remote_addr zone=nm_perip:10m;
limit_conn_zone $uri                zone=nm_perroom:10m;
limit_req_zone  $binary_remote_addr zone=nm_httpreq:10m rate=5r/s;
EOF

sudo ln -s /etc/nginx/sites-available/api.nodalmerge.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Certbot fills in the ssl_certificate lines and the 80->443 redirect:
sudo certbot --nginx -d api.nodalmerge.com
sudo nginx -t && sudo systemctl reload nginx
```

Note: the shipped conf's `server {}` block has a placeholder comment where
certbot's `ssl_certificate` lines land; if certbot complains about the missing
cert on first parse, run it once with a minimal port-80 server block for the
domain, then merge in the shipped block.

## 6. Nightly recycle (reclaims in-memory demo state)

PowerShell (local machine — copy the two unit files up):

```powershell
cd apps\hosts\nodalmerge-demo-host\deploy\systemd
scp -i {certificate} nodalmerge-demo-host-docker-restart.service nodalmerge-demo-host-docker-restart.timer ubuntu@{server}:/tmp/
```

Server (over ssh):

```bash
sudo mv /tmp/nodalmerge-demo-host-docker-restart.service /tmp/nodalmerge-demo-host-docker-restart.timer /etc/systemd/system/
sudo chown root:root /etc/systemd/system/nodalmerge-demo-host-docker-restart.{service,timer}
sudo systemctl daemon-reload
sudo systemctl enable --now nodalmerge-demo-host-docker-restart.timer
systemctl list-timers | grep nodalmerge   # verify next run (04:00 UTC)
```

(The bare-metal `nodalmerge-demo-host.service` + `-restart.*` pair in the same
folder is the non-Docker alternative; don't install both.)

## 7. Smoke test from your machine

```bash
curl -s https://api.nodalmerge.com/api/host/health
# expect 200 + provider JSON (InMemory / WsOnly / Default)
```

Then open two browser tabs on the deployed site's `/demos/pixel-canvas/` and
paint — pixels should appear in both tabs, and the diagnostics panel should
show `wss://api.nodalmerge.com` traffic.

## Ongoing

- **Watch for a week:** `docker stats nodalmerge-demo-host` and CloudWatch
  CPUCreditBalance. If memory sits near the 900 MB reservation or credits
  drain, bump to t3a.medium (stop → change type → start; nothing to rebuild).
- **Upgrade the host version:** build/load the new image tag, edit the tag in
  `docker-compose.yml`, `docker compose up -d`. Clients see a brief
  disconnect, same as the nightly recycle.
- **Logs:** `docker logs --tail 200 nodalmerge-demo-host`,
  `sudo tail -f /var/log/nginx/access.log`.
