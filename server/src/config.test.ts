import { describe, expect, it } from 'vitest'
import { appConfig, normalizeBasePath, resolveBasePaths } from './config.js'
describe('APP_BASE_PATH', () => {
  it.each([['',''],[' / ',''],['aaa','/aaa'],['/aaa/','/aaa'],['a/b','/a/b']])('normalizes %s', (value, expected) => expect(normalizeBasePath(value)).toBe(expected))
  it.each(['../secret','a//b','<script>','aaa?key=x','a%2fb','https://evil.test'])('rejects invalid prefix %s', (value) => expect(() => normalizeBasePath(value)).toThrow())
})

describe('independent runtime route prefixes', () => {
  it('keeps all original routes by default', () => {
    expect(resolveBasePaths({})).toEqual({ basePath: '', apiBasePath: '', mediaBasePath: '', healthBasePath: '' })
  })
  it('normalizes all four independently', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'web', API_BASE_PATH: '/a/', MEDIA_BASE_PATH: 'm', HEALTH_BASE_PATH: 'h/status' }))
      .toEqual({ basePath: '/web', apiBasePath: '/a', mediaBasePath: '/m', healthBasePath: '/h/status' })
  })
  it('treats an explicit empty backend prefix independently from the homepage', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'web', API_BASE_PATH: '', MEDIA_BASE_PATH: '', HEALTH_BASE_PATH: '' }))
      .toEqual({ basePath: '/web', apiBasePath: '', mediaBasePath: '', healthBasePath: '' })
  })
  it('does not inherit a homepage prefix when backend variables are omitted', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'aaa' }))
      .toEqual({ basePath: '/aaa', apiBasePath: '', mediaBasePath: '', healthBasePath: '' })
  })
  it.each(['API_BASE_PATH', 'MEDIA_BASE_PATH', 'HEALTH_BASE_PATH'] as const)('validates %s', (name) => {
    expect(() => resolveBasePaths({ [name]: '../invalid' })).toThrow(name)
  })
})

describe('fork version source', () => {
  it('checks releases from this fork by default', () => {
    expect(appConfig.versionCheckRepoOwner).toBe('EttijBaqaee')
    expect(appConfig.versionCheckRepoName).toBe('gpt_image_playground')
  })
})
