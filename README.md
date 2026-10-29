# TL Lab Hub

TL Lab（Lab 911）內部使用的網頁系統，取代原本 Notion 上的實驗室 Team space。

- **About the team**：Team Members、Projects、Tasks、Publication Tracker
- **Resources**：Orientation Guide、FAQ、Software and Tools、Pipelines、Meeting Summary
- 首頁 Dashboard 一覽實驗室現況

技術：Next.js（App Router）+ TypeScript + Tailwind CSS + shadcn/ui，後端 Supabase（PostgreSQL + Auth + Storage）。部署方式：資料庫、登入、檔案使用 **Supabase Cloud**，網頁跑在實驗室的 **Ubuntu 18.04.6 LTS** 主機（見下方〈部署〉）。

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
scripts/db-backup.sh   匯出資料備份
scripts/db-restore.sh  把備份還原到新的 Supabase 專案
scripts/test-db.sh     在暫存 PostgreSQL 上跑完整測試
deploy/nginx/          Nginx 反向代理設定
Dockerfile             網頁的容器映像（Node.js 20）
docker-compose.yml     網頁服務
docs/                  資料庫 schema、ER 圖、權限說明
```

Schema、ER 圖與權限說明見 [docs/database-schema.md](docs/database-schema.md)。

---

# 部署：Supabase Cloud + Ubuntu 18.04.6 LTS

## 架構

```
使用者瀏覽器 ──HTTPS──► Ubuntu 18.04 主機
                         ├─ Nginx（80/443）
                         └─ Docker：tllab-hub-web（Next.js，Node.js 20，127.0.0.1:3000）
                                     │
                                     ▼ HTTPS
                         Supabase Cloud（PostgreSQL、登入、檔案儲存）
```

- **主機需求**：x86_64、2 核心、2 GB RAM（另加 swap 供編譯用）、20 GB 硬碟。
- **網路需求**：主機要能連到外網的 `*.supabase.co`（443 port），以及 Docker Hub（下載映像）。如果學校網路需要 proxy，要另外設定 Docker 的 proxy。
- **資料備份、資料庫升級**由 Supabase 負責；主機上只有網頁程式，沒有資料。

## 先了解 Ubuntu 18.04 的限制

| 問題 | 原因 | 本專案的做法 |
|---|---|---|
| 無法直接安裝 Node.js 18 以上版本 | 18.04 的 glibc 是 2.27，Node.js 18 起的官方版需要 glibc 2.28；`apt` 內建的 nodejs 只有 8.x | **Node.js 跑在 Docker 容器內**（`node:20-alpine`），主機不裝 Node.js |
| Docker 新版不再支援 18.04 | Docker 官方套件庫對 bionic 的最後版本是 Engine 24.0.2、Compose 2.18.1、buildx 0.10.5 | 直接安裝這些版本，本專案用得到的功能都支援 |
| 內建 `psql` 是 10 版 | 版本太舊 | `scripts/db-apply.sh` 改用 `postgres:15-alpine` 容器裡的 psql |
| 18.04 標準支援已在 2023 年 5 月結束 | 不再有一般安全更新 | 建議啟用 Ubuntu Pro（個人免費 5 台，ESM 安全更新到 2028 年），並規劃升級到 22.04/24.04。主機上沒有資料，日後換主機只要重新部署網頁 |

## Supabase 免費方案須知

以下是撰寫時的限制，實際以 [官方價格頁](https://supabase.com/pricing) 為準：

- **連續 7 天沒有任何存取，專案會被暫停**。到 Dashboard 按 Restore 即可恢復，資料不會遺失。實驗室每天都在用，通常不會遇到。
- 資料庫 500 MB、檔案儲存 1 GB。純文字資料對 20 人的實驗室綽綽有餘；如果會上傳大量圖片或附件，再考慮升級 Pro。
- **不提供可下載的備份**，請依〈日常維運 → 備份〉自行定期匯出。
- 內建寄信服務每小時只能寄很少封，而且只寄給專案團隊成員。要用 **Email 登入**，就必須設定自己的 SMTP（見步驟 6）。

## 關於網域與 HTTPS

在這個架構下，Google 登入的 redirect URI 是 Supabase 的網址（`https://<ref>.supabase.co/auth/v1/callback`），所以**主機沒有公開網域也能用 Google 登入**。登入後瀏覽器會跳回網頁網址，只要你的電腦連得到主機就行，內網 IP 也可以。

