export class WrappedError extends Error {
  declare cause: { error: any; previousError?: WrappedError }
}