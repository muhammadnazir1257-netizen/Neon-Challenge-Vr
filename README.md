Neon Challenge VR

A browser-based VR mini-game built with Three.js and WebXR. You stand in a neon-lit room, start a round at the console, shoot the glowing targets, then grab an energy orb and carry it to the goal before time runs out.

It runs straight from the browser on a VR headset. There is nothing to install and no build step.

Gameplay

The game has two timed rounds:

Target round (30 seconds). One of five targets lights up at a time. Point your controller at it and pull the trigger. Each correct hit is worth 10 points, and hitting an unlit target costs 5. The round ends after 8 hits or when the timer runs out.
Collect round (25 seconds). An orb appears at the far end of the room. Grab it with the trigger, carry it across the room, and release it over the green goal ring for 30 points.

A scoreboard on the back wall shows your score, the time left, and what to do next.

Controls
VR headset
Input	Action
Trigger	Press the start button, shoot targets, grab and release the orb
Grip (hold)	Aim the teleport arc
Grip (release)	Teleport to the marker
Desktop (for testing without a headset)
Key	Action
Space	Start or replay
W / A / S / D	Move around the room
T	Register a hit on the active target
G	Move the orb to the goal
Run it locally

The game uses JavaScript modules, so it has to be served from a web server. Opening index.html by double-clicking it will not work.

bash
git clone https://github.com/<your-username>/NeonChallengeVR.git
cd NeonChallengeVR
python -m http.server 8000

Then open http://localhost:8000 in your browser. The Live Server extension in VS Code works too.

To play on a headset, the page must be served over HTTPS. The easiest way is GitHub Pages: in the repository, go to Settings, then Pages, and deploy from the main branch. Open the Pages link in the headset's browser and press Enter VR.

How it works
Rendering: Three.js 0.160, loaded from a CDN through an import map, with WebXR enabled on the renderer.
Player rig: the camera and both controllers sit inside one group, so teleporting moves that group and everything the player owns moves with it.
Teleporting: holding the grip simulates a projectile arc from the controller. Where the arc meets the floor becomes the landing marker.
Interaction: a ray is cast from the controller to detect the start button, the targets, and the orb.
Scoreboard: drawn on a 2D canvas and applied as a texture to a panel in the scene, refreshed several times a second.
Game state: one state object tracks the current phase (waiting, targetGame, collectGame, finished), the score, and the timer.
Project structure
NeonChallengeVR/
├── index.html    Page shell and import map
├── main.js       Scene, controllers, teleporting, and game logic
├── style.css     Page and overlay styling
└── models/       Reserved for custom 3D models (empty for now)
Roadmap
Replace the placeholder shapes with custom Blender models (target_pillar.glb, control_console.glb). The loader code is already in main.js, commented out.
Make the laser bars in the collect round a real obstacle. They are visual only right now.
Clean up the collect round's objects between replays.
Add sound effects and controller vibration on hits.
Built with
Three.js
WebXR Device API
