import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RoomsService } from '@services/rooms.service';
import { DraftActions } from '@state/draft/draft.actions';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectRoomId } from '@state/draft/draft.selectors';
import { Store } from '@ngrx/store';
import { DraftState } from '@models/draft';

@Component({
  selector: 'app-lobby-page',
  imports: [CommonModule, FormsModule, RouterLink],
  standalone: true,
  templateUrl: './lobby-page.component.html',
  styleUrls: ['./lobby-page.component.scss'],
})
export class LobbyPageComponent {
  private readonly store = inject(Store);
  blueTeamName = '';
  redTeamName = '';

  readonly roomId = toSignal(this.store.select(selectRoomId), { initialValue: null });
  private readonly rooms = inject(RoomsService);

  create(): void {
    this.rooms
      .createRoom({
        blueName: this.blueTeamName,
        redName: this.redTeamName,
      })
      .then((state: DraftState) => {
        if (!state) return;
        this.store.dispatch(DraftActions['draft/hydrate']({ newState: state }));
      })
      .catch((err) => {
        console.error('LobbyPageComponent: Failed to create room', err);
      });
  }
}
