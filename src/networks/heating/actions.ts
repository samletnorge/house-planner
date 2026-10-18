import { usePlanStore } from '../../store/planStore'
import { showToast } from '../../ui/Toast'
import { t } from '../../i18n'
import { autoLayout } from './layout'
import { heatingOf, withHeating } from './model'
import { filterPlanByLevel } from '../../model'
import { useHeatingUi } from './store'

export function runAutoLayout() {
  const plan = usePlanStore.getState().plan
  if (!plan) return
  const have = heatingOf(plan).loops.length
  if (have && !window.confirm(t('networks:heating.actions.confirmReplace', { count: have }))) return
  const level = usePlanStore.getState().level
  const res = autoLayout(filterPlanByLevel(plan, level))
  const existing = heatingOf(plan)
  const otherLoops = existing.loops.filter((l) => (l.level ?? 0) !== level)
  const heating = {
    ...existing,
    ...res.heating,
    loops: [...otherLoops, ...res.heating.loops.map((l) => ({ ...l, level }))],
    collector: res.heating.collector ? { ...res.heating.collector, level } : existing.collector,
  }
  usePlanStore.getState().commit(withHeating(plan, () => heating))
  useHeatingUi.getState().select(null)
  useHeatingUi.getState().setTab(true)
  showToast(t('networks:heating.actions.done', { count: res.heating.loops.length, notes: res.notes.slice(0, 2).join('. ') }))
}
