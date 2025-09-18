import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SpecPageComponent } from './spec-page.component';
import { provideStore } from '@ngrx/store';
import { draftReducer, initialDraftState } from '@state/draft/draft.reducer';
import { provideRouter } from '@angular/router';
import { DraftState } from '@models/draft';

describe('SpecPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SpecPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideStore({ draft: draftReducer }, { initialState: { draft: initialDraftState } }),
      ],
    });
  });

  it('computes playPauseLabel correctly when paused without progress', () => {
    const f = TestBed.createComponent(SpecPageComponent);
    const c = f.componentInstance as any;
    // default: idx=0, countdown=30, not playing
    expect(c.playPauseLabel()).toBe('Play');
  });

  it('playPauseLabel returns Pause when isReplaying=true', () => {
    const f = TestBed.createComponent(SpecPageComponent);
    const c = f.componentInstance as any;
    c.isReplaying.set(true);
    expect(c.playPauseLabel()).toBe('Pause');
  });

  it('onHistoryIndexChanged aligns replayIdx and countdown to next event', () => {
    const f = TestBed.createComponent(SpecPageComponent);
    const c = f.componentInstance as any;
    const s: DraftState = {
      ...initialDraftState,
      events: [
        { seq: 1, at: '', source: 'client', type: 'CLIENT/READY', payload: { side: 'blue' }, countdownAt: 30 },
        { seq: 2, at: '', source: 'client', type: 'CLIENT/READY', payload: { side: 'red' }, countdownAt: 30 },
      ],
    } as any;
    // override store-backed signal by replacing the callable with a stub
    (c as any).draft = () => s;
    c.onHistoryIndexChanged(0);
    expect(c.replayIdx()).toBe(1);
    expect(c.replayCountdown()).toBe(30);
  });

  it('togglePlayback starts replay and advances at least one event', () => {
    const f = TestBed.createComponent(SpecPageComponent);
    const c = f.componentInstance as any;
    // Stub environment to avoid timers and sockets
    c.beginReplayInterval = (_: any[]) => {};
    c.client = { disconnect: () => {} };
    // Make replay mode eligible
    c.initialWasFinished.set(true);
    const s: DraftState = {
      ...initialDraftState,
      events: [
        { seq: 1, at: '', source: 'client', type: 'CLIENT/READY', payload: { side: 'blue' }, countdownAt: 30 },
        { seq: 2, at: '', source: 'client', type: 'CLIENT/READY', payload: { side: 'red' }, countdownAt: 30 },
      ],
    } as any;
    (c as any).draft = () => s;
    // Preconditions
    expect(c.isReplayMode()).toBeTrue();
    expect(c.isReplaying()).toBeFalse();
    // Act
    c.togglePlayback();
    // Assert
    expect(c.isReplaying()).toBeTrue();
    expect(c.replayIdx()).toBeGreaterThanOrEqual(1);
  });

  it('restart resets runtime pointers and slider', () => {
    const f = TestBed.createComponent(SpecPageComponent);
    const c = f.componentInstance as any;
    // Seed runtime as if there was progress
    c.isReplaying.set(true);
    c.historyIndex.set(5);
    c.replayIdx.set(6);
    c.replayCountdown.set(0);
    // Act
    c.restart();
    // Assert
    expect(c.isReplaying()).toBeFalse();
    expect(c.historyIndex()).toBe(-1);
    expect(c.replayIdx()).toBe(0);
    expect(c.replayCountdown()).toBe(30);
  });
});


