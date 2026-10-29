# Update 0.3.66.3

**2026-10-29 · 基于本 fork 的 0.3.66.2 更新。**

- **独立 assets 路径**：新增可选 `ASSETS_BASE_PATH`，例如 `s` 对应 `/s/assets/`，与主页、API、媒体和健康检查分别设置。留空沿用原来的主页前缀，填 `/` 使用根路径 `/assets/`。修改编排后重新创建容器即可，无需重新构建镜像。
- **静态资源完整迁移**：入口 JS、CSS、预加载、动态加载的图片编辑器和相对资源使用新的 assets 路径；图标、manifest 和 Service Worker 仍跟随主页。资源不存在时返回 404。
- **升级说明**：补全从 0.3.66 升级时的旧数据目录权限迁移步骤，保留数据库、图片及原环境变量。编排参数注释和推荐 Nginx 反代示例同步补齐 assets。
- **部署配置排错**：说明 Compose 环境变量的映射/列表写法、Nginx 保留路径前缀的规则，以及五项统一使用 `/gpt_image_playground/` 的完整反代示例；补充资源 404、白屏、变量未生效，以及修改前缀后旧标签页仍请求根路径导致登录失败的检查方法。

## Update 0.3.66.2

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
docker pull ghcr.io/ettijbaqaee/gpt_image_playground:0.3.66.3
# 跟随本 fork 的最新发布版本
docker pull ghcr.io/ettijbaqaee/gpt_image_playground:latest
```

正式部署建议固定 `0.3.66.3`。本次发布镜像为 **Linux amd64**，从 Debian/1Panel 上经过验证的同一镜像导出并发布，容器使用 UID/GID 1000。GHCR 镜像与 Release 离线镜像使用相同应用内容，不是另行编译的版本。

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
git clone --branch v0.3.66.3 https://github.com/EttijBaqaee/gpt_image_playground.git /opt/gpt-image-playground
cd /opt/gpt-image-playground/deploy
cp .env.example .env
```