| 情境 | 網頁網址 | 費用 | 條件 |
|---|---|---|---|
| 只在實驗室／校內使用 | `http://<主機 IP>` | 免費 | 使用者要在同一個網路（或學校 VPN）內；不需要 HTTPS |
| 系所或計中核發的子網域（最建議） | `https://hub.<系所網域>` | 免費 | 向系上或計中申請 DNS 紀錄；憑證用 certbot（步驟 9） |
| Tailscale Funnel | `https://<主機名>.<tailnet>.ts.net` | 免費 | **不需要開放對外連接埠**，校外也能連，HTTPS 自動處理（見〈附錄：免費網址〉） |
| DuckDNS 等免費 DDNS | `https://<名稱>.duckdns.org` | 免費 | 主機要有公開 IP，且學校防火牆允許校外連入 80/443 |

建議先用 `http://<主機 IP>` 完成開發與測試，之後再換成正式網址。要換網址時，只需改 Supabase 的 URL Configuration 和 `.env` 的 `NEXT_PUBLIC_SITE_URL`，再重新編譯網頁；Google 那邊不用改。

以下範例使用 `hub.example.edu.tw`，請換成你的網域或 `http://<主機 IP>`。

---

## 步驟 1：系統準備

確認系統（`uname -m` 必須是 `x86_64`）：

```bash
uname -m && lsb_release -d && free -h && df -h /
```

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg git ufw
sudo timedatectl set-timezone Asia/Taipei
```

RAM 小於 4 GB 時加上 swap（Next.js 編譯時需要）：

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 步驟 2：安裝 Docker

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
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

讓目前使用者不用 sudo 就能執行 docker（設定後要登出再登入）：

```bash
sudo usermod -aG docker $USER
```

重新登入後確認：

```bash
docker version --format '{{.Server.Version}}'
docker compose version
docker run --rm hello-world
```

預期輸出：Docker `24.0.2`、Docker Compose `v2.18.1`，最後一行指令會印出 `Hello from Docker!`。

## 步驟 3：防火牆

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> ⚠️ Docker 發布的連接埠會**繞過 ufw**。`docker-compose.yml` 裡網頁的連接埠只綁定 `127.0.0.1:3000`，對外一律經由 Nginx。修改設定時請保留 `127.0.0.1:` 前綴。

## 步驟 4：取得程式碼

```bash
sudo mkdir -p /opt/tllab && sudo chown $USER /opt/tllab
cd /opt/tllab
git clone https://github.com/kevin00744/tllab-web.git
cd tllab-web
```

## 步驟 5：建立 Supabase 專案並套用 schema

1. 到 <https://supabase.com> 註冊（建議用實驗室共用帳號），建立 New project：
   - Region：**Northeast Asia (Tokyo)**（離台灣最近）
   - Database Password：設一組強密碼並記下來
2. 專案建立後，按上方 **Connect**，複製 **Session pooler** 的連線字串。
   - 不要用 Direct connection：那個只支援 IPv6，多數校園網路連不到。
   - Session pooler 的格式像這樣：`postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`
3. 在主機上套用 schema 與示範資料。把連線字串中的 `[YOUR-PASSWORD]` 換成密碼，並保留外面的單引號：

   ```bash
   cd /opt/tllab/tllab-web
   DATABASE_URL='postgresql://postgres.<ref>:<密碼>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres' scripts/db-apply.sh --seed
   ```

   - 不要示範資料就拿掉 `--seed`。
   - 之後有新的 migration 再執行一次即可，已套用的會自動跳過。

   成功時最後會印出 `✓ 完成`。也可以到 Dashboard → **Table Editor** 確認，應該會看到 `members`、`projects`、`tasks` 等資料表。

## 步驟 6：設定登入

Supabase Dashboard → **Authentication**：

1. **URL Configuration**
   - Site URL：`https://hub.example.edu.tw`（或 `http://<主機 IP>`）
   - Redirect URLs：新增 `https://hub.example.edu.tw/**`
