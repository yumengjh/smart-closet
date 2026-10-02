<!-- SVG renderer adapted from jeremy-prt/bloub; MIT license: bloub/LICENSE. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, triggerRef, watch } from 'vue'
import { BotEngine, type BotFrame } from './bloub/engine'
import { STATE_BY_ID, type StateId } from './bloub/states'
import { SHAPE_BY_ID, mixHex } from './bloub/skins'
import { EXPRESSION_BY_ID } from './bloub/expressions'
import { DEMI_VIEWBOX, RAYON } from './bloub/repere'
import { NOTIF_BLUE } from './bloub/decor'
import { expressionMap, type AvatarExpression } from './avatar'
const props = withDefaults(defineProps<{ state?: StateId; expression?: AvatarExpression; size?: number; animate?: boolean; repeat?: boolean; look?: { x: number; y: number } | null }>(), { state: 'idle', expression: 'neutral', size: 64, animate: false, repeat: false, look: null })
const R = RAYON, VB = DEMI_VIEWBOX
const ink = computed(() => '#3b93f0'), paper = '#ffffff'
const uid = Math.random().toString(36).slice(2), maskId = `closet-bloub-${uid}`
const engine = new BotEngine(R, props.state, SHAPE_BY_ID.get('cercle')!.radii, EXPRESSION_BY_ID.get(expressionMap[props.expression])!)
const frame = shallowRef<BotFrame>(engine.sample(0))
let clock = 0, last = 0, started = 0, raf = 0
const visible = ref(!document.hidden), intersecting = ref(true), root = ref<SVGSVGElement | null>(null)
const reduced = ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
const running = computed(() => props.animate && !reduced.value && visible.value && intersecting.value)
function draw() { frame.value = engine.sample(clock); triggerRef(frame) }
function tick(ms: number) {
  clock += last ? Math.min((ms-last)/1000, .064) : 0; last = ms
  if(props.repeat && clock-started >= STATE_BY_ID.get(props.state)!.duration) { engine.reset(props.state, clock); started=clock }
  draw(); raf=requestAnimationFrame(tick)
}
function sync() {
  cancelAnimationFrame(raf);last=0
  if(running.value) raf=requestAnimationFrame(tick)
  else { engine.reset(props.state,0); clock=0; started=0; frame.value=engine.sample(props.state==='idle'?0:1.1);triggerRef(frame) }
}
watch(() => props.state, state => { engine.setState(state,clock);started=clock;if(!running.value)sync() })
watch(() => props.expression, value => { engine.setExpression(EXPRESSION_BY_ID.get(expressionMap[value])!,clock);if(!running.value) { frame.value=engine.sample(clock+1);triggerRef(frame) } })
watch(() => props.look, (look,previous) => engine.setLook(look ? {yaw:look.x*30,pitch:-look.y*24,mix:1,spin:0,wander:0}:null,clock,previous===undefined?0:.24),{deep:true,immediate:true})
watch(running,sync)
function visibility(){visible.value=!document.hidden}
function preference(){reduced.value=motion.matches}
let observer: IntersectionObserver | undefined
onMounted(() => { document.addEventListener('visibilitychange',visibility);motion.addEventListener('change',preference);observer=new IntersectionObserver(entries=>{intersecting.value=!!entries[0]?.isIntersecting});if(root.value)observer.observe(root.value);sync() })
onUnmounted(() => {cancelAnimationFrame(raf);observer?.disconnect();document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',preference)})
function dotAttrs(dot: BotFrame['dots'][number]) {
  const fill=dot.color ?? (dot.depth===undefined?ink.value:mixHex(paper,ink.value,dot.depth))
  const common={fill,opacity:dot.opacity}
  return dot.d?{...common,d:dot.d,transform:`translate(${dot.x} ${dot.y}) rotate(${dot.rot??0}) scale(${R})`}:{...common,cx:dot.x,cy:dot.y,r:dot.r}
}
</script>
<template>
  <svg
    ref="root"
    :width="props.size"
    :height="props.size"
    :viewBox="`${-VB} ${-VB} ${VB * 2} ${VB * 2}`"
    :data-bloub-state="props.state"
    :data-bloub-animated="running"
    role="img"
    :aria-label="'鱼搭蓝色小助手'"
  >
    <defs>
      <!--
        Les yeux sont de vrais trous perces dans le corps (comme sur x.ai), pas
        des formes blanches posees dessus : ils restent donc automatiquement
        rognes par la silhouette quand ils glissent vers le bord.
      -->
      <mask
        :id="maskId"
        maskUnits="userSpaceOnUse"
        :x="-VB"
        :y="-VB"
        :width="VB * 2"
        :height="VB * 2"
      >
        <path :d="frame.bodyPath" fill="#fff" />
        <path
          v-for="(eye, i) in frame.eyes"
          :key="i"
          :d="eye.d"
          :transform="eye.matrix"
          :opacity="eye.alpha"
          fill="#000"
        />
        <circle
          v-if="frame.notch"
          :cx="frame.notch.x"
          :cy="frame.notch.y"
          :r="frame.notch.r"
          fill="#000"
        />
      </mask>

      <linearGradient
        v-for="arc in frame.arcs"
        :id="`${uid}-${arc.id}`"
        :key="arc.id"
        gradientUnits="userSpaceOnUse"
        :x1="arc.grad.x1"
        :y1="arc.grad.y1"
        :x2="arc.grad.x2"
        :y2="arc.grad.y2"
      >
        <stop
          v-for="(c, i) in arc.grad.stops"
          :key="i"
          :offset="i / (arc.grad.stops.length - 1)"
          :stop-color="c"
        />
      </linearGradient>
    </defs>

    <!-- moitie arriere des orbites : dessinee avant le corps, donc occultee -->
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="`b${arc.id}`"
        :d="arc.back"
        :stroke="`url(#${uid}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>

    <!-- particules de l'eclatement : elles passent derriere le noyau -->
    <g v-if="frame.dotsBehind">
      <component
        :is="dot.d ? 'path' : 'circle'"
        v-for="(dot, i) in frame.dots"
        :key="`pb${i}`"
        v-bind="dotAttrs(dot)"
      />
    </g>

    <g :opacity="frame.bodyAlpha">
      <!--
        Fond opaque a la forme exacte du corps, sous le corps lui-meme.

        Les yeux sont des TROUS perces dans le corps, pas des formes blanches
        posees dessus : c'est ce qui les fait rogner tout seuls au bord de la
        silhouette, et ca ne change pas. Mais un trou laisse voir ce qui est
        dessine derriere — or la moitie arriere des anneaux et les particules de
        l'eclatement le sont justement, pour etre occultees par le corps. Sans ce
        fond, un anneau qui passe derriere la boule reapparait DANS les yeux.

        Rempli avec `paper` et non en blanc pur : c'est exactement ce que les yeux
        laissaient voir jusqu'ici, le fond de la page. Les mettre en blanc les
        rendrait plus clairs que le fond, ce qui se verrait sur une grande boule.
      -->
      <path :d="frame.bodyPath" :fill="paper" />
      <g :mask="`url(#${maskId})`">
        <rect :x="-VB" :y="-VB" :width="VB * 2" :height="VB * 2" :fill="ink" />
      </g>
    </g>

    <g v-if="!frame.dotsBehind">
      <component
        :is="dot.d ? 'path' : 'circle'"
        v-for="(dot, i) in frame.dots"
        :key="`pf${i}`"
        v-bind="dotAttrs(dot)"
      />
    </g>

    <circle
      v-if="frame.notif"
      :cx="frame.notif.x"
      :cy="frame.notif.y"
      :r="frame.notif.r"
      :fill="NOTIF_BLUE"
    />

    <!-- moitie avant des orbites -->
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="`f${arc.id}`"
        :d="arc.front"
        :stroke="`url(#${uid}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>
  </svg>
</template>
