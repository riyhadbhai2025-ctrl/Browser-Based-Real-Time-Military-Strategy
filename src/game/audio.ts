// Procedural Web Audio Sound Synthesizer for RTS game
// No external MP3 downloads required; zero-latency, realistic military audio.

import { GameSettings } from '../lib/settings';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterVolume: number = 0.8; // 0.0 to 1.0
  private sfxVolume: number = 0.85; // 0.0 to 1.0
  private uiVolume: number = 0.75; // 0.0 to 1.0
  private alertAudioEnabled: boolean = true;

  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.uiGain = this.ctx.createGain();

        this.sfxGain.connect(this.masterGain);
        this.uiGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.syncGainNodes();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private syncGainNodes() {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.uiGain) return;
    const now = this.ctx.currentTime;
    const baseMaster = this.isMuted ? 0 : this.masterVolume * 0.45;
    this.masterGain.gain.setValueAtTime(baseMaster, now);
    this.sfxGain.gain.setValueAtTime(this.sfxVolume, now);
    this.uiGain.gain.setValueAtTime(this.uiVolume, now);
  }

  public applySettings(settings: Pick<GameSettings, 'muted' | 'masterVolume' | 'sfxVolume' | 'uiAudioVolume' | 'alertAudioEnabled'>) {
    this.isMuted = settings.muted;
    this.masterVolume = Math.max(0, Math.min(1, settings.masterVolume / 100));
    this.sfxVolume = Math.max(0, Math.min(1, settings.sfxVolume / 100));
    this.uiVolume = Math.max(0, Math.min(1, settings.uiAudioVolume / 100));
    this.alertAudioEnabled = settings.alertAudioEnabled;
    this.syncGainNodes();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    this.syncGainNodes();
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMasterVolume(vol0to100: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol0to100 / 100));
    this.syncGainNodes();
  }

  public getMasterVolume(): number {
    return Math.round(this.masterVolume * 100);
  }

  public setSfxVolume(vol0to100: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol0to100 / 100));
    this.syncGainNodes();
  }

  public getSfxVolume(): number {
    return Math.round(this.sfxVolume * 100);
  }

  public setUiVolume(vol0to100: number) {
    this.uiVolume = Math.max(0, Math.min(1, vol0to100 / 100));
    this.syncGainNodes();
  }

  public setAlertAudioEnabled(enabled: boolean) {
    this.alertAudioEnabled = enabled;
  }

  public playTestSound(type: 'ui' | 'combat' | 'alert' = 'ui') {
    this.initContext();
    if (type === 'combat') {
      this.playCannonShot();
    } else if (type === 'alert') {
      this.playCaptureSuccess(true);
    } else {
      this.playCommandAck();
    }
  }

  // Unit command acknowledgement beep / radio click
  public playCommandAck() {
    this.initContext();
    if (!this.ctx || !this.uiGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);

    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.uiGain);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Tank heavy cannon blast
  public playCannonShot() {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.isMuted) return;

    const t = this.ctx.currentTime;

    // Low pitch punch
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.25);

    oscGain.gain.setValueAtTime(0.4, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.3);

    // Blast noise
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.25);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    whiteNoise.start(t);
  }

  // Machine gun / Autocannon burst
  public playMachineGun() {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const shotTime = t + i * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(320, shotTime);
      osc.frequency.exponentialRampToValueAtTime(80, shotTime + 0.04);

      gain.gain.setValueAtTime(0.15, shotTime);
      gain.gain.exponentialRampToValueAtTime(0.001, shotTime + 0.045);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(shotTime);
      osc.stop(shotTime + 0.05);
    }
  }

  // Missile launch whoosh
  public playMissileLaunch() {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.28);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Explosion impact
  public playExplosion() {
    this.initContext();
    if (!this.ctx || !this.sfxGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(40, t + 0.45);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    whiteNoise.start(t);
  }

  // Base Siren Alarm (when base is under assault)
  public playBaseAlarm(forceTest: boolean = false) {
    this.initContext();
    if (!this.ctx || !this.uiGain || this.isMuted) return;
    if (!this.alertAudioEnabled && !forceTest) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.25);
    osc.frequency.linearRampToValueAtTime(440, t + 0.5);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.55);

    osc.connect(gain);
    gain.connect(this.uiGain);

    osc.start(t);
    osc.stop(t + 0.55);
  }

  // Base Captured Fanfare / Siren
  public playCaptureSuccess(forceTest: boolean = false) {
    this.initContext();
    if (!this.ctx || !this.uiGain || this.isMuted) return;
    if (!this.alertAudioEnabled && !forceTest) return;

    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const noteTime = t + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.22, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(this.uiGain!);

      osc.start(noteTime);
      osc.stop(noteTime + 0.25);
    });
  }

  // Construction complete chime
  public playBuildComplete() {
    this.initContext();
    if (!this.ctx || !this.uiGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, t); // C5
    osc.frequency.setValueAtTime(659.25, t + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, t + 0.2); // G5

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(this.uiGain);

    osc.start(t);
    osc.stop(t + 0.45);
  }
}

export const soundEngine = new SoundEngine();
