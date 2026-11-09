import { t } from './i18n'
import type { TaskRecord } from '../types'

export function formatUsageCodeTooltip(task: TaskRecord) {
  const code = task.ownerUsageCode
  if (!code) return task.ownerLabel ?? ''

  const isVideoTask = task.taskType === 'video'
  return [
    t("使用码：{0}", code.code ?? task.ownerLabel ?? t("未知")),
    isVideoTask
      ? t("当前 API 已用视频数：{0}", code.currentProviderUsedVideoCredits ?? 0)
      : t("当前 API 已用图片数：{0}", code.currentProviderUsedImageCredits ?? 0),
    isVideoTask
      ? t("当前 API 剩余视频数：{0}", code.currentProviderRemainingVideoCredits == null ? t("不限") : code.currentProviderRemainingVideoCredits)
      : t("当前 API 剩余图片数：{0}", code.currentProviderRemainingImageCredits == null ? t("不限") : code.currentProviderRemainingImageCredits),
  ].join('\n')
}
