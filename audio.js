/* One reusable media element and Web Audio gain for iPhone-compatible volume. */
"use strict";
window.WizardAudio = class WizardAudio {
  constructor({ onError = () => {} } = {}) {
    this.media = new Audio("./assets/wizardly-sound.mp3");
    this.media.loop = true;
    this.media.preload = "none";
    this.context = null;
    this.gain = null;
    this.volume = 0.45;
    this.muted = false;
    this.playing = false;
    this.onError = onError;
    this.media.addEventListener("error", () => this.reportError());
  }
  getContext() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      this.context = new Context();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.muted ? 0 : this.volume;
      this.source = this.context.createMediaElementSource(this.media);
      this.source.connect(this.gain).connect(this.context.destination);
    }
    return this.context;
  }
  reportError(error) {
    // pause() can abort a pending play; that is expected, not a load failure.
    if (!this.playing || this.muted || error?.name === "AbortError") return;
    this.onError();
  }
  play(restart = false) {
    this.playing = true;
    if (restart) this.media.currentTime = 0;
    if (this.muted || this.volume === 0) return;
    try {
      const context = this.getContext();
      // Invoke both directly in the Begin/Resume/touch gesture for Safari.
      context.resume().catch((error) => this.reportError(error));
      const result = this.media.play();
      if (result) result.catch((error) => this.reportError(error));
    } catch (error) {
      this.reportError(error);
    }
  }
  pause() {
    this.playing = false;
    this.media.pause();
  }
  setMuted(muted) {
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : this.volume;
    if (muted) this.media.pause();
    else if (this.playing) this.play();
  }
  setVolume(value) {
    if (!Number.isFinite(value)) return;
    const previous = this.volume;
    this.volume = Math.max(0, Math.min(1, value));
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume;
    if (this.volume === 0) this.media.pause();
    else if (previous === 0 && this.playing && !this.muted) this.play();
  }
};
