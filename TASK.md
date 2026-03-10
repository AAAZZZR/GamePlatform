# GamePlatform Development Task

## Repo: /home/node/.openclaw/workspace/GamePlatform
## GitHub: https://github.com/AAAZZZR/GamePlatform

## Architecture Overview
- Next.js + Express + Socket.IO custom server
- PC opens `localhost:3000` → shows QR code → phone scans → joins room
- Phone sends gyro data via Socket.IO → PC renders game
- Games in `games/gameN/index.tsx` (desktop) + `MobileController.tsx` (mobile)
- Registry in `games/registry.ts`, types in `types/game.ts`
- GameId type in `types/game.ts` must be updated when adding games

## Current Games (3)
1. **game1 - Rocket Shooter** 🚀 — Tilt to move, tap to shoot meteors
2. **game2 - Space Brick** 🧱 — Breakout/Arkanoid, tilt paddle
3. **game3 - Neon Racing** 🏎️ — Tilt to steer, nitro button

## Task 1: Latency Optimization (WebRTC DataChannel)

Add optional WebRTC DataChannel for P2P gyro data when on same network:
- Keep Socket.IO as signaling server for WebRTC handshake
- Once DataChannel is established, send gyro data P2P (bypass server)
- Fallback to Socket.IO if WebRTC fails
- This should be transparent to game components — they still receive `update-game-state` events

Implementation approach:
- Add WebRTC signaling events to `server.ts` (offer/answer/ice-candidate relay)
- Modify `hooks/useSocketConnection.ts` (PC side) to accept WebRTC connections
- Modify `hooks/useMobileSocket.ts` + `states/Gyro_states.ts` (mobile side) to establish WebRTC
- Wrap in a hook like `useP2PConnection` that falls back to socket

## Task 2: Add 2 New Games (to reach 5 total)

### Game 4: Snake 🐍
- Classic snake game controlled by phone tilt
- Tilt phone to change direction (up/down/left/right)
- Snake grows when eating food
- Game over when hitting walls or self
- Mobile controller: shows current direction, has a "boost speed" button
- Increasing difficulty (snake speeds up as it grows)

### Game 5: Asteroid Dodge 🌌
- Endless vertical scroller — spaceship dodges asteroids/debris
- Tilt to move left/right (like game1 but no shooting)
- Obstacles come from top with varying speeds and patterns
- Collect power-ups: shield (1 hit protection), slow-mo, magnet (attract coins)
- Coins to collect for score
- Mobile controller: shows score, has "dash" button (quick dodge), "shield activate" button
- Progressive difficulty — more and faster obstacles over time

### Game structure (follow existing pattern):
```
games/game4/index.tsx          — Desktop component
games/game4/MobileController.tsx — Mobile controller
games/game5/index.tsx
games/game5/MobileController.tsx
```

### Registration:
- Add imports and entries to `games/registry.ts`
- Update `GameId` type in `types/game.ts` to include 'game4' | 'game5'

## Task 3: Improve Existing Games

### Game 1 (Rocket Shooter):
- Add particle effects on meteor destruction
- Add difficulty progression (faster/more meteors over time)
- Visual polish: star field background, better explosion feedback

### Game 2 (Space Brick):
- Ball speed is very slow (BALL_SPEED: 1) — increase it
- Add power-ups dropping from broken bricks (wider paddle, multi-ball, fireball)
- Better visual feedback on brick hits
- Add level progression (new brick layouts after clearing)

### Game 3 (Neon Racing):
- BASE_SPEED is 1 which is too slow — increase base speed
- OBSTACLE_CHANCE is 0.05 — too sparse, increase obstacle density
- Add collectible coins on the road for bonus score
- Add visual polish: road markings, scenery, speed lines

## General Guidelines
- All games are SINGLE PLAYER only
- Use Tailwind CSS for styling (already configured)
- Use requestAnimationFrame for game loops
- Follow existing patterns for socket events and component props
- Games receive these standard props: `socket, roomId, paused, onPause, onResume, onScoreChange, onStatusChange, settings, onExit`
- Mobile controllers receive: `socket, roomId`
- Use `controller-action` socket event for button presses
- Use `update-game-state` socket event for gyro data
- Commit and push to GitHub when done

## Git Config
```
git config user.email "ai@openclaw.ai"
git config user.name "OpenClaw AI"
```
