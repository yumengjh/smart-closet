// 从相邻的 smart-closet-server 读取行为分析事件表，生成 src/services/analyticsEvents.generated.ts。
// 用法：npm run sync:analytics（server 仓库须在 ../smart-closet-server）。生成文件勿手改。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, '../smart-closet-server/src/main/resources/analytics/events.json')
const target = resolve(root, 'src/services/analyticsEvents.generated.ts')

export function render(catalog) {
  const lit = value => JSON.stringify(value)
  const propType = spec => spec.enum ? spec.enum.map(lit).join(' | ') : spec.type === 'boolean' ? 'boolean' : (() => { throw new Error(`不支持的属性类型：${JSON.stringify(spec)}`) })()
  const propsType = props => {
    const entries = Object.entries(props)
    return entries.length ? `{ ${entries.map(([key, spec]) => `${key}: ${propType(spec)}`).join('; ')} }` : 'Record<string, never>'
  }
  const specs = Object.fromEntries(catalog.events.map(event => [event.name, { phase: event.phase, billing: event.billing === true, props: event.props }]))
  return `// 自动生成，勿手改：npm run sync:analytics（来源 smart-closet-server 的 analytics/events.json）。
// version: ${catalog.version}

export const analyticsVersion = ${catalog.version}

/** 事件名 → 属性。属性只能是枚举或布尔。 */
export type AnalyticsEventProps = {
${catalog.events.map(event => `  ${event.name}: ${propsType(event.props)}`).join('\n')}
}
export type AnalyticsEventName = keyof AnalyticsEventProps

/** 允许上报的页面（路由模板与页面名）。 */
export const analyticsPages: readonly { readonly path: string; readonly name: string }[] = ${JSON.stringify(catalog.pages, null, 2)}

export type AnalyticsPropSpec = { readonly enum: readonly string[] } | { readonly type: 'boolean' }
export type AnalyticsEventSpec = { readonly phase: number; readonly billing: boolean; readonly props: Readonly<Record<string, AnalyticsPropSpec>> }

/** 运行时校验用：每个事件的期数、是否收费事件与属性定义。 */
export const analyticsEventSpecs: Readonly<Record<AnalyticsEventName, AnalyticsEventSpec>> = ${JSON.stringify(specs, null, 2)}
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalog = JSON.parse(readFileSync(source, 'utf8'))
  writeFileSync(target, render(catalog))
  console.log(`已生成 ${target}（version ${catalog.version}）`)
}
