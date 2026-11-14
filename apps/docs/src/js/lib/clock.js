import { ticker } from "./ticker.js";

/**
 * A playback clock for visualizations: play, pause, seek, loop, speed. Time is in ms. It ticks
 * through the shared ticker only while playing, and `setVisible(false)` suspends it off screen.
 */
export function createClock({
  duration,
  loop = false,
  hold = 0,
  speed = 1,
  onTick = () => {},
  onState = () => {},
}) {
  let time = 0;
  let playing = false;
  let visible = true;
  let holdLeft = 0;
  let stop = null;
  const state = () => onState({ playing, time, duration });
  const step = (dt) => {
    if (holdLeft > 0) {
      holdLeft -= dt;
      if (holdLeft <= 0) {
        time = 0;
        onTick(time);
      }
      return;
    }
    time += dt * clock.speed;
    if (time >= duration) {
      if (loop) {
        time = duration;
        onTick(time);
        holdLeft = hold || 1;
        return;
      }
      time = duration;
      onTick(time);
      clock.pause();
      return;
    }
    onTick(time);
  };
  const attach = () => {
    if (playing && visible && !stop) stop = ticker.add(step);
  };
  const detach = () => {
    stop?.();
    stop = null;
  };
  const clock = {
    speed,
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
    get duration() {
      return duration;
    },
    play() {
      if (time >= duration && !loop) time = 0;
      playing = true;
      attach();
      state();
    },
    pause() {
      playing = false;
      detach();
      state();
    },
    toggle() {
      if (playing) clock.pause();
      else clock.play();
    },
    seek(t) {
      time = Math.max(0, Math.min(duration, t));
      holdLeft = 0;
      onTick(time);
      state();
    },
    setDuration(d) {
      duration = d;
      if (time > d) clock.seek(d);
    },
    setVisible(v) {
      visible = v;
      if (v) attach();
      else detach();
    },
    destroy() {
      playing = false;
      detach();
    },
  };
  return clock;
}
