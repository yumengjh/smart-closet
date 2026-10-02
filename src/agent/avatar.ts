import { reactive } from 'vue'
import { STATE_BY_ID, type StateId } from './bloub/states'
export type AvatarMode = 'static' | 'basic' | 'personal'
export type AvatarExpression = 'neutral' | 'attentive' | 'happy' | 'curious' | 'surprised' | 'confused' | 'shy' | 'concern'
export type AvatarCue = { requestId: string; state: StateId; expression: AvatarExpression }
export const expressionMap = { neutral:'neutre', attentive:'attentif', happy:'heureux', curious:'curieux', surprised:'surpris', confused:'confus', shy:'timide', concern:'triste' } as const
export const avatarPreferences = reactive<{ mode: AvatarMode }>({ mode:'personal' })
export function applyAvatarMode(mode: unknown) { avatarPreferences.mode = ['static','basic','personal'].includes(String(mode)) ? mode as AvatarMode : 'personal' }
export const avatarLabels: Record<StateId,string> = {idle:'乖巧待机',thinking:'正在思考',wink:'眨眼认可',wide:'睁眼好奇',alert:'操作未完成',notify:'结果准备好',exclaim:'惊讶强调',sleep:'打个小盹',egg:'害羞蛋形',hexagon:'六边形',play:'灵动三角',orbit:'轨道环绕',burst:'星点庆祝',comet:'彗星探索',swirl:'轻盈唤起'}
export const publicStates = Object.keys(avatarLabels).filter(id=>id!=='swirl') as StateId[]
export const idleStates: StateId[] = ['wink','wide','sleep','egg','hexagon','play','orbit','burst','comet']
export function cueAllowed(state: StateId) { return STATE_BY_ID.has(state) && !['swirl','thinking','alert','notify'].includes(state) }
export function validCue(value: unknown): value is AvatarCue { const c=value as AvatarCue;return !!c && typeof c.requestId==='string' && publicStates.includes(c.state) && Object.hasOwn(expressionMap,c.expression) }
export function duration(state: StateId) { return (STATE_BY_ID.get(state)?.duration ?? 2)*1000 }
