import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import utc from 'dayjs/plugin/utc'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/en'

// 初始化插件（只执行一次）
dayjs.extend(relativeTime)
dayjs.extend(utc)

const LOCALE_MAP: Record<string, string> = {
  'zh-CN': 'zh-cn',
  'en-US': 'en'
}

export function setDayjsLocale(language: string): void {
  const locale = LOCALE_MAP[language] || 'zh-cn'
  dayjs.locale(locale)
}

export default dayjs
