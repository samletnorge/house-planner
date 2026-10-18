import { useMemo } from 'react'
import { fmtNum } from './i18n'
import { useProfile } from './store/profileStore'

export type Currency = 'RUB' | 'NOK' | 'EUR' | 'USD'

export const CURRENCIES: { id: Currency; symbol: string; name: string }[] = [
  { id: 'RUB', symbol: '₽', name: 'RUB' },
  { id: 'NOK', symbol: 'kr', name: 'NOK' },
  { id: 'EUR', symbol: '€', name: 'EUR' },
  { id: 'USD', symbol: '$', name: 'USD' },
]

const SYMBOL: Record<Currency, string> = {
  RUB: '₽',
  NOK: 'kr',
  EUR: '€',
  USD: '$',
}

export const formatMoney = (value: number, currency: Currency = 'RUB') =>
  `${fmtNum(Math.round(value), 0)} ${SYMBOL[currency]}`

export function useMoney() {
  const currency = useProfile((s) => s.currency)
  return useMemo(() => (value: number) => formatMoney(value, currency), [currency])
}
