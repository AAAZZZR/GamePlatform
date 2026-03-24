// hooks/useP2PConnection.ts
// WebRTC DataChannel for low-latency gyro data (P2P bypass of the server).
// The PC side acts as the WebRTC offerer/host. When a DataChannel message
// arrives it is injected into the Socket.IO socket's local listener list so
// game components remain completely unaware of the transport change.

import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/** Injects a synthetic incoming socket event WITHOUT sending it to the server. */
function injectSocketEvent(socket: Socket, event: string, ...args: any[]) {
  // Socket.IO (component-emitter) stores listeners in `_callbacks` keyed as `$<event>`.
  const cbs: Function[] | undefined = (socket as any)._callbacks?.[`$${event}`];
  if (cbs) cbs.forEach(fn => fn(...args));
}

export function useP2PConnection(socket: Socket | null, roomId: string) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [p2pActive, setP2pActive] = useState(false);

  useEffect(() => {
    if (!socket || !roomId) return;

    let pc: RTCPeerConnection | null = null;
    let destroyed = false;

    const setup = async () => {
      pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      // ── ICE trickle ────────────────────────────────────────────────────
      pc.onicecandidate = (e) => {
        if (e.candidate && socket && roomId) {
          socket.emit('webrtc-ice-candidate', { roomId, candidate: e.candidate.toJSON() });
        }
      };

      // ── DataChannel (PC receives the channel created by mobile) ────────
      pc.ondatachannel = (e) => {
        const ch = e.channel;
        ch.onopen = () => {
          console.log('[P2P] DataChannel open — using WebRTC for gyro data');
          if (!destroyed) setP2pActive(true);
        };
        ch.onclose = () => {
          console.log('[P2P] DataChannel closed — falling back to Socket.IO');
          if (!destroyed) setP2pActive(false);
        };
        ch.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (!socket) return;
            // Route by message type: action / reset-position / gyro (default)
            if (data._p2p === 'action') {
              // In multi mode, mobile sends { _p2p, action, playerNumber }
              // Preserve playerNumber if present for multi mode
              if (data.playerNumber !== undefined) {
                injectSocketEvent(socket, 'controller-action', { action: data.action, playerNumber: data.playerNumber });
              } else {
                // Solo mode: emit just the action string (backward compatible)
                injectSocketEvent(socket, 'controller-action', data.action);
              }
            } else if (data._p2p === 'reset-position') {
              injectSocketEvent(socket, 'reset-game-position');
            } else {
              // Gyro data — in multi mode includes playerNumber, in solo it doesn't
              // Pass through as-is; the game components handle both shapes
              injectSocketEvent(socket, 'update-game-state', data);
            }
          } catch { /* ignore */ }
        };
      };

      // ── Signal: receive answer from mobile ────────────────────────────
      socket.on('webrtc-answer', async (incoming: RTCSessionDescriptionInit | { sdp: RTCSessionDescriptionInit; fromSocketId?: string }) => {
        // Backward compat: accept raw sdp or wrapped { sdp, fromSocketId }
        const sdp = 'fromSocketId' in incoming
          ? (incoming as { sdp: RTCSessionDescriptionInit }).sdp
          : incoming as RTCSessionDescriptionInit;
        if (pc && pc.signalingState !== 'closed') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      });

      // ── Signal: receive ICE candidates from mobile ────────────────────
      socket.on('webrtc-ice-candidate', async (incoming: RTCIceCandidateInit | { candidate: RTCIceCandidateInit; fromSocketId?: string }) => {
        // Backward compat: accept raw candidate or wrapped { candidate, fromSocketId }
        const candidate = 'fromSocketId' in incoming
          ? (incoming as { candidate: RTCIceCandidateInit }).candidate
          : incoming as RTCIceCandidateInit;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      });

      // ── Create & send offer ───────────────────────────────────────────
      // We create a dummy data channel so the offer includes the m=application
      // section required for DataChannel negotiation.
      pc.createDataChannel('_dummy');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { roomId, sdp: pc.localDescription });
    };

    setup().catch(err => console.warn('[P2P] setup failed:', err));

    return () => {
      destroyed = true;
      if (pc) {
        pc.close();
        pcRef.current = null;
      }
      if (socket) {
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
      }
      setP2pActive(false);
    };
  }, [socket, roomId]);

  return { p2pActive };
}
