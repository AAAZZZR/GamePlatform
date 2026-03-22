// platform/audio/index.ts — 音訊系統公開 API
export { initAudio, setMasterVolume, setSfxVolume, setBgmVolume } from './engine';
export { sfx } from './sfx';
export { startBgm, stopBgm, isBgmPlaying } from './bgm';
