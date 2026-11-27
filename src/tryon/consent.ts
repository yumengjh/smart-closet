const CONSENT_KEY = 'yuda.tryon.premium.consent.v1'
const NETWORK_KEY = 'yuda.tryon.premium.network.v1'

export function premiumConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === '1' } catch { return false }
}

export function savePremiumConsent(): boolean {
  try { localStorage.setItem(CONSENT_KEY, '1'); return localStorage.getItem(CONSENT_KEY) === '1' } catch { return false }
}

export function premiumNetworkNoticeNeeded(): boolean {
  try { return localStorage.getItem(NETWORK_KEY) !== '1' } catch { return true }
}

export function savePremiumNetworkNotice(): void {
  try { localStorage.setItem(NETWORK_KEY, '1') } catch { /* 下次重新提示 */ }
}
