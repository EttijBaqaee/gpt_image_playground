import { describe, expect, it } from 'vitest'
import { appConfig, normalizeBasePath, resolveBasePaths } from './config.js'
describe('APP_BASE_PATH', () => {
  it.each([['',''],[' / ',''],['aaa','/aaa'],['/aaa/','/aaa'],['a/b','/a/b']])('normalizes %s', (value, expected) => expect(normalizeBasePath(value)).toBe(expected))
  it.each(['../secret','a//b','<script>','aaa?key=x','a%2fb','https://evil.test'])('rejects invalid prefix %s', (value) => expect(() => normalizeBasePath(value)).toThrow())
})

describe('independent runtime route prefixes', () => {
  it('keeps all original routes by default', () => {
    expect(resolveBasePaths({})).toEqual({ basePath: '', assetsBasePath: '', apiBasePath: '', mediaBasePath: '', referenceBasePath: '', healthBasePath: '' })
  })
  it('normalizes backend prefixes independently', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'web', API_BASE_PATH: '/a/', MEDIA_BASE_PATH: 'm', REFERENCE_BASE_PATH: '/r/', HEALTH_BASE_PATH: 'h/status' }))
      .toEqual({ basePath: '/web', assetsBasePath: '/web', apiBasePath: '/a', mediaBasePath: '/m', referenceBasePath: '/r', healthBasePath: '/h/status' })
  })
  it('treats an explicit empty backend prefix independently from the homepage', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'web', API_BASE_PATH: '', MEDIA_BASE_PATH: '', REFERENCE_BASE_PATH: '', HEALTH_BASE_PATH: '' }))
      .toEqual({ basePath: '/web', assetsBasePath: '/web', apiBasePath: '', mediaBasePath: '', referenceBasePath: '', healthBasePath: '' })
  })
  it('does not inherit a homepage prefix when backend variables are omitted', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'aaa' }))
      .toEqual({ basePath: '/aaa', assetsBasePath: '/aaa', apiBasePath: '', mediaBasePath: '', referenceBasePath: '', healthBasePath: '' })
  })
  it.each(['ASSETS_BASE_PATH', 'API_BASE_PATH', 'MEDIA_BASE_PATH', 'REFERENCE_BASE_PATH', 'HEALTH_BASE_PATH'] as const)('validates %s', (name) => {
    expect(() => resolveBasePaths({ [name]: '../invalid' })).toThrow(name)
  })
  it('sets assets independently of all other prefixes', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'web', ASSETS_BASE_PATH: '/s/files/', API_BASE_PATH: 'a', MEDIA_BASE_PATH: 'm', REFERENCE_BASE_PATH: 'r/public', HEALTH_BASE_PATH: 'h' }))
      .toEqual({ basePath: '/web', assetsBasePath: '/s/files', apiBasePath: '/a', mediaBasePath: '/m', referenceBasePath: '/r/public', healthBasePath: '/h' })
  })
  it.each([undefined, '', '  '])('preserves legacy homepage assets when configured as %s', (assets) => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'web', ASSETS_BASE_PATH: assets }).assetsBasePath).toBe('/web')
  })
  it('uses root assets for an explicit slash', () => {
    expect(resolveBasePaths({ APP_BASE_PATH: 'web', ASSETS_BASE_PATH: '/' }).assetsBasePath).toBe('')
  })
})

describe('fork version source', () => {
  it('checks releases from this fork by default', () => {
    expect(appConfig.versionCheckRepoOwner).toBe('EttijBaqaee')
    expect(appConfig.versionCheckRepoName).toBe('gpt_image_playground')
  })
})
