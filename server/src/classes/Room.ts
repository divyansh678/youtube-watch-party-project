import type { ChangeRequest, Participant, PlayState, Role, RoomState } from "../types.js";

export class Room {
  readonly roomId: string;
  participants = new Map<string, Participant>();
  videoId = "dQw4w9WgXcQ";
  playState: PlayState = "paused";
  currentTime = 0;
  requests = new Map<string, ChangeRequest>();
  updatedAt = Date.now();

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  addParticipant(userId: string, username: string, role: Role): Participant {
    const participant = { userId, username, role };
    this.participants.set(userId, participant);
    this.touch();
    return participant;
  }

  removeParticipant(userId: string): Participant | undefined {
    const removed = this.participants.get(userId);
    this.participants.delete(userId);
    for (const [id, request] of this.requests) {
      if (request.userId === userId) this.requests.delete(id);
    }
    this.touch();
    return removed;
  }

  getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  setRole(userId: string, role: Role): Participant | undefined {
    const participant = this.participants.get(userId);
    if (!participant) return undefined;
    participant.role = role;
    this.touch();
    return participant;
  }

  updatePlayback(patch: Partial<Pick<Room, "videoId" | "playState" | "currentTime">>) {
    if (patch.videoId !== undefined) this.videoId = patch.videoId;
    if (patch.playState !== undefined) this.playState = patch.playState;
    if (patch.currentTime !== undefined) this.currentTime = patch.currentTime;
    this.touch();
  }

  addRequest(request: ChangeRequest) {
    this.requests.set(request.requestId, request);
    this.touch();
  }

  removeRequest(requestId: string) {
    const request = this.requests.get(requestId);
    this.requests.delete(requestId);
    this.touch();
    return request;
  }

  touch() { this.updatedAt = Date.now(); }

  toJSON(): RoomState {
    return {
      roomId: this.roomId,
      participants: [...this.participants.values()],
      videoId: this.videoId,
      playState: this.playState,
      currentTime: this.currentTime,
      requests: [...this.requests.values()],
      updatedAt: this.updatedAt
    };
  }
}
