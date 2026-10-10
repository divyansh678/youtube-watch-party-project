import { randomBytes } from "node:crypto";
import { Room } from "./Room.js";

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    let roomId = "";
    do {
      roomId = randomBytes(3).toString("hex").toUpperCase();
    } while (this.rooms.has(roomId));
    const room = new Room(roomId);
    this.rooms.set(roomId, room);
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  deleteIfEmpty(roomId: string) {
    const room = this.get(roomId);
    if (room && room.participants.size === 0) this.rooms.delete(roomId);
  }
}
