// Reframe the existing brand animation into a 4:1 banner without stretching its logo.
// Usage: node scripts/prepare-showcase-video.mjs <path-to-ffmpeg>
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ffmpeg = process.argv[2];
if (!ffmpeg) throw new Error("Pass the path to your local FFmpeg binary.");
const source = fileURLToPath(new URL("../public/videos/chtaw-motion.mp4", import.meta.url));
const output = fileURLToPath(new URL("../public/videos/chtaw-motion-wide-v1.mp4", import.meta.url));
const poster = fileURLToPath(
  new URL("../public/images/chtaw-motion-wide-v1.webp", import.meta.url),
);
// The portrait source was composed from a 576px square centered at (384,640).
// Recover that square, extend its moving colors across the banner and softly blend
// the original animation at the center. The logo retains its original proportions.
const framing = [
  "[0:v]crop=576:576:96:352,split=2[bg][fg]",
  "[bg]scale=1920:1920,crop=1920:480,gblur=sigma=65,eq=brightness=-0.08:saturation=0.9[back]",
  "[fg]scale=480:480,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*min(1,min(min(X,W-X),min(Y,H-Y))/40)'[front]",
  "[back][front]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=24[out]",
].join(";");
execFileSync(
  ffmpeg,
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    source,
    "-filter_complex",
    framing,
    "-map",
    "[out]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    output,
  ],
  { stdio: "inherit" },
);
execFileSync(
  ffmpeg,
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "4.2",
    "-i",
    output,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "88",
    poster,
  ],
  { stdio: "inherit" },
);
console.log(
  JSON.stringify({
    output,
    width: 1920,
    height: 480,
    bytes: statSync(output).size,
    posterBytes: statSync(poster).size,
    audio: false,
  }),
);
