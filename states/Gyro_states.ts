// states/Gyro_states.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { GyroData } from '@/types/game';

const DIR_X = 1;
const DIR_Y = -1;
const EMIT_INTERVAL = 50;

/**
 * sendGyro: either a P2P DataChannel sender or the socket emit.
 * Provided by useMobileSocket's `sendGyro` helper.
 */
export type GyroMode = 'natural' | 'flat';

export function useGyroController(
  socket: Socket | null,
  roomId: string | null,
  sendGyroOverride?: (data: GyroData) => void
) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [debug, setDebug] = useState<string>('Init...');
  const [gyroMode, setGyroMode] = useState<GyroMode>('natural');

  // Natural: phone held at ~24° from flat; Flat: phone lying on table
  const offsetRef = useRef({ beta: 0, gamma: -24 });
  const lastRawData = useRef({ beta: 0, gamma: 0 });
  const lastEmitTime = useRef(0);

  const handleCalibrate = useCallback(() => {
    offsetRef.current = {
      beta: lastRawData.current.beta,
      gamma: lastRawData.current.gamma
    };
    if (socket && roomId) {
      socket.emit('reset-position', { roomId });
    }
    if (navigator.vibrate) navigator.vibrate(50);
    alert('Center Reset');
  }, [socket, roomId]);

  const switchGyroMode = useCallback((mode: GyroMode) => {
    setGyroMode(mode);
    if (mode === 'flat') {
      offsetRef.current = { beta: 0, gamma: 0 };
    } else {
      // Natural: recalibrate to current hand position
      offsetRef.current = {
        beta: lastRawData.current.beta,
        gamma: lastRawData.current.gamma
      };
    }
    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setPermissionGranted(true);
        } else {
          alert('Permission denied');
        }
      } catch (e) { console.error(e); }
    } else {
      setPermissionGranted(true);
    }
  }, [handleCalibrate]);

  useEffect(() => {
    if (!socket || !roomId || !permissionGranted) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const now = Date.now();
      const rawBeta = e.beta || 0;
      const rawGamma = e.gamma || 0;
      lastRawData.current = { beta: rawBeta, gamma: rawGamma };

      if (now - lastEmitTime.current < EMIT_INTERVAL) return;
      lastEmitTime.current = now;

      const deltaBeta = rawBeta - offsetRef.current.beta;
      const deltaGamma = rawGamma - offsetRef.current.gamma;

      const gameX = deltaBeta * DIR_X;
      const gameY = deltaGamma * DIR_Y;

      const payload: GyroData = {
        alpha: e.alpha,
        beta: gameY,
        gamma: gameX
      };

      // Use P2P DataChannel if available, otherwise fall back to Socket.IO
      if (sendGyroOverride) {
        sendGyroOverride(payload);
      } else {
        socket.emit('gyro-data', { roomId, data: payload });
      }

      setDebug(`X: ${Math.round(gameX)} | Y: ${Math.round(gameY)} | R_B:${Math.round(rawBeta)} R_G:${Math.round(rawGamma)}`);
    };

    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [socket, roomId, permissionGranted, sendGyroOverride]);

  return {
    permissionGranted,
    debug,
    gyroMode,
    requestPermission,
    handleCalibrate,
    switchGyroMode,
  };
}
