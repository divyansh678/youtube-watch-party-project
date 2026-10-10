import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
export const socket = io(socketUrl, {
  autoConnect: true,
  transports: ["websocket", "polling"]
});
