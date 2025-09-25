export interface ReplayContext {
  getState: () => any;
  getEvents: () => any[];
  getRoomId: () => string | null;
  setHistoryIndex: (index: number) => void;
  getReplayIdx: () => number;
  setReplayIdx: (index: number) => void;
  getReplayCountdown: () => number;
  setReplayCountdown: (value: number) => void;
  maskedFromCurrent: (s: any) => any;
  disconnectSocket: () => void;
  onFinished?: () => void;
}

export interface ReplayScheduler {
  configure(ctx: ReplayContext): void;
  start(): void;
  pause(): void;
  stop(): void;
  restartToMaskedBase(): void;
  scrubTo(index: number): void;
  isRunning(): boolean;
}
