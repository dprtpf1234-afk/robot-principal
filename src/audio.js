// 레트로 칩튠 배경음악과 효과음 (Web Audio로 직접 합성, 음원 파일 없음)
const Sound = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = Util.storage.get('rp_muted', false);
  let track = null;       // 'outdoor' | 'indoor' | null
  let timer = null;
  let step = 0;
  let nextTime = 0;

  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

  // 16분음표 기준 패턴. 0 = 쉼표
  const TRACKS = {
    // 첫 화면: 밝은 행진곡 느낌
    title: {
      bpm: 120,
      lead: [72, 0, 72, 74, 76, 0, 76, 0, 77, 76, 74, 0, 72, 0, 0, 0,
             74, 0, 74, 76, 77, 0, 79, 0, 81, 79, 77, 0, 76, 0, 0, 0,
             79, 0, 79, 77, 76, 0, 74, 0, 72, 0, 76, 0, 79, 0, 84, 0,
             83, 0, 81, 0, 79, 0, 77, 0, 76, 0, 74, 0, 72, 0, 0, 0],
      bass: [48, 0, 0, 0, 55, 0, 0, 0, 48, 0, 0, 0, 55, 0, 0, 0,
             53, 0, 0, 0, 57, 0, 0, 0, 53, 0, 0, 0, 57, 0, 0, 0,
             55, 0, 0, 0, 59, 0, 0, 0, 55, 0, 0, 0, 59, 0, 0, 0,
             55, 0, 0, 0, 53, 0, 0, 0, 48, 0, 0, 0, 48, 0, 0, 0]
    },
    outdoor: {
      bpm: 132,
      lead: [72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 77, 0, 81, 0, 77, 0, 76, 0, 79, 0, 84, 0, 79, 0, 77, 76, 74, 0, 72, 0, 0, 0,
             72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 77, 0, 81, 0, 79, 77, 76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 74, 0, 72, 0, 0, 0],
      bass: [48, 0, 0, 0, 55, 0, 0, 0, 50, 0, 0, 0, 57, 0, 0, 0, 52, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 55, 0, 0, 0,
             48, 0, 0, 0, 55, 0, 0, 0, 50, 0, 0, 0, 57, 0, 0, 0, 53, 0, 0, 0, 55, 0, 0, 0, 48, 0, 0, 0, 48, 0, 0, 0]
    },
    indoor: {
      bpm: 104,
      lead: [69, 0, 72, 0, 76, 0, 0, 0, 74, 0, 72, 0, 71, 0, 0, 0, 72, 0, 76, 0, 79, 0, 0, 0, 77, 0, 76, 0, 74, 0, 0, 0,
             69, 0, 72, 0, 76, 0, 0, 0, 74, 0, 72, 0, 71, 0, 72, 0, 74, 0, 72, 0, 71, 0, 67, 0, 69, 0, 0, 0, 0, 0, 0, 0],
      bass: [45, 0, 0, 0, 52, 0, 0, 0, 50, 0, 0, 0, 52, 0, 0, 0, 48, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 52, 0, 0, 0,
             45, 0, 0, 0, 52, 0, 0, 0, 50, 0, 0, 0, 52, 0, 0, 0, 53, 0, 0, 0, 52, 0, 0, 0, 45, 0, 0, 0, 45, 0, 0, 0]
    }
  };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.35;
    musicGain.connect(master);
  }

  function tone(freq, start, dur, type, vol, dest, slideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest || master);
    o.start(start); o.stop(start + dur + 0.02);
  }

  function schedule() {
    if (!ctx || !track) return;
    const t = TRACKS[track];
    const sixteenth = 60 / t.bpm / 4;
    while (nextTime < ctx.currentTime + 0.15) {
      const i = step % t.lead.length;
      if (t.lead[i]) tone(NOTE(t.lead[i]), nextTime, sixteenth * 1.8, 'square', 0.12, musicGain);
      if (t.bass[i]) tone(NOTE(t.bass[i]), nextTime, sixteenth * 3.5, 'triangle', 0.3, musicGain);
      if (i % 8 === 4) noise(nextTime, 0.05, 0.05, musicGain);
      nextTime += sixteenth;
      step++;
    }
  }

  function noise(start, dur, vol, dest) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(g); g.connect(dest || master);
    src.start(start);
  }

  function playMusic(name) {
    if (!ctx || track === name) return;
    track = name;
    step = 0;
    nextTime = ctx.currentTime + 0.05;
    if (!timer) timer = setInterval(schedule, 50);
  }

  function stopMusic() {
    track = null;
    if (timer) { clearInterval(timer); timer = null; }
  }

  function sfx(name) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'jump': tone(330, t, 0.15, 'square', 0.15, null, 660); break;
      case 'spin': [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.05, 0.08, 'square', 0.12)); break;
      case 'talk': tone(880, t, 0.04, 'square', 0.06); break;
      case 'pick': tone(988, t, 0.06, 'square', 0.12); tone(1319, t + 0.06, 0.1, 'square', 0.12); break;
      case 'correct': [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.08, 0.14, 'square', 0.14)); break;
      case 'wrong': tone(160, t, 0.3, 'sawtooth', 0.12, null, 100); break;
      case 'part': [659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.07, 0.12, 'square', 0.13)); break;
      case 'clear':
        [523, 523, 523, 659, 784, 0, 659, 784, 1047].forEach((f, i) => { if (f) tone(f, t + i * 0.12, 0.2, 'square', 0.14); });
        [262, 330, 392, 523].forEach((f, i) => tone(f, t + i * 0.24, 0.3, 'triangle', 0.25));
        break;
      case 'door': noise(t, 0.12, 0.12); tone(220, t, 0.12, 'square', 0.06, null, 110); break;
    }
  }

  function setMuted(m) {
    muted = m;
    Util.storage.set('rp_muted', m);
    if (master) master.gain.value = m ? 0 : 0.5;
  }

  return { init, playMusic, stopMusic, sfx, setMuted, isMuted: () => muted, current: () => track };
})();
