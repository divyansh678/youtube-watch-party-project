import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeRequest, ChatMessage, Participant, Role, RoomState } from "./types";
import { socket } from "./socket";

declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void; }
}

function getVideoId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
      const id = url.searchParams.get("v");
      if (id && /^[\w-]{11}$/.test(id)) return id;
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0] || "") && /^[\w-]{11}$/.test(parts[1] || "")) return parts[1];
    }
  } catch { /* invalid URL */ }
  return null;
}

export default function App() {
  const [username, setUsername] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState(new URLSearchParams(location.search).get("room") || "");
  const [roomId, setRoomId] = useState("");
  const [myId, setMyId] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [videoInput, setVideoInput] = useState("");
  const [seekInput, setSeekInput] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const [lastRequestNotice, setLastRequestNotice] = useState("");
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef(room);
  const myIdRef = useRef(myId);
  const applyingRemoteRef = useRef(false);
  const lastSyncRef = useRef(0);
  roomRef.current = room;
  myIdRef.current = myId;

  const me = room?.participants.find(p => p.userId === myId);
  const canControl = me?.role === "Host" || me?.role === "Moderator";
  const isHost = me?.role === "Host";

  const emitRoom = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (!roomRef.current) return;
    socket.emit(event, { roomId: roomRef.current.roomId, ...payload });
  }, []);

  useEffect(() => {
    const onConnect = () => { setConnected(true); setMyId(socket.id || ""); };
    const onDisconnect = () => setConnected(false);
    const onCreated = ({ roomId: id, userId }: { roomId: string; userId: string }) => {
      setRoomId(id); setMyId(userId); setNotice("Room created. Share the code with your friends.");
      history.replaceState({}, "", `?room=${id}`);
    };
    const onJoined = ({ roomId: id, userId }: { roomId: string; userId: string }) => {
      setRoomId(id); setMyId(userId); setNotice("You joined the room.");
      history.replaceState({}, "", `?room=${id}`);
    };
    const onState = (next: RoomState) => { setRoom(next); setRoomId(next.roomId); };
    const onPlayback = (state: { playState: "playing" | "paused"; currentTime: number; videoId: string; actorId?: string }) => {
      setRoom(prev => prev ? { ...prev, ...state } : prev);
      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== "function") return;
      applyingRemoteRef.current = true;
      try {
        if (player.getVideoData?.().video_id !== state.videoId) {
          if (state.playState === "playing") {
            player.loadVideoById({ videoId: state.videoId, startSeconds: state.currentTime || 0 });
          } else {
            player.cueVideoById({ videoId: state.videoId, startSeconds: state.currentTime || 0 });
          }
        } else {
          const current = player.getCurrentTime?.() ?? 0;
          if (Math.abs(current - state.currentTime) > 2.5) player.seekTo(state.currentTime, true);
          if (state.playState === "playing") player.playVideo();
          else player.pauseVideo();
        }
      } catch { /* Player may still be initializing. */ }
      window.setTimeout(() => { applyingRemoteRef.current = false; }, 500);
    };
    const onPositionSync = ({ currentTime, videoId }: { currentTime: number; videoId: string }) => {
      setSeekInput(currentTime);
      setRoom(prev => prev ? { ...prev, currentTime, videoId } : prev);
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;
      const localTime = player.getCurrentTime();
      if (Number.isFinite(localTime) && Math.abs(localTime - currentTime) > 3) {
        applyingRemoteRef.current = true;
        player.seekTo(currentTime, true);
        window.setTimeout(() => { applyingRemoteRef.current = false; }, 350);
      }
    };
    const onError = ({ message }: { message: string }) => setNotice(message);
    const onRemoved = ({ message }: { message: string }) => {
      setNotice(message); setRoom(null); setRoomId(""); history.replaceState({}, "", location.pathname);
    };
    const onChat = (msg: ChatMessage) => setMessages(prev => [...prev.slice(-99), msg]);
    const onRequestResolved = ({ approved }: { approved: boolean }) => setLastRequestNotice(approved ? "A change request was approved." : "A change request was rejected.");
    const onRequestCreated = (request: ChangeRequest) => setLastRequestNotice(`${request.username} requested ${request.type.replace("_", " ")}.`);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room_created", onCreated);
    socket.on("room_joined", onJoined);
    socket.on("room_state", onState);
    socket.on("playback", onPlayback);
    socket.on("position_sync", onPositionSync);
    socket.on("action_error", onError);
    socket.on("removed_from_room", onRemoved);
    socket.on("chat_message", onChat);
    socket.on("request_resolved", onRequestResolved);
    socket.on("request_created", onRequestCreated);
    if (socket.connected) { setConnected(true); setMyId(socket.id || ""); }
    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      socket.off("room_created", onCreated); socket.off("room_joined", onJoined);
      socket.off("room_state", onState); socket.off("playback", onPlayback);
      socket.off("position_sync", onPositionSync);
      socket.off("action_error", onError); socket.off("removed_from_room", onRemoved);
      socket.off("chat_message", onChat); socket.off("request_resolved", onRequestResolved);
      socket.off("request_created", onRequestCreated);
    };
  }, []);

  useEffect(() => {
    if (!room || !playerContainerRef.current) return;
    let cancelled = false;
    const createPlayer = () => {
      if (cancelled || !window.YT?.Player || !playerContainerRef.current) return;
      if (playerRef.current?.destroy) {
        try { playerRef.current.destroy(); } catch { /* noop */ }
      }
      playerRef.current = new window.YT.Player(playerContainerRef.current, {
        width: "100%", height: "100%", videoId: room.videoId,
        playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1 },
        events: {
          onReady: (event: any) => {
            const latest = roomRef.current;
            if (!latest) return;
            const duration = event.target.getDuration?.();
            if (Number.isFinite(duration) && duration > 0) setVideoDuration(duration);
            applyingRemoteRef.current = true;
            event.target.seekTo(latest.currentTime || 0, true);
            if (latest.playState === "playing") event.target.playVideo();
            window.setTimeout(() => { applyingRemoteRef.current = false; }, 600);
          },
          onStateChange: (event: any) => {
            const duration = event.target.getDuration?.();
            if (Number.isFinite(duration) && duration > 0) setVideoDuration(duration);
            if (applyingRemoteRef.current || !roomRef.current || !canControl) return;
            if (event.data === window.YT.PlayerState.PLAYING) emitRoom("play");
            if (event.data === window.YT.PlayerState.PAUSED) {
              const time = playerRef.current?.getCurrentTime?.() ?? 0;
              emitRoom("pause", { time });
            }
          }
        }
      });
    };
    if (window.YT?.Player) createPlayer();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); createPlayer(); };
    }
    return () => { cancelled = true; };
  // Recreate player when the room first appears; video changes are handled by playback events.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(room)]);

  useEffect(() => {
    if (!room || !canControl) return;
    const interval = window.setInterval(() => {
      if (applyingRemoteRef.current || !playerRef.current?.getCurrentTime) return;
      const now = Date.now();
      if (now - lastSyncRef.current < 1000) return;
      lastSyncRef.current = now;
      const current = playerRef.current.getCurrentTime();
      const duration = playerRef.current.getDuration?.();
      if (Number.isFinite(current)) setSeekInput(current);
      if (Number.isFinite(duration) && duration > 0) setVideoDuration(duration);
      if (roomRef.current?.playState === "playing" && Number.isFinite(current)) {
        emitRoom("sync_position", { time: current });
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [room, canControl, emitRoom]);

  function createRoom() {
    if (!username.trim()) return setNotice("Enter a username first.");
    socket.emit("create_room", { username: username.trim() });
  }
  function joinRoom() {
    if (!username.trim()) return setNotice("Enter a username first.");
    if (!roomCodeInput.trim()) return setNotice("Enter a room code.");
    socket.emit("join_room", { roomId: roomCodeInput.trim(), username: username.trim() });
  }
  function leaveRoom() {
    if (roomId) socket.emit("leave_room", { roomId });
    setRoom(null); setRoomId(""); setMessages([]);
    history.replaceState({}, "", location.pathname);
  }
  function playbackAction(action: "play" | "pause") {
    if (canControl) emitRoom(action, action === "pause" ? { time: playerRef.current?.getCurrentTime?.() ?? room?.currentTime ?? 0 } : {});
    else emitRoom("request_change", { type: action });
  }
  function seekTo(time: number) {
    if (canControl) emitRoom("seek", { time });
    else emitRoom("request_change", { type: "seek", payload: { time } });
  }
  function changeVideo() {
    const videoId = getVideoId(videoInput);
    if (!videoId) return setNotice("Paste a valid YouTube URL or 11-character video ID.");
    if (canControl) emitRoom("change_video", { video: videoInput });
    else emitRoom("request_change", { type: "change_video", payload: { videoId } });
    setVideoInput("");
  }
  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    emitRoom("chat_message", { message: chatInput.trim() });
    setChatInput("");
  }
  function copyRoomLink() {
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${roomId}`)
      .then(() => setNotice("Invite link copied."))
      .catch(() => setNotice(`Share room code: ${roomId}`));
  }
  function requestLabel(r: ChangeRequest) {
    if (r.type === "seek") return `seek to ${Math.floor(r.payload?.time || 0)}s`;
    if (r.type === "change_video") return `change video to ${r.payload?.videoId || "unknown"}`;
    return r.type;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">▶</span> WatchParty</a>
        <div className="connection"><span className={connected ? "dot online" : "dot"} />{connected ? "Connected" : "Connecting…"}</div>
      </header>

      {!room ? (
        <section className="landing">
          <div className="hero-copy">
            <div className="eyebrow">WATCH TOGETHER, FROM ANYWHERE</div>
            <h1>Your next movie night,<br /><span>in perfect sync.</span></h1>
            <p>Create a private room, invite your people, and keep every play, pause, and seek in sync.</p>
          </div>
          <div className="join-card">
            <div className="card-icon">▶</div>
            <h2>Start a watch party</h2>
            <p className="muted">Choose a name to create a room or join a friend.</p>
            <label>Your display name</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. Alex" maxLength={30} />
            <button className="primary full" onClick={createRoom}>Create a new room <span>→</span></button>
            <div className="or"><span />or<span /></div>
            <label>Have a room code?</label>
            <div className="join-row">
              <input value={roomCodeInput} onChange={e => setRoomCodeInput(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
              <button className="secondary" onClick={joinRoom}>Join room</button>
            </div>
            {notice && <p className="notice">{notice}</p>}
          </div>
          <div className="feature-row">
            <div><b>01</b><span><strong>In sync</strong><small>Playback follows the host</small></span></div>
            <div><b>02</b><span><strong>Your room, your rules</strong><small>Roles keep controls organized</small></span></div>
            <div><b>03</b><span><strong>Made for your people</strong><small>Chat while you watch</small></span></div>
          </div>
        </section>
      ) : (
        <section className="watch-layout">
          <div className="watch-main">
            <div className="room-heading">
              <div><div className="eyebrow">YOU'RE WATCHING TOGETHER</div><h1>Room <span className="room-code">{room.roomId}</span></h1></div>
              <button className="secondary" onClick={copyRoomLink}>↗ Invite friends</button>
            </div>
            {notice && <div className="notice banner">{notice}<button onClick={() => setNotice("")}>×</button></div>}
            <div className="player-frame"><div ref={playerContainerRef} className="youtube-player" /></div>
            <div className="video-controls">
              <div className="control-buttons">
                <button className="control-btn" onClick={() => playbackAction("play")} title="Play">▶</button>
                <button className="control-btn" onClick={() => playbackAction("pause")} title="Pause">Ⅱ</button>
                <span className="play-state">{room.playState === "playing" ? "Playing" : "Paused"} · {canControl ? "You can control playback" : "Watch-only access"}</span>
              </div>
              <div className="seek-row">
                <input type="range" min={0} max={Math.max(1, videoDuration || 3600)} value={Math.min(videoDuration || 3600, Math.max(0, seekInput))} onChange={e => setSeekInput(Number(e.target.value))} onMouseUp={() => seekTo(seekInput)} onTouchEnd={() => seekTo(seekInput)} />
                <span>{Math.floor(seekInput)}s{videoDuration > 0 ? ` / ${Math.floor(videoDuration)}s` : ""}</span>
                <button className="tiny-button" onClick={() => seekTo(seekInput)}>Seek</button>
              </div>
              {!canControl && <p className="muted small">Playback controls send approval requests to the Host or a Moderator.</p>}
            </div>
            <div className="change-video">
              <div><strong>Watch something else</strong><small>Paste a YouTube URL or video ID</small></div>
              <div className="join-row"><input value={videoInput} onChange={e => setVideoInput(e.target.value)} placeholder="https://youtube.com/watch?v=..." /><button className="primary" onClick={changeVideo}>{canControl ? "Change video" : "Request change"}</button></div>
            </div>
            {lastRequestNotice && <p className="notice">{lastRequestNotice}</p>}
            {canControl && room.requests.length > 0 && <div className="panel requests-panel">
              <div className="panel-heading"><h2>Change requests</h2><span className="count">{room.requests.length}</span></div>
              {room.requests.map(r => <div className="request-row" key={r.requestId}>
                <div><strong>{r.username}</strong><p>wants to {requestLabel(r)}</p></div>
                <div className="request-actions"><button className="approve" onClick={() => emitRoom("resolve_request", { requestId: r.requestId, approve: true })}>Approve</button><button className="reject" onClick={() => emitRoom("resolve_request", { requestId: r.requestId, approve: false })}>Reject</button></div>
              </div>)}
            </div>}
          </div>

          <aside className="sidebar">
            <div className="panel people-panel">
              <div className="panel-heading"><h2>People here</h2><span className="count">{room.participants.length}</span></div>
              {room.participants.map((person: Participant) => <div className="person-row" key={person.userId}>
                <div className="avatar">{person.username.slice(0, 1).toUpperCase()}</div>
                <div className="person-info"><strong>{person.username}{person.userId === myId ? " (you)" : ""}</strong><small>{person.role}</small></div>
                <span className={`role-pill ${person.role.toLowerCase()}`}>{person.role}</span>
                {isHost && person.userId !== myId && <div className="person-actions">
                  <select aria-label={`Role for ${person.username}`} value={person.role} onChange={e => emitRoom("assign_role", { userId: person.userId, role: e.target.value as Role })}>
                    <option value="Participant">Participant</option><option value="Moderator">Moderator</option>
                  </select>
                  <button className="icon-button danger" title={`Remove ${person.username}`} onClick={() => { if (confirm(`Remove ${person.username} from this room?`)) emitRoom("remove_participant", { userId: person.userId }); }}>×</button>
                  <button className="icon-button" title={`Transfer host to ${person.username}`} onClick={() => { if (confirm(`Transfer Host role to ${person.username}?`)) emitRoom("transfer_host", { userId: person.userId }); }}>⇄</button>
                </div>}
              </div>)}
              <div className="role-legend"><span><i className="host-dot" />Host controls the room</span><span><i className="mod-dot" />Moderators can control playback</span></div>
            </div>
            <div className="panel chat-panel">
              <div className="panel-heading"><h2>Room chat</h2><span className="live-label">LIVE</span></div>
              <div className="chat-messages">
                {messages.length === 0 && <div className="empty-chat">Say hello 👋<small>Messages from your room appear here.</small></div>}
                {messages.map((msg, i) => <div className="chat-message" key={`${msg.createdAt}-${i}`}><div><strong>{msg.username}</strong><time>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{msg.message}</p></div>)}
              </div>
              <form className="chat-form" onSubmit={sendChat}><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Send a message…" maxLength={500} /><button className="primary" type="submit">↑</button></form>
            </div>
            <button className="leave-button" onClick={() => { if (confirm("Leave this watch party?")) leaveRoom(); }}>← Leave room</button>
          </aside>
        </section>
      )}
      <footer>WATCHPARTY <span>·</span> A LITTLE CLOSER, EVEN WHEN FAR APART</footer>
    </main>
  );
}
