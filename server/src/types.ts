export type Role = "Host" | "Moderator" | "Participant";
export type PlayState = "playing" | "paused";

export interface Participant {
  userId: string;
  username: string;
  role: Role;
}

export interface ChangeRequest {
  requestId: string;
  userId: string;
  username: string;
  type: "play" | "pause" | "seek" | "change_video";
  payload?: { time?: number; videoId?: string };
  createdAt: number;
}

export interface RoomState {
  roomId: string;
  participants: Participant[];
  videoId: string;
  playState: PlayState;
  currentTime: number;
  requests: ChangeRequest[];
  updatedAt: number;
}
