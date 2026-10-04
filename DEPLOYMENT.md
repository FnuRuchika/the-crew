# Deploying THE CREW (Ubuntu 24.04 · Vultr · 1 GB RAM)

```
Internet ──► Nginx :80 (:443 later)
               ├── /       → /opt/the-crew/dist        (React/Vite production build)
               └── /api/   → 127.0.0.1:8000            (FastAPI via systemd, never public)
```

- **One origin.** The frontend calls relative `/api/...` URLs. Nginx serves both, so no CORS setup,
  no frontend env vars and no backend URL baked into the build. `VITE_API_BASE_URL` stays **unset**.
- **No new infrastructure:** no Docker, PM2 or Redis. One uvicorn worker under systemd, plus Nginx.
- **Secrets** live only in `/opt/the-crew/backend/.env` on the server (`chmod 600`). Nothing in
  `deploy/` or the built `dist/` contains a key.

Repo files used here:

| File | Installed to |
|---|---|
| [deploy/the-crew.service](deploy/the-crew.service) | `/etc/systemd/system/the-crew.service` |
| [deploy/nginx.conf](deploy/nginx.conf) | `/etc/nginx/sites-available/the-crew` |

All commands assume a sudo-capable shell. They also work as `root`.

---

## 1. Clone or update the repo

```bash
# first time
sudo git clone https://github.com/FnuRuchika/the-crew.git /opt/the-crew
# afterwards
cd /opt/the-crew && sudo git pull --ff-only
```

## 2. Swap (recommended on 1 GB)

The production build peaks around 350 MB, and uvicorn plus Nginx use roughly another 150 MB. A 1 GB swapfile keeps
`npm ci`/`npm run build` from being OOM-killed. Skip this if `swapon --show` already lists one.

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

If a build still fails for lack of memory, build on your laptop instead (`npm ci && npm run build`) and
copy it up with `scp -r dist/ <user>@<server>:/opt/the-crew/`. Nginx only needs the `dist/` folder.

## 3. Node.js

Vite 8 requires **Node `^20.19` or `>=22.12`**. Ubuntu 24.04's apt `nodejs` is 18.x, which is **too old**.
Install Node 24 LTS from NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # must print v22.12+ or v24.x
```

## 4. Build the frontend

```bash
cd /opt/the-crew
sudo npm ci          # exact versions from package-lock.json (never npm install on the server)
sudo npm run build   # tsc --noEmit && vite build  →  /opt/the-crew/dist
ls dist/index.html dist/assets
```

Don't set `VITE_API_BASE_URL`. Without it the build calls same-origin `/api`, which Nginx proxies.

## 5. Python backend

```bash
cd /opt/the-crew/backend
sudo apt-get install -y python3-venv          # only if the venv doesn't exist yet
sudo python3 -m venv .venv                    # only if the venv doesn't exist yet
sudo .venv/bin/pip install -r requirements.txt
```

## 6. Production `.env`

```bash
sudo cp /opt/the-crew/backend/.env.example /opt/the-crew/backend/.env   # first time only
sudo nano /opt/the-crew/backend/.env     # GEMINI_API_KEY, ELEVENLABS_API_KEY, DATABASE_URL
sudo chown root:root /opt/the-crew/backend/.env
sudo chmod 600 /opt/the-crew/backend/.env
```

`FRONTEND_ORIGINS` is **not** needed for this same-origin setup. Set it only if a frontend on a
different origin calls the API directly.

If the Evidence Ledger is used, apply migrations once with
`cd /opt/the-crew/backend && sudo .venv/bin/python -m db.migrate`. This is idempotent and prints only versions.

## 7. systemd (backend)

```bash
sudo cp /opt/the-crew/deploy/the-crew.service /etc/systemd/system/the-crew.service
sudo systemctl daemon-reload
sudo systemctl enable --now the-crew
sudo systemctl restart the-crew
systemctl status the-crew --no-pager
```

Uvicorn binds to `127.0.0.1:8000` only. `--proxy-headers --forwarded-allow-ips 127.0.0.1` lets the
per-IP rate limits see each visitor's real address (taken from Nginx), not `127.0.0.1` for everyone.

## 8. Nginx (frontend + API proxy)

```bash
sudo cp /opt/the-crew/deploy/nginx.conf /etc/nginx/sites-available/the-crew
sudo ln -sf /etc/nginx/sites-available/the-crew /etc/nginx/sites-enabled/the-crew
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

