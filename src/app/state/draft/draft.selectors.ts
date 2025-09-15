import { createSelector, createFeatureSelector } from '@ngrx/store';
import { DraftState } from '@models/draft';
import { IStep } from '@models/draft';

export const selectDraft = createFeatureSelector<DraftState>('draft');

export const selectReady = createSelector(selectDraft, (s) => ({
  blue: s.teams.blue.ready,
  red: s.teams.red.ready,
}));
export const selectCurrentStepId = createSelector(selectDraft, (s) => s.currentStepId);
export const selectCurrentSide = createSelector(selectDraft, (s) => s.currentSide);
export const selectCountdown = createSelector(selectDraft, (s) => s.countdown);
export const selectRoomId = createSelector(selectDraft, (s) => s.roomId);
export const selectSteps = createSelector(selectDraft, (s) => s.steps as IStep[]);
export const selectTeams = createSelector(selectDraft, (s) => s.teams);
export const selectIsFinished = createSelector(selectDraft, (s) => s.isFinished);
export const selectCurrentStep = createSelector(
  selectSteps,
  selectCurrentStepId,
  (steps, idx) => steps[idx] ?? null,
);
