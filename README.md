# ✍️ Air Draw — Gesture Whiteboard

A whiteboard you draw on with your hand in the air, using your webcam and computer vision (MediaPipe Hands). 100% client-side — no backend, no video ever leaves the browser.

Built with **Vite + React**.

## Gestures

| Gesture | Action |
|---|---|
| ☝️ Index finger up | Draw |
| ✋ Open palm | Sweep to erase |
| 🤏 Pinch | Grab & move the drawing |
| ✊ Fist | Idle / rest |

Toolbar: neon colors, thickness, glow intensity, undo, clear, save as PNG, camera on/off, help.

## Project structure

```
app/
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx
    └── style.css
```

## Run locally

Camera access requires `localhost` or HTTPS.

```bash
cd app
npm install
npm run dev
```

Open the URL Vite prints in the terminal (usually `http://localhost:5173`).

## Build for production

```bash
cd app
npm run build
npm run preview   # optional: preview the production build locally
```

The build output goes to `app/dist/`.

## Deploy

- **Netlify / Vercel**: set the project's base/root directory to `app`, build command to `npm run build`, and publish directory to `dist`.
- **GitHub Pages**: build with `npm run build`, then deploy the contents of `app/dist` to the `gh-pages` branch (e.g. via the `gh-pages` npm package or a GitHub Action).

No backend needed — MediaPipe's hand-tracking models load from CDN at runtime, so there's nothing extra to configure on the server side.

## Tech

- React 18 + Vite 5
- [MediaPipe Hands](https://github.com/google/mediapipe) for real-time hand landmark tracking (loaded from CDN)
- Canvas 2D API for drawing, erasing, and moving strokes