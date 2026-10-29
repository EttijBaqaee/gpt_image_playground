# Update 0.3.66.2

**2026-10-28 · 基于本 fork 的 0.3.66.1 更新。**

- **修复手机触屏参考图排序**：长按参考图约 0.45 秒后，拖至目标参考图并松手即可调整顺序；支持跨行拖动。短按选择/编辑和普通滑动保留原有行为，桌面鼠标拖拽继续可用。
- **保留遮罩顺序限制**：遮罩主图固定在第一张；多指、取消手势或拖出参考图区域时取消排序，拖动结束不会误触编辑。
- **编排参数注释**：将参数用途、默认值与必填/可选说明直接写入完整 YAML；README 示例和下载模板保持一致。

## Update 0.3.66.1

**2026-10-28 · 基于 XianYuDaXian 的 0.3.66 fork。** 本版只围绕以下内容修订，其余业务功能沿用 0.3.66。

- **四项独立路径前缀**：`APP_BASE_PATH` 控制主页，`API_BASE_PATH`、`MEDIA_BASE_PATH`、`HEALTH_BASE_PATH` 分别控制 API、媒体和健康检查。例如 `web` / `a` / `m` / `h` 对应 `/web/`、`/a/api/`、`/m/media/`、`/h/health`。新版编排各项留空使用各自默认路径，修改参数只需重建容器。
- **修复 Chromium 复制粘贴丢换行**：保留连续空行、首尾换行、CRLF、中文、emoji，以及参考图 mention；修复全选复制漏掉末尾换行、粘贴后光标与继续输入的问题。
- **修复额度事务**：额度预扣、任务、附件记录和初始事件通过同一 SQLite 事务提交；预校验失败不扣额度，任务失败按原有规则退款。
- **修复附件路径与清理**：附件使用 UUID 和安全扩展名保存，避免同名覆盖和原始文件名影响路径；失败时清理本次上传，不留下可执行的残缺任务。
- **限制上传与可信代理**：默认单文件 32 MiB、单次累计 128 MiB，流式累计检查；最多 32 个文件、16 个普通字段。默认不信任转发 IP，只有明确配置的可信代理才生效。

---

<p align="center">
  <img src="asset/主界面.png" alt="主界面" width="45%" />
  <img src="asset/设置界面.png" alt="设置界面" width="45%" />
</p>

## 1. 获取 Docker 镜像（推荐）

服务器只需 Docker Engine 和 Docker Compose v2，可直接拉取本 fork 的镜像，无需安装 Node.js 或在宿主机编译：

```bash
docker pull ghcr.io/ettijbaqaee/gpt_image_playground:0.3.66.2
# 跟随本 fork 的最新发布版本
docker pull ghcr.io/ettijbaqaee/gpt_image_playground:latest
```

正式部署建议固定 `0.3.66.2`。本次发布镜像为 **Linux amd64**，从 Debian/1Panel 上经过验证的同一镜像导出并发布，容器使用 UID/GID 1000。GHCR 镜像与 Release 离线镜像使用相同应用内容，不是另行编译的版本。

### 首次创建持久化目录

以下命令由 root 执行，为新部署创建数据目录：

```bash
mkdir -p /opt/gpt-image-playground-data
chown 1000:1000 /opt/gpt-image-playground-data
```

如果已有部署，继续使用原数据目录，不要新建空目录替代它。**从 0.3.66 升级前，必须检查整个旧数据目录的权限；只修改最外层目录不够。** 旧版默认以 root 运行，本 fork 的镜像使用 UID/GID 1000，具体迁移命令见第 10 节。

### 可选：获取源码并在 Docker 内构建

只有需要自行构建时才需要 Git，以及访问基础镜像、npm 和 Debian 软件源：

```bash
git clone --branch v0.3.66.2 https://github.com/EttijBaqaee/gpt_image_playground.git /opt/gpt-image-playground
cd /opt/gpt-image-playground/deploy
cp .env.example .env
```

