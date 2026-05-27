import { type IncomingMessage, type ServerResponse, METHODS } from 'node:http'
import { PrefixedLogger } from './logger.ts'
import { ExtendedMap, PatternMap } from './pattern-map.ts'
import { WrappedError } from './wrapped-error.ts'

export const methods = METHODS.map(m => m.toLowerCase() as Methods)
const console = new PrefixedLogger(import.meta.url)

type Middleware = (req: any, res: any, next: (err?: any) => void) => void
type ErrorMiddleware = (err: any, req: any, res: any, next: (err?: any) => void) => void

export type Methods = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head'
type middlewareRegisterer<TMiddleware extends Function = Middleware, EMiddleware extends Function = ErrorMiddleware, R = RouterBase<TMiddleware, EMiddleware>> = {
  (path: string, ...middlewares: (TMiddleware | EMiddleware | R)[]): R
}

type ServerRequest = IncomingMessage & {
  params?: Record<string, string>
  query?: Record<string, string>
}

const emptyMap = new PatternMap<any>()

export class RouterBase<TMiddleware extends Function = Middleware, EMiddleware extends Function = ErrorMiddleware> implements Record<
  Methods,
  middlewareRegisterer<TMiddleware, EMiddleware, RouterBase<TMiddleware, EMiddleware>>
