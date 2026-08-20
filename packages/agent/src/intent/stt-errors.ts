export class SttUnavailableError extends Error {
  readonly code = "STT_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "SttUnavailableError";
  }
}
