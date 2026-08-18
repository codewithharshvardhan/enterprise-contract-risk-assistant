import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWindowSize } from './useWindowSize'

describe('useWindowSize', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 })
  })

  it('returns the current window dimensions', () => {
    const { result } = renderHook(() => useWindowSize())
    expect(result.current.width).toBe(1024)
    expect(result.current.height).toBe(768)
  })

  it('updates on resize', () => {
    const { result } = renderHook(() => useWindowSize())

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 900 })
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.width).toBe(1280)
    expect(result.current.height).toBe(900)
  })
})
