export class ExtendedMap<K, V> extends Map<K, V> {
  getOrInsertComputed(key: K, callbackFn: (key: K) => V): V {
    if (this.has(key)) return this.get(key)!
    const value = callbackFn(key)
    this.set(key, value)
    return value
  }
}
const noParams = Object.freeze({} as Record<string, string>)
const noKeys = Object.freeze(new Set<string>())

// supports patten matching for paths, so we can do router.use('/users/:id', ...middlewares) and it will match /users/123, /users/abc, etc.
export class PatternMap<V = unknown> extends ExtendedMap<string, V> {
  candidateKeysBySegment = new ExtendedMap<number, Set<string>>()

  normalizeKey(key: string): string {
    return key.startsWith('/') ? key : `/${key}`
  }

  set(path: string, value: V): this {
    path = this.normalizeKey(path)
    const segments = path.split('/').filter((e) => e).length
    this.candidateKeysBySegment.getOrInsertComputed(segments, () => new Set()).add(path)

    return super.set(path, value)
  }

  get(path: string): V | undefined {
    path = this.normalizeKey(path)
    return super.get(path)
  }

  getCandidates(path: string): IterableIterator<[string, V, Record<string, string>]> {
    const exactMatch = this.get(path)
    if (exactMatch) {
      return one([path, exactMatch, noParams])
    }

    const splitPath = path.split('/').filter((e) => e)
    const segments = splitPath.length
    const candidates = this.candidateKeysBySegment.getOrInsertComputed(segments, () => noKeys)
    return flatMap(candidates.values(), (candidate) => {
      const splitCandidate = candidate.split('/').filter((e) => e)
      if (!candidate.includes(':')) {
        // no exact match, and this candidate doesn't have any params, so it can't match
        return none()
      }
      for (let i = 0; i < splitCandidate.length; i++) {
        const candidateSegment = splitCandidate[i]
        if (candidateSegment.startsWith(':')) {
          continue
        }
        if (candidateSegment !== splitPath[i]) {
          return none()
        }
      }
      const params = splitCandidate.reduce(
        (params, segment, i) => {
          if (segment.startsWith(':')) {
            const paramName = segment.slice(1)
            params[paramName] = splitPath[i]
          }
          return params
        },
        {} as Record<string, string>,
      )
      const value = this.get(candidate)
      if (value !== undefined) {
        return one([candidate, value, Object.freeze(params)])
      }
      return none()
    })
  }
}

function* flatMap<T, U>(iterable: Iterable<T>, callbackFn: (item: T) => Iterable<U>): Generator<U> {
  for (const item of iterable) {
    yield* callbackFn(item)
  }
}

function* one<T>(item: T): IterableIterator<T> {
  yield item
}

function* none<T>(): IterableIterator<T> {
  return
}