2. **Sign In / Providers → Google**：開啟，填入 Client ID 與 Client Secret（取得方式見〈附錄：Google 登入〉）。
3. **Email 登入**（可選）：Email provider 預設已開啟。要寄驗證信給一般成員，必須到 **Emails → SMTP Settings** 設定自己的 SMTP：
   - 學校信箱：填學校 SMTP 主機。
   - Gmail：`smtp.gmail.com`、port `587`，使用者是 Gmail 帳號，密碼用「應用程式密碼」。
4. **（強烈建議）關閉公開註冊**：在 Sign In / Providers 關閉 **Allow new users to sign up**。
   - 原因：自行註冊的帳號雖然只會是 viewer，但 viewer **可以讀取實驗室所有資料**。
   - 關閉後，由 Admin 到 Authentication → Users → **Add user** 新增成員：
     - **Send invitation**：寄邀請信，需要已設定 SMTP。
     - **Create new user**：不寄信。輸入成員的 Google 信箱、任意密碼，並勾選 Auto Confirm User。之後成員用同一個 Google 帳號登入，就會自動連結。

## 步驟 7：建立第一位 Admin

`seed.sql` 預設 PI 的 email 是占位值 `pi@tllab.example`。請到 Supabase Dashboard → **SQL Editor** 執行下面的指令，改成 PI 實際的登入信箱。PI 第一次登入時就會自動綁定為 Admin。

```sql
update public.members set email = '<PI 的登入信箱>' where position = 'pi';
```

已經登入過、目前是 viewer 的帳號，也可以直接提升權限：

```sql
update public.members set app_role = 'admin' where email = '<信箱>';
```

## 步驟 8：部署網頁（階段 2 完成後適用）

到 Supabase Dashboard → **Project Settings → API**（新版介面為 **API Keys**）取得：
- Project URL
- `anon`（public）key
- `service_role` key

建立設定檔：

```bash
cd /opt/tllab/tllab-web
cp .env.example .env
chmod 600 .env
nano .env
```

在 `.env` 填入：

```ini
NEXT_PUBLIC_SITE_URL=https://hub.example.edu.tw
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

> `service_role` key 擁有資料庫完整權限，只能放在主機的 `.env`，不可以提交到 git、也不可以給別人。`.env` 已列在 `.gitignore`。

編譯並啟動（第一次編譯約需 3–10 分鐘）：

```bash
docker compose up -d --build
docker compose logs -f web
```

看到 `Ready` 之後按 Ctrl+C 離開 log。本機測試，應回傳 `HTTP/1.1 200`：

```bash
curl -I http://127.0.0.1:3000
```

`NEXT_PUBLIC_*` 會在編譯時寫入網頁，修改後要重新執行 `docker compose up -d --build`。

> 主機 RAM 不夠編譯時，可以在其他電腦編譯好再傳過去。在那台電腦先準備好同樣的 `.env`，然後執行 `docker compose build`，再執行 `docker save tllab-hub-web:latest | ssh <主機> docker load`。最後在主機上執行 `docker compose up -d`。

## 步驟 9：Nginx 與 HTTPS

18.04 內建的 Nginx 1.14 就夠用：

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx/tllab-hub.conf /etc/nginx/sites-available/tllab-hub.conf
sudo nano /etc/nginx/sites-available/tllab-hub.conf
```

