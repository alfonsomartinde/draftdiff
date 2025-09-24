import { Injectable } from '@angular/core';
import { environment } from '@/environments/environment';
import { DraftState } from '@models/draft';

@Injectable({ providedIn: 'root' })
export class RoomsService {
  /**
   * Creates a new draft room via the backend API.
   *
   * @param input Object containing the blue and red team names
   * @returns The initial DraftState persisted on the server
   * @throws Error when the HTTP request fails
   */
  async createRoom(input: { blueName: string; redName: string }): Promise<DraftState> {
    const res = await fetch(`${environment.socketUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to create room: HTTP ${res.status} ${text}`);
    }
    return res.json();
  }

  // Placeholders para CRUD adicional (implementar en servidor cuando sea necesario)
  async getRoom(_roomId: string): Promise<{ roomId: string; state: DraftState } | undefined> {
    // Implementar cuando exista endpoint REST GET /api/rooms/:roomId
    return undefined;
  }

  async listEvents(_roomId: string): Promise<any[]> {
    // Implementar cuando exista endpoint REST GET /api/rooms/:roomId/events
    return [];
  }

  async createSnapshot(_roomId: string): Promise<{ ok: boolean }> {
    // Implementar cuando exista endpoint REST POST /api/rooms/:roomId/snapshots
    return { ok: false };
  }

  async listSnapshots(_roomId: string): Promise<any[]> {
    // Implementar cuando exista endpoint REST GET /api/rooms/:roomId/snapshots
    return [];
  }
}
