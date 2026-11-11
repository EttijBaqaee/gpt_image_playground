# 绘坊 · Pictelier · 0.3.66.7

[![简体中文](https://img.shields.io/badge/简体中文-当前页面-blue)](README.md) [![English](https://img.shields.io/badge/English-Readme-lightgrey)](README.en.md)

绘坊（Pictelier）是一款将生成图片保存在自己服务器上的 AI 创作工作台，基于 [GPT Image Playground](https://github.com/CookSleep/gpt_image_playground) 开发。登录同一实例，即可在手机、电脑等设备上随时查看、下载和管理已生成的图片，不必依赖单台设备的浏览器记录。

- **服务器图库与跨设备访问**：生成图片和任务记录集中保存在服务器；在不同设备上登录同一实例，即可访问已有作品。
- **多供应商接入**：支持 Images、Responses、Videos、Venice、WaveSpeed 和 Kie 等接口模式；按供应商文档配置模型与扩展能力。
- **图像创作与编辑**：支持文生图、参考图编辑、遮罩和透明标注层，以及 SVG 静态预览、GIF 动画预览与原格式下载。具体能力取决于所选接口和模型。
- **任务与素材管理**：保存任务历史、复用提示词和输入图片，支持收藏、归档、批量操作与数据备份。
- **后台与使用码分发**：由管理员集中配置上游 API、访问方式和额度；供应商密钥保存在服务端。
- **本地化与自部署**：提供中英文界面和明暗主题，可通过 Docker 或 1Panel 部署，支持独立路径配置及内网使用。

**章节快速跳转**

[Update 0.3.66.7](#release-0-3-66-7) · [界面预览](#section-1) · [1. 获取 Docker 镜像（推荐）](#section-2) · [2. 完整编排文件](#section-3) · [3. 环境变量怎么写](#section-4) · [4. 在 1Panel 中部署](#section-5) · [5. 命令行 Docker Compose](#section-6) · [6. 六项路径分别设置](#section-7) · [7. 推荐使用 Nginx 反代部署](#section-8) · [8. 上传限制与代理](#section-9) · [9. 离线镜像（可选）](#section-10) · [10. 更新与数据备份](#section-11) · [11. 常见问题](#section-12) · [许可证与来源](#section-13)

<a id="release-0-3-66-7"></a>

## Update 0.3.66.7

**2026-11-09 · 中英文界面、图像扩展与输入图复用。**

- **中英文切换**：登录页、主界面和设置窗口新增 EN / 中文按钮。首次访问根据浏览器首选语言自动选择，中文语言使用简体中文，其余语言使用英文。手动选择保存在当前浏览器，切换时保留正在编辑的表单与提示词。
- **明暗主题**：默认跟随浏览器的系统配色，支持浅色、深色与跟随系统。切换使用柔和渐变；开启“减少动态效果”时直接切换。
- **恢复自动设置**：在“设置 → 习惯配置”中，将“界面语言”改为“跟随浏览器”，或将“外观”改为“跟随系统”。语言与外观选择立即生效并保存在本机。
- **英文文档**：新增 [English README](README.en.md)，两个页面顶部均提供语言切换入口。
- **图像扩展能力**：在 Images API 配置中按“当前站点配置 + 完整模型名”手动勾选规划程度、扩展质量、透明标注层、SVG、GIF 和 SVG 编写模型。默认关闭，按供应商文档手动勾选；更换 URL 会清除扩展配置，更换模型不继承勾选。勾选仅允许发送参数，不保证供应商支持；OpenAI 兼容接口也可能接入 Seedream、Grok 等模型，不支持时可能报错或仍被计费，请先确认供应商文档。未勾选扩展时保留原参数。
- **扩展参数与标注**：在“参数设置 → 扩展参数”中设置可用选项。添加参考图后可标注第一张图片，支持画笔、矩形、箭头、橡皮擦、撤销与清空。透明 PNG 标注层与原图分别提交，标注和遮罩互斥；缺少能力时会在提交前提示，不会把标注当作遮罩。
- **SVG / GIF**：仅用于无参考图的文生图；SVG 数量为 1，二者均不使用压缩率。SVG 以静态矢量图片预览，GIF 在大图预览中播放，下载保留原格式。GIF 帧数上限默认 16，供应商明确支持时可设至 64；每帧时长支持 20–2000 毫秒。复用为参考图时转为位图，原始制品保留。
- **输入图复用与去重**：修复相同图片重复上传及压缩后复用；启动时和备份恢复后自动处理历史输入图。内容相同的输入图通过硬链接共享磁盘数据，各任务的图片 ID、路径、权限、顺序和遮罩关联保持独立，删除最后一个引用后释放空间。不支持硬链接的文件系统保留独立文件。
- **空目录清理**：删除任务时清理对应的空媒体目录，启动时清理已删除任务遗留的空目录，保留其他文件。
- **参考图访问提示**：保留内网部署支持，新增红色提示，务必确保上游服务能够访问参考图地址；检测通过仅表示当前服务器可访问。

官方已公布的完整模型名为 `gpt-image-2.6-sunburst`、`gpt-image-2.6-flare`。中转别名需按供应商实际值填写，再明确配置能力。详见 [OpenAI 图像文档](https://developers.openai.com/api/docs/guides/image-generation)。






---

<a id="section-1"></a>

## 界面预览

<p align="center">
  <img src="asset/主界面.png" alt="服务器图库与任务管理" width="100%" />
  <img src="asset/设置界面.png" alt="服务器数据管理" width="100%" />
</p>

界面预览：0.3.66.9，使用本地演示数据展示图库和服务器数据管理。

<a id="section-2"></a>

## 1. 获取 Docker 镜像（推荐）

服务器只需 Docker Engine 和 Docker Compose v2，可直接拉取绘坊的镜像，无需安装 Node.js 或在宿主机编译：

```bash
docker pull ghcr.io/ettijbaqaee/pictelier:0.3.66.7
# 跟随绘坊的最新发布版本
docker pull ghcr.io/ettijbaqaee/pictelier:latest
```

正式部署建议固定 `0.3.66.7`。本次发布镜像为 **Linux amd64**，容器使用 UID/GID 1000。GHCR 镜像与 Release 离线镜像使用相同应用内容，不是另行编译的版本。

### 首次创建持久化目录

以下命令由 root 执行，为新部署创建数据目录：

```bash
mkdir -p /opt/pictelier-data
chown 1000:1000 /opt/pictelier-data
```

数据目录必须让 UID/GID 1000 可写。使用已有目录时，检查目录内数据库和媒体文件的权限，排障步骤见第 10 节。

### 可选：获取源码并在 Docker 内构建

只有需要自行构建时才需要 Git，以及访问基础镜像、npm 和 Debian 软件源：

```bash
git clone --branch v0.3.66.7 https://github.com/EttijBaqaee/pictelier.git /opt/pictelier
cd /opt/pictelier/deploy
cp .env.example .env
```

也可以从 [0.3.66.7 Release](https://github.com/EttijBaqaee/pictelier/releases/tag/v0.3.66.7) 下载源码包并解压；`APP_SOURCE_DIR` 应指向含 `package.json`、`server/` 和 `deploy/` 的源码根目录。

标准源码构建使用 `deploy/Dockerfile`，依赖安装、前端编译和后端编译都在 Docker 内完成。`deploy/Dockerfile.1panel` 是已有 Linux 锁定依赖缓存环境的构建文件，不能直接用于没有 `node_modules` 的干净源码；首次部署请使用标准 `deploy/Dockerfile`。

<a id="section-3"></a>

## 2. 完整编排文件

仓库内模板为 [`deploy/docker-compose.yml`](deploy/docker-compose.yml)。可以直接用于命令行，也可以粘贴进 1Panel 编排编辑器：

**下面的 `environment` 使用映射格式：`APP_BASE_PATH: "值"`，前面不加 `-`。** 如果已有编排使用列表格式，应写成 `- APP_BASE_PATH=值`。不能写成 `- APP_BASE_PATH:/pictelier/`；两种正确写法和完整路径示例见第 6 节。

```yaml
# 必填变量：APP_SECRET、ADMIN_PASSWORD；其余变量均可选，未填写时使用下方默认值。
# ${变量:-默认值} 从同目录 .env 或 1Panel 编排环境变量读取；也可将整个引号内的值改为实际值。
# 例如 APP_BASE_PATH: "web"；留空请写 ""。修改变量后需重新创建容器才能生效。
name: pictelier # 可选：编排项目名；同一服务器部署多套时使用不同名称。

services:
  app:
    # 镜像：推荐固定此版本；可按需改为绘坊的其他已发布标签。
    image: ghcr.io/ettijbaqaee/pictelier:0.3.66.7
    # 可选：本机没有镜像时才拉取；升级时主动执行 docker compose pull app。
    pull_policy: if_not_present
    container_name: pictelier # 可选：容器名；部署多套时必须各不相同。
    restart: unless-stopped # 可选：异常退出或重启服务器后自动启动，手动停止除外。
    ports:
      # APP_PORT 可选，默认 8787：左侧为宿主机端口；右侧容器端口保持 8787。
      - "${APP_PORT:-8787}:8787"
    environment:
      # 以下路径参数均可选；可填 web 或 /web/ 这样的形式。
      # 主页前缀（含图标、manifest、Service Worker）：web → /web/；默认留空 → /。
      APP_BASE_PATH: "${APP_BASE_PATH:-}"
      # JS/CSS 等构建资源前缀：s → /s/assets/；留空沿用主页前缀；填 / → /assets/。
      # 可单独设置，不需要重新构建镜像。assets 末尾段保持不变。
      ASSETS_BASE_PATH: "${ASSETS_BASE_PATH:-}"
      # 以下四个后端前缀互相独立，留空均不继承主页前缀。
      # API 前缀：a → /a/api/…；默认留空 → /api/…。
      API_BASE_PATH: "${API_BASE_PATH:-}"
      # 媒体前缀：m → /m/media/…；默认留空 → /media/…。
      MEDIA_BASE_PATH: "${MEDIA_BASE_PATH:-}"
      # 可选：供应商公网参考图的独立前缀：r → /r/references/…；默认留空 → /references/…。
      # 仅开启“参考图使用公网 URL”的节点使用；反代保留完整路径和签名参数，修改后需重新检测。
      REFERENCE_BASE_PATH: "${REFERENCE_BASE_PATH:-}"
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
      # 可选：首次初始化节点的请求超时，单位秒，默认 300；填写正整数。
      # 已有节点请在网页的供应商/API 配置中修改“请求超时”，此变量不会覆盖已保存节点。
      UPSTREAM_TIMEOUT_SECONDS: "${UPSTREAM_TIMEOUT_SECONDS:-300}"
      # 可选：Codex CLI 兼容开关，默认 false；仅对应供应商要求时设为 true。
      UPSTREAM_CODEX_CLI: "${UPSTREAM_CODEX_CLI:-false}"
    volumes:
      # APP_DATA_DIR 可选，默认 ../docker-data（相对编排文件目录）；1Panel 推荐填写绝对路径。
      # 左侧为宿主机持久化目录，需让 UID/GID 1000 可写；右侧保持 /app/data。
      # 升级必须继续使用原数据目录，避免进入空数据库。
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

<a id="section-4"></a>

## 3. 环境变量怎么写

命令行部署使用 `deploy/.env`。1Panel 使用该编排的环境变量编辑区，或者编排目录中的 `.env`。**不要把 `.env` 提交到 GitHub。**

下面是首次部署示例，两个密码占位符必须替换：

```dotenv
APP_SECRET=replace-with-a-long-random-secret-at-least-32-characters
ADMIN_PASSWORD=replace-with-your-admin-password
APP_PORT=8787
APP_BASE_PATH=
ASSETS_BASE_PATH=
API_BASE_PATH=
MEDIA_BASE_PATH=
REFERENCE_BASE_PATH=
HEALTH_BASE_PATH=
CORS_ORIGIN=*

# 使用绝对数据路径，避免把数据写到错误目录
APP_DATA_DIR=/opt/pictelier-data
# 仅源码构建时需要；镜像拉取部署可以不填
APP_SOURCE_DIR=

TRUSTED_PROXIES=
UPLOAD_MAX_FILE_MB=32
UPLOAD_MAX_TOTAL_MB=128
```

可用 `openssl rand -hex 32` 生成 `APP_SECRET`。请妥善保管 `.env` 和数据目录；会话签名及供应商密钥加密依赖 `APP_SECRET`。

`UPSTREAM_API_URL` / `UPSTREAM_API_KEY` 可留空，登录网页后配置供应商。可选初始化参数见 [`deploy/.env.example`](deploy/.env.example)。

### 参考图使用公网 URL

需要公网参考图的供应商，可在管理员的 API 配置中开启“参考图使用公网 URL”。开关位于“返回 Base64 图片数据”下方，开启后填写“公网访问地址”，然后点击“检测公网访问”；检测通过后才允许保存。无需在 Docker 编排中添加 `PUBLIC_BASE_URL`。

- 支持 `https://example.com`、`https://example.com:8443`，也支持无证书的 `http://公网IP:端口`。只填写协议、域名或 IP、可选端口，不填主页或媒体路径。上游服务必须能访问该地址；内网部署可使用上游能够访问的内网地址，部分供应商可能只允许 HTTPS。
- 只对标准 Images 模式生效，与 Grok API 兼容、Codex CLI 模式互斥。没有参考图时继续使用原来的文生图请求；关闭开关后继续使用文件上传。
- 有参考图时，后端按 OpenAI 官方格式，以 JSON 请求 `/v1/images/edits`，使用 `images: [{"image_url":"临时公网链接"}]`。多图按最终排列提交；遮罩使用 `mask.image_url`。第三方接口是否完整支持该格式及遮罩，仍由供应商决定。
- 公网参考图使用独立的 `REFERENCE_BASE_PATH`，不继承主页或媒体前缀。编排中填 `REFERENCE_BASE_PATH: "r"`，公网地址填 `https://example.com`，生成链接就是 `https://example.com/r/references/uploads/…?ref_provider=…&ref_expires=…&ref_signature=…`；留空使用 `/references/…`。`references` 末尾段保留。
- 检测由应用后端通过所填地址读取本次随机生成的临时图片，最多等待 10 秒，并核对图片内容；不调用供应商 API。公网地址、参考图路径反代、签名查询参数或额外登录有误时无法通过。更换公网地址、重新开启开关或更换 `REFERENCE_BASE_PATH` 后需要重新检测；它验证当前服务器能通过该地址访问图片，不能保证供应商所在网络也允许访问。
- 浏览器能访问，但检测仍超时时，请检查应用容器能否回访所填公网地址和端口。防火墙、Docker 桥接网络或路由器不支持 NAT 回环时，容器可能无法访问自身映射端口；应调整回访网络或使用容器可回访的 Nginx 反代入口，再重新检测。HTTP 地址不需要证书。
- 临时链接在任务实际执行时生成，至少有效 1 小时；长请求按“两倍节点请求超时加 60 秒”延长。过期后重新提交任务会获得新链接。签名仅允许读取该节点任务的指定输入图片或遮罩，其他媒体继续要求登录；关闭节点的公网 URL 开关即可使该节点旧链接失效。

使用 Nginx 时，参考图反代必须保留完整前缀和查询参数，不应对该路径额外添加 Basic Auth 或网页登录。它只接受指定输入图片或遮罩的临时签名链接；原有媒体路径仍要求登录，不能把 `references` 改写为 `media`：

```nginx
# REFERENCE_BASE_PATH=r 时的示例；留空时改为 location ^~ /references/。
location ^~ /r/references/ {
    # proxy_pass 后不附加 URI，保留原始路径和签名参数。
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache off;
}
```

直接通过 `http://公网IP:端口` 访问容器时，开放相应端口即可；若 `REFERENCE_BASE_PATH` 为空，临时链接直接使用 `/references/…`。该配置只改变访问路由，图片保存在持久化数据目录，无需为参考图链接新增挂载。

### 请求超时与 5 分钟报错

`fetch failed | Headers Timeout Error | UND_ERR_HEADERS_TIMEOUT` 表示后端向上游请求时，等待响应头超过了 Node.js / Undici 的限制。`0.3.66.5` 及以前的版本存在两层计时器没有统一的问题：网页中设置 600 或 1800 秒，底层默认的 300 秒仍可能先触发。只修改 Nginx 的超时不能解除这个限制。**0.3.66.6 已修复，底层请求遵循节点设置的超时。**

已有节点需要在网页的供应商/API 配置中修改“请求超时 (秒)”并保存，再提交新任务。`UPSTREAM_TIMEOUT_SECONDS` 只在尚无默认节点时初始化“环境变量默认节点”，不会覆盖数据库中已保存的设置；重建容器也不会覆盖。

0.3.66.6 让直连、HTTP/HTTPS 代理和 SOCKS 请求按配置限制一次请求从发出到完整读取正文的总时间，同时取消图片接口强制不少于 180 秒的限制。Images / Responses 返回结果图片 URL 时，后续下载单独使用同一个超时秒数；视频结果下载同理。它不代表整个任务的统一总时限：多图多次调用、异步轮询和重试各有自己的计时；Kie / WaveSpeed 结果 CDN 下载原有的每次 120 秒和重试规则继续保留。上游自己的网关或反代超时也仍可能更早结束请求。

<a id="section-5"></a>

## 4. 在 1Panel 中部署

1. 按第 1 节创建持久化目录并设置 UID/GID 1000 写入权限。
2. 进入 **容器 → 编排 → 创建编排**，选择编辑编排，名称填写 `pictelier`。
3. 粘贴第 2 节完整 YAML，使用 `ghcr.io/ettijbaqaee/pictelier:0.3.66.7`。
4. 在编排环境变量中填写第 3 节参数，替换 `APP_SECRET` 和 `ADMIN_PASSWORD`，`APP_DATA_DIR` 使用绝对路径。六项路径按第 6 节分别填写或留空。
5. 创建并启动，面板会拉取镜像并创建容器，不需要下载源码或现场编译。
6. 容器健康状态变为 `healthy` 后，按 `APP_PORT` 和 `APP_BASE_PATH` 访问。推荐再按第 7 节配置 Nginx/HTTPS。

### 在 1Panel 内改用源码构建

下载源码到服务器（例如 `/opt/pictelier`），在环境变量中设置 `APP_SOURCE_DIR=/opt/pictelier`，并把主编排中的 `image` / `pull_policy` 改为下面内容，同时加入 `build`：

```yaml
image: pictelier:0.3.66.7
pull_policy: never
build:
  context: ${APP_SOURCE_DIR}
  dockerfile: deploy/Dockerfile
```

这些键与主编排 `app` 下的 `ports`、`environment` 平级。源码目录必须含 `package.json`、`server/`、`deploy/Dockerfile`；`build.context` 不是 `deploy/` 或 1Panel 编排自身目录。

如果面板版本首次创建未执行构建，可在服务器终端进入 **面板管理的同一份编排目录**，执行 `docker compose build app`，再回面板启动。编排实际路径以面板显示为准，例如 `/opt/1panel/docker/compose/pictelier`。不要另外建立不同数据目录的一套部署。

<a id="section-6"></a>

## 5. 命令行 Docker Compose

把第 2 节 YAML 保存为 `docker-compose.yml`，同目录创建第 3 节的 `.env`，准备好数据目录后：

```bash
docker compose config --quiet
docker compose pull app
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
```

若使用仓库内模板，则在 `/opt/pictelier/deploy` 目录执行上述命令。

### 可选：从源码 Docker 构建

仓库提供 [`deploy/docker-compose.build.yml`](deploy/docker-compose.build.yml) 作为源码构建覆盖文件：

```bash
cd /opt/pictelier/deploy
docker compose -f docker-compose.yml -f docker-compose.build.yml build app
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d
```

该模式使用本地镜像名 `pictelier:0.3.66.7`，不向 GHCR 上传。之后修改环境变量时仍使用相同两个 `-f` 文件。依赖安装和前后端编译均在 Docker 内完成，不需要在宿主机执行 `npm install` 或 `npm run build`。

<a id="section-7"></a>

## 6. 六项路径分别设置

所有参数都是**前缀**，不是完整 URL；`assets`、`api`、`media`、`references`、`health` 末尾段仍保留。`REFERENCE_BASE_PATH` 为 0.3.66.6 新增参数，专用于供应商读取公网参考图。

```dotenv
APP_BASE_PATH=web
ASSETS_BASE_PATH=s
API_BASE_PATH=a
MEDIA_BASE_PATH=m
REFERENCE_BASE_PATH=r
HEALTH_BASE_PATH=h
```

假设宿主机端口是 `8787`：

| 用途 | 全部留空 | 上面的配置 |
| --- | --- | --- |
| 主页、图标、manifest、Service Worker | `http://服务器IP:8787/` | `http://服务器IP:8787/web/` |
| JS/CSS 等构建资源 | `/assets/…` | `/s/assets/…` |
| API 与 SSE | `/api/…` | `/a/api/…` |
| 媒体 | `/media/…` | `/m/media/…` |
| 供应商公网参考图（临时签名） | `/references/…` | `/r/references/…` |
| 健康检查 | `/health`、`/health/` | `/h/health`、`/h/health/` |

`ASSETS_BASE_PATH` 可选：**不设置或留空时随 `APP_BASE_PATH`**，兼容 0.3.66.2 及更早的部署；填 `/` 表示独立使用根路径 `/assets/`；填 `s` 或 `/s/` 则为 `/s/assets/`。例如主页是 `/web/` 且 assets 留空时，资源仍为 `/web/assets/`。此参数只控制构建资源，不移动图标、manifest 或 Service Worker，也不支持跨域 CDN URL。

例如只把主页放在 `/pictelier/`，其余各项使用根路径：

```dotenv
APP_BASE_PATH=pictelier
ASSETS_BASE_PATH=/
API_BASE_PATH=
MEDIA_BASE_PATH=
REFERENCE_BASE_PATH=
HEALTH_BASE_PATH=
```

### environment 的两种正确写法

若希望六项共用 `/pictelier/` 前缀，六项都填 `pictelier` 即可；填写 `/pictelier/` 也会归一化成同样的前缀。参考图仍是独立的 `/pictelier/references/…`，普通媒体是 `/pictelier/media/…`。下例只展示路径部分，合并到已有服务的 `environment` 中，保留密码、密钥等其他设置。

**映射格式（与第 2 节完整模板一致）：**

```yaml
environment:
  APP_BASE_PATH: "pictelier"    # 可选；主页、图标、manifest、Service Worker
  ASSETS_BASE_PATH: "pictelier" # 可选；JS/CSS，也可留空以跟随主页
  API_BASE_PATH: "pictelier"    # 可选；API 与 SSE
  MEDIA_BASE_PATH: "pictelier"  # 可选；图片、视频等媒体
  REFERENCE_BASE_PATH: "pictelier" # 可选；独立的供应商公网参考图
  HEALTH_BASE_PATH: "pictelier" # 可选；健康检查
```

**列表格式（已有 `environment` 全部采用 `- KEY=value` 时使用）：**

```yaml
environment:
  - APP_BASE_PATH=pictelier    # 可选；主页
  - ASSETS_BASE_PATH=pictelier # 可选；JS/CSS，也可写 ASSETS_BASE_PATH= 以跟随主页
  - API_BASE_PATH=pictelier    # 可选；API 与 SSE
  - MEDIA_BASE_PATH=pictelier  # 可选；媒体
  - REFERENCE_BASE_PATH=pictelier # 可选；独立的供应商公网参考图
  - HEALTH_BASE_PATH=pictelier # 可选；健康检查
```

一个 `environment` 中只能选择一种格式，其他变量也必须使用相同格式。不要在已有的 `environment` 旁再添加第二个同名块。`- APP_BASE_PATH:/pictelier/` 不会给 `APP_BASE_PATH` 正确赋值；列表中应使用等号，映射中应使用冒号加空格。

以上两种正确配置得到的公开路径相同：

| 用途 | 路径 |
| --- | --- |
| 主页 | `/pictelier/` |
| JS/CSS | `/pictelier/assets/…` |
| API 与 SSE | `/pictelier/api/…` |
| 媒体 | `/pictelier/media/…` |
| 供应商公网参考图（临时签名） | `/pictelier/references/…` |
| 健康检查 | `/pictelier/health`、`/pictelier/health/` |
| PWA 配置、图标、Service Worker | `/pictelier/manifest.webmanifest`、`/pictelier/pwa-icon.svg`、`/pictelier/sw.js` |

前缀只允许字母、数字、下划线、短横线和路径分隔符；不能包含 `..`、查询参数、编码斜线或连续空路径段。四个后端前缀互相独立，未设置或留空都使用各自根路径，不继承主页前缀。修改 `REFERENCE_BASE_PATH` 后，网页中的公网访问地址须重新检测后保存。

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
- 供应商读取参考图和遮罩，以及检测使用的临时图片，统一走独立的 `/references/`，跟随 `REFERENCE_BASE_PATH`。普通媒体访问继续要求登录，即使带上参考图签名也不会免登录。
- 外部供应商 URL、GitHub 链接、现有外部字体 CDN 和浏览器本地 `blob:` / `data:` 地址不加本应用前缀。

<a id="section-8"></a>

## 7. 推荐使用 Nginx 反代部署

**我们推荐使用 Nginx（或 OpenResty）反代部署，由反向代理统一提供域名和 HTTPS。**

### 六项统一使用 /pictelier/ 前缀的完整示例

使用第 6 节六项同前缀的编排设置后，主页、assets 和四个后端路径可以共用一个 `location`。模板默认使用 `8787:8787`，下面的代理示例均连接宿主机端口 `8787`。

将下面内容放入域名现有的 `server { ... }` 中，替换旧的同路径 `location`，不要与旧配置重复添加：

```nginx
location = /pictelier {
    return 301 /pictelier/;
}

# 六项都设置为 pictelier；assets 也可留空以跟随主页。
location ^~ /pictelier/ {
    # 末尾不加 /，完整保留 /pictelier/ 前缀。
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

此配置同时覆盖 `/pictelier/health` 和 `/pictelier/health/`，也覆盖 JS/CSS、图标、PWA 文件及独立的 `/pictelier/references/`。无需再添加 API/媒体/参考图/健康检查反代。若六项设置为不同前缀，则使用下面的分别配置示例。

### 六项分别设置的路径示例

下面假设 Nginx 运行在 Docker 宿主机，应用映射到宿主机 `8787` 端口。先设置：

```dotenv
APP_PORT=8787
APP_BASE_PATH=pictelier
ASSETS_BASE_PATH=s
API_BASE_PATH=a
MEDIA_BASE_PATH=m
REFERENCE_BASE_PATH=r
HEALTH_BASE_PATH=h
CORS_ORIGIN=https://image.example.com
```

将 `image.example.com` 替换为实际域名，`CORS_ORIGIN` 不包含路径。重新创建应用容器后，在域名现有的 `server { ... }` 中加入下面的配置。HTTPS 证书沿用站点配置。片段文件见 [`deploy/nginx.conf.example`](deploy/nginx.conf.example)。

```nginx
# 放入域名现有的 server 块；HTTPS 证书沿用站点配置。
# APP_BASE_PATH=pictelier
# ASSETS_BASE_PATH=s
# API_BASE_PATH=a  MEDIA_BASE_PATH=m  REFERENCE_BASE_PATH=r  HEALTH_BASE_PATH=h
# APP_PORT=8787；proxy_pass 末尾不加 /，保留请求的完整路径。
location = /pictelier {
    return 301 /pictelier/;
}

# 主页、图标、manifest 和 Service Worker
location ^~ /pictelier/ {
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
}

# 独立 JS/CSS 构建资源；留空 ASSETS_BASE_PATH 时资源随主页，此段无需单独添加。
# ASSETS_BASE_PATH=/ 时改为 location ^~ /assets/；不要去掉 assets 末尾段。
location ^~ /s/assets/ {
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
}

# API、上传和 SSE 任务进度
location ^~ /a/api/ {
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
    # 为默认 128 MiB 文件累计限制预留 multipart / 字段开销。
    client_max_body_size 160m;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_cache off;
}

# 媒体仍由应用鉴权，不在代理层建立公共缓存。
location ^~ /m/media/ {
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
    proxy_cache off;
}

# 独立公网参考图：应用验证临时签名；保留查询参数，不额外添加登录认证。
# REFERENCE_BASE_PATH 留空时改为 location ^~ /references/。
location ^~ /r/references/ {
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
    proxy_cache off;
}

# 同时覆盖 /h/health 和 /h/health/；不存在的后缀由应用返回 404。
location /h/health {
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
    proxy_cache off;
}
```

对应的公开地址为：主页 `https://image.example.com/pictelier/`、构建资源 `/s/assets/…`、API `/a/api/…`、媒体 `/m/media/…`、公网参考图 `/r/references/…`、健康检查 `/h/health` 或 `/h/health/`。

**每段 `proxy_pass` 末尾都不加 `/`，完整路径原样转发给应用。** 不同前缀需要匹配各自的 `location`；六项共用同一前缀时，可使用上一例中的单个 `location`。

若 `ASSETS_BASE_PATH` 留空，assets 随主页路径，不需要单独的 assets 段；填 `/` 时将资源段改为 `location ^~ /assets/`。如果后端四项留空，保持主页前缀不变，把四段后端 `location` 分别改为 `/api/`、`/media/`、`/references/`、`/health`。如果修改任何一个参数，只改对应的 `location` 即可。若主页也留空，则删除补斜线重定向，把主页段改成 `location /`，API/媒体/参考图等更具体的段继续保留。

API 段关闭响应缓冲和缓存，确保 SSE 实时进度及时到达；不强制发送 `Connection: upgrade`。后端是 HTTP，不需要 `proxy_ssl_server_name`、`proxy_ssl_name`。默认 `client_max_body_size 160m` 给 128 MiB 文件累计上限预留 multipart 和字段开销；应用仍检查单文件 32 MiB 和累计 128 MiB，调整应用上限时也要调整代理上限。

### 反代资源 404 / 白屏检查

若 `location /pictelier/` 搭配 `proxy_pass http://127.0.0.1:8787/;` 会剥掉匹配的 `/pictelier/` 前缀。应改成 `proxy_pass http://127.0.0.1:8787;`，让应用收到完整路径。只修改 Nginx 的访问路径不会自动设置应用环境变量；浏览器地址栏里的子路径也不会自动填入这些变量。

例如访问 `/pictelier/`，页面却请求根路径 `/assets/index-….js`、`/manifest.webmanifest` 或 `/pwa-icon.svg` 并返回 404，应按顺序检查：

1. 在浏览器查看页面源码中的 `<base href="…">` 和 `app-base-path`、`assets-base-path` 等 meta。六项统一配置时，base 应为 `/pictelier/`，原有五个 meta 的值应为 `/pictelier`；新增参考图路径由后端使用，不写入页面 meta。全部为空说明页面仍按默认根路径运行；只有 assets 为空也可能是显式配置了根路径 `/`，需对照实际设置。
2. 核对 Compose 写法：映射用 `APP_BASE_PATH: "pictelier"`，列表用 `- APP_BASE_PATH=pictelier`，不要使用冒号列表。修改后重新创建容器，单纯重启不能更新环境变量。
3. 核对 Nginx 的上游端口和路径：请求进入应用前必须保留已配置的前缀。六项共用前缀时可直接使用上面的完整示例；后端四项独立留空时，则仍需代理根路径 `/api/`、`/media/`、`/references/` 和 `/health`。
4. 在浏览器开发者工具的 Network 中核对入口 JS、CSS、动态加载的编辑器、manifest 和图标。JS/CSS 应返回对应资源，不能返回 404 或主页 HTML。修正后强制刷新页面；安装过旧 PWA 时，如仍加载旧内容，再注销该应用的旧 Service Worker 并重新打开。

使用第 2 节模板时，可在编排目录执行以下命令，只查看六项路径变量，避免把含密钥的全部环境变量贴到公开日志：

```bash
docker compose exec -T app node -e 'for (const k of ["APP_BASE_PATH","ASSETS_BASE_PATH","API_BASE_PATH","MEDIA_BASE_PATH","REFERENCE_BASE_PATH","HEALTH_BASE_PATH"]) console.log(k + "=" + JSON.stringify(process.env[k] ?? ""))'
```

其中 `app` 是模板服务名；若自行修改过服务名，应使用实际名称。容器内变量正确但公开页面 meta 仍为空时，还要检查 Nginx 是否转发到了旧容器、错误的端口或其他编排实例。

### 修改前缀后无法登录：旧标签页仍请求 /api/auth/status

修改路径并重新创建容器后，已经打开的标签页可能仍运行修改前的页面和路径配置。服务端新页面正确，并不代表旧标签页已经更新。若新窗口正常、原窗口仍请求根路径，应优先检查原标签页及其缓存；仅凭这个现象不能断定是 Service Worker 导致。

以六项都设置为 `pictelier` 为例：

| 浏览器现场请求 | 判断 |
| --- | --- |
| `/api/auth/status` | 仍在使用旧的根路径；此配置下可能返回 404 |
| `/pictelier/api/auth/status` | 正确的登录状态接口；未登录时返回 200 和 `authenticated: false` 属于正常行为 |
| `/pictelier/api/auth/admin/login` | 点击管理员登录后应发出的 POST 请求 |

如果 `API_BASE_PATH` 本来就留空，`/api/auth/status` 则是正确地址；应按实际配置判断。

排查和恢复步骤：

1. 在**出问题的原标签页**打开 F12 → Network，清空已有请求记录，再刷新，避免把修改前保留的旧记录当成新请求。核对登录状态请求和点击登录后产生的 POST 请求。
2. 在这个标签页的 Console 执行下面的只读命令，检查当前运行页面的 API 前缀，而不是仅通过重新请求的“查看页面源代码”判断：

   ```javascript
   document.querySelector('meta[name="api-base-path"]')?.content
   ```

   本例应输出 `/pictelier`。若输出为空或旧值，说明这个标签页的路径配置尚未更新；若输出正确而新请求仍走旧路径，查看 Network 的 Initiator（发起程序）以定位来源。
3. 按 **Ctrl + Shift + R** 强制刷新，或关闭旧标签页后重新打开。也可使用无痕窗口对比是否仍出现相同请求。
4. 如果只有原窗口仍异常，在开发者工具中注销**本应用对应的**旧 Service Worker，并清理 Cache Storage 中本应用对应的缓存，再重新打开页面。此操作只针对应用缓存，不清空整个域名的站点数据，也不涉及服务器数据目录。
5. 全程使用同一个域名：`image.example.com` 与 `www.image.example.com` 是不同来源，浏览器会分别保存 Cookie、缓存及 Service Worker；不要在两个域名之间切换来判断同一次登录是否保留。

恢复后，确认 Network 中新产生的请求使用配置后的前缀；成功登录后，再确认后续登录状态接口返回 `authenticated: true`。仅看到主页或状态接口返回 200，不能作为已经登录成功的依据。

检查并重载：

```bash
nginx -t && nginx -s reload
```

1Panel/OpenResty 使用面板的配置检测、重载操作。

### 后端端口与可信代理

- 示例的宿主机端口与容器端口均为 `8787`；如自定义宿主机端口，请同步调整反向代理的上游端口。
- Nginx 在宿主机且只通过反代访问时，可以把编排端口映射改为 `127.0.0.1:${APP_PORT:-8787}:8787`，让后端仅监听本机。
- 如果 Nginx 也在容器中，`127.0.0.1` 指向 Nginx 容器自己，应改用共享 Docker 网络中的应用服务名和容器端口 `8787`，或实际可达的宿主机地址。
- `TRUSTED_PROXIES` 应填写应用实际看到的代理 IP/CIDR，Docker 转发下可能是网关地址，不能直接假定为 `127.0.0.1`；不确定时保持留空。

<a id="section-9"></a>

## 8. 上传限制与代理

- 上传大小按实际流式读取的字节累计检查，不只看请求头声明。
- 单次最多 32 个文件、16 个普通字段，普通字段上限为 1 MiB。
- 超限请求会被拒绝并清理本次附件；未完成上传不会产生可运行的残缺任务或错误扣费。
- `TRUSTED_PROXIES` 留空时，不采信请求中自行填写的 `X-Forwarded-For`。
- 使用代理时只配置真正的代理 IP/CIDR，不能填写 `*`、`true`、`0.0.0.0/0` 或 `::/0`。

<a id="section-10"></a>

## 9. 离线镜像（可选）

Release 中的 `pictelier-0.3.66.7-amd64.tar.gz` 是 **Linux amd64** 镜像，不适用于 ARM 主机；ARM 主机请使用源码 Docker 构建。

```bash
sha256sum -c SHA256SUMS --ignore-missing
docker load -i pictelier-0.3.66.7-amd64.tar.gz
```

使用离线镜像时，将主编排的 `image` 和 `pull_policy` 改为下面内容；如果之前添加过 `build`，同时删除整个 `build` 块：

```yaml
image: pictelier:0.3.66.7
pull_policy: never
```

其他端口、环境变量和数据挂载照常填写，然后在 1Panel 创建/启动或执行 `docker compose up -d`。不要执行 `docker compose pull`，该镜像已经通过 `docker load` 导入本机。

<a id="section-11"></a>

## 10. 更新与数据备份

升级前先停止应用，备份整个持久化数据目录，并保留原 `.env`。供应商设置、使用码额度、历史任务和媒体文件都依赖原数据目录。

0.3.66.7 会在启动及备份恢复后自动检查历史输入图；新上传的输入图也参与去重。内容完全相同的输入图通过硬链接共享磁盘存储，各任务的图片 ID、路径、权限、顺序及遮罩关联保持不变，最后一个引用删除后释放存储空间。数据目录的文件系统需支持硬链接；不支持时保留原有独立文件。

### 数据目录写权限

容器以 UID/GID 1000 运行。SQLite 数据库、`app.db-wal`、`app.db-shm` 和媒体目录都需要该用户的写权限；只修改最外层目录不够。镜像内设置的权限不会覆盖宿主机挂载目录的权限。

出现 `SQLITE_READONLY` 或 `EACCES` 时，先在 1Panel 确认 `/app/data` 挂载为读写，并核对实际宿主机路径。停止应用并备份整个数据目录后，在实际编排目录以 root 执行：

```bash
set -e
docker compose stop app
docker compose run --rm --no-deps --user 0:0 \
  --cap-add CHOWN --cap-add FOWNER --cap-add DAC_OVERRIDE \
  --entrypoint sh app -eu -c \
  'chown -Rh 1000:1000 /app/data && chmod -R u+rwX /app/data'
docker compose up -d app
docker compose logs --tail=50 app
```

`app` 是模板中的服务名。一次性容器使用该服务的数据挂载，仅调整属主及属主读写权限。若编排使用多个 `-f` 文件，所有命令都需带相同的文件组合。若挂载显示只读，应先改为读写；文件系统本身只读时，应先处理宿主机存储问题。

- GHCR 镜像升级：修改 `image` 中的版本标签，执行 `docker compose pull app`，再执行 `docker compose up -d`；1Panel 等价操作为拉取镜像并重新部署编排。
- 源码构建升级：更新源码后，使用第 5 节相同的两个 `-f` 文件重新构建并启动。
- 离线镜像升级：导入新镜像，修改 `image` 标签后重新部署。
- 只改环境变量：重新创建容器，不需要重新构建镜像。
- 继续使用相同的 `APP_SECRET`、管理员密码和数据挂载；不要删除数据卷或对旧部署执行 `down -v`。
- GHCR 和离线镜像均使用 UID/GID 1000。若挂载目录不可写，按上述步骤修正数据目录权限。

<a id="section-12"></a>

## 11. 常见问题

- **1Panel 找不到 Dockerfile**：检查 `APP_SOURCE_DIR` 是否为绝对源码根目录，而不是 `deploy/` 或编排自身目录。
- **要求设置 APP_SECRET / ADMIN_PASSWORD**：环境变量未保存或 `.env` 不在编排读取位置，填写后重新部署。
- **路径变量填写了却不生效**：检查是否误写成 `- APP_BASE_PATH:/路径/`；列表应使用 `=`，映射应使用 `: ` 且不加 `-`。按第 6 节改正后重新创建容器。
- **改前缀后 404**：分别核对六项参数和对应的 Nginx `location`，确认代理未剥掉前缀；网页入口只跟随 `APP_BASE_PATH`。公网参考图还需重新检测后保存。
- **主页白屏，JS/CSS、manifest 或图标请求到了域名根路径**：按第 7 节检查页面 base/meta、容器环境变量和代理路径；确认没有沿用剥离子路径的旧 `proxy_pass`，也没有转发到旧容器。
- **改前缀后无法登录，F12 仍请求 `/api/auth/status`**：先按实际 `API_BASE_PATH` 判断地址；若应带前缀，按第 7 节检查原标签页的 meta 和新请求记录，强制刷新或用无痕窗口对比，必要时仅清理本应用的 Service Worker 和缓存。
- **健康检查失败**：检查容器日志；编排里的健康检查已经跟随 `HEALTH_BASE_PATH`，不要改回固定 `/health`。
- **上传出现 413**：同时检查应用的单文件/累计上限及反向代理请求体上限。
- **EACCES / SQLITE_READONLY / 图片保存失败**：按第 10 节检查 `/app/data` 是否读写挂载，以及整个数据目录的属主和写权限。数据库、WAL/SHM 文件及所在目录均须可写。
- **镜像拉取失败**：确认域名为 `ghcr.io`，账号与仓库全小写，标签正确，服务器能访问 GHCR；也可使用 Release 离线镜像，先 `docker load`，改成本地镜像名和 `pull_policy: never`。

<a id="section-13"></a>

## 许可证与来源

[MIT License](LICENSE)。绘坊 与上游使用相同许可证，保留 `Copyright (c) 2026 CookSleep` 和原 MIT 许可文本。

- 原始项目：[CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)
- 0.3.66 基线：XianYuDaXian fork，提交 `0477e08e8328652cfdfaf66c463970e626a9ff69`
- 当前维护：[EttijBaqaee/pictelier](https://github.com/EttijBaqaee/pictelier)