在設定檔中，把 `server_name hub.example.edu.tw;` 改成你的網域；沒有網域就改成 `server_name _;`。

啟用設定：

```bash
sudo ln -s /etc/nginx/sites-available/tllab-hub.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

有網域時，用 snap 安裝新版 certbot 申請 Let's Encrypt 憑證（apt 上的版本太舊）。憑證會自動續期：

```bash
sudo snap install core && sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d hub.example.edu.tw
sudo certbot renew --dry-run
```

申請前要確認兩件事：網域已在 DNS 指向這台主機，而且 80 port 能從校外連到。如果學校防火牆擋住校外連線，請找計中開通，或改用計中核發的憑證。

完成後用瀏覽器開 `https://hub.example.edu.tw`，用 Google 帳號登入測試。

---

## 日常維運

### 更新版本

```bash
cd /opt/tllab/tllab-web
git pull
DATABASE_URL='<Session pooler 連線字串>' scripts/db-apply.sh
docker compose up -d --build
docker image prune -f
```

### 開機自動啟動

Docker 預設會開機啟動，網頁容器設定了 `restart: unless-stopped`，主機重開機後會自動恢復，不需另外設定 systemd。確認方式：

```bash
systemctl is-enabled docker
```

### 備份

Supabase 免費方案不提供可下載的備份，請在主機上排程每天匯出。

把連線字串存成只有自己能讀的檔案：

```bash
echo "DATABASE_URL='<Session pooler 連線字串>'" > /opt/tllab/db.env
chmod 600 /opt/tllab/db.env
```

先手動備份一次（備份檔存到 `/opt/tllab/backups`，保留 30 天）：

```bash
bash -c 'set -a; source /opt/tllab/db.env; /opt/tllab/tllab-web/scripts/db-backup.sh /opt/tllab/backups 30'
```

用 `crontab -e` 加入下面這行，每天 03:30 自動備份：

```
30 3 * * * bash -c 'set -a; source /opt/tllab/db.env; /opt/tllab/tllab-web/scripts/db-backup.sh /opt/tllab/backups 30' >> /opt/tllab/backups/backup.log 2>&1
```

備份內容：
- **包含**所有實驗室資料（`public` schema 的資料）。
- **不含登入帳號**：還原後成員重新登入，就會依 email 自動綁定回原本的成員資料。
- **不含 Storage 裡上傳的檔案**：檔案可以在 Dashboard → Storage 下載。

請另外把 `/opt/tllab/backups` 同步到實驗室 NAS。

**還原**到新的 Supabase 專案時，先套用 schema（不要加 `--seed`），再匯入備份：

```bash
DATABASE_URL='<新專案的連線字串>' scripts/db-apply.sh
```

```bash
DATABASE_URL='<新專案的連線字串>' scripts/db-restore.sh /opt/tllab/backups/tllab-XXXXXXXX-XXXX.dump
```

`db-restore.sh` 不需要 superuser 權限，並在單一交易中完成，失敗時不會留下一半的資料。`scripts/test-db.sh` 每次都會實際測試「備份 → 還原到空資料庫」。

### 常見問題

| 狀況 | 解法 |
|---|---|
| `node: ... version 'GLIBC_2.28' not found` | 主機上直接跑了 Node.js 18 以上版本，請改用 Docker（步驟 8） |
| `db-apply.sh` 卡住或 `could not translate host name` | 用了 Direct connection（只支援 IPv6），改用 **Session pooler** 連線字串；或學校網路擋住 5432 port |
| `password authentication failed` | 連線字串的密碼不對；密碼有特殊字元時要做 URL 編碼（例如 `@` → `%40`），或到 Database Settings 重設成只有英數字的密碼 |
| 網站打不開，Dashboard 顯示 Paused | 免費專案 7 天沒有使用被暫停，在 Dashboard 按 Restore |
| Google 登入出現 `redirect_uri_mismatch` | Google Console 的 redirect URI 必須完全等於 `https://<ref>.supabase.co/auth/v1/callback` |
| 登入後跳到 `localhost:3000` | Supabase 的 Site URL／Redirect URLs 沒改成正式網址（步驟 6） |
| 成員收不到 Email 登入信 | 還沒設定自訂 SMTP（步驟 6-3） |
| 編譯時出現 `Killed` | RAM 不足，加 swap（步驟 1）或在別台電腦編譯 |
| `docker pull` 逾時 | 學校網路需要 proxy：在 `/etc/systemd/system/docker.service.d/proxy.conf` 設定 `HTTP_PROXY`／`HTTPS_PROXY` 後重啟 Docker |

