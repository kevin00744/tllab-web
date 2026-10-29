# TL Lab Hub

TL Lab（Lab 911）內部使用的網頁系統，取代原本 Notion 上的實驗室 Team space。

- **About the team**：Team Members、Projects、Tasks、Publication Tracker
- **Resources**：Orientation Guide、FAQ、Software and Tools、Pipelines、Meeting Summary
- 首頁 Dashboard 一覽實驗室現況

技術：Next.js（App Router）+ TypeScript + Tailwind CSS + shadcn/ui，後端 Supabase（PostgreSQL + Auth + Storage）。部署目標為實驗室自有的 **Ubuntu 18.04.6 LTS** 主機（見下方〈部署〉）。

## 開發進度

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | 資料庫 schema 與資料表關聯 | ✅ 待確認 |
| 2 | 版面架構（側邊欄 + 路由）與登入 | ⏳ |
| 3 | Dashboard 首頁 | ⏳ |
| 4 | Projects、Tasks、Publication Tracker | ⏳ |
| 5 | Team Members | ⏳ |
| 6 | Resources 各子頁面 | ⏳ |
| 7 | 全站搜尋、權限、活動紀錄、深色模式 | ⏳ |
| 8 | 從 Notion 匯入資料（CSV／Markdown） | ⏳ |

> 目前只完成階段 1（資料庫）。下方的資料庫部署現在就能用；「部署網頁」一節要等階段 2 建立前端後才能執行。

## 專案結構

```
supabase/migrations/   資料庫 schema（依序套用）
supabase/seed.sql      示範資料
supabase/tests/        schema／權限測試
scripts/db-apply.sh    套用 migrations（可重複執行，已套用的會跳過）
scripts/test-db.sh     在暫存 PostgreSQL 上跑完整測試
deploy/                自架 Supabase 覆寫設定、Nginx 設定
Dockerfile             網頁的容器映像（Node.js 20）
docker-compose.yml     網頁服務
docs/                  資料庫 schema、ER 圖、權限說明
```

Schema、ER 圖與權限說明見 [docs/database-schema.md](docs/database-schema.md)。

---

# 部署：Ubuntu 18.04.6 LTS

## 先了解 Ubuntu 18.04 的限制

| 問題 | 原因 | 本專案的做法 |
|---|---|---|
| 無法直接安裝 Node.js 18 以上版本 | 18.04 的 glibc 是 2.27，Node.js 18 起的官方版需要 glibc 2.28；`apt` 內建的 nodejs 只有 8.x | **Node.js 跑在 Docker 容器內**（`node:20-alpine`），主機不裝 Node.js |
| Docker 新版不再支援 18.04 | Docker 官方套件庫對 bionic 的最後版本是 Engine **24.0.2**、buildx 0.10.5、Compose 2.18.1 | Engine 用 apt 安裝 24.0.2；Compose 改裝 **v2.29.7** 的單一執行檔，它不依賴系統函式庫 |
| 內建 `psql` 是 10 版 | 版本太舊 | `scripts/db-apply.sh` 用 `postgres:15-alpine` 容器裡的 psql |
| 18.04 標準支援已在 2023 年 5 月結束 | 不再有一般安全更新 | 建議啟用 Ubuntu Pro（個人免費 5 台，ESM 安全更新到 2028 年），並規劃升級到 22.04/24.04。服務都在容器裡，日後升級主機時只要搬資料 |

## 選擇架構

| | 方案 A：Supabase Cloud（推薦） | 方案 B：完全自架 |
|---|---|---|
| 資料庫、登入、檔案 | Supabase 雲端（免費方案即可） | 同一台主機上用 Docker 跑 Supabase |
| 主機上跑什麼 | 只有網頁容器＋Nginx | 網頁＋約 12 個 Supabase 容器＋Nginx |
| 主機需求 | 2 核心、2 GB RAM（另加 2 GB swap 供編譯）、20 GB 硬碟 | 4 核心、**8 GB RAM**（最低 4 GB）、50 GB 以上硬碟 |
| 維運 | 備份、升級由 Supabase 負責 | 要自己備份、更新 |
| 適合 | 想省事；資料可以放雲端 | 資料必須留在實驗室 |

**登入相關的網路需求（兩種方案都一樣）：**
- **Google 登入**需要公開網域與 HTTPS，例如 `hub.<系所網域>`。Google 不接受內網 IP 當作 redirect URI。
- 主機如果只在校內網路、沒有公開網域，就只能用 **Email 登入**，而且要設定 SMTP（可用學校信箱或 Gmail 應用程式密碼）寄驗證信。

以下範例使用 `hub.example.edu.tw`（網頁）與 `supabase.example.edu.tw`（方案 B 的 API），請換成你的網域。

---

## 步驟 1：系統準備

