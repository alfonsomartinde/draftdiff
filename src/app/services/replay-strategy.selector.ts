import { Injectable, inject } from '@angular/core';
import { ReplayScheduler } from './replay.service';
import { RealTimeReplayScheduler } from './schedulers/realtime-replay.scheduler';
import { FastReplayScheduler } from './schedulers/fast-replay.scheduler';

/**
 * ReplayStrategySelector
 *
 * Purpose: Choose the appropriate replay scheduler implementation.
 * Why created: Decouple the decision from the view; allow future strategies.
 */
@Injectable({ providedIn: 'root' })
export class ReplayStrategySelector {
  private readonly realtime = inject(RealTimeReplayScheduler);
  private readonly fast = inject(FastReplayScheduler);

  selectStrategy(opts: { isFinished: boolean }): ReplayScheduler {
    // Always prefer real-time replay to simulate original timing in spec mode
    // Fast replay remains available for potential future explicit fast-forward controls
    return this.realtime;
  }
}


