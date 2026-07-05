#!/usr/bin/env python3
"""beat_06.mp4 — FrontRow LiveKit Topology animation (15s, 30fps, 1920x1080)"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np
import subprocess, os

OUTPUT_DIR = os.path.expanduser("~/Projects/frontrow/video-production/output/clips")
TEMP = os.path.join(OUTPUT_DIR, "beat_06_noaudio.mp4")
FINAL = os.path.join(OUTPUT_DIR, "beat_06.mp4")
FPS = 30
DURATION = 15
TOTAL_FRAMES = FPS * DURATION

# Colors
BG = '#0d0d1a'
BROWSER = '#1e3a5f'
LIVEKIT = '#8B0000'
BACKEND = '#2d4a2d'
GOLD = '#D4AF37'
BLUE = '#4488ff'
WHITE = '#ffffff'
GREY = '#888888'

# Nodes: name, x, y, color
nodes = [
    ("House\nManager",   0.15, 0.7,  BROWSER),
    ("Performer",        0.15, 0.35, BROWSER),
    ("Audience A",       0.85, 0.65, BROWSER),
    ("Audience B",       0.85, 0.35, BROWSER),
    ("LiveKit\nSFU",     0.50, 0.5,  LIVEKIT),
    ("Render\nBackend",  0.50, 0.15, BACKEND),
]

# Edges: from_idx, to_idx, color, label, curve
edges = [
    (1, 4, GOLD, "WebRTC media", 0.0),       # Performer -> LiveKit
    (4, 2, GOLD, "WebRTC media", 0.0),        # LiveKit -> Audience A
    (4, 3, GOLD, "", 0.0),                     # LiveKit -> Audience B
    (0, 5, BLUE, "Socket.io", 0.0),           # HM -> Backend
    (5, 2, BLUE, "Socket.io", 0.0),           # Backend -> Audience A
    (5, 3, BLUE, "", 0.0),                     # Backend -> Audience B
]

# Timing: nodes appear one by one in first 6s, edges in next 6s, hold 3s
node_appear_frames = [int(i * (6*FPS) / len(nodes)) for i in range(len(nodes))]
edge_start = 6 * FPS
edge_appear_frames = [edge_start + int(i * (6*FPS) / len(edges)) for i in range(len(edges))]

fig, ax = plt.subplots(figsize=(19.2, 10.8), dpi=100)
fig.patch.set_facecolor(BG)

def draw_frame(frame):
    ax.clear()
    ax.set_facecolor(BG)
    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.set_aspect('equal')
    ax.axis('off')

    # Title
    ax.text(0.5, 0.95, "FrontRow — LiveKit Topology", color=WHITE,
            fontsize=28, fontweight='bold', ha='center', va='top',
            fontfamily='sans-serif')

    # Draw visible edges
    for i, (fi, ti, col, label, curve) in enumerate(edges):
        if frame < edge_appear_frames[i]:
            continue
        # fade in over 15 frames
        alpha = min(1.0, (frame - edge_appear_frames[i]) / 15.0)
        x1, y1 = nodes[fi][1], nodes[fi][2]
        x2, y2 = nodes[ti][1], nodes[ti][2]
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                     arrowprops=dict(arrowstyle='->', color=col,
                                     lw=2.5, alpha=alpha,
                                     connectionstyle=f"arc3,rad={curve}"))
        if label:
            mx, my = (x1+x2)/2, (y1+y2)/2 + 0.04
            ax.text(mx, my, label, color=col, fontsize=11, ha='center',
                    va='center', alpha=alpha, fontfamily='sans-serif',
                    bbox=dict(boxstyle='round,pad=0.2', facecolor=BG, edgecolor='none', alpha=0.7*alpha))

    # Draw visible nodes
    for i, (name, x, y, col) in enumerate(nodes):
        if frame < node_appear_frames[i]:
            continue
        alpha = min(1.0, (frame - node_appear_frames[i]) / 15.0)
        circle = plt.Circle((x, y), 0.06, color=col, alpha=alpha, zorder=5)
        ax.add_patch(circle)
        ax.text(x, y, name, color=WHITE, fontsize=12, ha='center', va='center',
                fontweight='bold', alpha=alpha, zorder=6, fontfamily='sans-serif')

ani = animation.FuncAnimation(fig, draw_frame, frames=TOTAL_FRAMES, interval=1000/FPS)
writer = animation.FFMpegWriter(fps=FPS, bitrate=5000,
                                 extra_args=['-pix_fmt', 'yuv420p',
                                             '-vf', 'scale=1920:1080'])
print("Rendering beat_06...")
ani.save(TEMP, writer=writer)
plt.close()

# Add silent audio
subprocess.run([
    'ffmpeg', '-y', '-i', TEMP,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-t', str(DURATION), '-shortest', FINAL
], check=True, capture_output=True)
os.remove(TEMP)
print(f"Done: {FINAL}")
