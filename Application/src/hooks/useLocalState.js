import { useEffect, useState } from 'react'
export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => { try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : initial } catch { return initial } })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)) }, [key, value])
  return [value, setValue]
}
