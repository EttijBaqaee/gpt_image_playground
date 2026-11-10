# GPT Image Playground · 0.3.66.8

[![简体中文](https://img.shields.io/badge/简体中文-Readme-lightgrey)](README.md) [![English](https://img.shields.io/badge/English-Current-blue)](README.en.md)

## What changes in 0.3.66.8

- Images profiles can enable **Grok API compatibility** and **Use public reference URLs** together. Single-image edits send `image.url`; multiple references use `images[].url` in their selected order at `/v1/images/edits`.
- Disabling public URLs preserves Base64 transport for Grok. Standard Images profiles retain their existing JSON URL and file-upload formats. Toggling public URLs preserves the xAI 2K setting.
- Grok single-image edits follow the reference image's aspect ratio and omit `aspect_ratio`. Multiple-image edits retain the selected aspect ratio. Resolution still follows the xAI 2K option and requested size.
- Existing origin checks, signed temporary URLs, access reminders, data directories, and Compose settings continue to apply. Grok image edits do not support masks.

## What changes in 0.3.66.7

- Chinese and English interfaces, with a language button on the login screen, main page, and Settings. The initial language follows the browser: Chinese for Chinese locales, English otherwise. Manual preferences are saved in the current browser.
- System, light, and dark appearance controls. System is the default. Theme changes use a gentle crossfade and respect reduced-motion preferences.
- Image extensions configured separately for each API profile and exact model ID. An OpenAI-compatible endpoint alone does not enable newer model features.
- Optional complexity, extended quality, transparent markup edits, SVG output, and animated GIF output. Availability follows the administrator’s manual selections for each provider and model.
- SVG remains a vector file, GIF retains animation, and downloads preserve their formats. SVG is displayed as an image after static-content checks. GIF playback is available in the full image preview.
- Repeated uploads and compressed reference reuse are fixed. Historical and new identical inputs share disk storage through hard links while keeping separate task references; deleting the last reference releases the storage. Filesystems without hard-link support retain separate files.
- Deleting tasks removes their empty media directories. Startup also removes empty directories belonging to deleted tasks, preserving other files.
- Reference URL settings retain support for private networks and display a red reminder to ensure the upstream service can access the address. A successful check confirms access from the current server only.

This fork provides image/video generation, reference images, masks, task history, usage-code access, quotas, and a server-managed provider configuration. Provider keys stay on the server. Supported modes include Images, Responses, Videos, Venice, WaveSpeed, and Kie, with a separate Grok compatibility option where applicable.

## Docker deployment

Docker Engine and Docker Compose v2 are sufficient. The production container runs as UID/GID **1000** and listens on port **8787**. The supplied Compose template publishes it on port **8788** by default.

Create a persistent data directory for a new installation:

```bash
mkdir -p /opt/gpt-image-playground-data
chown 1000:1000 /opt/gpt-image-playground-data
```

Use [deploy/docker-compose.yml](deploy/docker-compose.yml) for a prebuilt image, or [deploy/docker-compose.build.yml](deploy/docker-compose.build.yml) to build from source. Copy [deploy/.env.example](deploy/.env.example) to `.env` beside the Compose file and set:

```dotenv
APP_SECRET=replace-with-a-stable-random-secret-at-least-32-characters
ADMIN_PASSWORD=replace-with-your-admin-login-password
APP_DATA_DIR=/opt/gpt-image-playground-data
APP_PORT=8788
```

Generate a random secret with `openssl rand -hex 32`. Keep the secret and your data directory when upgrading. API keys and encrypted data rely on the existing secret.

Start or update the application:

```bash
docker compose pull app
docker compose up -d
```

Pin the image to `ghcr.io/ettijbaqaee/gpt_image_playground:0.3.66.8` for a fixed version. `latest` follows the most recently published version. Release images target Linux amd64. The GHCR image and offline release archive contain the same application.

For offline installation, load the release archive with `docker load -i <archive.tar.gz>`, then use its image tag in Compose. Release downloads are available on the [releases page](https://github.com/EttijBaqaee/gpt_image_playground/releases).

### Building from source

Clone or download the desired version, then configure the build template:

```bash
git clone https://github.com/EttijBaqaee/gpt_image_playground.git
cd gpt_image_playground/deploy
cp .env.example .env
docker compose -f docker-compose.build.yml up -d --build
```

`APP_SOURCE_DIR` must point to the source root containing `package.json`, `server/`, and `deploy/`. The standard [Dockerfile](deploy/Dockerfile) installs dependencies and builds the application inside Docker. [Dockerfile.1panel](deploy/Dockerfile.1panel) requires an existing Linux dependency cache; use the standard Dockerfile for a clean source checkout.

## 1Panel

Create a Compose application and paste the full [deployment template](deploy/docker-compose.yml). Set `APP_SECRET`, `ADMIN_PASSWORD`, and an absolute `APP_DATA_DIR` in its environment settings. Keep the container port at 8787; change the host port if needed.

Compose environment variables use either a mapping or a list. For example:

```yaml
environment:
  APP_BASE_PATH: "web"
  API_BASE_PATH: "a"
```

The equivalent list form is `- APP_BASE_PATH=web`. Do not mix the two forms. Recreate the container after changing environment variables.

## Paths and reverse proxies

Path prefixes can be changed at runtime without rebuilding the image. Plain names such as `web` and slash-wrapped names such as `/web/` are both accepted.

| Environment variable | Example | Result | Default |
| --- | --- | --- | --- |
| `APP_BASE_PATH` | `web` | `/web/` home, icons, manifest, service worker | `/` |
| `ASSETS_BASE_PATH` | `s` | `/s/assets/` scripts and styles | Home prefix |
| `API_BASE_PATH` | `a` | `/a/api/…` | `/api/…` |
| `MEDIA_BASE_PATH` | `m` | `/m/media/…` | `/media/…` |
| `REFERENCE_BASE_PATH` | `r` | `/r/references/…` | `/references/…` |
| `HEALTH_BASE_PATH` | `h` | `/h/health` and `/h/health/` | `/health` |

API, media, reference, and health prefixes are independent of the home prefix. Assets inherit the home prefix when unset; set `ASSETS_BASE_PATH=/` to serve them at `/assets/`.

Forward all configured paths to the same application, preserving their full paths and query strings. See [deploy/nginx.conf.example](deploy/nginx.conf.example). Keep API connections open for long generation requests and disable proxy buffering for server-sent events. Configure proxy upload limits to match the application limits.

Set `TRUSTED_PROXIES` to the actual proxy IP addresses or restricted CIDRs, comma-separated. It is empty by default. Only explicitly trusted proxies can supply forwarded client addresses.

## Provider setup

Log in as administrator and open **Settings → API configuration**. Add the provider URL, server-side API key, exact model name, and interface mode. Set one profile as the default. Provider-specific timeout and proxy options belong to each profile.

- **Images** submits image generation and editing requests. Ordinary edits use multipart file uploads.
- **Responses** uses a model/tool-compatible Responses endpoint.
- **Grok API compatibility** selects xAI-style image fields, aspect ratios, and resolution options. Enable it only if the provider requires that format.
- **Venice, WaveSpeed, and Kie** retain their separate request paths and capability controls.
- **Videos** provides video generation with the configured resolution and duration choices.

The request timeout is configured per provider. Existing saved profiles are not overwritten by environment initialization values.

### Optional image extensions

In an Images profile, open **Image extensions**. The switch defaults to off. Enter the exact model ID, then select only the features that this provider supports for that model.

The configuration belongs to the profile and full model name. A different model starts without selections. Changing the endpoint URL clears the extension configuration. Seedream and Grok may expose OpenAI-compatible APIs without supporting OpenAI model extensions.

Extensions are off by default; select features manually using your provider’s documentation. Selecting a feature permits its parameters to be sent; it does not confirm provider support. Unsupported requests may fail or still incur charges, so check your provider’s documentation first. Without feature selections, requests retain their existing parameters. Changing to an unconfigured model resets unavailable quality/format choices and removes optional extension fields from the draft. A markup attachment cannot be silently treated as a legacy mask; remove it or select a profile with markup enabled.

Supported extension controls:

| Control | Behavior |
| --- | --- |
| Complexity | Optional `low`, `medium`, or `high`; omitted by default |
| Extended quality | Adds `xhigh` and `max` when explicitly enabled |
| Markup | A separate transparent PNG overlay on the first reference image |
| SVG | Text-only generation, one output, no compression setting |
| GIF | Text-only generation with optional frame count and frame duration |
| SVG authoring model | Optional author model and reasoning effort; omitted when blank |

Open **Parameters → Advanced parameters** to use these controls. To annotate an image, add a reference and select **Annotate the first reference**. The editor supports freehand strokes, rectangles, arrows, an eraser, undo, and clear. The overlay has the same dimensions as the first submitted image, contains transparency, and is sent separately from the original. Markup and masks are mutually exclusive.

GIF frame limits default to 16. An administrator may raise the limit to 64 only when the provider supports it. Frame duration is 20–2000 ms. SVG/GIF do not use image-edit requests or compression settings. Reusing either format as a reference creates a raster reference while preserving the original output file.

Confirmed official model IDs include `gpt-image-2.6-sunburst` and `gpt-image-2.6-flare`. A relay may expose a different alias; configure the exact value it accepts. A name alone does not confirm that a relay implements the associated features. See the [official image guide](https://developers.openai.com/api/docs/guides/image-generation).

### Public reference URLs

For providers that require JSON image URLs, enable **Use public reference URLs** in an Images profile and enter the public origin, such as `https://example.com` or `http://public-ip:port`. Do not include a path. Grok profiles can also enable **Grok API compatibility**; Codex CLI mode remains mutually exclusive with public reference URLs.

Standard Images profiles send `images[].image_url` and optional `mask.image_url`. Grok profiles send `image.url` for one reference or `images[].url` for multiple references in their selected order, without masks. Both use `/v1/images/edits`. Disabling public URLs restores file uploads for standard Images or Base64 images for Grok. Without references, text-to-image behavior is unchanged.

Use **Check public access**, then save the profile. The application retrieves a temporary image through that origin and checks its contents without calling the provider. The reverse proxy must preserve the reference path and signed query string and must not add an extra login requirement. The check confirms access from this server; provider network access may differ.

Temporary URLs remain valid for at least one hour, or twice the configured request timeout plus 60 seconds when longer. Expired tasks need resubmission. Changing the origin or reference prefix requires another check. Keep the origin free of credentials and private query parameters.

## Language and appearance

Use the **EN / 中文** control to change language. To restore automatic selection, choose **Follow browser** in **Settings → Preferences → Interface language**.

Use the appearance control to choose system, light, or dark. System follows the browser’s preferred color scheme and updates when it changes. Theme transitions respect the operating system’s reduced-motion setting. These preferences are stored locally; switching them preserves the current prompt and form drafts.

## Usage codes, tasks, and data

Administrators can create usage codes, limit which providers they may use, set image/video quotas, and manage distribution settings. Users access only their permitted tasks and media. Tasks support reference reuse, favorites, archiving, and deletion.

The server stores its SQLite database and uploaded/generated media under `/app/data`. Persist the entire directory. Use the administrator data controls to export or restore application backups and manage media exports. Keep backup archives private because they contain application data and provider configuration.

The application automatically checks historical input images at startup and after backup restoration, and deduplicates new uploads as well. Identical inputs share disk storage through hard links while retaining each task's image IDs, paths, permissions, order, and mask associations. Storage is released when the last reference is deleted. The data filesystem must support hard links; otherwise, separate files are preserved.

## Environment reference

| Variable | Meaning |
| --- | --- |
| `APP_SECRET` | Stable signing/encryption secret, at least 16 characters; 32+ recommended |
| `ADMIN_PASSWORD` | Web administrator login password |
| `APP_DATA_DIR` | Host persistence directory used by Compose |
| `APP_PORT` | Host port, default 8788 |
| `PORT` / `HOST` | Container listener, default 8787 / 0.0.0.0 |
| `DATA_DIR` | Container persistence root, `/app/data` in the template |
| `WEB_DIST_DIR` | Built web directory, `/app/dist` in the template |
| `CORS_ORIGIN` | Allowed origin, `*` by default; use full scheme/host/port when restricted |
| `UPLOAD_MAX_FILE_MB` | Per-file limit, default 32 MiB, range 1–1024 |
| `UPLOAD_MAX_TOTAL_MB` | Aggregate attachment limit, default 128 MiB, range 1–2048 |
| `UPSTREAM_API_URL` / `UPSTREAM_API_KEY` | Optional initial provider; both must be supplied |
| `UPSTREAM_MODEL` | Initial model, default `gpt-image-2` |
| `UPSTREAM_API_MODE` | Initial mode, default `images` |
| `UPSTREAM_TIMEOUT_SECONDS` | Initial provider timeout, default 300 seconds |
| `UPSTREAM_CODEX_CLI` | Optional initial compatibility flag, default false |

Provider initialization applies when no default profile exists. For saved profiles, change the settings in the application. The path and trusted-proxy variables are described above.

## Upgrading an existing deployment

1. Export a backup and record the current image tag, data mount, `APP_SECRET`, password, and path settings.
2. Stop the container before copying the entire persistent directory, including SQLite WAL/SHM files if present.
3. When migrating from a root-run 0.3.66 installation, update ownership of the **entire old data directory** so UID/GID 1000 can read and write existing files. Confirm the path first; changing only the top-level directory is insufficient.
4. Keep the original data mount and secret, update the image tag, then recreate the container. Database schema changes are applied automatically.
5. Open the configured application path and confirm that the existing tasks and provider profiles are present.

For a root-run installation using `/opt/gpt-image-playground-data`, the ownership migration is:

```bash
docker compose stop app
chown -R 1000:1000 /opt/gpt-image-playground-data
docker compose up -d
```

Use your actual persistence path. Do not replace it with a new empty directory, and do not remove the volume during an upgrade. To roll back after a schema change, restore the matching pre-upgrade backup together with its original image.

## Troubleshooting

- **Empty history after upgrading:** check the host data mount and original `APP_SECRET`.
- **Permission errors:** make all existing persistent files writable by UID/GID 1000.
- **404 for scripts, media, or API:** check each independent prefix and proxy route.
- **Uploads rejected:** align application and proxy size limits. The backend rejects over-limit uploads with HTTP 413.
- **Long tasks stop early:** increase the profile request timeout and reverse-proxy timeouts as needed.
- **Unsupported extension:** confirm the exact provider/model selection and its feature switches. OpenAI compatibility alone is insufficient.
- **Clipboard unavailable:** use HTTPS or localhost and allow clipboard access. Copying SVG/GIF produces a PNG clipboard image; downloading preserves the original.

For the full Chinese deployment examples, see [README.md](README.md).

## License and provenance

This fork is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0-only)](LICENSE). The upstream copyright, `Copyright (c) 2026 CookSleep`, and its complete original MIT license are preserved in [NOTICE](NOTICE).

- Original project: [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)
- Baseline: the XianYuDaXian fork at commit `0477e08e8328652cfdfaf66c463970e626a9ff69`
- Maintained fork: [EttijBaqaee/gpt_image_playground](https://github.com/EttijBaqaee/gpt_image_playground)

## Privacy policy

This project does not include user behavior analytics, advertising trackers, or features that send user data back to the project author. It does not proactively report API keys, prompts, images, or task records for statistics or telemetry.

The application connects to GitHub to check public version information. These requests do not include the application data listed above. Pages may also request font resources from third-party font services, which may receive routine network request information such as IP addresses.

When users submit generation tasks, query balances, or use other network features, the application sends the data necessary to perform those operations to the relevant providers and their supporting services according to its configuration. This may include prompts, reference images, request parameters, and authentication information. Those services process the data under their own privacy policies.

Task records and media files are stored on the deployment server. Some interface preferences and drafts are stored locally in the browser. For self-hosted deployments, the operator manages data and access permissions. Users of an instance hosted by someone else should also review that operator's data handling practices.

## Disclaimer

1. **Software provided as is**

   This project makes no warranties about feature completeness, operational stability, security, or fitness for a particular purpose. The code may contain undiscovered errors, vulnerabilities, or compatibility issues. Users should assess its suitability for their needs before use.

2. **Responsibility for use and deployment**

   Users are responsible for managing their deployment environment, access permissions, API keys, and backups, and for the risks of configuration, operation, and maintenance. To the extent permitted by applicable law, the author and contributors are not liable for data loss, service interruptions, expenses, or other losses arising from the use of, or inability to use, this project.

3. **Third-party services and charges**

   This project can connect to third-party model APIs, relay services, and other external resources. Their availability, output quality, content policies, billing, and refund rules are determined by the respective providers. This project does not guarantee that third-party requests will succeed or that failed requests will be free of charge. Review provider rules and set appropriate spending limits before use.

4. **Content and intellectual property**

   Users must ensure that content they upload, enter, generate, store, or distribute has a lawful source and the necessary permissions, and must comply with applicable laws and third-party service terms. This project must not be used to infringe copyright, trademarks, likeness rights, privacy rights, or other lawful rights. Generated content may contain errors or raise rights disputes and should be reviewed before publication or commercial use.

5. **Data and privacy**

   Reference images, prompts, and other request data may be sent to third-party services configured by the user. Users should review those services' data handling policies and meet any applicable notice, authorization, and protection obligations. When enabling reference image URLs, assess access to temporary links and protect sensitive information.

6. **Open-source licensing and third-party components**

   This project uses the GNU Affero General Public License v3.0 (AGPL-3.0). The rights and obligations are governed by [LICENSE](LICENSE). Distribution, modification, or offering a modified version over a network must comply with applicable requirements, including providing corresponding source and preserving copyright notices. Third-party dependencies and upstream code remain subject to their respective licenses, and their notices must be retained as required.

7. **Modified versions and affiliation**

   Providers of third-party modifications, hosted services, commercial products, or promotional material based on this project are responsible for their offerings. Without express authorization, they must not make commitments or guarantees in the name of the author or contributors, or imply their endorsement of related products, services, or uses.

8. **Scope of this disclaimer**

   This disclaimer explains usage risks and the limits of responsibility. It does not replace the project license or restrict rights granted by that license. Exclusions and limitations of liability apply only to the extent permitted by applicable law; liabilities that cannot lawfully be excluded or limited remain unaffected.

Before use, read this disclaimer, the project license, and the terms of any connected services, and take appropriate measures to protect data, control costs, and review content.
