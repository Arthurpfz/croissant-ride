// Audio cues: a soft beep before each step change and a spoken summary of what comes next.
import { watts, type Step } from './workouts';

let muted = (() => { try { return localStorage.getItem('audio-muted') === '1'; } catch { return false; } })();
let ctx: AudioContext | undefined;

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('audio-muted', muted ? '1' : '0'); } catch {}
  if (muted) speechSynthesis.cancel();
  else unlock();
  return muted;
}

// Browsers only start audio from a user gesture: call this from a click or key press.
export function unlock() {
  ctx ??= new AudioContext();
  ctx.resume().catch(() => {});
}

export function beep() {
  if (muted || !ctx) return;
  const t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.3);
}

// The default voice is often the most robotic one: prefer downloaded premium/enhanced voices (macOS),
// Microsoft "Natural" (Edge/Windows), then Google's (Chrome), then the classic macOS voices.
let voice: SpeechSynthesisVoice | undefined;
const rank = (v: SpeechSynthesisVoice) =>
  /premium|natural/i.test(v.name) ? 4 : /enhanced/i.test(v.name) ? 3 : /^google/i.test(v.name) ? 2 : /samantha|daniel|karen|moira/i.test(v.name) ? 1 : 0;
function pickVoice() {
  voice = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en')).sort((a, b) => rank(b) - rank(a) || +b.lang.startsWith('en-US') - +a.lang.startsWith('en-US'))[0];
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }

export function say(text: string) {
  if (muted || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  speechSynthesis.speak(u);
}

// "240 watts, 10 minutes" — undefined = no step left
export function describe(st: Step | undefined, offset: number) {
  if (!st) return 'Almost done. Nice work!';
  const w = (p: number) => watts(p, offset);
  const m = Math.floor(st.dur / 60), s = st.dur % 60;
  const time = [m && `${m} minute${m > 1 ? 's' : ''}`, s && `${s} seconds`].filter(Boolean).join(' ');
  const what = st.free ? (st.label ?? 'Free riding').replace('~', 'about ')
    : st.to === undefined ? `${w(st.from)} watts`
    : `${st.label ? st.label + ', ' : ''}${w(st.from)} to ${w(st.to)} watts`;
  return `${what}, ${time}`;
}
