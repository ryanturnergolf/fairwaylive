type OperationIdCrypto = Pick<Crypto, "randomUUID" | "getRandomValues">;

let fallbackSequence = 0;

const formatUuid = (bytes: Uint8Array) => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

export const createOperationId = (
  cryptoProvider: Partial<OperationIdCrypto> | undefined = globalThis.crypto
) => {
  if (typeof cryptoProvider?.randomUUID === "function") {
    return cryptoProvider.randomUUID();
  }

  if (typeof cryptoProvider?.getRandomValues === "function") {
    return formatUuid(cryptoProvider.getRandomValues(new Uint8Array(16)));
  }

  fallbackSequence = (fallbackSequence + 1) % Number.MAX_SAFE_INTEGER;
  const timestamp = Date.now().toString(36);
  const highResolutionTime =
    typeof globalThis.performance?.now === "function"
      ? Math.floor(globalThis.performance.now() * 1_000).toString(36)
      : "0";
  const random = Math.random().toString(36).slice(2);
  return `operation-${timestamp}-${highResolutionTime}-${fallbackSequence.toString(36)}-${random}`;
};