也可以从 [0.3.66.2 Release](https://github.com/EttijBaqaee/gpt_image_playground/releases/tag/v0.3.66.2) 下载源码包并解压；`APP_SOURCE_DIR` 应指向含 `package.json`、`server/` 和 `deploy/` 的源码根目录。

标准源码构建使用 `deploy/Dockerfile`，依赖安装、前端编译和后端编译都在 Docker 内完成。`deploy/Dockerfile.1panel` 是已有 Linux 锁定依赖缓存环境的构建文件，不能直接用于没有 `node_modules` 的干净源码；首次部署请使用标准 `deploy/Dockerfile`。

## 2. 完整编排文件

仓库内模板为 [`deploy/docker-compose.yml`](deploy/docker-compose.yml)。可以直接用于命令行，也可以粘贴进 1Panel 编排编辑器：

```yaml
# 必填变量：APP_SECRET、ADMIN_PASSWORD；其余变量均可选，未填写时使用下方默认值。
# ${变量:-默认值} 从同目录 .env 或 1Panel 编排环境变量读取；也可将整个引号内的值改为实际值。
# 例如 APP_BASE_PATH: "web"；留空请写 ""。修改变量后需重新创建容器才能生效。
name: gpt-image-playground-fork # 可选：编排项目名；同一服务器部署多套时使用不同名称。

services:
  app:
    # 镜像：推荐固定此版本；可按需改为本 fork 的其他已发布标签。
    image: ghcr.io/ettijbaqaee/gpt_image_playground:0.3.66.2
    # 可选：本机没有镜像时才拉取；升级时主动执行 docker compose pull app。
    pull_policy: if_not_present
    container_name: gpt-image-playground-fork # 可选：容器名；部署多套时必须各不相同。
    restart: unless-stopped # 可选：异常退出或重启服务器后自动启动，手动停止除外。
    ports:
      # APP_PORT 可选，默认 8788：左侧为宿主机端口；右侧容器端口保持 8787。
      - "${APP_PORT:-8788}:8787"
    environment:
      # 以下四项均可选且互相独立，不会继承主页前缀；可填 web 或 /web/ 这样的形式。
      # 主页/静态资源前缀：web → /web/；默认留空 → /。
      APP_BASE_PATH: "${APP_BASE_PATH:-}"
      # API 前缀：a → /a/api/…；默认留空 → /api/…。
      API_BASE_PATH: "${API_BASE_PATH:-}"
      # 媒体前缀：m → /m/media/…；默认留空 → /media/…。
      MEDIA_BASE_PATH: "${MEDIA_BASE_PATH:-}"
      # 健康检查前缀：h → /h/health 和 /h/health/；默认留空 → /health 和 /health/。
      HEALTH_BASE_PATH: "${HEALTH_BASE_PATH:-}"
      # 可选：默认留空，不信任转发 IP；只填实际反向代理 IP 或受限 CIDR，多个值用逗号分隔。
      TRUSTED_PROXIES: "${TRUSTED_PROXIES:-}"
      # 可选：单文件上传上限，默认 32 MiB；填写 1–1024 的整数。
      UPLOAD_MAX_FILE_MB: "${UPLOAD_MAX_FILE_MB:-32}"
      # 可选：单次上传累计上限，默认 128 MiB；填写 1–2048 的整数。
      UPLOAD_MAX_TOTAL_MB: "${UPLOAD_MAX_TOTAL_MB:-128}"
      # 以下为容器内部运行设置，建议保持原值，避免与端口、挂载和健康检查不一致。
      NODE_ENV: production
      PORT: "8787"
      HOST: "0.0.0.0"
      DATA_DIR: /app/data
      WEB_DIST_DIR: /app/dist
      # 必填：固定的随机会话签名密钥，至少 16 字符，建议 32 字符以上；升级继续使用原值。
      # 可执行 openssl rand -hex 32 生成；填入 .env 或 1Panel 环境变量，勿提交到仓库。
      APP_SECRET: "${APP_SECRET:?Set APP_SECRET in .env}"
      # 必填：应用网页登录管理员密码，与服务器和 1Panel 密码无关；升级保留原值。
      ADMIN_PASSWORD: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD in .env}"
      # 可选：跨域允许来源，默认 *；限定时填写完整协议、域名和端口，不含路径前缀。
      CORS_ORIGIN: "${CORS_ORIGIN:-*}"
      # 以下供应商初始化参数全部可选；URL 和 KEY 同时填写才启用，也可留空后在网页中配置。
      # 供应商 API 地址与密钥，按供应商的接入说明填写。
      UPSTREAM_API_URL: "${UPSTREAM_API_URL:-}"
      UPSTREAM_API_KEY: "${UPSTREAM_API_KEY:-}"
      # 可选：初始化模型名称，默认 gpt-image-2，按供应商支持的模型填写。
      UPSTREAM_MODEL: "${UPSTREAM_MODEL:-gpt-image-2}"
      # 可选：接口模式，默认 images；支持 images/responses/videos/venice_images/wavespeed/kie。
      UPSTREAM_API_MODE: "${UPSTREAM_API_MODE:-images}"
      # 可选：上游请求超时，单位秒，默认 300；填写正整数。
      UPSTREAM_TIMEOUT_SECONDS: "${UPSTREAM_TIMEOUT_SECONDS:-300}"
      # 可选：Codex CLI 兼容开关，默认 false；仅对应供应商要求时设为 true。
      UPSTREAM_CODEX_CLI: "${UPSTREAM_CODEX_CLI:-false}"
    volumes:
      # APP_DATA_DIR 可选，默认 ../docker-data（相对编排文件目录）；1Panel 推荐填写绝对路径。
      # 左侧为宿主机持久化目录，需让 UID/GID 1000 可写；右侧保持 /app/data。
      # 升级必须继续使用原数据目录，避免进入空数据库。
      # 从 0.3.66 升级时，旧文件可能属于 root；先按 README 第 10 节一次性迁移整个目录权限。
      - "${APP_DATA_DIR:-../docker-data}:/app/data"
    # 可选安全设置，建议保留：禁止提权并移除额外 Linux capabilities。
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    mem_limit: 1536m # 可选：容器内存上限，可按服务器资源调整。
    pids_limit: 128 # 可选：容器进程数上限。
    # 可选健康检查，建议保留：自动读取 HEALTH_BASE_PATH，修改前缀无需修改脚本。
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          const p=(process.env.HEALTH_BASE_PATH||'').trim().replace(/^[/]+|[/]+$/g,'');
          fetch('http://127.0.0.1:8787'+(p?'/'+p:'')+'/health')
          .then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))
      interval: 20s # 可选：检查间隔。
      timeout: 5s # 可选：单次检查超时。
      retries: 3 # 可选：连续失败阈值。
      start_period: 30s # 可选：启动宽限时间。
    # 可选日志轮转，建议保留，避免日志持续占用磁盘。
    logging:
      driver: json-file
      options:
        max-size: "10m" # 可选：单个日志文件上限。
        max-file: "3" # 可选：保留的日志文件数量。
```

## 3. 环境变量怎么写

命令行部署使用 `deploy/.env`。1Panel 使用该编排的环境变量编辑区，或者编排目录中的 `.env`。**不要把 `.env` 提交到 GitHub。**

下面是首次部署示例，两个密码占位符必须替换：

```dotenv
APP_SECRET=replace-with-a-long-random-secret-at-least-32-characters
ADMIN_PASSWORD=replace-with-your-admin-password
APP_PORT=8788
APP_BASE_PATH=
API_BASE_PATH=
MEDIA_BASE_PATH=
HEALTH_BASE_PATH=
CORS_ORIGIN=*

# 使用绝对数据路径，避免把数据写到错误目录
APP_DATA_DIR=/opt/gpt-image-playground-data
# 仅源码构建时需要；镜像拉取部署可以不填
APP_SOURCE_DIR=

TRUSTED_PROXIES=
UPLOAD_MAX_FILE_MB=32
UPLOAD_MAX_TOTAL_MB=128
```

可用 `openssl rand -hex 32` 生成 `APP_SECRET`。如果已有部署，继续使用原来的 `APP_SECRET`、管理员密码和数据目录，不能照抄示例覆盖。

`UPSTREAM_API_URL` / `UPSTREAM_API_KEY` 可留空，登录网页后配置供应商。可选初始化参数见 [`deploy/.env.example`](deploy/.env.example)。

## 4. 在 1Panel 中部署

1. 按第 1 节创建持久化目录并设置 UID/GID 1000 写入权限；升级时使用原目录。
2. 进入 **容器 → 编排 → 创建编排**，选择编辑编排，名称填写 `gpt-image-playground-fork`。
3. 粘贴第 2 节完整 YAML，使用 `ghcr.io/ettijbaqaee/gpt_image_playground:0.3.66.2`。
4. 在编排环境变量中填写第 3 节参数，替换 `APP_SECRET` 和 `ADMIN_PASSWORD`，`APP_DATA_DIR` 使用绝对路径。四项路径可独立填写或留空。
5. 创建并启动，面板会拉取镜像并创建容器，不需要下载源码或现场编译。
6. 容器健康状态变为 `healthy` 后，按 `APP_PORT` 和 `APP_BASE_PATH` 访问。推荐再按第 7 节配置 Nginx/HTTPS。

### 在 1Panel 内改用源码构建

下载源码到服务器（例如 `/opt/gpt-image-playground`），在环境变量中设置 `APP_SOURCE_DIR=/opt/gpt-image-playground`，并把主编排中的 `image` / `pull_policy` 改为下面内容，同时加入 `build`：

```yaml
image: gpt-image-playground-fork:0.3.66.2
pull_policy: never
build:
  context: ${APP_SOURCE_DIR}
  dockerfile: deploy/Dockerfile
```

这些键与主编排 `app` 下的 `ports`、`environment` 平级。源码目录必须含 `package.json`、`server/`、`deploy/Dockerfile`；`build.context` 不是 `deploy/` 或 1Panel 编排自身目录。

如果面板版本首次创建未执行构建，可在服务器终端进入 **面板管理的同一份编排目录**，执行 `docker compose build app`，再回面板启动。编排实际路径以面板显示为准，例如 `/opt/1panel/docker/compose/gpt-image-playground-fork`。不要另外建立不同数据目录的一套部署。

## 5. 命令行 Docker Compose

把第 2 节 YAML 保存为 `docker-compose.yml`，同目录创建第 3 节的 `.env`，准备好数据目录后：

```bash
docker compose config --quiet
docker compose pull app
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
```

若使用仓库内模板，则在 `/opt/gpt-image-playground/deploy` 目录执行上述命令。

### 可选：从源码 Docker 构建

仓库提供 [`deploy/docker-compose.build.yml`](deploy/docker-compose.build.yml) 作为源码构建覆盖文件：

```bash
cd /opt/gpt-image-playground/deploy
docker compose -f docker-compose.yml -f docker-compose.build.yml build app
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```

该模式使用本地镜像名 `gpt-image-playground-fork:0.3.66.2`，不向 GHCR 上传。之后修改环境变量时仍使用相同两个 `-f` 文件。依赖安装和前后端编译均在 Docker 内完成，不需要在宿主机执行 `npm install` 或 `npm run build`。

## 6. 四项路径独立设置

所有参数都是**前缀**，不是完整 URL；`/api`、`/media`、`/health` 这三个末尾段仍保留。新版编排显式传入四项参数，各项留空即使用该项的默认路径，互不影响。

```dotenv
APP_BASE_PATH=web
API_BASE_PATH=a
MEDIA_BASE_PATH=m
HEALTH_BASE_PATH=h
```

假设宿主机端口是 `8788`：

| 用途 | 四项均留空 | 上面的独立配置 |
| --- | --- | --- |
| 主页与静态资源 | `http://服务器IP:8788/` | `http://服务器IP:8788/web/` |
| API 与 SSE | `/api/…` | `/a/api/…` |
| 媒体 | `/media/…` | `/m/media/…` |
| 健康检查 | `/health`、`/health/` | `/h/health`、`/h/health/` |

例如只想把主页放在 `/gpt_image_playground/`，后端保持根路径，就填：

```dotenv
APP_BASE_PATH=gpt_image_playground
API_BASE_PATH=
MEDIA_BASE_PATH=
HEALTH_BASE_PATH=
```

如果希望四项共用 `aaa`，则四项都填 `aaa`。也可以直接在 YAML 的 `environment` 中写固定值：

```yaml
APP_BASE_PATH: "web"
API_BASE_PATH: "a"
MEDIA_BASE_PATH: "m"
HEALTH_BASE_PATH: "h"
```

每个前缀只允许字母、数字、下划线、短横线和路径分隔符；不能包含 `..`、查询参数、编码斜线或连续空路径段。前端请求、SSE、媒体 DTO、PWA 排除规则和健康检查会分别跟随对应参数。

修改后，在 1Panel 重新部署/重建容器；命令行等价操作是：

```bash
docker compose up -d --force-recreate
```

**不需要重新构建镜像；只重启旧容器不会读取新的 Compose 环境变量。** 这四项都是应用自身路径，与 1Panel 的安全入口独立。

**没有隐式继承：** 每项未声明或留空都会使用自己的默认路径。只设置 `APP_BASE_PATH` 不会改变三个后端路径；若要统一前缀，需要四项显式填写相同值。

## 7. 推荐使用 Nginx 反代部署

**我们推荐使用 Nginx（或 OpenResty）反代部署，由反向代理统一提供域名和 HTTPS。**

### 四个独立路径的配置示例

下面假设 Nginx 运行在 Docker 宿主机，应用映射到宿主机 `8788` 端口。先设置：

```dotenv
APP_PORT=8788
APP_BASE_PATH=gpt_image_playground
API_BASE_PATH=a
MEDIA_BASE_PATH=m
HEALTH_BASE_PATH=h
CORS_ORIGIN=https://image.example.com
```

将 `image.example.com` 替换为实际域名，`CORS_ORIGIN` 不包含路径。重新创建应用容器后，在域名现有的 `server { ... }` 中加入下面的配置。HTTPS 证书沿用站点配置。片段文件见 [`deploy/nginx.conf.example`](deploy/nginx.conf.example)。

```nginx
# 放入域名现有的 server 块；HTTPS 证书沿用站点配置。
# APP_BASE_PATH=gpt_image_playground
# API_BASE_PATH=a  MEDIA_BASE_PATH=m  HEALTH_BASE_PATH=h
# APP_PORT=8788；proxy_pass 末尾不加 /，保留请求的完整路径。
location = /gpt_image_playground {
    return 301 /gpt_image_playground/;
}

# 主页和静态资源
location ^~ /gpt_image_playground/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}

# API、上传和 SSE 任务进度
location ^~ /a/api/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    # 为默认 128 MiB 文件累计限制预留 multipart / 字段开销。
    client_max_body_size 160m;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_cache off;
}

# 媒体仍由应用鉴权，不在代理层建立公共缓存。
location ^~ /m/media/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    proxy_cache off;
}

# 同时覆盖 /h/health 和 /h/health/；不存在的后缀由应用返回 404。
location /h/health {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    proxy_cache off;
}
```

对应的公开地址为：主页 `https://image.example.com/gpt_image_playground/`、API `/a/api/…`、媒体 `/m/media/…`、健康检查 `/h/health` 或 `/h/health/`。

**每段 `proxy_pass` 末尾都不加 `/`，完整路径原样转发给应用。** 不要剥掉前缀，也不要把三类后端请求全部塞进主页的 `location`；它们分别匹配自己的路径。

如果后端三项留空，保持主页前缀不变，只需把三段后端 `location` 分别改为 `/api/`、`/media/`、`/health`。如果修改任何一个参数，只改对应的 `location` 即可。若主页也留空，则删除补斜线重定向，把主页段改成 `location /`，API/媒体等更具体的段继续保留。

API 段关闭响应缓冲和缓存，确保 SSE 实时进度及时到达；不强制发送 `Connection: upgrade`。后端是 HTTP，不需要 `proxy_ssl_server_name`、`proxy_ssl_name`。默认 `client_max_body_size 160m` 给 128 MiB 文件累计上限预留 multipart 和字段开销；应用仍检查单文件 32 MiB 和累计 128 MiB，调整应用上限时也要调整代理上限。

检查并重载：

```bash
nginx -t && nginx -s reload
```

1Panel/OpenResty 使用面板的配置检测、重载操作。

### 后端端口与可信代理

- 示例的 `8788` 是宿主机端口；如果 `APP_PORT=8787`，四段代理地址都相应改为 `127.0.0.1:8787`。容器内端口始终是 `8787`。
- Nginx 在宿主机且只通过反代访问时，可以把编排端口映射改为 `127.0.0.1:${APP_PORT:-8788}:8787`，让后端仅监听本机。
- 如果 Nginx 也在容器中，`127.0.0.1` 指向 Nginx 容器自己，应改用共享 Docker 网络中的应用服务名和容器端口 `8787`，或实际可达的宿主机地址。
- `TRUSTED_PROXIES` 应填写应用实际看到的代理 IP/CIDR，Docker 转发下可能是网关地址，不能直接假定为 `127.0.0.1`；不确定时保持留空。

## 8. 上传限制与代理

- 上传大小按实际流式读取的字节累计检查，不只看请求头声明。
- 单次最多 32 个文件、16 个普通字段，普通字段上限为 1 MiB。
- 超限请求会被拒绝并清理本次附件；未完成上传不会产生可运行的残缺任务或错误扣费。
- `TRUSTED_PROXIES` 留空时，不采信请求中自行填写的 `X-Forwarded-For`。
- 使用代理时只配置真正的代理 IP/CIDR，不能填写 `*`、`true`、`0.0.0.0/0` 或 `::/0`。

## 9. 离线镜像（可选）

Release 中的 `gpt-image-playground-fork-0.3.66.2-amd64.tar.gz` 是已验证的 **Linux amd64** 镜像，不适用于 ARM 主机；ARM 主机请使用源码 Docker 构建。

```bash
sha256sum -c SHA256SUMS --ignore-missing
docker load -i gpt-image-playground-fork-0.3.66.2-amd64.tar.gz
```

使用离线镜像时，将主编排的 `image` 和 `pull_policy` 改为下面内容；如果之前添加过 `build`，同时删除整个 `build` 块：

```yaml
image: gpt-image-playground-fork:0.3.66.2
pull_policy: never
```

其他端口、环境变量和数据挂载照常填写，然后在 1Panel 创建/启动或执行 `docker compose up -d`。不要执行 `docker compose pull`，该镜像已经通过 `docker load` 导入本机。

## 10. 升级与数据保留

升级前先停止应用，备份整个持久化数据目录，并保留原 `.env`。供应商设置、使用码额度、历史任务和媒体文件都依赖原数据目录。

### 从 0.3.66 升级：先迁移数据目录权限

0.3.66 的容器默认以 root 运行，本 fork 的 0.3.66.1 / 0.3.66.2 镜像以 UID/GID 1000 运行。旧数据库或 `media/` 等目录如果仍属于 root，直接更换镜像可能导致 `EACCES: permission denied, mkdir '/app/data/media/masks'`，或数据库只读错误。镜像构建时对 `/app/data` 设置权限，不会改变后来挂载进来的宿主机旧数据。

在**出错服务器**上以 root 身份进入该应用实际的编排目录（包含原 `docker-compose.yml` 和 `.env`），确认仍挂载原数据目录，先停止应用并备份该目录，再执行：

```bash
# 以下命令在同一个 shell 中运行；任何一步失败都会停止后续操作。
set -e
docker compose stop app
# 在此完成原数据目录的备份后，再执行下面两条命令。
docker compose run --rm --no-deps --user 0:0 \
  --cap-add CHOWN --cap-add FOWNER --cap-add DAC_OVERRIDE \
  --entrypoint sh app -eu -c \
  'chown -Rh 1000:1000 /app/data && chmod -R u+rwX /app/data'
docker compose up -d app
```

- `app` 是本仓库模板中的服务名；如果自己的编排使用其他服务名，替换命令中的 `app`。
- 1Panel 可在编排详情中查看编排目录，再通过服务器 SSH 或终端执行。若平时使用自定义 `-f` 文件，请为上述每条 `docker compose` 命令继续使用相同文件。
- 一次性容器复用该服务的原挂载，递归调整数据的属主和属主读写权限；不删除数据库、图片或配置，不重新生成 `APP_SECRET`。保留原 `.env`。
- 原编排包含 `cap_drop: ALL`，因此修复容器显式添加修改权限所需的能力；修复结束后自动移除，正常应用继续按镜像的 UID/GID 1000 运行。
- 修复后通过 1Panel 日志和健康状态确认启动成功。

如果已确定 `/app/data` 对应的宿主机路径，也可以在 1Panel 停止应用并备份后，直接以 root 修复该路径。以下 `DATA_PATH` 必须替换为**自己的实际数据根目录**，不能只指向 `media/uploads`：

```bash
DATA_PATH=/实际的宿主机数据根目录
chown -Rh 1000:1000 "$DATA_PATH"
chmod -R u+rwX "$DATA_PATH"
```

两条命令均成功后，在 1Panel 重新启动/部署原编排。该权限迁移只需完成一次，继续使用原数据目录和原环境变量。

- GHCR 镜像升级：修改 `image` 中的版本标签，执行 `docker compose pull app`，再执行 `docker compose up -d`；1Panel 等价操作为拉取镜像并重新部署编排。
- 源码构建升级：更新源码后，使用第 5 节相同的两个 `-f` 文件重新构建并启动。
- 离线镜像升级：导入新镜像，修改 `image` 标签后重新部署。
- 只改环境变量：重新创建容器，不需要重新构建镜像。
- 继续使用相同的 `APP_SECRET`、管理员密码和数据挂载；不要删除数据卷或对旧部署执行 `down -v`。
- 本版 GHCR 和离线镜像均使用 UID/GID 1000。若挂载目录不可写，按上述步骤迁移旧数据目录权限；不要把容器改成特权模式。

## 11. 常见问题

- **1Panel 找不到 Dockerfile**：检查 `APP_SOURCE_DIR` 是否为绝对源码根目录，而不是 `deploy/` 或编排自身目录。
- **要求设置 APP_SECRET / ADMIN_PASSWORD**：环境变量未保存或 `.env` 不在编排读取位置，填写后重新部署。
- **改前缀后 404**：分别核对四项参数和对应的 Nginx `location`，确认代理未剥掉前缀；网页入口只跟随 `APP_BASE_PATH`。
- **健康检查失败**：检查容器日志；编排里的健康检查已经跟随 `HEALTH_BASE_PATH`，不要改回固定 `/health`。
- **上传出现 413**：同时检查应用的单文件/累计上限及反向代理请求体上限。
- **EACCES / 数据库只读或图片保存失败**：尤其是从 0.3.66 升级时，按第 10 节迁移整个原数据目录的属主和写入权限，仅修改最外层目录或新建空目录不能解决旧文件权限问题。
- **镜像拉取失败**：确认域名为 `ghcr.io`，账号与仓库全小写，标签正确，服务器能访问 GHCR；也可使用 Release 离线镜像，先 `docker load`，改成本地镜像名和 `pull_policy: never`。

## 许可证与来源

[MIT License](LICENSE)。本 fork 与上游使用相同许可证，保留 `Copyright (c) 2026 CookSleep` 和原 MIT 许可文本。

- 原始项目：[CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)
- 0.3.66 基线：XianYuDaXian fork，提交 `0477e08e8328652cfdfaf66c463970e626a9ff69`
- 当前维护：[EttijBaqaee/gpt_image_playground](https://github.com/EttijBaqaee/gpt_image_playground)
