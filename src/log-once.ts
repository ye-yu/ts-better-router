const loggedMessages = new Set<string>()

export function logOnce(...messages: unknown[]) {
  const messageKey = messages.map((msg) => JSON.stringify(msg)).join('|')
  if (loggedMessages.has(messageKey)) {
    return
  }
  loggedMessages.add(messageKey)
  console.debug(...messages)
}