```bash
uname -m                     # 必須是 x86_64
lsb_release -d               # Ubuntu 18.04.6 LTS
free -h && df -h /           # 確認 RAM 與硬碟空間
```

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg git openssl ufw
sudo timedatectl set-timezone Asia/Taipei
```

RAM 小於 4 GB 時加上 swap（Next.js 編譯時需要）：

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 步驟 2：安裝 Docker Engine 24.0.2

如果曾經裝過舊版 Docker，先移除：

```bash
sudo apt-get remove -y docker docker-engine docker.io containerd runc docker-compose
```

加入 Docker 官方套件庫（bionic）並安裝：

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu bionic stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
```

鎖定版本，避免 `apt upgrade` 時被更動：

```bash
sudo apt-mark hold docker-ce docker-ce-cli containerd.io docker-buildx-plugin
```

讓目前使用者不用 sudo 就能執行 docker（設定後要重新登入）：

```bash
sudo usermod -aG docker $USER
```

## 步驟 3：安裝 Docker Compose v2.29.7

apt 上給 bionic 的 Compose 只到 2.18.1，但自架 Supabase 的覆寫設定需要 2.24.4 以上。所以改裝官方的單一執行檔，它不依賴系統函式庫，可以在 18.04 上執行：

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

重新登入後確認：

```bash
docker version --format '{{.Server.Version}}'
docker compose version
docker run --rm hello-world
```

預期輸出：Docker `24.0.2`、Compose `v2.29.7`，最後一行指令會印出 `Hello from Docker!`。

## 步驟 4：防火牆

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> ⚠️ Docker 發布的連接埠會**繞過 ufw**。本專案所有容器的連接埠都只綁定 `127.0.0.1`（`docker-compose.yml`、`deploy/supabase/docker-compose.tllab.yml`），對外一律經由 Nginx。修改設定時請保留 `127.0.0.1:` 前綴。

## 步驟 5：取得程式碼

```bash
sudo mkdir -p /opt/tllab && sudo chown $USER /opt/tllab
cd /opt/tllab
git clone https://github.com/kevin00744/tllab-web.git
cd tllab-web
```

---

## 步驟 6A：資料庫使用 Supabase Cloud（方案 A）

1. 到 <https://supabase.com> 建立專案，Region 選 **Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**。
2. **Project Settings → Database → Connection string → URI** 複製連線字串。
3. 套用 schema 與示範資料（用容器內的 psql 15）：

   ```bash
   DATABASE_URL='postgresql://postgres.<ref>:<密碼>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres' scripts/db-apply.sh --seed
   ```

   不要示範資料就拿掉 `--seed`。之後有新的 migration 再執行一次即可，已套用的會自動跳過。

4. **Authentication → URL Configuration**
   - Site URL：`https://hub.example.edu.tw`
   - Redirect URLs：`https://hub.example.edu.tw/**`
5. **Authentication → Providers**
   - Email：預設已啟用。
   - Google：填入 Client ID／Secret（見〈附錄：Google 登入〉）。
6. **Project Settings → API** 記下 Project URL、`anon` key、`service_role` key，步驟 7 會用到。

接著跳到〈步驟 7：部署網頁〉。

## 步驟 6B：自架 Supabase（方案 B）

### 6B-1 下載 Supabase 自架檔案

```bash
cd /opt/tllab
git clone --depth 1 https://github.com/supabase/supabase.git supabase-src
mkdir supabase-docker
cp -rf supabase-src/docker/* supabase-docker/
cp supabase-src/docker/.env.example supabase-docker/.env
cp tllab-web/deploy/supabase/docker-compose.tllab.yml supabase-docker/
cd supabase-docker
```

### 6B-2 產生密鑰

Supabase 附的產生器只需要 `openssl`，18.04 內建的 OpenSSL 1.1.1 可以直接用：

```bash
sh utils/generate-keys.sh --update-env
```

這會把 `.env` 裡的 `POSTGRES_PASSWORD`、`JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY`、`DASHBOARD_PASSWORD` 等預設值換成隨機值。

> `utils/add-new-auth-keys.sh`（新版非對稱金鑰）需要 Node.js 16 以上；主機沒有 Node.js 時它會自動改用 Docker 執行。這一步可選，用原本的 `ANON_KEY`／`SERVICE_ROLE_KEY` 就能運作。

### 6B-3 編輯 `.env`

```bash
nano .env
```

至少要改這些值：

