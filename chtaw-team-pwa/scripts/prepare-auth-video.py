"""Prepare the supplied video for the auth panel. Requires a local FFmpeg binary."""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', required=True)
parser.add_argument('--source', required=True)
args = parser.parse_args()
public = Path(__file__).resolve().parents[1] / 'public'
(public / 'videos').mkdir(exist_ok=True)
output = public / 'videos/auth-motion.mp4'
# Extend the square source using its blurred colors, then feather its edges.
# This preserves the drawing without visible bands on a portrait form panel.
framing = (
    '[0:v]split=2[bg][fg];'
    '[bg]scale=768:1280:force_original_aspect_ratio=increase,crop=768:1280,gblur=sigma=35[back];'
    "[fg]scale=576:576,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':"
    "a='255*min(1,min(min(X,W-X),min(Y,H-Y))/64)'[front];"
    '[back][front]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=24[out]'
)
subprocess.run([args.ffmpeg, '-y', '-i', args.source, '-filter_complex', framing, '-map', '[out]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-map_metadata', '-1', str(output)], check=True)
subprocess.run([args.ffmpeg, '-y', '-ss', '2.2', '-i', str(output), '-frames:v', '1',
    '-c:v', 'libwebp', '-quality', '85', str(public / 'images/auth-motion-poster.webp')], check=True)
print('Web assets prepared:', output.stat().st_size, 'bytes, H.264, no audio')
