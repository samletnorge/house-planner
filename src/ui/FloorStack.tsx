import { useTranslation } from 'react-i18next'
import { usePlanStore } from '../store/planStore'
import { cx } from './cx'

export function FloorStack({ variant = 'column', onSelect }: { variant?: 'row' | 'column'; onSelect?: (level: number) => void }) {
  const { t } = useTranslation('common')
  const plan = usePlanStore((s) => s.plan)
  const level = usePlanStore((s) => s.level)
  const count = usePlanStore((s) => s.levelCount)
  const setLevel = usePlanStore((s) => s.setLevel)
  const addLevel = usePlanStore((s) => s.addLevel)
  if (!plan) return null
  const levels = Array.from({ length: count }, (_, i) => i)
  if (variant === 'column') levels.reverse()
  return (
    <div className={cx('floor-stack', 'card', `floor-stack--${variant}`)} role="group" aria-label={t('floor.label')}>
      <span className="floor-stack__title">{t('floor.label')}</span>
      {levels.map((i) => (
        <button
          key={i}
          type="button"
          className={cx('floor-stack__item', i === level && 'floor-stack__item--active')}
          aria-pressed={i === level}
          onClick={() => {
            setLevel(i)
            onSelect?.(i)
          }}
        >
          <span className="floor-stack__num">{i + 1}</span>
          <span>{t('floor.level', { level: i + 1 })}</span>
        </button>
      ))}
      <button type="button" className="floor-stack__item floor-stack__add" onClick={addLevel}>
        <span className="floor-stack__num">+</span>
        <span>{t('floor.add')}</span>
      </button>
    </div>
  )
}
