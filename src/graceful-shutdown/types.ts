export interface Shutdown {
  (signal?: AbortSignal): Promise<void>;
}
