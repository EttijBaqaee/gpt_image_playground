import { describe, expect, it } from 'vitest'
import { appConfig, normalizeBasePath } from './config.js'
describe('APP_BASE_PATH', () => {
  it.each([['',''],[' / ',''],['aaa','/aaa'],['/aaa/','/aaa'],['a/b','/a/b']])('normalizes %s', (value, expected) => expect(normalizeBasePath(value)).toBe(expected))
  it.each(['../secret','a//b','<script>','aaa?key=x','a%2fb','https://evil.test'])('rejects invalid prefix %s', (value) => expect(() => normalizeBasePath(value)).toThrow())
})

describe('fork version source', () => {
  it('checks releases from this fork by default', () => {
    expect(appConfig.versionCheckRepoOwner).toBe('EttijBaqaee')
    expect(appConfig.versionCheckRepoName).toBe('gpt_image_playground')
  })
})
