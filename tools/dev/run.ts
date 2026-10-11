/**
 * Starts the API server (with --watch) and the Vite dev server together and
 * stops both when either exits or on Ctrl+C. Usage: npm run dev
 */
import { spawn, type ChildProcess } from 'node:child_process';

const processes: ChildProcess[] = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--watch', 'apps/server/src/main.ts'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', '@bim/web'], { stdio: 'inherit' }),
];

let stopping = false;
function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}

for (const child of processes) {
  child.on('exit', (code) => stopAll(code ?? 1));
  child.on('error', (error) => {
    console.error(error);
    stopAll(1);
  });
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
