// states/Gyro_states.ts — 手機端：讀陀螺儀、校正中心、每 50ms 送一次給電腦
import { useState, useEffect, useRef, useCallback } from 'react';

const DIR_X = 1;
const DIR_Y = -1;
const EMIT_INTERVAL = 50;

export type GyroMode = 'natural' | 'flat';

type GyroSender = (beta: number, gamma: number) => void;

/** sendGyro 要是穩定的函式（useCallback），null 代表還沒連上、先不送 */
export function useGyroController(sendGyro: GyroSender | null) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [debug, setDebug] = useState<string>('Init...');
  const [gyroMode, setGyroMode] = useState<GyroMode>('natural');
  const [tilt, setTilt] = useState({ x: 0, y: 0 }); // normalized -1..1

  // Natural: phone held at ~24° from flat; Flat: phone lying on table
  const offsetRef = useRef({ beta: 0, gamma: -24 });
  const lastRawData = useRef({ beta: 0, gamma: 0 });
  const lastEmitTime = useRef(0);

  /** 以現在的手機角度當中心 */
  const handleCalibrate = useCallback(() => {
    offsetRef.current = {
      beta: lastRawData.current.beta,
      gamma: lastRawData.current.gamma,
    };
    if (navigator.vibrate) navigator.vibrate(50);
  }, []);

  const switchGyroMode = useCallback((mode: GyroMode) => {
    setGyroMode(mode);
    if (mode === 'flat') {
      offsetRef.current = { beta: 0, gamma: 0 };
    } else {
      // Natural: recalibrate to current hand position
      offsetRef.current = {
        beta: lastRawData.current.beta,
        gamma: lastRawData.current.gamma,
      };
    }
    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  const requestPermission = useCallback(async () => {
    const orientation = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof orientation.requestPermission !== 'function') {
      setPermissionGranted(true);
      return;
    }
    try {
      const response = await orientation.requestPermission();
      if (response === 'granted') {
        setPermissionGranted(true);
      } else {
        alert('Gyroscope permission denied. Allow motion access to play.');
      }
    } catch (error) {
      console.error('[gyro] permission request failed', error);
      alert('Could not request gyroscope permission.');
    }
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const now = Date.now();
      const rawBeta = e.beta || 0;
      const rawGamma = e.gamma || 0;
      lastRawData.current = { beta: rawBeta, gamma: rawGamma };

      if (now - lastEmitTime.current < EMIT_INTERVAL) return;
      lastEmitTime.current = now;

      const gameX = (rawBeta - offsetRef.current.beta) * DIR_X;
      const gameY = (rawGamma - offsetRef.current.gamma) * DIR_Y;

      // 電腦端：gamma → move.x，beta → move.y
      sendGyro?.(gameY, gameX);

      // Normalized tilt for indicator ball (-1 to 1)
      setTilt({
        x: Math.max(-1, Math.min(1, gameX / 30)),
        y: Math.max(-1, Math.min(1, gameY / 30)),
      });
      setDebug(`X: ${Math.round(gameX)} | Y: ${Math.round(gameY)} | R_B:${Math.round(rawBeta)} R_G:${Math.round(rawGamma)}`);
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [permissionGranted, sendGyro]);

  return {
    permissionGranted,
    debug,
    tilt,
    gyroMode,
    requestPermission,
    handleCalibrate,
    switchGyroMode,
  };
}
