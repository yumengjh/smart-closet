import zhCN from 'ant-design-vue/es/date-picker/locale/zh_CN'

/** Keep calendar headings Chinese even when a dependency carries its own date-library locale. */
export const dateLocale = {
  ...zhCN,
  lang: { ...zhCN.lang, shortWeekDays: ['日', '一', '二', '三', '四', '五', '六'], shortMonths: Array.from({ length: 12 }, (_, i) => `${i + 1}月`) },
}
