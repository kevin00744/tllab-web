# TL Lab Hub

TL Lab（Lab 911）內部使用的網頁系統，取代原本 Notion 上的實驗室 Team space。

- **About the team**：Team Members、Projects、Tasks、Publication Tracker
- **Resources**：Orientation Guide、FAQ、Software and Tools、Pipelines、Meeting Summary
- 首頁 Dashboard 一覽實驗室現況

技術：Next.js（App Router）+ TypeScript + Tailwind CSS + shadcn/ui，後端 Supabase（PostgreSQL + Auth + Storage）。部署方式：資料庫、登入、檔案使用 **Supabase Cloud**，網頁跑在實驗室的 **Ubuntu 18.04.6 LTS** 主機（見下方〈部署〉）。

## 開發進度

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | 資料庫 schema 與資料表關聯 | ✅ |
| 2 | 版面架構（側邊欄 + 路由）與登入 | ✅ |
| 3 | Dashboard 首頁 | ✅ 待確認 |
| 4 | Projects、Tasks、Publication Tracker | ⏳ |
| 5 | Team Members | ⏳ |
| 6 | Resources 各子頁面 | ⏳ |
| 7 | 全站搜尋、權限、活動紀錄、深色模式 | ⏳ |
| 8 | 從 Notion 匯入資料（CSV／Markdown） | ⏳ |

> 目前完成到階段 3：登入／邀請碼註冊、側邊欄與各頁路由、中英文切換、深淺色模式，以及 Dashboard（KPI、我的任務、專案進度、論文進度、近期會議、14 天截止日、快速連結）。其他模組頁面依階段陸續完成。

## 專案結構

```
src/app/(auth)/        登入、邀請碼註冊（未登入可進入）
src/app/(app)/         登入後的頁面：Dashboard 與各模組
src/app/api/health/    健康檢查（Docker healthcheck 用）
src/components/        版面（側邊欄、頁首）、表單、shadcn/ui 元件
src/lib/supabase/      Supabase 連線（瀏覽器、伺服器、service_role、proxy）
src/lib/i18n/          繁中／英文字典與語言切換
src/lib/status.ts      全站一致的狀態標籤色
src/proxy.ts           未登入導向登入頁、更新 session
supabase/migrations/   資料庫 schema（依序套用）
supabase/seed.sql      示範資料
supabase/tests/        schema／權限測試
scripts/               db-apply／db-backup／db-restore／test-db
deploy/nginx/          Nginx 反向代理設定
Dockerfile             網頁的容器映像（Node.js 22）
docker-compose.yml     網頁服務
docs/                  資料庫 schema、ER 圖、權限說明
```

## 本機開發（開發者電腦，不是 18.04 主機）

需要 Node.js 20.9 以上。先安裝套件並建立設定檔：

```bash
npm install
```

```bash
cp .env.example .env.local
```

在 `.env.local` 填入 Supabase 的網址與金鑰（同步驟 7），然後啟動開發伺服器，開 <http://localhost:3000>：

```bash
npm run dev
```

送出程式碼前執行檢查：

```bash
npm run lint && npm run typecheck && npm run build
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
- 內建寄信服務每小時只能寄很少封，而且只寄給專案團隊成員。本系統的邀請碼註冊不需要寄信，所以不受影響。

## 關於網域與 HTTPS

登入採 Email＋密碼＋邀請碼（步驟 6），由網頁伺服器端連到 Supabase 驗證，所以**主機不需要公開網域**，用內網 IP 也能登入。只要使用者的電腦連得到主機即可。

| 情境 | 網頁網址 | 費用 | 條件 |
|---|---|---|---|
| 只在實驗室／校內使用 | `http://<主機 IP>` | 免費 | 使用者要在同一個網路（或學校 VPN）內；不需要 HTTPS |
| 系所或計中核發的子網域（最建議） | `https://hub.<系所網域>` | 免費 | 向系上或計中申請 DNS 紀錄；憑證用 certbot（步驟 8） |
| Tailscale Funnel | `https://<主機名>.<tailnet>.ts.net` | 免費 | **不需要開放對外連接埠**，校外也能連，HTTPS 自動處理（見〈附錄：免費網址〉） |
| DuckDNS 等免費 DDNS | `https://<名稱>.duckdns.org` | 免費 | 主機要有公開 IP，且學校防火牆允許校外連入 80/443 |

建議先用 `http://<主機 IP>` 完成開發與測試，之後再換成正式網址。要換網址時，只需改 Supabase 的 URL Configuration 和 `.env` 的 `NEXT_PUBLIC_SITE_URL`，再重新編譯網頁。

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

## 步驟 6：設定登入（Email＋密碼＋邀請碼）

登入方式是 **Email＋密碼**。新成員註冊時必須輸入 Admin 產生的**邀請碼**：
- 註冊由網頁伺服器端驗證邀請碼後建立帳號，**不需要設定 SMTP 寄信**。
- 邀請碼可設定預設權限、職稱、限定 Email、可用次數與有效期限。
- 資料庫只存邀請碼的雜湊值，原文只在產生時顯示一次。

### 6-1 網址

