// ─── TOUL UI primitives ─────────────────────────────────────
// iOS-inspired Dark · Active container pattern · Apple System Green

export { Field } from './Field'
export type { FieldProps } from './Field'

export { PriceField } from './PriceField'
export type { PriceFieldProps } from './PriceField'

export { CategoryPicker } from './CategoryPicker'
export type { CategoryPickerProps, PickerItem } from './CategoryPicker'

// ─── Animation tokens (Framer Motion) ───────────────────────
export const SPRING_SOFT = { type: 'spring' as const, stiffness: 240, damping: 26 }
export const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }
export const EASE_OUT_EXPO: [number, number, number, number] = [0.4, 0, 0.2, 1]
export const EASE_OUT_EMIL: [number, number, number, number] = [0.23, 1, 0.32, 1]
