import type { Garment } from '../services/api'
/** 只有已拥有、且有审核通过图片的衣物才能用于创作。 */
export const eligibleGarment = (g: Garment) => g.status === 'ACTIVE' && Boolean(g.displayUrl || g.images.some(image => image.reviewStatus === 'APPROVED'))
