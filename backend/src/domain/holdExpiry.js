export function isHoldExpired(expiresAt, now = new Date()) {
  return !expiresAt || new Date(expiresAt).getTime() <= new Date(now).getTime();
}