---

## 附錄：Google 登入設定

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立專案，再進入 **APIs & Services → OAuth consent screen**：
   - 學校有 Google Workspace，而且只給校內帳號登入：User type 選 **Internal**。
   - 否則選 **External**，填好應用程式名稱與聯絡信箱後按 **Publish app**；不發布的話，只有列為測試使用者的帳號能登入。
2. **Credentials → Create credentials → OAuth client ID**，Application type 選 **Web application**：
   - Authorized JavaScript origins：可以不填。Google 不接受內網 IP，而登入流程也用不到這個欄位。
   - Authorized redirect URIs：`https://<ref>.supabase.co/auth/v1/callback`
     （Supabase Dashboard → Authentication → Providers → Google 頁面上可直接複製這個網址）
3. 把產生的 Client ID 與 Client Secret 填回 Supabase 的 Google provider（步驟 6-2）。

## 附錄：免費網址

先在主機上確認是否有公開 IP：

```bash
hostname -I; curl -s https://ifconfig.me; echo
```

兩個指令印出相同的 IP 時，主機就有公開 IP，可以考慮 DuckDNS。不同的話（例如 `192.168.x.x` 與另一個 IP），主機在 NAT 後面，請用 Tailscale Funnel。

### Tailscale Funnel（不需開放連接埠）

1. 到 <https://tailscale.com> 用實驗室 Google 帳號註冊（個人方案免費）。
2. 到管理頁面 **DNS** 啟用 MagicDNS 與 HTTPS Certificates。
3. 在主機上安裝並登入。安裝程式支援 Ubuntu 18.04，`tailscale up` 會印出一個網址，用瀏覽器開啟並登入：

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

   ```bash
   sudo tailscale up
   ```

4. 把 Nginx（80 port）公開成 HTTPS 網址。第一次執行時，如果提示要到管理頁面允許 Funnel，照著網址開啟即可：

   ```bash
   sudo tailscale funnel --bg 80
   ```

   ```bash
   tailscale funnel status
   ```

5. `tailscale funnel status` 會顯示網址，例如 `https://tllab-1112.<tailnet>.ts.net`。把它填到 Supabase 的 Site URL 與 Redirect URLs，以及 `.env` 的 `NEXT_PUBLIC_SITE_URL`。這個方式**不需要 certbot**。

### DuckDNS（需要公開 IP）

1. 到 <https://www.duckdns.org> 用 Google 帳號登入，建立子網域（例如 `tllab911.duckdns.org`），記下 token。
2. 每 5 分鐘更新一次 IP：用 `crontab -e` 加入下面這行。

   ```
   */5 * * * * curl -s "https://www.duckdns.org/update?domains=tllab911&token=<token>&ip=" > /dev/null
   ```

3. 確認校外連得到主機的 80/443 port 後，依步驟 9 用 certbot 申請憑證（`-d tllab911.duckdns.org`）。

## 開發者：本機測試 schema

需要 PostgreSQL 16 執行檔（`/usr/lib/postgresql/16/bin`）：

```bash
scripts/test-db.sh
```

這個腳本會在暫存資料庫上模擬 Supabase 的 `auth`／`storage` schema，執行 `db-apply.sh` 兩次（第二次應全部略過），再跑權限測試。
