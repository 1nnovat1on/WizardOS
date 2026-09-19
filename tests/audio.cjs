"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const media = [];
class FakeAudio {
  constructor(src) {
    this.src = src;
    this.currentTime = 0;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.listeners = {};
    media.push(this);
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  play() {
    this.playCalls++;
    return this.result || Promise.resolve();
  }
  pause() {
    this.pauseCalls++;
  }
}
let contexts = 0;
class FakeContext {
  constructor() {
    contexts++;
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: { value: 1 },
      connect() {
        return this;
      },
    };
  }
  createMediaElementSource() {
    return {
      connect(node) {
        return node;
      },
    };
  }
}
(async () => {
  const sandbox = { window: { AudioContext: FakeContext }, Audio: FakeAudio };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../audio.js"), "utf8"),
    sandbox,
  );
  let errors = 0;
  const audio = new sandbox.window.WizardAudio({ onError: () => errors++ });
  assert.equal(audio.media.playCalls, 0, "no autoplay on the title screen");
  assert.equal(contexts, 0, "no audio context before gesture");
  assert.equal(audio.media.loop, true);
  audio.play(true);
  assert.equal(audio.media.playCalls, 1);
  assert.equal(audio.gain.gain.value, 0.45);
  assert.equal(audio.media.src, "./assets/wizardly-sound.mp3");
  audio.media.currentTime = 23;
  audio.pause();
  assert.equal(audio.playing, false);
  audio.play();
  assert.equal(audio.media.currentTime, 23, "resume preserves position");
  assert.equal(contexts, 1, "one reusable audio graph");
  audio.setVolume(0.2);
  assert.equal(audio.gain.gain.value, 0.2, "Web Audio gain controls volume");
  audio.setMuted(true);
  assert.equal(audio.gain.gain.value, 0);
  const calls = audio.media.playCalls;
  audio.setMuted(false);
  assert.equal(audio.media.playCalls, calls + 1);
  assert.equal(audio.gain.gain.value, 0.2);
  audio.pause();
  const stopped = audio.media.playCalls;
  audio.setMuted(true);
  audio.setMuted(false);
  assert.equal(
    audio.media.playCalls,
    stopped,
    "unmute cannot resume a paused game",
  );
  audio.play(true);
  assert.equal(audio.media.currentTime, 0, "new journey restarts track");
  audio.setVolume(0);
  const zeroCalls = audio.media.playCalls;
  audio.setVolume(0.7);
  assert.equal(
    audio.media.playCalls,
    zeroCalls + 1,
    "raising volume from zero resumes playback",
  );
  audio.setVolume(200);
  assert.equal(audio.volume, 1);
  audio.setVolume(NaN);
  assert.equal(audio.volume, 1);
  audio.media.result = Promise.reject(
    Object.assign(new Error("paused"), { name: "AbortError" }),
  );
  audio.play();
  await Promise.resolve();
  assert.equal(errors, 0, "expected abort is ignored");
  audio.media.result = Promise.reject(new Error("blocked"));
  audio.play();
  await Promise.resolve();
  assert.equal(errors, 1, "play rejection is caught and reported");
  audio.media.result = Promise.reject(new Error("late rejection"));
  audio.play();
  audio.pause();
  await Promise.resolve();
  assert.equal(errors, 1, "pause suppresses stale play rejection");
  console.log(
    "PASS: audio gesture start, looping, gain volume, mute, pause/resume, restart, graph reuse, and rejected playback handling",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
