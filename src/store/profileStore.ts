import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Currency } from '../money'

export type ProfileState = {
  name: string
  currency: Currency
  setName: (name: string) => void
  setCurrency: (currency: Currency) => void
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      currency: 'RUB',
      setName: (name) => set({ name }),
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: 'house-planner:profile',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ name: s.name, currency: s.currency }),
    },
  ),
)
