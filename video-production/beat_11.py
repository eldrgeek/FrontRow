#!/usr/bin/env python3
"""beat_11.mp4 — FrontRow Reaction Data Channel animation (10s, 30fps, 1920x1080)"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np
import subprocess, os

OUTPUT_DIR = os.path.expanduser("~/Projects/frontrow/video-production/output/clips")
TEMP = os.path.join(OUTPUT_DIR, "beat_11_noaudio.mp4")
FINAL = os.path.join(OUTPUT_DIR, "beat_11.mp4")
FPS = 30
DURATION = 10
TOTAL_FRAMES = FPS * DURATION

# Colors
BG = '#0d0d1a'
BROWSER = '#1e3a5f'
LIVEKIT = '#8B0000'
GOLD = '#D4AF37'
WHITE = '#ffffff'

# Nodes
audience_nodes = [
    ("Audience 1", 0.15, 0.7),
    ("Audience 2", 0.15, 0.5),
    ("Audience 3", 0.15, 0.3),
]
sfu_node = ("LiveKit\nSFU", 0.50, 0.5)
performer_node = ("Performer", 0.85, 0.5)

# Timing
NODE_REVEAL_END = 3 * FPS  # nodes appear in first 3s
EDGE_REVEAL_END = 5 * FPS  # edges appear 3-5s
PACKET_START = 5 * FPS     # packets animate 5-10s

# Packet definitions: each is (start_frame_offset, source_idx)
# Stagger packets from different audience members
packet_waves = []
for wave in range(4):
    for src in range(3):
        t = PACKET_START + wave * (FPS * 1) + src * 8
        packet_waves.append((t, src))

fig, ax = plt.subplots(figsize=(19.2, 10.8), dpi=100)
fig.patch.set_facecolor(BG)

def lerp(a, b, t):
    return a + (b - a) * max(0, min(1, t))

def draw_frame(frame):
    ax.clear()
    ax.set_facecolor(BG)
    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.set_aspect('equal')
    ax.axis('off')

    # Title
    ax.text(0.5, 0.95, "FrontRow — Reaction Data Channel", color=WHITE,
            fontsize=28, fontweight='bold', ha='center', va='top',
            fontfamily='sans-serif')

    # Node reveal timing
    all_nodes = audience_nodes + [sfu_node, performer_node]
    node_times = [int(i * NODE_REVEAL_END / len(all_nodes)) for i in range(len(all_nodes))]

    # Draw nodes
    for i, (name, x, y) in enumerate(all_nodes):
        if frame < node_times[i]:
            continue
        alpha = min(1.0, (frame - node_times[i]) / 15.0)
        col = LIVEKIT if 'LiveKit' in name else BROWSER
        r = 0.06 if 'LiveKit' in name else 0.05
        circle = plt.Circle((x, y), r, color=col, alpha=alpha, zorder=5)
        ax.add_patch(circle)
        ax.text(x, y, name, color=WHITE, fontsize=12, ha='center', va='center',
                fontweight='bold', alpha=alpha, zorder=6, fontfamily='sans-serif')

    # Draw static edges (after EDGE_REVEAL_END - 2*FPS)
    edge_start = 3 * FPS
    edges = []
    for an in audience_nodes:
        edges.append((an[1], an[2], sfu_node[1], sfu_node[2]))
    edges.append((sfu_node[1], sfu_node[2], performer_node[1], performer_node[2]))

    for i, (x1, y1, x2, y2) in enumerate(edges):
        et = edge_start + int(i * (2*FPS) / len(edges))
        if frame < et:
            continue
        alpha = min(0.4, (frame - et) / 15.0 * 0.4)
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                     arrowprops=dict(arrowstyle='->', color=GOLD,
                                     lw=1.5, alpha=alpha))

    # "Data Channel" label
    if frame >= EDGE_REVEAL_END:
        alpha = min(1.0, (frame - EDGE_REVEAL_END) / 15.0)
        ax.text(0.50, 0.58, "Data Channel", color=GOLD, fontsize=14,
                ha='center', va='center', alpha=alpha, fontstyle='italic',
                fontfamily='sans-serif')

    # Animate packets
    for start_f, src_idx in packet_waves:
        if frame < start_f:
            continue
        elapsed = frame - start_f
        # Phase 1: audience -> SFU (30 frames)
        # Phase 2: SFU -> performer (30 frames)
        total_travel = 60
        if elapsed > total_travel:
            continue

        ax1, ay = audience_nodes[src_idx][1], audience_nodes[src_idx][2]
        sx, sy = sfu_node[1], sfu_node[2]
        px, py = performer_node[1], performer_node[2]

        if elapsed <= 30:
            t = elapsed / 30.0
            cx = lerp(ax1, sx, t)
            cy = lerp(ay, sy, t)
        else:
            t = (elapsed - 30) / 30.0
            cx = lerp(sx, px, t)
            cy = lerp(sy, py, t)

        # Draw packet as small bright dot
        pkt = plt.Circle((cx, cy), 0.012, color=GOLD, alpha=0.9, zorder=10)
        ax.add_patch(pkt)

ani = animation.FuncAnimation(fig, draw_frame, frames=TOTAL_FRAMES, interval=1000/FPS)
writer = animation.FFMpegWriter(fps=FPS, bitrate=5000,
                                 extra_args=['-pix_fmt', 'yuv420p',
                                             '-vf', 'scale=1920:1080'])
print("Rendering beat_11...")
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
