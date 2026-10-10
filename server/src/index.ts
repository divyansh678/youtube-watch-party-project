import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import { RoomManager } from "./classes/RoomManager.js";
import type { ChangeRequest, Role } from "./types.js";

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const app = express();
app.use(cors({ origin: CLIENT_ORIGIN.split(",").map(s => s.trim()) }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "youtube-watch-party" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN.split(",").map(s => s.trim()), methods: ["GET", "POST"] }
});
const rooms = new RoomManager();

function error(socket: Socket, message: string) {
  socket.emit("action_error", { message });
}
function getRoom(socket: Socket, roomId: string) {
  const room = rooms.get(roomId || "");
  if (!room || !room.getParticipant(socket.id)) {
    error(socket, "You are not a participant in this room.");
    return undefined;
  }
  return room;
}
function hasControl(socket: Socket, roomId: string) {
  const room = getRoom(socket, roomId);
  if (!room) return undefined;
  const role = room.getParticipant(socket.id)?.role;
  if (role !== "Host" && role !== "Moderator") {
    error(socket, "Only the Host or a Moderator can control playback.");
    return undefined;
  }
  return room;
}
function isHost(socket: Socket, roomId: string) {
  const room = getRoom(socket, roomId);
  if (!room) return undefined;
  if (room.getParticipant(socket.id)?.role !== "Host") {
    error(socket, "Only the Host can perform this action.");
    return undefined;
  }
  return room;
}
function broadcastRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room) io.to(roomId).emit("room_state", room.toJSON());
}
function validVideoId(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be" || url.hostname.endsWith(".youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : undefined;
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
      const id = url.searchParams.get("v");
      if (id && /^[\w-]{11}$/.test(id)) return id;
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0] || "") && /^[\w-]{11}$/.test(parts[1] || "")) return parts[1];
    }
  } catch { /* invalid URL */ }
  return undefined;
}
function isFiniteTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 24 * 60 * 60;
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ username }: { username?: string } = {}) => {
    const cleanName = typeof username === "string" ? username.trim().slice(0, 30) : "";
    if (!cleanName) return error(socket, "Enter a username first.");
    const room = rooms.createRoom();
    room.addParticipant(socket.id, cleanName, "Host");
    socket.join(room.roomId);
    socket.emit("room_created", { roomId: room.roomId, userId: socket.id });
    broadcastRoom(room.roomId);
  });

  socket.on("join_room", ({ roomId, username }: { roomId?: string; username?: string } = {}) => {
    const cleanRoomId = typeof roomId === "string" ? roomId.trim().toUpperCase() : "";
    const cleanName = typeof username === "string" ? username.trim().slice(0, 30) : "";
    const room = rooms.get(cleanRoomId);
    if (!cleanName) return error(socket, "Enter a username first.");
    if (!room) return error(socket, "Room not found. Check the code or create a new room.");
    if (room.participants.size >= 50) return error(socket, "This room has reached its 50 participant MVP limit.");
    const participant = room.addParticipant(socket.id, cleanName, "Participant");
    socket.join(room.roomId);
    socket.emit("room_joined", { roomId: room.roomId, userId: socket.id });
    socket.to(room.roomId).emit("user_joined", { username: participant.username, userId: participant.userId, role: participant.role });
    broadcastRoom(room.roomId);
  });

  socket.on("play", ({ roomId }: { roomId: string }) => {
    const room = hasControl(socket, roomId);
    if (!room) return;
    room.updatePlayback({ playState: "playing" });
    io.to(room.roomId).emit("playback", { playState: room.playState, currentTime: room.currentTime, videoId: room.videoId, actorId: socket.id });
    broadcastRoom(room.roomId);
  });
  socket.on("pause", ({ roomId, time }: { roomId: string; time?: number }) => {
    const room = hasControl(socket, roomId);
    if (!room) return;
    room.updatePlayback({ playState: "paused", ...(isFiniteTime(time) ? { currentTime: time } : {}) });
    io.to(room.roomId).emit("playback", { playState: room.playState, currentTime: room.currentTime, videoId: room.videoId, actorId: socket.id });
    broadcastRoom(room.roomId);
  });
  socket.on("seek", ({ roomId, time }: { roomId: string; time: number }) => {
    const room = hasControl(socket, roomId);
    if (!room) return;
    if (!isFiniteTime(time)) return error(socket, "Seek position is invalid.");
    room.updatePlayback({ currentTime: time });
    io.to(room.roomId).emit("playback", { playState: room.playState, currentTime: time, videoId: room.videoId, actorId: socket.id });
    broadcastRoom(room.roomId);
  });
  // The Host/Moderator periodically publishes the current playback position.
  // This keeps late joiners and clients with clock drift close to the same timestamp.
  socket.on("sync_position", ({ roomId, time }: { roomId: string; time: number }) => {
    const room = hasControl(socket, roomId);
    if (!room) return;
    if (room.playState !== "playing" || !isFiniteTime(time)) return;
    room.updatePlayback({ currentTime: time });
    socket.to(room.roomId).emit("position_sync", { currentTime: time, videoId: room.videoId });
  });

  socket.on("change_video", ({ roomId, video }: { roomId: string; video: string }) => {
    const room = hasControl(socket, roomId);
    if (!room) return;
    const videoId = validVideoId(video);
    if (!videoId) return error(socket, "Enter a valid YouTube video URL or 11-character video ID.");
    room.updatePlayback({ videoId, currentTime: 0, playState: "paused" });
    io.to(room.roomId).emit("playback", { playState: "paused", currentTime: 0, videoId, actorId: socket.id });
    broadcastRoom(room.roomId);
  });

  socket.on("assign_role", ({ roomId, userId, role }: { roomId: string; userId: string; role: Role }) => {
    const room = isHost(socket, roomId);
    if (!room) return;
    if (!["Moderator", "Participant"].includes(role)) return error(socket, "The Host role cannot be assigned; use transfer_host.");
    if (userId === socket.id) return error(socket, "You cannot change your own Host role here.");
    const target = room.getParticipant(userId);
    if (!target) return error(socket, "Participant not found.");
    room.setRole(userId, role);
    io.to(room.roomId).emit("role_assigned", { userId, username: target.username, role });
    broadcastRoom(room.roomId);
  });

  socket.on("remove_participant", ({ roomId, userId }: { roomId: string; userId: string }) => {
    const room = isHost(socket, roomId);
    if (!room) return;
    if (userId === socket.id) return error(socket, "Use transfer host or leave the room instead.");
    const target = room.getParticipant(userId);
    if (!target) return error(socket, "Participant not found.");
    room.removeParticipant(userId);
    io.to(userId).emit("removed_from_room", { roomId: room.roomId, message: "The Host removed you from this room." });
    const targetSocket = io.sockets.sockets.get(userId);
    targetSocket?.leave(room.roomId);
    io.to(room.roomId).emit("participant_removed", { userId, username: target.username });
    broadcastRoom(room.roomId);
    rooms.deleteIfEmpty(room.roomId);
  });

  socket.on("transfer_host", ({ roomId, userId }: { roomId: string; userId: string }) => {
    const room = isHost(socket, roomId);
    if (!room) return;
    if (!room.getParticipant(userId)) return error(socket, "Participant not found.");
    room.setRole(socket.id, "Moderator");
    room.setRole(userId, "Host");
    io.to(room.roomId).emit("host_transferred", { previousHostId: socket.id, newHostId: userId });
    broadcastRoom(room.roomId);
  });

  socket.on("request_change", ({ roomId, type, payload }: { roomId: string; type: ChangeRequest["type"]; payload?: ChangeRequest["payload"] }) => {
    const room = getRoom(socket, roomId);
    if (!room) return;
    const participant = room.getParticipant(socket.id)!;
    if (participant.role !== "Participant") return error(socket, "Hosts and Moderators can apply controls directly.");
    if (!["play", "pause", "seek", "change_video"].includes(type)) return error(socket, "Unsupported request type.");
    if (type === "seek" && !isFiniteTime(payload?.time)) return error(socket, "Seek position is invalid.");
    if (type === "change_video" && !validVideoId(payload?.videoId)) return error(socket, "Enter a valid YouTube video URL or video ID.");
    const request: ChangeRequest = {
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: socket.id, username: participant.username, type,
      payload: type === "change_video" ? { videoId: validVideoId(payload?.videoId)! } : payload,
      createdAt: Date.now()
    };
    room.addRequest(request);
    io.to(room.roomId).emit("request_created", request);
    broadcastRoom(room.roomId);
  });

  socket.on("resolve_request", ({ roomId, requestId, approve }: { roomId: string; requestId: string; approve: boolean }) => {
    const room = hasControl(socket, roomId);
    if (!room) return;
    const request = room.requests.get(requestId);
    if (!request) return error(socket, "This request no longer exists.");
    room.removeRequest(requestId);
    if (approve) {
      if (request.type === "play") room.updatePlayback({ playState: "playing" });
      if (request.type === "pause") room.updatePlayback({ playState: "paused" });
      if (request.type === "seek" && isFiniteTime(request.payload?.time)) room.updatePlayback({ currentTime: request.payload!.time! });
      if (request.type === "change_video") {
        const videoId = validVideoId(request.payload?.videoId);
        if (videoId) room.updatePlayback({ videoId, currentTime: 0, playState: "paused" });
      }
      io.to(room.roomId).emit("playback", { playState: room.playState, currentTime: room.currentTime, videoId: room.videoId, actorId: socket.id });
    }
    io.to(room.roomId).emit("request_resolved", { requestId, approved: Boolean(approve), by: room.getParticipant(socket.id)?.username });
    broadcastRoom(room.roomId);
  });

  socket.on("chat_message", ({ roomId, message }: { roomId: string; message: string }) => {
    const room = getRoom(socket, roomId);
    if (!room) return;
    if (typeof message !== "string" || !message.trim()) return;
    if (message.length > 500) return error(socket, "Chat messages must be 500 characters or fewer.");
    const participant = room.getParticipant(socket.id)!;
    io.to(room.roomId).emit("chat_message", { userId: socket.id, username: participant.username, role: participant.role, message: message.trim(), createdAt: Date.now() });
  });

  socket.on("leave_room", ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (!room || !room.getParticipant(socket.id)) return;
    const participant = room.getParticipant(socket.id)!;
    room.removeParticipant(socket.id);
    socket.leave(room.roomId);
    if (participant.role === "Host" && room.participants.size > 0) {
      const next = room.participants.values().next().value;
      if (next) room.setRole(next.userId, "Host");
    }
    io.to(room.roomId).emit("user_left", { username: participant.username, userId: socket.id });
    broadcastRoom(room.roomId);
    rooms.deleteIfEmpty(room.roomId);
  });

  socket.on("disconnect", () => {
    for (const room of [...getRoomsForSocket(socket.id)]) {
      const participant = room.getParticipant(socket.id);
      if (!participant) continue;
      room.removeParticipant(socket.id);
      if (participant.role === "Host" && room.participants.size > 0) {
        const next = room.participants.values().next().value;
        if (next) room.setRole(next.userId, "Host");
      }
      io.to(room.roomId).emit("user_left", { username: participant.username, userId: socket.id });
      broadcastRoom(room.roomId);
      rooms.deleteIfEmpty(room.roomId);
    }
  });

  function* getRoomsForSocket(userId: string) {
    // Room list is deliberately discovered through the manager's room map in this MVP.
    for (const roomId of socket.rooms) {
      const room = rooms.get(roomId);
      if (room?.getParticipant(userId)) yield room;
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`Watch Party server listening on port ${PORT}`);
});