```ini
# 套用 TL Lab 覆寫設定：連接埠只綁 127.0.0.1、啟用 Google 登入
COMPOSE_FILE=docker-compose.yml:docker-compose.tllab.yml

# 對外網址（經由 Nginx + HTTPS）
SUPABASE_PUBLIC_URL=https://supabase.example.edu.tw
API_EXTERNAL_URL=https://supabase.example.edu.tw/auth/v1
SITE_URL=https://hub.example.edu.tw
ADDITIONAL_REDIRECT_URLS=https://hub.example.edu.tw/**

# Studio 管理介面帳號（密碼已由 generate-keys.sh 產生）
DASHBOARD_USERNAME=tllab-admin

# Email 登入：設定 SMTP 寄驗證信
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
SMTP_ADMIN_EMAIL=lab911@example.edu.tw
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=lab911@example.edu.tw
SMTP_PASS=<應用程式密碼>
SMTP_SENDER_NAME=TL Lab Hub

# Google 登入（沒有公開網域就設 false）
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=<Google OAuth Client ID>
GOOGLE_SECRET=<Google OAuth Client Secret>
```

`.env` 裡其他標示 `your-...`／`this_password_is_insecure...` 的值也要全部改掉。

> Supabase 的 `.env` 欄位會隨版本調整；若名稱和上面不同，以 `supabase-src/docker/.env.example` 的註解為準。

### 6B-4 啟動

```bash
docker compose pull
docker compose up -d
docker compose ps
```

約 1–2 分鐘後，`docker compose ps` 裡所有服務都應顯示 `healthy` 或 `running`。

### 6B-5 確認連接埠只開在本機

```bash
sudo ss -tlnp | grep -E ':(8000|5432|6543)\b'
```

每一行都必須是 `127.0.0.1:...`。如果看到 `0.0.0.0`，就是覆寫設定沒有生效：檢查 `.env` 的 `COMPOSE_FILE`，以及 `docker compose version` 是否 ≥ 2.24.4。

### 6B-6 套用 TL Lab Hub schema

必須等 Supabase 全部服務啟動完成再執行，因為 `storage` schema 是由 storage 服務建立的：

```bash
cd /opt/tllab/tllab-web
DB_CONTAINER=supabase-db scripts/db-apply.sh --seed
```

### 6B-7 Studio 管理介面

Studio 經由 Nginx 的 `https://supabase.example.edu.tw/` 開啟，需要 `DASHBOARD_USERNAME`／`DASHBOARD_PASSWORD` 登入，而且 Nginx 只允許你設定的網段連線。

不想對外開放 Studio 時，可以從自己的電腦用 SSH 通道連線，再用瀏覽器開 `http://localhost:8000`：

```bash
ssh -L 8000:127.0.0.1:8000 <帳號>@<主機>
```

API 位址（步驟 7 用）：`https://supabase.example.edu.tw`；金鑰是 `.env` 裡的 `ANON_KEY` 和 `SERVICE_ROLE_KEY`。

---

## 步驟 7：部署網頁（階段 2 完成後適用）

```bash
cd /opt/tllab/tllab-web
cp .env.example .env
nano .env
```

在 `.env` 填入網址與金鑰：

```ini
NEXT_PUBLIC_SITE_URL=https://hub.example.edu.tw
# 方案 A：https://<ref>.supabase.co；方案 B：https://supabase.example.edu.tw
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

編譯並啟動（第一次編譯約需 3–10 分鐘）：

```bash
docker compose up -d --build
docker compose logs -f web
```

本機測試，應回傳 `HTTP/1.1 200`：

```bash
curl -I http://127.0.0.1:3000
```

`NEXT_PUBLIC_*` 會在編譯時寫入網頁，修改後要重新 `docker compose up -d --build`。

> 主機 RAM 不夠編譯時，可以在其他電腦 `docker build` 後用 `docker save | ssh 主機 docker load` 傳過去，再 `docker compose up -d`。

## 步驟 8：Nginx 與 HTTPS

18.04 內建的 Nginx 1.14 就夠用：

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx/tllab-hub.conf /etc/nginx/sites-available/tllab-hub.conf
sudo nano /etc/nginx/sites-available/tllab-hub.conf
```

編輯時要做兩件事：
- 把網域改成你的網域。
- 方案 A 刪除 `supabase.example.edu.tw` 那一段；方案 B 把 Studio 的 `allow` 網段改成實驗室網段。

啟用設定：

```bash
sudo ln -s /etc/nginx/sites-available/tllab-hub.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

用 snap 安裝新版 certbot 申請 Let's Encrypt 憑證（apt 上的版本太舊），會自動續期：

```bash
sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d hub.example.edu.tw -d supabase.example.edu.tw
sudo certbot renew --dry-run
```

方案 A 只要 `-d hub.example.edu.tw`。網域必須先在 DNS 指向這台主機，並且 80 port 能從外部連到。

> 沒有公開網域、只在校內使用時：跳過 certbot，用 `http://<主機 IP>` 連線，並把所有設定中的網址改成 `http://<主機 IP>`（方案 B 的 API 可改用 `http://<主機 IP>:8000`）。這時只能用 Email 登入。

