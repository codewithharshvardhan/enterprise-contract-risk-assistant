import { useState, useEffect, useCallback } from 'react'
import { fetchExecutions } from '../lib/api'
import type { ExecutionRecord } from '../types/contract'

export function useExecutions() {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchExecutions()
      setExecutions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load executions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { executions, loading, error, refresh: load }
}
