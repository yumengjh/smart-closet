/** Chat cards talk to the assistant panel through window events; AssistantPanel.vue listens for both. */
export const ASSISTANT_SEND_EVENT = 'closet-assistant-send'
export const ASSISTANT_PREFILL_EVENT = 'closet-assistant-prefill'
export type AssistantTextDetail = { text: string }

/** Sends the text as the user's next message (the panel keeps it in the input instead while it is replying). */
export function sendToAssistant(text: string) { window.dispatchEvent(new CustomEvent<AssistantTextDetail>(ASSISTANT_SEND_EVENT, { detail: { text } })) }
/** Puts the text into the assistant input for the user to finish and send. */
export function prefillAssistant(text: string) { window.dispatchEvent(new CustomEvent<AssistantTextDetail>(ASSISTANT_PREFILL_EVENT, { detail: { text } })) }
