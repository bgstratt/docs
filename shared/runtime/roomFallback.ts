export const MAX_ROOM_FALLBACK_ATTEMPTS = 3;
export const ROOM_FALLBACK_RETRY_DELAY_MS = 600;

export function fallbackRoomId(baseRoomId: string, attempt: number): string {
  if (attempt <= 1) {
    return baseRoomId;
  }
  // Random suffix rather than -2/-3: every visitor falling back from a busy
  // room would otherwise pile into the same derived room and fill it too.
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)];
  }
  return `${baseRoomId}-${suffix}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface RoomFallbackResult {
  roomId: string;
  connected: boolean;
  attempts: number;
}

/**
 * User-triggered, bounded retry across a small number of derived room ids
 * (base, then base-{four random letters}). Never runs automatically and never on its own on
 * connect failure — the caller decides when to invoke it (e.g. a "Try
 * another room" button) so a transient failure can't turn into a reconnect
 * storm against the per-IP/per-room connection caps.
 */
export async function connectWithRoomFallback(
  baseRoomId: string,
  connect: (roomId: string) => Promise<void>,
  isConnected: () => boolean,
  onAttempt?: (roomId: string, attempt: number) => void
): Promise<RoomFallbackResult> {
  const base = baseRoomId.trim();
  let lastCandidate = base;

  for (let attempt = 1; attempt <= MAX_ROOM_FALLBACK_ATTEMPTS; attempt++) {
    const candidate = fallbackRoomId(base, attempt);
    lastCandidate = candidate;
    onAttempt?.(candidate, attempt);

    await connect(candidate);
    if (isConnected()) {
      return { roomId: candidate, connected: true, attempts: attempt };
    }

    if (attempt < MAX_ROOM_FALLBACK_ATTEMPTS) {
      await delay(ROOM_FALLBACK_RETRY_DELAY_MS);
    }
  }

  return { roomId: lastCandidate, connected: false, attempts: MAX_ROOM_FALLBACK_ATTEMPTS };
}
