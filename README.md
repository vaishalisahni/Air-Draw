# ✍️ Air Draw — Gesture Whiteboard

A whiteboard you draw on with your hand in the air, using your webcam and computer vision (MediaPipe Hands). 100% client-side — no backend, no video ever leaves the browser.

## Gestures

| Gesture | Action |
|---|---|
| ☝️ Index finger up | Draw |
| ✋ Open palm | Sweep to erase |
| 🤏 Pinch | Grab & move the drawing |
| ✊ Fist | Idle / rest |

Toolbar: neon colors, thickness, glow intensity, undo, clear, save as PNG, camera on/off, help.

## Run locally

Any static server works (camera requires `localhost` or HTTPS):

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Deploy

It's just three static files — deploy anywhere:

- **Netlify / Vercel**: drag-and-drop the folder or `vercel deploy`.
- **GitHub Pages**: push the repo, enable Pages on the branch root.

No build step, no dependencies to install (MediaPipe loads from CDN).
