import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Pose } from '../services/platform'

export type SendOffCard = { image?: string; label: string }
export type SendOff = {
  id: number
  /** Short line under the cards while they gather, e.g. "4 件衣物 · 叉腰站姿". */
  title: string
  cards: SendOffCard[]
  /** The model the cards are dressed onto; omitted when the picture is the model itself. */
  person?: string
  pose?: Pose | null
}

/**
 * The hand-off ritual for image generation: the chosen garments, pose and model gather on screen, the outfit is
 * "put on" the model, and the bundle flies into the processing centre at the top right. The picture takes about a
 * minute; the user keeps browsing and is told when it is ready instead of watching a spinner.
 */
export const useSendOffStore = defineStore('sendOff', () => {
  const current = ref<SendOff | null>(null)
  /** Bumped when a bundle lands so the inbox button can bounce. */
  const landed = ref(0)
  let serial = 0
  function launch(input: Omit<SendOff, 'id'>) { current.value = { ...input, cards: input.cards.slice(0, 6), id: ++serial } }
  function land(id: number) { if (current.value?.id === id) current.value = null; landed.value++ }
  return { current, landed, launch, land }
})