> {

  rankingCounter: number;
  ranks: WeakMap<object, number>
  trackedPaths: ['use' | Methods, string, (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]][]

  constructor() {
    this.rankingCounter = 0;
    this.ranks = new WeakMap()
    this.trackedPaths = []
    this.configureUnsetMethods()
  }

  configureUnsetMethods() {
    for (const method of METHODS) {
      if (!this[method as Methods]) {
        this[method as Methods] = (path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]) => {
          return this.apply(method as Methods, path, ...middlewares)
        }
      }
    }
  }

  route: (path: string) => { [K in Methods]: (...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]) => ReturnType<typeof this['route']> } = (path: string) => {
    const routeHandlers = {} as any

    for (const method of methods) {
      routeHandlers[method] = (...middlewares: any[]) => {
        this.apply(method, path, ...middlewares)
        return routeHandlers
      }
    }

    routeHandlers['use' as any] = (...middlewares: any[]) => {
      (this.use as any)(...middlewares)
      return routeHandlers
    }

    routeHandlers['all' as any] = (...middlewares: any[]) => {
      (this.all as any)(path, ...middlewares)
      return routeHandlers
    }

    return routeHandlers
  }

  getNewRanking() {
    return (++this.rankingCounter)
  }

  setRanking(obj: object) {
    this.ranks.set(obj, this.getNewRanking())
  }

  isMiddleware(middleware: any): middleware is TMiddleware {
    return typeof middleware === 'function' && ((middleware as () => void).length === 3 || (middleware as () => void).length === 2)
  }

  isErrorMiddleware(middleware: any): middleware is EMiddleware {
    return typeof middleware === 'function' && (middleware as () => void).length === 4
  }

  *getPathSegmentsForUse(path: string): Generator<string> {
    const segments = path.split('/')
    for (let i = 0; i < segments.length; i++) {
      const candidate = segments.slice(0, i + 1).join('/')
      yield candidate
    }
  }

  *getHandlersFromProvided<T>(
    method: Methods,
    path: string,
    middlewaresOfUse: PatternMap<T[]>,
    methodsToMiddlewares: ExtendedMap<Methods, PatternMap<T[]>>,
  ): Generator<{
    pattern: string
    handler: T[]
  }> {
    const pathSegmentsForUse = this.getPathSegmentsForUse(path)
    for (const segments of pathSegmentsForUse) {
      const matchingMiddlewaresOfUse = middlewaresOfUse.getCandidates(segments)
      for (const [pattern, middlewares] of matchingMiddlewaresOfUse) {
        yield { pattern, handler: middlewares }
      }
    }

    const middlewaresOfMethod = methodsToMiddlewares.getOrInsertComputed(
      method,
      () => emptyMap as PatternMap<T[]>,
    )

    const candidates = middlewaresOfMethod.getCandidates(path)
    for (const [pattern, middlewares] of candidates) {
      yield { pattern, handler: middlewares }
    }
  }

  *getHandlers(
    method: Methods,
    path: string,
  ): Generator<{
    pattern: string
    handler: TMiddleware[]
  }> {
    const handlerGenerator = this.getHandlersFromProvided(
      method,
      path,
      this.middlewaresOfUse,
      this.methodsToMiddlewares,
    )

    yield* Array.from(handlerGenerator).toSorted((a, b) => {
      const aRanking = this.ranks.get(a) || 0
      const bRanking = this.ranks.get(b) || 0
      return aRanking - bRanking
    })
  }

  *getErrorHandlers(
    method: Methods,
    path: string,
  ): Generator<{
    pattern: string
    handler: EMiddleware[]
  }> {
    const handlerGenerator = this.getHandlersFromProvided(
      method,
      path,
      this.errorMiddlewaresOfUse,
      this.methodsToErrorMiddlewares,
    )

    yield* Array.from(handlerGenerator).toSorted((a, b) => {
      const aRanking = this.ranks.get(a) || 0
      const bRanking = this.ranks.get(b) || 0
      return aRanking - bRanking
    })
  }

  middlewaresOfUse = new PatternMap<TMiddleware[]>()
  methodsToMiddlewares = new ExtendedMap<Methods, PatternMap<TMiddleware[]>>()

  errorMiddlewaresOfUse = new PatternMap<EMiddleware[]>()
  methodsToErrorMiddlewares = new ExtendedMap<Methods, PatternMap<EMiddleware[]>>()

  all(...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this
  all(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this
  all(path: string | (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>), ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    if (typeof path === 'string') {
      for (const method of methods) {
        this.apply(method, path, ...middlewares)
      }
      return this

    }

    for (const method of methods) {
      this.apply(method, '/', path, ...middlewares)
    }
    return this
  }

  use(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    for (const m of middlewares) {
      this.setRanking(m)
      this.trackedPaths.push(['use', path, middlewares])
      switch (true) {
        case this.isMiddleware(m):
          this.middlewaresOfUse.getOrInsertComputed(path, () => []).push(m)
          break
        case this.isErrorMiddleware(m):
          this.errorMiddlewaresOfUse.getOrInsertComputed(path, () => []).push(m)
          break
        case m instanceof RouterBase:
          this.extractRouterHandlers(m)
          break
        default:
          throw new Error('Unsupported handler: argument handler must be a function', { cause: m })
      }
    }

    return this
  }

  apply(method: Methods, path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    for (const m of middlewares) {
      this.setRanking(m)
      this.trackedPaths.push([method, path, middlewares])
      switch (true) {
        case typeof m === 'function':
        case this.isMiddleware(m):
          this.methodsToMiddlewares
            .getOrInsertComputed(method, () => new PatternMap())
            .getOrInsertComputed(path, () => []).push(m as any)
          break
        case this.isErrorMiddleware(m):
          this.methodsToErrorMiddlewares
            .getOrInsertComputed(method, () => new PatternMap())
            .getOrInsertComputed(path, () => []).push(m)
          break
        case m instanceof RouterBase:
          this.extractRouterHandlers(m)
          break
        default:
          throw new Error('Unsupported handler: argument handler must be a function', { cause: m })
      }
    }

    return this
  }

  extractRouterHandlers(router: RouterBase<any, any>) {
    for (const [method, path, middlewares] of router.trackedPaths) {
      switch (method) {
        case 'use':
          this.use(path, ...middlewares)
          break
        default:
          this.apply(method, path, ...middlewares)
      }
    }
  }

  get(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    return this.apply('get', path, ...middlewares)
  }

  post(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    return this.apply('post', path, ...middlewares)
  }

  put(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    return this.apply('put', path, ...middlewares)
  }

  delete(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    return this.apply('delete', path, ...middlewares)
  }

  patch(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    return this.apply('patch', path, ...middlewares)
  }

  options(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    return this.apply('options', path, ...middlewares)
  }

  head(path: string, ...middlewares: (TMiddleware | EMiddleware | RouterBase<TMiddleware, EMiddleware>)[]): this {
    return this.apply('head', path, ...middlewares)
  }

  extractParams(path: string, pattern: string): Record<string, string> {
    const pathSegments = path.split('/')
    const patternSegments = pattern.split('/')

    const params: Record<string, string> = {}
    for (let i = 0; i < patternSegments.length; i++) {
      const patternSegment = patternSegments[i]
      if (patternSegment.startsWith(':')) {
        const paramName = patternSegment.slice(1)
        params[paramName] = pathSegments[i]
      }
    }

    return params
  }

  wrapError(newError?: any, oldError?: Error): Error {
    if (!oldError) {
      return newError instanceof Error ? newError : new Error(String(newError))
    }

    if (!(newError instanceof Error)) {
      return new WrappedError(`${newError}`, {
        cause: { error: newError as unknown, previousError: oldError },
      })
    }

    if (!newError.cause) {
      newError.cause = oldError
      return newError
    }

    return new WrappedError(`${newError}`, {
      cause: { error: newError, previousError: oldError },
    })
  }


  async handleAsync<
    TRequest extends { method?: string; url?: string } = IncomingMessage,
    TResponse extends { statusCode: number; end: (resp?: any) => void; writableEnded: boolean } =
    ServerResponse,
  >(req: TRequest, res: TResponse): Promise<void> {
    const { method = '', url = '' } = req

    const methodLower = method as unknown as Methods

    const asUrlObject = URL.parse(url, 'http://dummy/')
    if (!asUrlObject) {
      res.statusCode = 400
      res.end('Bad Request')
      return
    }

    const path = asUrlObject.pathname || '/'
    const params: Record<string, string> = {}
    const query = Object.freeze(Object.fromEntries(asUrlObject.searchParams.entries()))
    Object.defineProperty(req, 'params', {
      value: params,
      writable: false,
      configurable: false,
      enumerable: true,
    })
    Object.defineProperty(req, 'query', {
      value: query,
      writable: false,
      configurable: false,
      enumerable: true,
    })
    const enrichedReq = req as unknown as ServerRequest

    let error: any = null

    const handlers = this.getHandlers(methodLower, url)
    handlerLoop: for (const { pattern, handler } of handlers) {
      const paramsFromPattern = this.extractParams(path, pattern)
      Object.assign(params, paramsFromPattern)
      for (const _middleware of handler) {
        const middleware = _middleware as TMiddleware
        try {
          // note: only resolve when next is called, even if the middleware is a promise
          await new Promise<void>((resolve, reject) => {
            const maybePromise = middleware(enrichedReq, res as unknown as any, (err: any) => {
              if (err) {
                reject(err)
              } else {
                resolve()
              }
            })

            if (maybePromise instanceof Promise) {
              maybePromise
                // .then(resolve) // do we need to resolve?
                .catch(reject)
            }
          })
          if (error) {
            break handlerLoop
          }
        } catch (err) {
          error = this.wrapError(err, error)
          break handlerLoop
        }
      }
      if (error) {
        break handlerLoop
      }
    }

    if (error) {
      const errorHandlers = this.getErrorHandlers(methodLower, url)
      for (const { pattern, handler } of errorHandlers) {
        const paramsFromPattern = this.extractParams(path, pattern)
        Object.assign(params, paramsFromPattern)
        for (const _middleware of handler) {
          const middleware = _middleware as EMiddleware
          try {
            // note: only resolve when next is called, even if the middleware is a promise
            await new Promise<void>((resolve, reject) => {
              const maybePromise = middleware(error, enrichedReq, res as unknown as any, (err: any) => {
                if (err) {
                  reject(err)
                } else {
                  resolve()
                }
              })

              if (maybePromise instanceof Promise) {
                maybePromise
                  // .then(resolve) // do we need to resolve?
                  .catch(reject)
              }
            })
          } catch (err) {
            error = this.wrapError(err, error)
            break
          }
        }
      }
    }

    // if (res.writableEnded) return
    // if (error) {
    //   console.debug('Error occurred but writes have not ended, sending 500 response', error)
    //   res.statusCode = 500
    //   res.end('Internal Server Error')
    // } else {
    //   res.statusCode = 404
    //   res.end('Not Found')
    // }
  }

  handle<TRequest extends { method?: string; url?: string } = IncomingMessage, TResponse extends { statusCode: number; end: (resp?: any) => void; writableEnded: boolean } = ServerResponse>(req: TRequest, res: TResponse): void {
    this.handleAsync(req, res)
  }
}

export type RouterType<
  TMiddleware extends Function = Middleware,
  EMiddleware extends Function = ErrorMiddleware> =
  (() => RouterBase<TMiddleware, EMiddleware>) & {
    new(): RouterBase<TMiddleware, EMiddleware>
  }



// @ts-expect-error allow compat with Router() and new Router()
export const Router: RouterType = function Router(this: any) {
  if (!(this instanceof Router)) {
    // @ts-expect-error allow compat with Router() and new Router()
    return new Router()
  }

  function handler(req: any, res: any, next: (err?: any) => void) {
    // @ts-expect-error allow compat with Router() and new Router()
    return this.handleAsync(req, res)
  }

  Object.setPrototypeOf(handler, Router.prototype)

  // @ts-expect-error allow compat with Router() and new Router()
  handler.configureUnsetMethods()
  const base = new RouterBase()
  for (const [key, value] of Object.entries(base)) {
    if (Object.hasOwn(handler, key)) continue
    // @ts-expect-error allow compat with Router() and new Router()
    handler[key] = value
  }

  return handler
}

Object.setPrototypeOf(Router.prototype, RouterBase.prototype);
