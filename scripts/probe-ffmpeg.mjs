import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const jpg = readFileSync('out/crm/sheet.png.frames/000.jpg');

const variants = [
  ['image2pipe', ['-f', 'image2pipe', '-framerate', '30', '-i', '-']],
  ['mjpeg', ['-f', 'mjpeg', '-i', '-']],
];

for (const [name, inputArgs] of variants) {
  const args = ['-y', '-v', 'error', ...inputArgs, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
    `out/crm/_v_${name}.mp4`];
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  ff.stdin.on('error', () => {});
  let err = '';
  ff.stderr.on('data', d => { err += d.toString(); });
  let n = 0, done = false;
  const finish = new Promise(r => ff.on('close', c => { done = true; r(c); }));

  for (let i = 0; i < 20 && !done; i++) {
    if (ff.stdin.destroyed) break;
    if (!ff.stdin.write(jpg)) {
      await Promise.race([new Promise(r => ff.stdin.once('drain', r)), finish]);
    }
    n++;
  }
  if (!done && !ff.stdin.destroyed) { try { ff.stdin.end(); } catch {} }
  const timeout = new Promise(r => setTimeout(() => { try { ff.kill(); } catch {}; r('timeout'); }, 5000));
  const code = await Promise.race([finish, timeout]);
  console.log(`\n### ${name} — écrit=${n} code=${code}`);
  console.log(err.trim() ? err.trim().split('\n').slice(0, 5).join('\n') : '(pas de stderr)');
}
