// states/Gyro_states.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client'; // 不再 import io
import { GyroData } from '@/types/game';

const DIR_X = 1;
const DIR_Y = -1;
const EMIT_INTERVAL = 50;

// [修改] 這裡接收 socket 實例
export function useGyroController(socket: Socket | null, roomId: string | null) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [debug, setDebug] = useState<string>('Init...');

  // Hardcoded default offset based on user request (R_B=0, R_G=-24)
  const offsetRef = useRef({ beta: 0, gamma: -24 });
  const lastRawData = useRef({ beta: 0, gamma: 0 });
  const lastEmitTime = useRef(0);

  const handleCalibrate = useCallback(() => {
    offsetRef.current = {
      beta: lastRawData.current.beta,
      gamma: lastRawData.current.gamma
    };
    // 使用傳入的 socket
    if (socket && roomId) {
      socket.emit('reset-position', { roomId });
    }
    if (navigator.vibrate) navigator.vibrate(50);
    // Alert logic removed or kept? User said "reset can be used later".
    // I'll keep the function but maybe suppress the alert or keep it for manual resets.
    alert("Center Reset");
  }, [socket, roomId]);

  const requestPermission = useCallback(async () => {
    // ... (權限請求邏輯不變) ...
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setPermissionGranted(true);
          // Removed auto-calibrate
        } else {
          alert('Permission denied');
        }
      } catch (e) { console.error(e); }
    } else {
      setPermissionGranted(true);
      // Removed auto-calibrate
    }
  }, [handleCalibrate]);

  useEffect(() => {
    // 必須要有 socket 才開始監聽
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

      socket.emit('gyro-data', { roomId, data: payload });
      setDebug(`X: ${Math.round(gameX)} | Y: ${Math.round(gameY)} | R_B:${Math.round(rawBeta)} R_G:${Math.round(rawGamma)}`);
    };

    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [socket, roomId, permissionGranted]);

  return {
    permissionGranted,
    debug,
    requestPermission,
    handleCalibrate
  };
}