What the config does:

- Serves `dist/`. `/assets/*` (fingerprinted) is cached for a year, and `index.html` is never cached.
- SPA fallback: unknown paths return `index.html`, while `/api/*` paths always go to FastAPI.
- `client_max_body_size 12m` for LIVE CALL audio segments. The backend's own cap is 10 MB, and the default
  Nginx limit of 1 MB would reject longer recordings.
- `proxy_read_timeout 90s`, which covers Gemini and ElevenLabs model fallback chains. Browser-side timeouts are 30–45 s.
- No WebSocket/SSE is used, so no upgrade headers are needed.

## 9. Firewall

Only SSH, HTTP and HTTPS should be reachable. Port 8000 is already loopback-only, and the firewall
is a second layer.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'      # 80 + 443
sudo ufw enable
sudo ufw status
```

If a **Vultr Firewall Group** is attached to the instance, allow TCP 22, 80 and 443 there too.

## 10. Health checks

On the server:

```bash
curl -s http://127.0.0.1:8000/api/health        # backend directly
curl -s http://127.0.0.1/api/health             # through Nginx
curl -s http://127.0.0.1/api/ledger/status      # Tiger Data ledger
curl -sI http://127.0.0.1/ | head -n 5          # frontend, 200
sudo ss -tlnp | grep -E ':(80|8000)\b'          # 8000 must show 127.0.0.1 only
```

From your laptop: `curl http://<server-ip>/api/health` should work, and `curl http://<server-ip>:8000/api/health`
must **fail**.

Survives reboot: `sudo reboot`, then repeat the checks. Both `the-crew` and `nginx` are enabled.

Logs: `journalctl -u the-crew -f`, `sudo tail -f /var/log/nginx/error.log`.

## 11. Optional: prewarm demo voice clips

The voice cache (`backend/.voice-cache/`) is git-ignored, so a fresh server starts empty and
generates each clip the first time it is played, using ElevenLabs credits. To pre-generate them once:

```bash
cd /opt/the-crew && sudo npm run prewarm:voice
```

## 12. Updating after a `git pull`

```bash
cd /opt/the-crew
sudo git pull --ff-only
sudo npm ci && sudo npm run build                        # if anything frontend-related changed
sudo backend/.venv/bin/pip install -r backend/requirements.txt   # if requirements changed
sudo systemctl restart the-crew                          # if backend code changed
# if deploy/ files changed:
#   sudo cp deploy/the-crew.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart the-crew
#   sudo cp deploy/nginx.conf /etc/nginx/sites-available/the-crew && sudo nginx -t && sudo systemctl reload nginx
curl -s http://127.0.0.1/api/health
```

`vite build` empties `dist/` first, so the site is blank for a second or two while it rebuilds.
Nginx doesn't need a reload for frontend-only changes.

---

## Next step: domain + HTTPS

Do this only once a real domain points at the server. **The browser microphone (LIVE CALL → mic)
only works over HTTPS**, because browsers block `getUserMedia` on plain `http://<ip>`. Over HTTP, LIVE
CALL still works with **LOAD DEMO AUDIO**, and every other feature works normally.

1. At the registrar (e.g. GoDaddy), add DNS `A` records for `@` and `www` pointing to the server's IPv4.
   Wait until `dig +short your-domain.example` returns that IP.
2. In `/etc/nginx/sites-available/the-crew`, replace `server_name _;` with
   `server_name your-domain.example www.your-domain.example;`, then run `sudo nginx -t && sudo systemctl reload nginx`.
3. Get the certificate. Certbot edits the Nginx site in place, adds the 443 server and the HTTP→HTTPS
   redirect, and installs auto-renewal:

   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.example -d www.your-domain.example
   sudo certbot renew --dry-run
   ```

4. After certbot, **don't** re-copy `deploy/nginx.conf` over the live site file, or you'll lose the TLS
   blocks. Make further edits in `/etc/nginx/sites-available/the-crew` directly.
5. `FRONTEND_ORIGINS` still isn't needed, because the site and `/api` share the HTTPS origin.