Supabase Dashboard → **Authentication** → **URL Configuration**：
- **Site URL**：`http://<主機 IP>`（或 Tailscale／正式網址）
- **Redirect URLs**：新增 `http://<主機 IP>/**`

### 6-2 登入方式與密碼規則

Authentication → **Sign In / Providers**：
1. **User Signups** 區塊：關閉 **Allow new users to sign up**。
   - 關閉後，別人無法繞過邀請碼自行註冊。
   - 網頁的邀請碼註冊走伺服器端管理 API，不受這個開關影響。
2. **Email** provider：保持開啟。
   - **Minimum password length** 設為 `8`。
   - **Password Requirements** 選「Letters and digits」。
   - 按 **Save**。
3. 其他 provider（Google 等）保持關閉。

### 6-3 建立第一位 Admin

先在 **SQL Editor** 把示範資料中 PI 的 Email 改成實際要用的登入信箱：

```sql
update public.members set email = '<PI 的登入信箱>' where position = 'pi';
```

再到 Authentication → **Users** → **Add user** → **Create new user**：
- Email：同上
- Password：設定登入密碼
- 勾選 **Auto Confirm User**

建立後，帳號會依 Email 自動綁定成 Admin。到 SQL Editor 確認：

```sql
select name, email, app_role, user_id is not null as 已綁定 from public.members where app_role = 'admin';
```

你自己也要當 Admin 的話，用同樣方式在 Users 建立帳號，再執行：

```sql
update public.members set app_role = 'admin' where lower(email) = lower('<你的信箱>');
```

### 6-4 產生邀請碼

在網頁的管理介面完成前（階段 7），先在 SQL Editor 產生。**邀請碼原文只會顯示這一次，請立即複製給對方。**

一般成員，單次使用，14 天內有效：

```sql
select public.create_invite_code();
```

指定職稱與備註，例如碩士新生：

```sql
select public.create_invite_code(p_position => 'master', p_note => '2026 新生');
```

限定只能由某個 Email 使用：

```sql
select public.create_invite_code(p_email => 'student@example.com');
```

一組碼給多人使用，例如 5 位專題生、7 天有效：

```sql
select public.create_invite_code(p_position => 'undergrad', p_max_uses => 5, p_expires_days => 7);
```

綁定已存在的成員資料。註冊後會連到這筆成員，不會多出一筆：

```sql
select public.create_invite_code(p_member_id => (select id from public.members where name = '林冠宇'));
```

唯讀帳號（校友、訪客）：

```sql
select public.create_invite_code(p_app_role => 'viewer');
```

查看與撤銷邀請碼（`code_hint` 是邀請碼的末 4 碼）：

```sql
select code_hint, note, app_role, position, email, used_count, max_uses, expires_at, revoked_at
  from public.invite_codes order by created_at desc;
```

```sql
update public.invite_codes set revoked_at = now() where code_hint = '<末 4 碼>';
```

成員拿到邀請碼後，在網頁的「註冊」頁輸入邀請碼、Email、密碼即可。註冊頁在階段 2 完成。

### 6-5 忘記密碼

因為沒有設定寄信，「忘記密碼」由 Admin 協助重設：
- 階段 7 會在成員管理頁加上「重設密碼」按鈕。
- 在那之前，可以在 SQL Editor 設定一組臨時密碼，再請成員登入後自行修改：

```sql
update auth.users set encrypted_password = extensions.crypt('<臨時密碼>', extensions.gen_salt('bf'))
 where lower(email) = lower('<成員信箱>');
```

日後如果設定了 SMTP，也可以開放成員自行用 Email 重設密碼。

## 步驟 7：部署網頁

先更新程式碼：

```bash
cd /opt/tllab/tllab-web && git pull
```

到 Supabase Dashboard 取得三個值：
- **Project URL**：Project Settings → **Data API**（或 **API**），例如 `https://wdnkgbmumfqsfhhqlqmk.supabase.co`
- 兩把金鑰：Project Settings → **API Keys**，下列兩組擇一使用：
  - **Legacy API Keys** 分頁的 `anon` 和 `service_role`
  - 新版的 Publishable key（`sb_publishable_...`）和 Secret key（`sb_secret_...`）

建立設定檔：

```bash
cp .env.example .env && chmod 600 .env && nano .env
```

在 `.env` 填入：

```ini
NEXT_PUBLIC_SITE_URL=http://<主機 IP>
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon 或 publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role 或 secret key>
```

`NEXT_PUBLIC_SITE_URL` 依你的網址填，例如 `https://tllab-1112.<tailnet>.ts.net`。

> `service_role` key 擁有資料庫完整權限，只能放在主機的 `.env`，不可以提交到 git、也不可以給別人。`.env` 已列在 `.gitignore`。

編譯並啟動（第一次編譯約需 3–10 分鐘）：

```bash
docker compose up -d --build
docker compose logs -f web
```

看到 `Ready` 之後按 Ctrl+C 離開 log。本機測試，應回傳 `{"ok":true}`：

```bash
curl http://127.0.0.1:3000/api/health
```

