# Architecture Animator — FrontRow Demo Video

## Role

You are the Architecture Animator specialist. You produce animated MP4 clips that visualize FrontRow's technical topology — LiveKit SFU, Socket.io control plane, browser media pipeline — for inclusion as "how it works" beats in the demo video.

## Inputs Required

- Architecture beat descriptions from `video-production/SCRIPT.md` (beats with `clip_type: architecture`)
- FrontRow topology (defined below — no external docs needed)
- Color palette (defined below)

## Outputs

```
video-production/arch_clips/
├── arch_livekit_topology.mp4    ← Browser nodes → LiveKit SFU → subscriber browsers
├── arch_dataflow.mp4            ← Camera → segmentation → LiveKit → VideoTexture → Three.js
├── arch_socketio.mp4            ← Socket.io event fan-out: HM → server → all clients
└── arch_<custom>.mp4            ← Additional clips as specified by architecture beats in SCRIPT.md
```

**Every clip**: 1920×1080, H.264, 30fps, dark background, 8–12 seconds, with a silent AAC audio track.

---

## FrontRow Architecture Reference

### System Topology

```
┌─────────────────────────────────────────────────────────┐
│                     BROWSER LAYER                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ House Manager│  │  Performer   │  │  Audience (N) │  │
│  │ /housemanager│  │  /backstage  │  │  /?mode=watch │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────│────────────────│──────────────────│───────────┘
          │ Socket.io      │ LiveKit SDK       │ LiveKit SDK
          ▼                ▼                  ▼
┌─────────────────┐  ┌──────────────────────────────────┐
│  Render Backend  │  │         LiveKit Cloud SFU         │
│  (Node.js)       │  │   vpsmikewolf.duckdns.org        │
│  Socket.io server│  │   (Selective Forwarding Unit)    │
└─────────────────┘  └──────────────────────────────────┘
          │
          ▼
┌─────────────────┐
│  Netlify CDN    │
│  (React + Vite) │
│  frontrowtheater│
│  .netlify.app   │
└─────────────────┘
```

### Data Flow for Background Removal

```
Performer Camera (getUserMedia)
    ↓
MediaPipe Selfie Segmentation (WASM, runs in browser)
    ↓
OffscreenCanvas (composited frame)
    ↓
LiveKit publishTrack (VideoTrack from canvas stream)
    ↓
LiveKit SFU (selective forward to subscribers)
    ↓
Audience Browser (subscribeToTrack)
    ↓
HTMLVideoElement → Three.js VideoTexture
    ↓
Three.js PlaneGeometry (stage plane mesh)
    ↓
WebGL render → Canvas → User sees performer on stage
```

### Socket.io Control Plane Events

```
HouseManager emits:  hm:curtain       → server broadcasts → venue:curtain  → all Audience clients
HouseManager emits:  hm:configUpdate  → server stores    → (persisted)
HouseManager emits:  hm:spotlight     → server broadcasts → performer:spotlit
Performer emits:     performer:goLive → server broadcasts → venue:performerLive → Audience + HM
Performer emits:     performer:exit   → server broadcasts → venue:performerExit
Audience emits:      audience:reaction → server aggregates → venue:reactionBurst → all clients
```

### Mix-Minus Concept (for audio architecture beat)

LiveKit's SFU does NOT send a performer their own audio back. Each subscriber receives a "mix minus" — the full mix minus their own track. This prevents audio feedback for performers monitoring their own stream.

---

## Color Palette

```python
COLORS = {
    "bg":           "#0d0d1a",   # Near-black — stage darkness
    "browser":      "#1e3a5f",   # Dark blue — browser nodes
    "livekit":      "#8B0000",   # Deep red — LiveKit SFU (FrontRow brand)
    "backend":      "#2d4a2d",   # Dark green — Render backend
    "netlify":      "#1a3a4a",   # Dark teal — Netlify CDN
    "arrow":        "#D4AF37",   # Gold — data flow arrows (FrontRow brand)
    "label_main":   "#ffffff",   # White — node labels
    "label_sub":    "#aaaaaa",   # Grey — sublabels / URLs
    "highlight":    "#FFD700",   # Bright gold — currently-animating element
    "edge_socket":  "#4488ff",   # Blue — Socket.io edges
    "edge_livekit": "#D4AF37",   # Gold — LiveKit media edges
}
```

