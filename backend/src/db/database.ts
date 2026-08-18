// ─── Generic data store — a database-agnostic persistence stub ───────────────
//
// The template does NOT commit to a database. This in-memory store implements a
// small, generic surface (`insert` / `list` / `get` / `update` / `remove` over named
// *collections*) so the app runs and the Continuous Learning + governance features
// work out of the box and show **empty** until there is real activity.
//
// ⚠️ It does NOT persist across restarts. **Replace it with your real database**
// (Postgres, MongoDB, SQLite, a managed service, …): implement this same surface
// backed by your DB and read connection settings from the environment
// (`DATABASE_URL` / `DB_*`). Features create their own collections on demand by name
// — there is no central schema — so swapping the backend touches only this file.

export type Doc = Record<string, unknown> & { id: number }

class InMemoryStore {
  private data = new Map<string, Map<number, Doc>>()
  private seq = new Map<string, number>()

  private coll(name: string): Map<number, Doc> {
    let c = this.data.get(name)
    if (!c) {
      c = new Map()
      this.data.set(name, c)
    }
    return c
  }

  /** Add a document; assigns and returns it with an integer `id`. */
  insert(collection: string, doc: Record<string, unknown>): Doc {
    const c = this.coll(collection)
    const id = (this.seq.get(collection) ?? 0) + 1
    this.seq.set(collection, id)
    const stored: Doc = { ...structuredClone(doc), id }
    c.set(id, stored)
    return structuredClone(stored)
  }

  list(collection: string, opts: { newestFirst?: boolean } = {}): Doc[] {
    const rows = [...this.coll(collection).values()].map((d) => structuredClone(d))
    rows.sort((a, b) => (opts.newestFirst ? b.id - a.id : a.id - b.id))
    return rows
  }

  get(collection: string, id: number): Doc | null {
    const d = this.coll(collection).get(id)
    return d ? structuredClone(d) : null
  }

  update(collection: string, id: number, patch: Record<string, unknown>): Doc | null {
    const c = this.coll(collection)
    const cur = c.get(id)
    if (!cur) return null
    const next: Doc = { ...cur, ...structuredClone(patch), id }
    c.set(id, next)
    return structuredClone(next)
  }

  remove(collection: string, id: number): boolean {
    return this.coll(collection).delete(id)
  }
}

// The app-wide store. Replace `new InMemoryStore()` with your real DB-backed
// implementation (same surface) — every feature uses this one instance.
export const store = new InMemoryStore()
