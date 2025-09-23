import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
export class LobbyPageComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  blueTeamName = '';
  redTeamName = '';
  currentRoute = '';

  readonly roomId = toSignal(this.store.select(selectRoomId), { initialValue: null });
  private readonly rooms = inject(RoomsService);

  ngOnInit(): void {
    this.currentRoute = this.router.url;
  }

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

  copyLink(link: string): void {
    const fullLink = `${window.location.origin}${this.currentRoute}/${link}`.replace(/([^:]\/)\/+/g, "$1");
    navigator.clipboard.writeText(fullLink);
  }
}