## 步驟 9：建立第一位 Admin

`seed.sql` 預設 PI 的 email 是占位值 `pi@tllab.example`。請在 Supabase Studio（SQL Editor）把它改成 PI 實際的登入信箱，PI 第一次登入時就會自動綁定為 Admin。其他成員之後由 Admin 在系統內新增。

```sql
update public.members set email = '<PI 的登入信箱>' where position = 'pi';
```

已經登入過、目前是 viewer 的帳號，也可以直接提升權限：

```sql
update public.members set app_role = 'admin' where email = '<信箱>';
```

---

## 日常維運

### 更新版本

```bash
cd /opt/tllab/tllab-web
git pull
DB_CONTAINER=supabase-db scripts/db-apply.sh
docker compose up -d --build
```

方案 A 的 `scripts/db-apply.sh` 改用 `DATABASE_URL=...`。

### 開機自動啟動

Docker 服務本身預設開機啟動，容器都設定了 `restart: unless-stopped`，不需另外設定 systemd。確認方式：

```bash
systemctl is-enabled docker
```

### 備份（方案 B）

建立 `/opt/tllab/backup.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail
DEST=/opt/tllab/backups
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M)
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$DEST/db-$STAMP.dump"
tar -czf "$DEST/storage-$STAMP.tar.gz" -C /opt/tllab/supabase-docker/volumes storage
find "$DEST" -type f -mtime +14 -delete
```

設為可執行：

```bash
chmod +x /opt/tllab/backup.sh
```

用 `crontab -e` 加入下面這行，每天 03:30 備份一次：

```
30 3 * * * /opt/tllab/backup.sh >> /opt/tllab/backups/backup.log 2>&1
```

請另外把 `/opt/tllab/backups` 同步到實驗室 NAS 或其他機器。還原資料庫：

```bash
docker exec -i supabase-db pg_restore -U postgres -d postgres --clean --if-exists < db-XXXX.dump
```

還原前請先停止網頁與 Supabase 的 auth 服務，並建議先在測試機演練一次。

方案 A：Supabase 免費方案不提供可下載的備份，請自行定期匯出：

```bash
docker run --rm --network host postgres:15-alpine pg_dump "$DATABASE_URL" -Fc > db-$(date +%Y%m%d).dump
```

### 常見問題

| 狀況 | 解法 |
|---|---|
| `node: /lib/x86_64-linux-gnu/libc.so.6: version 'GLIBC_2.28' not found` | 主機上直接跑了 Node.js 18 以上版本，請改用 Docker（步驟 7） |
| `docker: 'compose' is not a docker command` | 步驟 3 的檔案路徑或權限不對 |
| `ports: !override` 相關錯誤 | Compose 版本低於 2.24.4，重做步驟 3 |
| Supabase 容器一直重啟 | `docker compose logs <服務名稱>`；多半是 `.env` 密鑰格式錯誤或 RAM 不足（`free -h`） |
| `db-apply.sh` 出現 `schema "storage" does not exist` | Supabase 還沒完全啟動，等 `docker compose ps` 全部 healthy 再執行 |
| Google 登入出現 `redirect_uri_mismatch` | Google Console 的 redirect URI 要和下方附錄完全相同 |
| 編譯時被 `Killed` | RAM 不足，加 swap（步驟 1）或在別台電腦編譯 |
| 時間顯示差 8 小時 | 資料庫一律存 UTC，系統以 `lab_today()`／`Asia/Taipei` 計算；確認主機有執行 `timedatectl set-timezone Asia/Taipei` |

---

## 附錄：Google 登入設定

1. 到 [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → OAuth consent screen**。
   - 若有學校 Google Workspace 且只給校內帳號使用，選 Internal。
   - 否則選 External，並加入測試使用者或發布應用程式。
2. **Credentials → Create credentials → OAuth client ID → Web application**。
3. **Authorized redirect URIs** 填入：
   - 方案 A：`https://<ref>.supabase.co/auth/v1/callback`
   - 方案 B：`https://supabase.example.edu.tw/auth/v1/callback`
4. 把 Client ID／Secret 填入 Supabase：
   - 方案 A：Dashboard → Authentication → Providers → Google。
   - 方案 B：`.env` 的 `GOOGLE_CLIENT_ID`／`GOOGLE_SECRET`，然後重新啟動：

     ```bash
     cd /opt/tllab/supabase-docker && docker compose up -d
     ```

## 開發者：本機測試 schema

需要 PostgreSQL 16 執行檔（`/usr/lib/postgresql/16/bin`）：

```bash
scripts/test-db.sh
```

這個腳本會在暫存資料庫上模擬 Supabase 的 `auth`／`storage` schema，執行 `db-apply.sh` 兩次（第二次應全部略過），再跑權限測試。