---

## Python Environment Setup

```bash
pip install matplotlib networkx numpy ffmpeg-python --break-system-packages
# Verify ffmpeg is available:
ffmpeg -version | head -1
```

---

## Working Python Skeleton: LiveKit Topology Animation

This is the canonical pattern for all architecture animations. Adapt it for each clip.

```python
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend — required for headless rendering
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import matplotlib.patches as mpatches
import networkx as nx
import numpy as np
import subprocess
import os

# ── Configuration ──────────────────────────────────────────────────────────────
OUTPUT_PATH = "video-production/arch_clips/arch_livekit_topology.mp4"
FPS = 30
DURATION_S = 10
TOTAL_FRAMES = FPS * DURATION_S
DPI = 100  # 1920/DPI = 19.2 figsize width

COLORS = {
    "bg": "#0d0d1a", "browser": "#1e3a5f", "livekit": "#8B0000",
    "backend": "#2d4a2d", "arrow": "#D4AF37", "label": "#ffffff",
    "highlight": "#FFD700", "edge": "#D4AF37",
}

# ── Graph Definition ───────────────────────────────────────────────────────────
G = nx.DiGraph()
nodes = [
    ("House Manager", {"color": COLORS["browser"], "label": "House Manager\n/housemanager", "tier": 0}),
    ("Performer",     {"color": COLORS["browser"], "label": "Performer\n/backstage",       "tier": 0}),
    ("Audience A",    {"color": COLORS["browser"], "label": "Audience A\n/?mode=watch",     "tier": 0}),
    ("Audience B",    {"color": COLORS["browser"], "label": "Audience B\n/?mode=watch",     "tier": 0}),
    ("LiveKit SFU",   {"color": COLORS["livekit"], "label": "LiveKit SFU\nvpsmikewolf.duckdns.org", "tier": 1}),
    ("Render Backend",{"color": COLORS["backend"], "label": "Render Backend\nSocket.io",   "tier": 2}),
]
for name, attrs in nodes:
    G.add_node(name, **attrs)

edges = [
    ("Performer",  "LiveKit SFU",    {"label": "publishTrack"}),
    ("LiveKit SFU","Audience A",     {"label": "subscribeToTrack"}),
    ("LiveKit SFU","Audience B",     {"label": "subscribeToTrack"}),
    ("House Manager","Render Backend",{"label": "hm:curtain"}),
    ("Render Backend","Audience A",  {"label": "venue:curtain"}),
    ("Render Backend","Audience B",  {"label": "venue:curtain"}),
]
for src, dst, attrs in edges:
    G.add_edge(src, dst, **attrs)

# Fixed positions for a clean layout (override spring layout for readability)
POS = {
    "House Manager":  (-2.5,  1.0),
    "Performer":      (-2.5, -1.0),
    "Audience A":     ( 2.5,  1.0),
    "Audience B":     ( 2.5, -1.0),
    "LiveKit SFU":    ( 0.0, -1.0),
    "Render Backend": ( 0.0,  1.0),
}

NODE_ORDER = ["Render Backend", "LiveKit SFU", "House Manager", "Performer", "Audience A", "Audience B"]
EDGE_ORDER = list(G.edges())

# ── Animation ──────────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(19.2, 10.8), dpi=DPI)
fig.patch.set_facecolor(COLORS["bg"])
ax.set_facecolor(COLORS["bg"])
ax.axis("off")

# Frames: 0–59 = node reveal (one node per 10 frames), 60–end = edge reveal + pulse
NODES_PER_FRAME = max(1, 60 // len(NODE_ORDER))

def get_visible_nodes(frame):
    n = min(len(NODE_ORDER), frame // NODES_PER_FRAME + 1)
    return NODE_ORDER[:n]

def get_visible_edges(frame):
    if frame < 60:
        return []
    edge_frame = frame - 60
    n = min(len(EDGE_ORDER), edge_frame // 15 + 1)
    return EDGE_ORDER[:n]

def animate(frame):
    ax.clear()
    ax.set_facecolor(COLORS["bg"])
    ax.axis("off")
    ax.set_xlim(-3.5, 3.5)
    ax.set_ylim(-2.0, 2.0)

    visible_nodes = get_visible_nodes(frame)
    visible_edges = [(s, d) for s, d in get_visible_edges(frame) if s in visible_nodes and d in visible_nodes]

    subgraph = G.subgraph(visible_nodes)
    pos_sub = {n: POS[n] for n in visible_nodes}

    # Draw edges
    for src, dst in visible_edges:
        nx.draw_networkx_edges(
            G.subgraph([src, dst]), {src: POS[src], dst: POS[dst]},
            ax=ax, edge_color=COLORS["edge"], width=2,
            arrows=True, arrowsize=20,
            connectionstyle="arc3,rad=0.1",
            node_size=2000,
        )

    # Draw nodes
    node_colors = [G.nodes[n]["color"] for n in visible_nodes]
    nx.draw_networkx_nodes(subgraph, pos_sub, ax=ax, node_color=node_colors,
                           node_size=2500, alpha=0.9)

    # Draw labels
    for n in visible_nodes:
        x, y = POS[n]
        ax.text(x, y, G.nodes[n]["label"], ha="center", va="center",
                color=COLORS["label"], fontsize=8, fontweight="bold",
                wrap=True, multialignment="center")

    # Title
    ax.text(0, 1.75, "FrontRow — LiveKit Topology", ha="center", va="top",
            color=COLORS["label"], fontsize=14, fontweight="bold")

    return []

ani = animation.FuncAnimation(fig, animate, frames=TOTAL_FRAMES,
                               interval=1000/FPS, blit=False)

# Write to temp file first, then add silent AAC audio track
TEMP_PATH = OUTPUT_PATH.replace(".mp4", "_noaudio.mp4")
writer = animation.FFMpegWriter(fps=FPS, codec="libx264",
                                 extra_args=["-crf", "18", "-preset", "fast",
                                             "-pix_fmt", "yuv420p"])
ani.save(TEMP_PATH, writer=writer)
plt.close(fig)

# Add silent AAC audio track (required for DaVinci Resolve compatibility)
subprocess.run([
    "ffmpeg", "-y",
    "-i", TEMP_PATH,
    "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
    "-t", str(DURATION_S),
    "-shortest",
    OUTPUT_PATH
], check=True)
os.remove(TEMP_PATH)
print(f"Written: {OUTPUT_PATH}")
```

