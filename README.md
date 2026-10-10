<<<<<<< HEAD
# YouTube Watch Party

A room-based YouTube Watch Party built to match the supplied Full Stack Intern Assignment PDF. It uses React + TypeScript + Vite, Node.js + Express, Socket.IO for real-time communication, and the YouTube IFrame Player API.

## Assignment requirements covered

- Create a room; creator automatically becomes **Host**.
- Join an existing room by room code or invite URL.
- YouTube playback controls: play, pause, seek, and change video.
- Playback events are validated and broadcast by the backend; periodic position updates help participants stay synchronized.
- **Host**, **Moderator**, and **Participant** roles.
- Host can promote/demote participants, remove participants, and transfer the Host role.
- Backend enforces permissions: only Host/Moderator can directly control playback; Participants can submit requests for approval.
- Host/Moderator can approve or reject participant playback requests.
- Real-time participant list and text chat.
- Health-check endpoint at `/health`.

## Technology stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Real-time transport: Socket.IO (WebSocket with fallback)
- Video: YouTube IFrame Player API
- Storage: in-memory for this MVP (rooms are not persistent across server restarts)

## Requirements

Install a current Node.js LTS release and npm. Verify in a terminal:

```bash
node --version
npm --version
```

## Run locally (Windows / VS Code)

1. Extract the ZIP and open the `youtube-watch-party` project folder in VS Code.
2. Open a terminal in the project root (the folder containing the root `package.json`).
3. Install dependencies:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

4. Start both the backend and frontend:

```bash
npm run dev
```

5. Open `http://localhost:5173`. Backend health check: `http://localhost:3001/health`.

If you prefer two terminals, run `npm run dev --prefix server` in one and `npm run dev --prefix client` in the other.

### Environment files

Defaults are configured for local development. Optional examples are included:

- `server/.env.example` — copy to `server/.env` to configure `PORT` and `CLIENT_ORIGIN`.
- `client/.env.example` — local default for `VITE_SOCKET_URL`. Vite environment variables must be set before building the frontend.

## Manual testing checklist

Use two separate browser windows or profiles so each person has a different socket session.

1. In browser A, enter a display name and create a room.
2. Copy the room code or invite link and join from browser B.
3. Confirm browser A is Host and browser B is Participant.
4. As Host, test play, pause, seeking, and changing the YouTube URL; confirm the other browser follows.
5. Let playback run, then join a third browser and verify it starts near the latest playback position.
6. Promote browser B to Moderator and confirm playback controls work.
7. As Participant, send a playback request; approve and reject it from Host/Moderator.
8. Remove a participant and verify the removed session no longer has room access.
9. Transfer Host and verify the new Host can manage roles.
10. Test chat from both browsers.
11. Verify the backend rejects restricted events sent by a Participant.

## Build

From the project root:

```bash
npm run build
```

This builds the TypeScript backend and the Vite frontend.

## Deployment guide (Render example)

Deploy the backend and frontend as separate services. This repository includes setup instructions, but a public URL is not included until you deploy it in your own hosting account.

### 1. Backend web service

- Root directory: `server`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables:
  - `NODE_ENV=production`
  - `CLIENT_ORIGIN=https://YOUR-FRONTEND.onrender.com`
  - `PORT` is normally provided by the platform.

After deployment, test `https://YOUR-BACKEND.onrender.com/health` and confirm it returns JSON with `status: "ok"`.

### 2. Frontend static site

- Root directory: `client`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variable set before build:
  - `VITE_SOCKET_URL=https://YOUR-BACKEND.onrender.com`

Replace the example URLs with the actual service URLs. Update the backend `CLIENT_ORIGIN` to the actual frontend URL and redeploy/restart the backend if needed. Then test room creation and playback sync on the public site.

### Important MVP limitations

- Rooms and chat are held in memory; restarting the backend clears them.
- This MVP is designed for demonstration, not production-scale traffic. Authentication, persistent database storage, rate limiting, and multi-instance Socket.IO scaling are not included.
- YouTube playback availability depends on the video's embedding permissions and browser autoplay policies. A user may need to interact with the player/browser before audio playback is allowed.
- Test the full app locally and after deployment. Do not report a deployment URL as live until it has been deployed and verified.

## Architecture overview

1. The React client connects to the Express server using Socket.IO.
2. The creator sends `create_room`; the server creates a room and assigns Host. Other users send `join_room` and receive Participant by default.
3. The server tracks each room's participants, role assignments, current video, playback state, and pending requests in memory.
4. Playback actions are checked on the backend. Host/Moderator actions update the room and are broadcast to room members; Participant actions create approval requests.
5. Each client controls an embedded YouTube IFrame player. Playback events and periodic position sync keep participants close to the shared state.
6. Role changes, participant removal, requests, and chat messages are broadcast to the room.

## Suggested demo

Show room creation, a second user joining, synchronized play/pause/seek, video change, role promotion, participant approval request, removal/host transfer, and chat. Include the actual public URL in your submission after deployment.
=======
# youtube-watch-party-project
>>>>>>> 5658297f0ad18d5d5d7bc7ac59f5534cc8c5dff4
