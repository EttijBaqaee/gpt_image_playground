import path from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  APP_BASE_PATH: z.string().default(''),
  API_BASE_PATH: z.string().optional(),
  MEDIA_BASE_PATH: z.string().optional(),
  HEALTH_BASE_PATH: z.string().optional(),
  TRUSTED_PROXIES: z.string().default(''),
  UPLOAD_MAX_FILE_MB: z.coerce.number().int().min(1).max(1024).default(32),
  UPLOAD_MAX_TOTAL_MB: z.coerce.number().int().min(1).max(2048).default(128),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().optional(),
  WEB_DIST_DIR: z.string().optional(),
  APP_SECRET: z.string().min(16).default('change-this-secret-in-production'),
  ADMIN_PASSWORD: z.string().optional(),
  CORS_ORIGIN: z.string().default('*'),
  ACCESS_LOG_VERBOSE: z.coerce.boolean().default(false),
  ACCESS_LOG_MEDIA_ONLY: z.coerce.boolean().default(false),
  UPSTREAM_API_URL: z.string().optional(),
  UPSTREAM_API_KEY: z.string().optional(),
  UPSTREAM_MODEL: z.string().optional(),
  UPSTREAM_API_MODE: z.enum(['images', 'responses', 'videos', 'venice_images', 'wavespeed', 'kie']).optional(),
  UPSTREAM_TIMEOUT_SECONDS: z.coerce.number().int().positive().optional(),
  UPSTREAM_CODEX_CLI: z.string().optional(),
  VERSION_CHECK_REPO_OWNER: z.string().default('EttijBaqaee'),
  VERSION_CHECK_REPO_NAME: z.string().default('gpt_image_playground'),
})

const parsed = envSchema.parse(process.env)
const dataDir = parsed.DATA_DIR
  ? path.resolve(parsed.DATA_DIR)
  : path.resolve(process.cwd(), 'data')
const webDistDir = parsed.WEB_DIST_DIR
  ? path.resolve(parsed.WEB_DIST_DIR)
  : path.resolve(process.cwd(), '..', 'dist')

export function normalizeBasePath(value: string, name = 'APP_BASE_PATH') {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '')
  if (!normalized) return ''
  if (!normalized.split('/').every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error(`${name} 只允许字母、数字、下划线、短横线和路径分隔符`)
  }
  return `/${normalized}`
}

export function resolveBasePaths(env: {
  APP_BASE_PATH?: string
  API_BASE_PATH?: string
  MEDIA_BASE_PATH?: string
  HEALTH_BASE_PATH?: string
}) {
  const homepage = env.APP_BASE_PATH ?? ''
  return {
    basePath: normalizeBasePath(homepage),
    apiBasePath: normalizeBasePath(env.API_BASE_PATH ?? '', 'API_BASE_PATH'),
    mediaBasePath: normalizeBasePath(env.MEDIA_BASE_PATH ?? '', 'MEDIA_BASE_PATH'),
    healthBasePath: normalizeBasePath(env.HEALTH_BASE_PATH ?? '', 'HEALTH_BASE_PATH'),
  }
}

const trustedProxies = parsed.TRUSTED_PROXIES.split(',').map((value) => value.trim()).filter(Boolean)
if (trustedProxies.some((value) => ['true', '*', '0.0.0.0/0', '::/0'].includes(value.toLowerCase()))) {
  throw new Error('TRUSTED_PROXIES 必须指定可信代理 IP 或受限 CIDR，不能信任所有来源')
}

export const appConfig = {
  ...resolveBasePaths(parsed),
  trustedProxies: trustedProxies.length ? trustedProxies : false as false,
  uploadFileBytes: parsed.UPLOAD_MAX_FILE_MB * 1024 * 1024,
  uploadTotalBytes: parsed.UPLOAD_MAX_TOTAL_MB * 1024 * 1024,
  port: parsed.PORT,
  host: parsed.HOST,
  dataDir,
  webDistDir,
  dbPath: path.join(dataDir, 'app.db'),
  backupsDir: path.join(dataDir, 'backups'),
  backupImportsDir: path.join(dataDir, 'backups', 'imports'),
  mediaDir: path.join(dataDir, 'media'),
  uploadsDir: path.join(dataDir, 'media', 'uploads'),
  masksDir: path.join(dataDir, 'media', 'masks'),
  outputsDir: path.join(dataDir, 'media', 'outputs'),
  thumbsDir: path.join(dataDir, 'media', 'thumbs'),
  appSecret: parsed.APP_SECRET,
  adminPassword: parsed.ADMIN_PASSWORD?.trim() ?? '',
  corsOrigin: parsed.CORS_ORIGIN,
  accessLogVerbose: parsed.ACCESS_LOG_VERBOSE,
  accessLogMediaOnly: parsed.ACCESS_LOG_MEDIA_ONLY,
  versionCheckRepoOwner: parsed.VERSION_CHECK_REPO_OWNER,
  versionCheckRepoName: parsed.VERSION_CHECK_REPO_NAME,
  bootstrapProvider: parsed.UPSTREAM_API_URL && parsed.UPSTREAM_API_KEY
    ? {
        baseUrl: parsed.UPSTREAM_API_URL,
        apiKey: parsed.UPSTREAM_API_KEY,
        model: parsed.UPSTREAM_MODEL ?? 'gpt-image-2',
        apiMode: parsed.UPSTREAM_API_MODE ?? 'images',
        timeoutSeconds: parsed.UPSTREAM_TIMEOUT_SECONDS ?? 300,
        codexCli: parsed.UPSTREAM_CODEX_CLI?.trim().toLowerCase() === 'true',
      }
    : null,
}