也可以从 [0.3.66.3 Release](https://github.com/EttijBaqaee/gpt_image_playground/releases/tag/v0.3.66.3) 下载源码包并解压；`APP_SOURCE_DIR` 应指向含 `package.json`、`server/` 和 `deploy/` 的源码根目录。

标准源码构建使用 `deploy/Dockerfile`，依赖安装、前端编译和后端编译都在 Docker 内完成。`deploy/Dockerfile.1panel` 是已有 Linux 锁定依赖缓存环境的构建文件，不能直接用于没有 `node_modules` 的干净源码；首次部署请使用标准 `deploy/Dockerfile`。

## 2. 完整编排文件

仓库内模板为 [`deploy/docker-compose.yml`](deploy/docker-compose.yml)。可以直接用于命令行，也可以粘贴进 1Panel 编排编辑器：

**下面的 `environment` 使用映射格式：`APP_BASE_PATH: "值"`，前面不加 `-`。** 如果已有编排使用列表格式，应写成 `- APP_BASE_PATH=值`。不能写成 `- APP_BASE_PATH:/gpt_image_playground/`；两种正确写法和完整路径示例见第 6 节。

```yaml
# 必填变量：APP_SECRET、ADMIN_PASSWORD；其余变量均可选，未填写时使用下方默认值。
# ${变量:-默认值} 从同目录 .env 或 1Panel 编排环境变量读取；也可将整个引号内的值改为实际值。
# 例如 APP_BASE_PATH: "web"；留空请写 ""。修改变量后需重新创建容器才能生效。
name: gpt-image-playground-fork # 可选：编排项目名；同一服务器部署多套时使用不同名称。

services:
  app:
    # 镜像：推荐固定此版本；可按需改为本 fork 的其他已发布标签。
    image: ghcr.io/ettijbaqaee/gpt_image_playground:0.3.66.3
    # 可选：本机没有镜像时才拉取；升级时主动执行 docker compose pull app。
    pull_policy: if_not_present
    container_name: gpt-image-playground-fork # 可选：容器名；部署多套时必须各不相同。
    restart: unless-stopped # 可选：异常退出或重启服务器后自动启动，手动停止除外。
    ports:
      # APP_PORT 可选，默认 8788：左侧为宿主机端口；右侧容器端口保持 8787。
      - "${APP_PORT:-8788}:8787"
    environment:
      # 以下路径参数均可选；可填 web 或 /web/ 这样的形式。
      # 主页前缀（含图标、manifest、Service Worker）：web → /web/；默认留空 → /。
      APP_BASE_PATH: "${APP_BASE_PATH:-}"
      # JS/CSS 等构建资源前缀：s → /s/assets/；留空沿用主页前缀以兼容旧版；填 / → /assets/。
      # 可单独设置，不需要重新构建镜像。assets 末尾段保持不变。
      ASSETS_BASE_PATH: "${ASSETS_BASE_PATH:-}"
      # 以下三个后端前缀互相独立，留空均不继承主页前缀。
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
ASSETS_BASE_PATH=
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
3. 粘贴第 2 节完整 YAML，使用 `ghcr.io/ettijbaqaee/gpt_image_playground:0.3.66.3`。
4. 在编排环境变量中填写第 3 节参数，替换 `APP_SECRET` 和 `ADMIN_PASSWORD`，`APP_DATA_DIR` 使用绝对路径。五项路径按第 6 节分别填写或留空。
5. 创建并启动，面板会拉取镜像并创建容器，不需要下载源码或现场编译。
6. 容器健康状态变为 `healthy` 后，按 `APP_PORT` 和 `APP_BASE_PATH` 访问。推荐再按第 7 节配置 Nginx/HTTPS。

### 在 1Panel 内改用源码构建

下载源码到服务器（例如 `/opt/gpt-image-playground`），在环境变量中设置 `APP_SOURCE_DIR=/opt/gpt-image-playground`，并把主编排中的 `image` / `pull_policy` 改为下面内容，同时加入 `build`：

```yaml
image: gpt-image-playground-fork:0.3.66.3
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

该模式使用本地镜像名 `gpt-image-playground-fork:0.3.66.3`，不向 GHCR 上传。之后修改环境变量时仍使用相同两个 `-f` 文件。依赖安装和前后端编译均在 Docker 内完成，不需要在宿主机执行 `npm install` 或 `npm run build`。

## 6. 五项路径分别设置

所有参数都是**前缀**，不是完整 URL；`assets`、`api`、`media`、`health` 末尾段仍保留。

```dotenv
APP_BASE_PATH=web
ASSETS_BASE_PATH=s
API_BASE_PATH=a
MEDIA_BASE_PATH=m
HEALTH_BASE_PATH=h
```

假设宿主机端口是 `8788`：

| 用途 | 全部留空 | 上面的配置 |
| --- | --- | --- |
| 主页、图标、manifest、Service Worker | `http://服务器IP:8788/` | `http://服务器IP:8788/web/` |
| JS/CSS 等构建资源 | `/assets/…` | `/s/assets/…` |
| API 与 SSE | `/api/…` | `/a/api/…` |
| 媒体 | `/media/…` | `/m/media/…` |
| 健康检查 | `/health`、`/health/` | `/h/health`、`/h/health/` |

`ASSETS_BASE_PATH` 可选：**不设置或留空时随 `APP_BASE_PATH`**，兼容 0.3.66.2 及更早的部署；填 `/` 表示独立使用根路径 `/assets/`；填 `s` 或 `/s/` 则为 `/s/assets/`。例如主页是 `/web/` 且 assets 留空时，资源仍为 `/web/assets/`。此参数只控制构建资源，不移动图标、manifest 或 Service Worker，也不支持跨域 CDN URL。

例如只把主页放在 `/gpt_image_playground/`，其余各项使用根路径：

```dotenv
APP_BASE_PATH=gpt_image_playground
ASSETS_BASE_PATH=/
API_BASE_PATH=
MEDIA_BASE_PATH=
HEALTH_BASE_PATH=
```

### environment 的两种正确写法

若希望五项共用 `/gpt_image_playground/`，五项都填 `gpt_image_playground` 即可；填写 `/gpt_image_playground/` 也会归一化成同样的前缀。下例只展示路径部分，合并到已有服务的 `environment` 中，保留密码、密钥等其他设置。

**映射格式（与第 2 节完整模板一致）：**

```yaml
environment:
  APP_BASE_PATH: "gpt_image_playground"    # 可选；主页、图标、manifest、Service Worker
  ASSETS_BASE_PATH: "gpt_image_playground" # 可选；JS/CSS，也可留空以跟随主页
  API_BASE_PATH: "gpt_image_playground"    # 可选；API 与 SSE
  MEDIA_BASE_PATH: "gpt_image_playground"  # 可选；图片、视频等媒体
  HEALTH_BASE_PATH: "gpt_image_playground" # 可选；健康检查
```

**列表格式（已有 `environment` 全部采用 `- KEY=value` 时使用）：**

```yaml
environment:
  - APP_BASE_PATH=gpt_image_playground    # 可选；主页
  - ASSETS_BASE_PATH=gpt_image_playground # 可选；JS/CSS，也可写 ASSETS_BASE_PATH= 以跟随主页
  - API_BASE_PATH=gpt_image_playground    # 可选；API 与 SSE
  - MEDIA_BASE_PATH=gpt_image_playground  # 可选；媒体
  - HEALTH_BASE_PATH=gpt_image_playground # 可选；健康检查
```

一个 `environment` 中只能选择一种格式，其他变量也必须使用相同格式。不要在已有的 `environment` 旁再添加第二个同名块。`- APP_BASE_PATH:/gpt_image_playground/` 不会给 `APP_BASE_PATH` 正确赋值；列表中应使用等号，映射中应使用冒号加空格。

以上两种正确配置得到的公开路径相同：

| 用途 | 路径 |
| --- | --- |
| 主页 | `/gpt_image_playground/` |
| JS/CSS | `/gpt_image_playground/assets/…` |
| API 与 SSE | `/gpt_image_playground/api/…` |
| 媒体 | `/gpt_image_playground/media/…` |
| 健康检查 | `/gpt_image_playground/health`、`/gpt_image_playground/health/` |
| PWA 配置、图标、Service Worker | `/gpt_image_playground/manifest.webmanifest`、`/gpt_image_playground/pwa-icon.svg`、`/gpt_image_playground/sw.js` |

前缀只允许字母、数字、下划线、短横线和路径分隔符；不能包含 `..`、查询参数、编码斜线或连续空路径段。三个后端前缀互相独立，未设置或留空都使用各自根路径，不继承主页前缀。

修改后，在 1Panel 重新部署/重建容器；命令行等价操作：

```bash
docker compose up -d --force-recreate
```

**无需重新构建镜像；只重启旧容器不会读取新的 Compose 环境变量。** 这些路径与 1Panel 安全入口独立。

### 其他路径归属

- `sw.js`、`manifest.webmanifest`、`pwa-icon.svg`，以及 PWA 的 `start_url` / `scope` 继续跟随 `APP_BASE_PATH`。
- 图片编辑器动态 JS、入口 JS/CSS 和构建预加载文件跟随 `ASSETS_BASE_PATH`；不存在或错误的 assets 地址返回 404，不返回主页 HTML。
- 登录、任务、设置、使用码、公告、备份导入导出、下载接口和两类 SSE 都属于 `/api/`，统一跟随 `API_BASE_PATH`，无需另加下载或 SSE 前缀。
- 原图、遮罩、生成图片、缩略图、输入/输出视频及视频封面都属于 `/media/`，统一跟随 `MEDIA_BASE_PATH`；`uploads`、`masks`、`outputs` 和 `thumbs` 是媒体目录内部路径。
- 外部供应商 URL、GitHub 链接、现有外部字体 CDN 和浏览器本地 `blob:` / `data:` 地址不加本应用前缀。

## 7. 推荐使用 Nginx 反代部署

**我们推荐使用 Nginx（或 OpenResty）反代部署，由反向代理统一提供域名和 HTTPS。**

### 五项统一使用 /gpt_image_playground/ 的完整示例

使用第 6 节五项同前缀的编排设置后，主页、assets 和三个后端路径可以共用一个 `location`。下面按宿主机端口 `8787` 编写，即模板中设置 `APP_PORT=8787`，或使用端口映射 `"8787:8787"`。如果继续使用模板默认的宿主机端口 `8788`，把下面的上游端口改为 `8788`；Nginx 连接的是端口映射左侧的宿主机端口。

将下面内容放入域名现有的 `server { ... }` 中，替换旧的同路径 `location`，不要与旧配置重复添加：

```nginx
location = /gpt_image_playground {
    return 301 /gpt_image_playground/;
}

# 五项都设置为 gpt_image_playground；assets 也可留空以跟随主页。
location ^~ /gpt_image_playground/ {
    # 末尾不加 /，完整保留 /gpt_image_playground/ 前缀。
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    # 默认累计上传 128 MiB，另留 multipart 和字段开销。
    client_max_body_size 160m;
    proxy_request_buffering off;
    # 保证 SSE 任务进度及时返回，媒体继续由应用鉴权。
    proxy_buffering off;
    proxy_cache off;
}
```

此配置同时覆盖 `/gpt_image_playground/health` 和 `/gpt_image_playground/health/`，也覆盖 JS/CSS、图标及 PWA 文件。无需再添加三段 API/媒体/健康检查反代。若五项设置为不同前缀，则使用下面的分别配置示例。

### 五个分别设置的路径示例

下面假设 Nginx 运行在 Docker 宿主机，应用映射到宿主机 `8788` 端口。先设置：

```dotenv
APP_PORT=8788
APP_BASE_PATH=gpt_image_playground
ASSETS_BASE_PATH=s
API_BASE_PATH=a
MEDIA_BASE_PATH=m
HEALTH_BASE_PATH=h
CORS_ORIGIN=https://image.example.com
```

将 `image.example.com` 替换为实际域名，`CORS_ORIGIN` 不包含路径。重新创建应用容器后，在域名现有的 `server { ... }` 中加入下面的配置。HTTPS 证书沿用站点配置。片段文件见 [`deploy/nginx.conf.example`](deploy/nginx.conf.example)。

```nginx
# 放入域名现有的 server 块；HTTPS 证书沿用站点配置。
# APP_BASE_PATH=gpt_image_playground
# ASSETS_BASE_PATH=s
# API_BASE_PATH=a  MEDIA_BASE_PATH=m  HEALTH_BASE_PATH=h
# APP_PORT=8788；proxy_pass 末尾不加 /，保留请求的完整路径。
location = /gpt_image_playground {
    return 301 /gpt_image_playground/;
}

# 主页、图标、manifest 和 Service Worker
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

# 独立 JS/CSS 构建资源；留空 ASSETS_BASE_PATH 时资源随主页，此段无需单独添加。
# ASSETS_BASE_PATH=/ 时改为 location ^~ /assets/；不要去掉 assets 末尾段。
location ^~ /s/assets/ {
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

对应的公开地址为：主页 `https://image.example.com/gpt_image_playground/`、构建资源 `/s/assets/…`、API `/a/api/…`、媒体 `/m/media/…`、健康检查 `/h/health` 或 `/h/health/`。

**每段 `proxy_pass` 末尾都不加 `/`，完整路径原样转发给应用。** 不同前缀需要匹配各自的 `location`；五项共用同一前缀时，可使用上一例中的单个 `location`。

若 `ASSETS_BASE_PATH` 留空，assets 随主页路径，不需要单独的 assets 段；填 `/` 时将资源段改为 `location ^~ /assets/`。如果后端三项留空，保持主页前缀不变，只需把三段后端 `location` 分别改为 `/api/`、`/media/`、`/health`。如果修改任何一个参数，只改对应的 `location` 即可。若主页也留空，则删除补斜线重定向，把主页段改成 `location /`，API/媒体等更具体的段继续保留。

API 段关闭响应缓冲和缓存，确保 SSE 实时进度及时到达；不强制发送 `Connection: upgrade`。后端是 HTTP，不需要 `proxy_ssl_server_name`、`proxy_ssl_name`。默认 `client_max_body_size 160m` 给 128 MiB 文件累计上限预留 multipart 和字段开销；应用仍检查单文件 32 MiB 和累计 128 MiB，调整应用上限时也要调整代理上限。

### 从旧反代迁移，以及资源 404 / 白屏检查

旧配置中的 `location /gpt_image_playground/` 搭配 `proxy_pass http://127.0.0.1:8787/;` 会剥掉匹配的 `/gpt_image_playground/` 前缀。设置本版路径变量后，应改成 `proxy_pass http://127.0.0.1:8787;`，让应用收到完整路径。只修改 Nginx 的访问路径不会自动设置应用环境变量；浏览器地址栏里的子路径也不会自动填入这些变量。

例如访问 `/gpt_image_playground/`，页面却请求根路径 `/assets/index-….js`、`/manifest.webmanifest` 或 `/pwa-icon.svg` 并返回 404，应按顺序检查：

1. 在浏览器查看页面源码中的 `<base href="…">` 和 `app-base-path`、`assets-base-path` 等 meta。五项统一配置时，base 应为 `/gpt_image_playground/`，五个 meta 的值应为 `/gpt_image_playground`。全部为空说明页面仍按默认根路径运行；只有 assets 为空也可能是显式配置了根路径 `/`，需对照实际设置。
2. 核对 Compose 写法：映射用 `APP_BASE_PATH: "gpt_image_playground"`，列表用 `- APP_BASE_PATH=gpt_image_playground`，不要使用冒号列表。修改后重新创建容器，单纯重启不能更新环境变量。
3. 核对 Nginx 的上游端口和路径：请求进入应用前必须保留已配置的前缀。五项共用前缀时可直接使用上面的完整示例；后端三项独立留空时，则仍需代理根路径 `/api/`、`/media/` 和 `/health`。
4. 在浏览器开发者工具的 Network 中核对入口 JS、CSS、动态加载的编辑器、manifest 和图标。JS/CSS 应返回对应资源，不能返回 404 或主页 HTML。修正后强制刷新页面；安装过旧 PWA 时，如仍加载旧内容，再注销该应用的旧 Service Worker 并重新打开。

使用第 2 节模板时，可在编排目录执行以下命令，只查看五项路径变量，避免把含密钥的全部环境变量贴到公开日志：

```bash
docker compose exec -T app node -e 'for (const k of ["APP_BASE_PATH","ASSETS_BASE_PATH","API_BASE_PATH","MEDIA_BASE_PATH","HEALTH_BASE_PATH"]) console.log(k + "=" + JSON.stringify(process.env[k] ?? ""))'
```

其中 `app` 是模板服务名；若自行修改过服务名，应使用实际名称。容器内变量正确但公开页面 meta 仍为空时，还要检查 Nginx 是否转发到了旧容器、错误的端口或其他编排实例。

### 修改前缀后无法登录：旧标签页仍请求 /api/auth/status

修改路径并重新创建容器后，已经打开的标签页可能仍运行修改前的页面和路径配置。服务端新页面正确，并不代表旧标签页已经更新。若新窗口正常、原窗口仍请求根路径，应优先检查原标签页及其缓存；仅凭这个现象不能断定是 Service Worker 导致。

以五项都设置为 `gpt_image_playground` 为例：

| 浏览器现场请求 | 判断 |
| --- | --- |
| `/api/auth/status` | 仍在使用旧的根路径；此配置下可能返回 404 |
| `/gpt_image_playground/api/auth/status` | 正确的登录状态接口；未登录时返回 200 和 `authenticated: false` 属于正常行为 |
| `/gpt_image_playground/api/auth/admin/login` | 点击管理员登录后应发出的 POST 请求 |

如果 `API_BASE_PATH` 本来就留空，`/api/auth/status` 则是正确地址；应按实际配置判断。

排查和恢复步骤：

1. 在**出问题的原标签页**打开 F12 → Network，清空已有请求记录，再刷新，避免把修改前保留的旧记录当成新请求。核对登录状态请求和点击登录后产生的 POST 请求。
2. 在这个标签页的 Console 执行下面的只读命令，检查当前运行页面的 API 前缀，而不是仅通过重新请求的“查看页面源代码”判断：

   ```javascript
   document.querySelector('meta[name="api-base-path"]')?.content
   ```

   本例应输出 `/gpt_image_playground`。若输出为空或旧值，说明这个标签页的路径配置尚未更新；若输出正确而新请求仍走旧路径，查看 Network 的 Initiator（发起程序）以定位来源。
3. 按 **Ctrl + Shift + R** 强制刷新，或关闭旧标签页后重新打开。也可使用无痕窗口对比是否仍出现相同请求。
4. 如果只有原窗口仍异常，在开发者工具中注销**本应用对应的**旧 Service Worker，并清理 Cache Storage 中名称以 `gpt-image-playground` 开头的应用缓存，再重新打开页面。此操作只针对应用缓存，不清空整个域名的站点数据，也不涉及服务器数据目录。
5. 全程使用同一个域名：`image.example.com` 与 `www.image.example.com` 是不同来源，浏览器会分别保存 Cookie、缓存及 Service Worker；不要在两个域名之间切换来判断同一次登录是否保留。

恢复后，确认 Network 中新产生的请求使用配置后的前缀；成功登录后，再确认后续登录状态接口返回 `authenticated: true`。仅看到主页或状态接口返回 200，不能作为已经登录成功的依据。

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

Release 中的 `gpt-image-playground-fork-0.3.66.3-amd64.tar.gz` 是已验证的 **Linux amd64** 镜像，不适用于 ARM 主机；ARM 主机请使用源码 Docker 构建。

```bash
sha256sum -c SHA256SUMS --ignore-missing
docker load -i gpt-image-playground-fork-0.3.66.3-amd64.tar.gz
```

使用离线镜像时，将主编排的 `image` 和 `pull_policy` 改为下面内容；如果之前添加过 `build`，同时删除整个 `build` 块：

```yaml
image: gpt-image-playground-fork:0.3.66.3
pull_policy: never
```

其他端口、环境变量和数据挂载照常填写，然后在 1Panel 创建/启动或执行 `docker compose up -d`。不要执行 `docker compose pull`，该镜像已经通过 `docker load` 导入本机。

## 10. 升级与数据保留

升级前先停止应用，备份整个持久化数据目录，并保留原 `.env`。供应商设置、使用码额度、历史任务和媒体文件都依赖原数据目录。

### 从 0.3.66 升级：先迁移数据目录权限

0.3.66 的容器默认以 root 运行，本 fork 自 0.3.66.1 起以 UID/GID 1000 运行。旧数据库或 `media/` 等目录如果仍属于 root，直接更换镜像可能导致 `EACCES: permission denied, mkdir '/app/data/media/masks'`，或数据库只读错误。镜像构建时对 `/app/data` 设置权限，不会改变后来挂载进来的宿主机旧数据。

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
- **路径变量填写了却不生效**：检查是否误写成 `- APP_BASE_PATH:/路径/`；列表应使用 `=`，映射应使用 `: ` 且不加 `-`。按第 6 节改正后重新创建容器。
- **改前缀后 404**：分别核对五项参数和对应的 Nginx `location`，确认代理未剥掉前缀；网页入口只跟随 `APP_BASE_PATH`。
- **主页白屏，JS/CSS、manifest 或图标请求到了域名根路径**：按第 7 节检查页面 base/meta、容器环境变量和代理路径；确认没有沿用剥离子路径的旧 `proxy_pass`，也没有转发到旧容器。
- **改前缀后无法登录，F12 仍请求 `/api/auth/status`**：先按实际 `API_BASE_PATH` 判断地址；若应带前缀，按第 7 节检查原标签页的 meta 和新请求记录，强制刷新或用无痕窗口对比，必要时仅清理本应用的 Service Worker 和缓存。
- **健康检查失败**：检查容器日志；编排里的健康检查已经跟随 `HEALTH_BASE_PATH`，不要改回固定 `/health`。
- **上传出现 413**：同时检查应用的单文件/累计上限及反向代理请求体上限。
- **EACCES / 数据库只读或图片保存失败**：尤其是从 0.3.66 升级时，按第 10 节迁移整个原数据目录的属主和写入权限，仅修改最外层目录或新建空目录不能解决旧文件权限问题。
- **镜像拉取失败**：确认域名为 `ghcr.io`，账号与仓库全小写，标签正确，服务器能访问 GHCR；也可使用 Release 离线镜像，先 `docker load`，改成本地镜像名和 `pull_policy: never`。

## 许可证与来源

[MIT License](LICENSE)。本 fork 与上游使用相同许可证，保留 `Copyright (c) 2026 CookSleep` 和原 MIT 许可文本。

- 原始项目：[CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)
- 0.3.66 基线：XianYuDaXian fork，提交 `0477e08e8328652cfdfaf66c463970e626a9ff69`
- 当前维护：[EttijBaqaee/gpt_image_playground](https://github.com/EttijBaqaee/gpt_image_playground)