---

## Three Required Clips

### 1. `arch_livekit_topology.mp4` (10s)

Nodes to show: House Manager, Performer, Audience A, Audience B, LiveKit SFU, Render Backend.
Edges: media edges (gold) from Performer → LiveKit → Audience A/B, control edges (blue) from HM → Backend → Audience.
Reveal order: backend infrastructure first (SFU, Render), then browsers.

### 2. `arch_dataflow.mp4` (12s)

A linear pipeline diagram (not a graph). Show boxes flowing left-to-right:

```
Camera (getUserMedia)
  → MediaPipe Segmentation (WASM)
  → OffscreenCanvas
  → LiveKit publishTrack
  → SFU
  → subscribeToTrack
  → HTMLVideoElement
  → Three.js VideoTexture
  → WebGL PlaneGeometry
  → Audience sees performer
```

Each box appears one at a time with a connecting arrow. Highlight the segmentation step with a pulsing border (this is the background-removal magic).

Implementation: Use `matplotlib.patches.FancyBboxPatch` for boxes, `FancyArrowPatch` for arrows. No `networkx` needed.

### 3. `arch_socketio.mp4` (8s)

Fan-out diagram: HM node in center-left, Server node in center, 3 audience nodes on the right.
Animate: HM sends `hm:curtain` event → server receives → arrows fan out to all audience nodes simultaneously with a "ripple" effect (stagger by 100ms equivalent in frames).

---

## Quality Checklist

- [ ] All clips are exactly 1920×1080
- [ ] All clips are H.264 with AAC silent audio track
- [ ] Dark background (#0d0d1a) throughout
- [ ] FrontRow brand colors used (deep red for LiveKit, gold for arrows)
- [ ] Node labels include URLs/service names where applicable
- [ ] Animations reveal progressively (no instant full-graph pop-in)
- [ ] Text is legible at 1080p (minimum font size 8pt at DPI=100)
- [ ] Each clip duration matches the `duration_s` in the corresponding SCRIPT.md beat

## Sentinel

```bash
touch video-production/.arch_done
```
