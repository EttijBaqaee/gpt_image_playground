# Update 0.3.66.1

**2026-10-28 · 基于 XianYuDaXian 的 0.3.66 fork。** 本版只围绕以下内容修订，其余业务功能沿用 0.3.66。

- **可配置路径前缀**：新增 `APP_BASE_PATH`。填写 `aaa` 后，网页、API、媒体和健康检查统一使用 `/aaa/` 前缀；留空保持原路径。前端请求、SSE、静态资源和 PWA 同步适配，修改参数后只需重建容器。
- **修复 Chromium 复制粘贴丢换行**：保留连续空行、首尾换行、CRLF、中文、emoji，以及参考图 mention；修复全选复制漏掉末尾换行、粘贴后光标与继续输入的问题。
- **修复额度事务**：额度预扣、任务、附件记录和初始事件通过同一 SQLite 事务提交；预校验失败不扣额度，任务失败按原有规则退款。
- **修复附件路径与清理**：附件使用 UUID 和安全扩展名保存，避免同名覆盖和原始文件名影响路径；失败时清理本次上传，不留下可执行的残缺任务。
- **限制上传与可信代理**：默认单文件 32 MiB、单次累计 128 MiB，流式累计检查；最多 32 个文件、16 个普通字段。默认不信任转发 IP，只有明确配置的可信代理才生效。
- **仓库与更新源**：页面仓库入口、帮助页、镜像来源和默认版本检测统一指向 [EttijBaqaee/gpt_image_playground](https://github.com/EttijBaqaee/gpt_image_playground)。
- **验证与发布**：在 Debian 上通过自动化测试、Chromium 真实剪贴板、默认/自定义前缀 HTTP、真实 Worker 与模拟供应商集成验证。具体结果、镜像架构与 SHA256 随 Release 提供；没有调用付费供应商 API。
- **许可证**：与上游相同，继续使用 MIT，保留 `LICENSE` 中原版权声明。

---

# GPT Image Playground — Docker fork

本仓库由 [@EttijBaqaee](https://github.com/EttijBaqaee/gpt_image_playground) 维护，基于 XianYuDaXian 的 0.3.66 fork，原项目来自 [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)。

**本版仅提供 Docker 构建与部署说明。** 前后端在一个容器中运行，SQLite、任务记录、图片和配置保存在挂载的数据目录中。没有 Render、桌面安装包或直接在宿主机运行 npm 的部署方式。

<p align="center">
  <img src="asset/主界面.png" alt="主界面" width="45%" />
  <img src="asset/设置界面.png" alt="设置界面" width="45%" />
</p>

## 1. 获取源码

服务器需要安装 Docker Engine、Docker Compose v2 和 Git。构建时需要能够访问基础镜像、npm 和 Debian 软件源。

```bash
git clone --branch v0.3.66.1 https://github.com/EttijBaqaee/gpt_image_playground.git /opt/gpt-image-playground
cd /opt/gpt-image-playground/deploy
cp .env.example .env
```

也可以从 [0.3.66.1 Release](https://github.com/EttijBaqaee/gpt_image_playground/releases/tag/v0.3.66.1) 下载源码包并解压；`APP_SOURCE_DIR` 应指向含 `package.json`、`server/` 和 `deploy/` 的源码根目录。

标准源码构建使用 `deploy/Dockerfile`，依赖安装、前端编译和后端编译都在 Docker 内完成。`deploy/Dockerfile.1panel` 是已有 Linux 锁定依赖缓存环境的构建文件，不能直接用于没有 `node_modules` 的干净源码；首次部署请使用标准 `deploy/Dockerfile`。

## 2. 完整编排文件

仓库内模板为 [`deploy/docker-compose.yml`](deploy/docker-compose.yml)。可以直接用于命令行，也可以粘贴进 1Panel 编排编辑器：

```yaml
name: gpt-image-playground-fork

services:
  app:
    image: gpt-image-playground-fork:0.3.66.1
    build:
      # CLI default: repository root; in 1Panel set an absolute APP_SOURCE_DIR.
      context: ${APP_SOURCE_DIR:-..}
      dockerfile: deploy/Dockerfile
    container_name: gpt-image-playground-fork
    restart: unless-stopped
    ports:
      - "${APP_PORT:-8788}:8787"
    environment:
      APP_BASE_PATH: "${APP_BASE_PATH:-}"
      TRUSTED_PROXIES: "${TRUSTED_PROXIES:-}"
      UPLOAD_MAX_FILE_MB: "${UPLOAD_MAX_FILE_MB:-32}"
      UPLOAD_MAX_TOTAL_MB: "${UPLOAD_MAX_TOTAL_MB:-128}"
      NODE_ENV: production
      PORT: "8787"
      HOST: "0.0.0.0"
      DATA_DIR: /app/data
      WEB_DIST_DIR: /app/dist
      APP_SECRET: "${APP_SECRET:?Set APP_SECRET in .env}"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD in .env}"
      CORS_ORIGIN: "${CORS_ORIGIN:-*}"
      UPSTREAM_API_URL: "${UPSTREAM_API_URL:-}"
      UPSTREAM_API_KEY: "${UPSTREAM_API_KEY:-}"
      UPSTREAM_MODEL: "${UPSTREAM_MODEL:-gpt-image-2}"
      UPSTREAM_API_MODE: "${UPSTREAM_API_MODE:-images}"
      UPSTREAM_TIMEOUT_SECONDS: "${UPSTREAM_TIMEOUT_SECONDS:-300}"
      UPSTREAM_CODEX_CLI: "${UPSTREAM_CODEX_CLI:-false}"
    volumes:
      - "${APP_DATA_DIR:-../docker-data}:/app/data"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    mem_limit: 1536m
    pids_limit: 128
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          const p=(process.env.APP_BASE_PATH||'').trim().replace(/^[/]+|[/]+$/g,'');
          fetch('http://127.0.0.1:8787'+(p?'/'+p:'')+'/health')
          .then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))
      interval: 20s
      timeout: 5s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

### 这些字段怎么改

| 字段 | 作用与填写方式 |
| --- | --- |
| `image` | 本地构建后的镜像名：`gpt-image-playground-fork:0.3.66.1`，不是需要从公共仓库拉取的镜像地址。 |
| `build.context` | 源码根目录。命令行使用默认 `..`；1Panel 建议在环境变量中填绝对 `APP_SOURCE_DIR`。 |
| `build.dockerfile` | 保持 `deploy/Dockerfile`，路径相对于源码根目录。 |
| `ports` | 左侧是宿主机端口，默认 `8788`；右侧容器端口保持 `8787`。 |
| `volumes` | 左侧为持久化目录，右侧保持 `/app/data`。升级必须继续使用原目录。 |
| `APP_BASE_PATH` | 留空不加前缀；填 `aaa` 或 `/aaa/` 均得到 `/aaa`。也可直接在编排中写 `APP_BASE_PATH: "aaa"`。 |
| `APP_SECRET` | 用于会话签名的固定随机密钥，至少 16 字符，建议 32 字符以上；升级不要重新生成。 |
| `ADMIN_PASSWORD` | 应用网页登录管理员密码，与服务器或 1Panel 密码无关。 |
| `CORS_ORIGIN` | 默认 `*` 沿用原行为；若限定来源，填完整协议、域名及端口，不包含路径前缀。 |
| `TRUSTED_PROXIES` | 默认留空；只填实际反向代理的 IP 或受限 CIDR，多个值用逗号分隔。 |
| `UPLOAD_MAX_FILE_MB` | 单文件上限，默认 32 MiB，可设 1–1024。 |
| `UPLOAD_MAX_TOTAL_MB` | 单次上传累计上限，默认 128 MiB，可设 1–2048。 |

## 3. 环境变量怎么写

命令行部署使用 `deploy/.env`。1Panel 使用该编排的环境变量编辑区，或者编排目录中的 `.env`。**不要把 `.env` 提交到 GitHub。**

下面是首次部署示例，两个密码占位符必须替换：

```dotenv
APP_SECRET=replace-with-a-long-random-secret-at-least-32-characters
ADMIN_PASSWORD=replace-with-your-admin-password
APP_PORT=8788
APP_BASE_PATH=
CORS_ORIGIN=*

# 1Panel 使用绝对路径，避免把数据写到错误目录
APP_SOURCE_DIR=/opt/gpt-image-playground
APP_DATA_DIR=/opt/gpt-image-playground/docker-data

TRUSTED_PROXIES=
UPLOAD_MAX_FILE_MB=32
UPLOAD_MAX_TOTAL_MB=128
```

可用 `openssl rand -hex 32` 生成 `APP_SECRET`。如果已有部署，继续使用原来的 `APP_SECRET`、管理员密码和数据目录，不能照抄示例覆盖。

`UPSTREAM_API_URL` / `UPSTREAM_API_KEY` 可留空，登录网页后配置供应商。可选初始化参数见 [`deploy/.env.example`](deploy/.env.example)。

## 4. 在 1Panel 中构建部署

1. 将源码下载到服务器，例如 `/opt/gpt-image-playground`，确认 `/opt/gpt-image-playground/deploy/Dockerfile` 存在。
2. 在 **容器 → 编排 → 创建编排** 中选择编辑编排，名称填写 `gpt-image-playground-fork`。
3. 粘贴第 2 节的完整 YAML。
4. 填写第 3 节的环境变量。特别是 `APP_SOURCE_DIR`、`APP_DATA_DIR` 使用服务器绝对路径。
5. 创建并启动编排。`build` 指向本机源码，通过 Docker 构建镜像；首次构建需要等待依赖安装与前后端编译完成。
6. 查看构建/容器日志，容器健康状态应变为 `healthy`，然后访问应用。

如果某个 1Panel 版本的首次创建只执行镜像拉取，没有执行 `build`，可以在服务器终端对 **1Panel 管理的同一份编排文件** 执行构建，再回到面板启动；不要额外建立一套不同数据目录的部署：

```bash
# 替换为 1Panel 中该编排的实际目录
cd /opt/1panel/docker/compose/gpt-image-playground-fork
docker compose build app
```

> 上面的路径仅为常见示例，以你面板显示的编排实际路径为准。

## 5. 命令行 Docker Compose 构建

在第 1 节创建的 `deploy/.env` 中填好参数后：

```bash
cd /opt/gpt-image-playground/deploy
docker compose config --quiet
docker compose build app
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
```

这只在 Docker 内安装依赖和编译，不需要在宿主机执行 `npm install` 或 `npm run build`。

## 6. 路径前缀与访问地址

假设宿主机端口为 `8788`：

| 用途 | `APP_BASE_PATH=` | `APP_BASE_PATH=aaa` |
| --- | --- | --- |
| 网页 | `http://服务器IP:8788/` | `http://服务器IP:8788/aaa/` |
| API | `/api/…` | `/aaa/api/…` |
| 媒体 | `/media/…` | `/aaa/media/…` |
| 健康检查 | `/health`、`/health/` | `/aaa/health`、`/aaa/health/` |

前缀只允许字母、数字、下划线、短横线和路径分隔符；不能包含 `..`、查询参数、编码斜线或连续空路径段。设置前缀后，旧的不带前缀 API、媒体和健康检查地址不再使用。

要改成 `aaa`，可以在编排环境变量中填写 `APP_BASE_PATH=aaa`，或直接修改 YAML 的这一行：

```yaml
APP_BASE_PATH: "aaa"
```

然后在 1Panel 重新部署/重建容器。命令行等价操作是：

```bash
docker compose up -d --force-recreate
```

**只改前缀不需要重新构建镜像，单纯重启旧容器不会读取新的 Compose 环境变量。** 前缀属于应用本身，与 1Panel 的安全入口相互独立。

若使用 Nginx/OpenResty 反向代理，应把前缀原样转发给后端，例如 `/aaa/…` 仍转发为 `/aaa/…`，不要剥掉 `/aaa`。代理层的请求体上限也要允许你配置的上传大小。

## 7. 上传限制与代理

- 上传大小按实际流式读取的字节累计检查，不只看请求头声明。
- 单次最多 32 个文件、16 个普通字段，普通字段上限为 1 MiB。
- 超限请求会被拒绝并清理本次附件；未完成上传不会产生可运行的残缺任务或错误扣费。
- `TRUSTED_PROXIES` 留空时，不采信请求中自行填写的 `X-Forwarded-For`。
- 使用代理时只配置真正的代理 IP/CIDR，不能填写 `*`、`true`、`0.0.0.0/0` 或 `::/0`。

## 8. 离线镜像（可选）

Release 中的 `gpt-image-playground-fork-0.3.66.1-amd64.tar.gz` 是已验证的 **Linux amd64** 镜像，不适用于 ARM 主机；ARM 主机请使用源码 Docker 构建。

```bash
sha256sum -c SHA256SUMS --ignore-missing
docker load -i gpt-image-playground-fork-0.3.66.1-amd64.tar.gz
```

使用离线镜像时，将上述编排中的整个 `build:` 块删除，保留：

```yaml
image: gpt-image-playground-fork:0.3.66.1
pull_policy: never
```

其他端口、环境变量和数据挂载照常填写，然后在 1Panel 创建/启动或执行 `docker compose up -d`。不要执行 `docker compose pull`，该镜像已经通过 `docker load` 导入本机。

## 9. 升级与数据保留

升级前备份整个持久化数据目录，并保留原 `.env`。供应商设置、使用码额度、历史任务和媒体文件都依赖原数据目录。

- 源码构建升级：更新到目标版本后执行 `docker compose build app`，再执行 `docker compose up -d`。
- 离线镜像升级：导入新镜像，修改 `image` 标签后重新部署。
- 只改环境变量：重新创建容器，不需要重新构建镜像。
- 继续使用相同的 `APP_SECRET`、管理员密码和数据挂载；不要删除数据卷或对旧部署执行 `down -v`。
- 本版离线镜像使用 UID/GID 1000。若挂载目录不可写，按实际部署用户调整该目录权限；不要把容器改成特权模式。

## 10. 常见问题

- **1Panel 找不到 Dockerfile**：检查 `APP_SOURCE_DIR` 是否为绝对源码根目录，而不是 `deploy/` 或编排自身目录。
- **要求设置 APP_SECRET / ADMIN_PASSWORD**：环境变量未保存或 `.env` 不在编排读取位置，填写后重新部署。
- **改前缀后 404**：使用新的网页入口，并确认反向代理没有剥掉前缀。
- **健康检查失败**：检查容器日志；编排里的健康检查已经跟随 `APP_BASE_PATH`，不要改回固定 `/health`。
- **上传出现 413**：同时检查应用的单文件/累计上限及反向代理请求体上限。
- **数据库只读或图片保存失败**：检查 `/app/data` 的实际宿主机挂载目录和写入权限。
- **镜像拉取失败**：本仓库提供源码 Docker 构建和 Release 离线镜像；离线方式先 `docker load`，删除 `build` 并使用 `pull_policy: never`。

## 许可证与来源

[MIT License](LICENSE)。本 fork 与上游使用相同许可证，保留 `Copyright (c) 2026 CookSleep` 和原 MIT 许可文本。

- 原始项目：[CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)
- 0.3.66 基线：XianYuDaXian fork，提交 `0477e08e8328652cfdfaf66c463970e626a9ff69`
- 当前维护：[EttijBaqaee/gpt_image_playground](https://github.com/EttijBaqaee/gpt_image_playground)