約 30 秒後執行 `docker compose ps`，`STATUS` 應顯示 `healthy`。

`NEXT_PUBLIC_*` 會在編譯時寫入網頁，修改後要重新執行 `docker compose up -d --build`。

> 主機 RAM 不夠編譯時，可以在其他電腦編譯好再傳過去。在那台電腦先準備好同樣的 `.env`，然後執行 `docker compose build`，再執行 `docker save tllab-hub-web:latest | ssh <主機> docker load`。最後在主機上執行 `docker compose up -d`。

## 步驟 8：Nginx 與 HTTPS

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

完成後用瀏覽器開 `https://hub.example.edu.tw`，用步驟 6-3 建立的帳號登入測試。

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
| 網頁顯示「缺少環境變數 NEXT_PUBLIC_SUPABASE_URL」 | `.env` 沒填或填錯，改好後重新 `docker compose up -d --build` |
| 登入後顯示「帳號尚未啟用」 | 這個登入帳號沒有對應的成員資料：到 SQL Editor 確認 `members` 有這個 Email，且 `user_id` 已綁定 |
| `node: ... version 'GLIBC_2.28' not found` | 主機上直接跑了 Node.js 18 以上版本，請改用 Docker（步驟 7） |
| `db-apply.sh` 卡住或 `could not translate host name` | 用了 Direct connection（只支援 IPv6），改用 **Session pooler** 連線字串；或學校網路擋住 5432 port |
| `password authentication failed` | 連線字串的密碼不對；密碼有特殊字元時要做 URL 編碼（例如 `@` → `%40`），或到 Database Settings 重設成只有英數字的密碼 |
| 網站打不開，Dashboard 顯示 Paused | 免費專案 7 天沒有使用被暫停，在 Dashboard 按 Restore |
| 註冊時顯示「邀請碼無效、已過期或已使用完畢」 | 在 SQL Editor 查詢 `invite_codes` 的 `used_count`、`expires_at`、`revoked_at`；必要時重新產生 |
| 成員忘記密碼 | 見步驟 6-5 |
| 登入後跳到 `localhost:3000` | Supabase 的 Site URL／Redirect URLs 沒改成正式網址（步驟 6-1） |
| 編譯時出現 `Killed` | RAM 不足，加 swap（步驟 1）或在別台電腦編譯 |
| `docker pull` 逾時 | 學校網路需要 proxy：在 `/etc/systemd/system/docker.service.d/proxy.conf` 設定 `HTTP_PROXY`／`HTTPS_PROXY` 後重啟 Docker |

---

## 附錄：日後加入 Google 登入（可選）

目前使用邀請碼註冊，不需要這一節。日後想讓成員也能用 Google 登入時，再依下列步驟設定，並在 Sign In / Providers 開啟 Google。

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立專案，再進入 **APIs & Services → OAuth consent screen**：
   - 學校有 Google Workspace，而且只給校內帳號登入：User type 選 **Internal**。
   - 否則選 **External**，填好應用程式名稱與聯絡信箱後按 **Publish app**；不發布的話，只有列為測試使用者的帳號能登入。
2. **Credentials → Create credentials → OAuth client ID**，Application type 選 **Web application**：
   - Authorized JavaScript origins：可以不填。Google 不接受內網 IP，而登入流程也用不到這個欄位。
   - Authorized redirect URIs：`https://<ref>.supabase.co/auth/v1/callback`
     （Supabase Dashboard → Authentication → Providers → Google 頁面上可直接複製這個網址）
3. 把產生的 Client ID 與 Client Secret 填回 Supabase 的 Google provider。

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

5. `tailscale funnel status` 會顯示網址，例如 `https://tllab-1112.<tailnet>.ts.net`。把它填到以下地方，這個方式**不需要 certbot**：
   - Supabase → Authentication → URL Configuration：
     - **Site URL**：`https://tllab-1112.<tailnet>.ts.net`
     - **Redirect URLs**：`https://tllab-1112.<tailnet>.ts.net/**`。也可以保留 `http://<主機 IP>/**`，校內就能繼續用 IP 連線。
   - `.env` 的 `NEXT_PUBLIC_SITE_URL`。
   - Nginx 設定的 `server_name` 改成 `_`。


### DuckDNS（需要公開 IP）

1. 到 <https://www.duckdns.org> 用 Google 帳號登入，建立子網域（例如 `tllab911.duckdns.org`），記下 token。
2. 每 5 分鐘更新一次 IP：用 `crontab -e` 加入下面這行。

   ```
   */5 * * * * curl -s "https://www.duckdns.org/update?domains=tllab911&token=<token>&ip=" > /dev/null
   ```

3. 確認校外連得到主機的 80/443 port 後，依步驟 8 用 certbot 申請憑證（`-d tllab911.duckdns.org`）。

## 開發者：本機測試 schema

需要 PostgreSQL 16 執行檔（`/usr/lib/postgresql/16/bin`）：

```bash
scripts/test-db.sh
```

這個腳本會在暫存資料庫上模擬 Supabase 的 `auth`／`storage` schema，執行 `db-apply.sh` 兩次（第二次應全部略過），再跑權限測試。
