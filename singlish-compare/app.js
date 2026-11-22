/* Human LAIer / Signal Lab: static, source-backed two-model comparison.
   Transcript content is never fabricated. Follow is synchronized to VERIFIED
   15-second excerpt boundaries, never to unmeasured word timestamps. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const player = $("sourceAudio");
  const seekSlider = $("seekSlider");
  const playButton = $("playButton");
  const waveform = $("waveform");
  const status = $("playerStatus");
  const momentParent = $("moments");
  const clipSeconds = 15;
  let dataset = null;
  let activeIndex = -1;
  let motionReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rowNodes = {small: [], coats: []};
  const textNodes = {small: [], coats: []};
  const momentNodes = [];
  const color = {played: "#66e0d1", waiting: "#335668", cursor: "#f4f6f3"};

  const fmt = seconds => {
    const t = Math.max(0, Math.floor(Number(seconds) || 0));
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" +
      String(t % 60).padStart(2, "0");
  };
  const node = (tag, cls, value) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (value !== undefined && value !== null) item.textContent = String(value);
    return item;
  };
  const normalizedWords = str => new Set(
    (String(str).toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [])
  );
  function showTranscriptText(element, ownText, otherText) {
    element.replaceChildren();
    if (!ownText.trim()) {
      element.classList.add("empty");
      element.textContent = "No speech returned for this excerpt.";
      return;
    }
    element.classList.remove("empty");
    if (!$("showDiff").checked) {
      element.textContent = ownText;
      return;
    }
    const comparison = normalizedWords(otherText);
    const tokens = ownText.match(/\s+|[^\s]+/gu) || [ownText];
    for (const token of tokens) {
      const normal = token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (normal && !comparison.has(normal)) {
        element.appendChild(node("mark", "word-diff", token));
      } else {
        element.appendChild(document.createTextNode(token));
      }
    }
  }
  function buildMoment(clip) {
    const button = node("button", "moment");
    button.type = "button";
    button.setAttribute("aria-label", "Play excerpt " + (clip.index + 1) + " at " + fmt(clip.timelineStart));
    const top = node("span", "moment-top");
    top.append(node("span", "", "EXCERPT 0" + (clip.index + 1)), node("span", "", fmt(clip.timelineStart) + "—" + fmt(clip.timelineEnd)));
    button.append(top, node("span", "moment-text", "Original segment / " + fmt(clip.sourcePartOffsetSeconds)),
      node("span", "moment-detail", "15 SEC · AUDIO + BOTH MODELS"));
    button.addEventListener("click", () => jumpTo(clip.timelineStart, true));
    momentParent.appendChild(button);
    momentNodes.push(button);
  }
  function buildRow(model, clip) {
    const key = model === "small" ? "singlish" : "coats";
    const other = model === "small" ? "coats" : "singlish";
    const pane = $(model + "Scroll");
    const row = node("article", "transcript-chunk");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "Seek to excerpt " + (clip.index + 1) + " for " + (model === "small" ? "Singlish2English" : "Coats"));
    row.dataset.index = String(clip.index);
    const top = node("div", "chunk-meta");
    top.append(node("span", "chunk-num", "0" + (clip.index + 1) + " / " + fmt(clip.timelineStart) + " — " + fmt(clip.timelineEnd)),
      node("span", "", "SOURCE AUDIO"));
    const phrase = node("p", "chunk-text");
    showTranscriptText(phrase, clip[key], clip[other]);
    const source = node("div", "chunk-source", "ORIGINAL SEGMENT OFFSET " + fmt(clip.sourcePartOffsetSeconds) +
      " · " + clip.sourcePart.replace(".ts", "").replace("part_", "PART "));
    row.append(top, phrase, source, node("div", "chunk-progress"));
    row.addEventListener("click", () => jumpTo(clip.timelineStart, true));
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        jumpTo(clip.timelineStart, true);
      }
    });
    pane.appendChild(row);
    rowNodes[model].push(row);
    textNodes[model].push(phrase);
  }
  function repaintDifferences() {
    if (!dataset) return;
    for (const clip of dataset.clips) {
      showTranscriptText(textNodes.small[clip.index], clip.singlish, clip.coats);
      showTranscriptText(textNodes.coats[clip.index], clip.coats, clip.singlish);
    }
  }
  function followPane(model, index) {
    const row = rowNodes[model][index];
    const pane = $(model + "Scroll");
    if (!pane || !row) return;
    pane.scrollTo({top: Math.max(0, row.offsetTop - 18),
      behavior: motionReduced ? "instant" : "smooth"});
  }
  function updatePlayback() {
    if (!dataset) return;
    const duration = dataset.durationSeconds;
    const current = Number.isFinite(player.currentTime) ? Math.max(0, Math.min(duration, player.currentTime)) : 0;
    $("playerClock").textContent = fmt(current) + " / " + fmt(duration);
    seekSlider.value = String(current);
    seekSlider.style.setProperty("--seek-percent", (current / duration * 100) + "%");
    const segment = Math.max(0, Math.min(dataset.clips.length - 1, Math.floor(Math.min(duration - .0001, current) / clipSeconds)));
    if (segment !== activeIndex) {
      activeIndex = segment;
      for (const model of ["small", "coats"]) {
        rowNodes[model].forEach((r, i) => {
          r.classList.toggle("active", i === segment);
          r.classList.toggle("completed", i < segment);
          r.setAttribute("aria-current", i === segment ? "true" : "false");
        });
        if ($("autoFollow").checked) followPane(model, segment);
      }
      momentNodes.forEach((m, i) => {
        m.classList.toggle("active", i === segment);
        m.setAttribute("aria-current", i === segment ? "true" : "false");
      });
      status.textContent = "Listening to excerpt " + (segment + 1) + " of " + dataset.clips.length +
        " · original segment at " + fmt(dataset.clips[segment].sourcePartOffsetSeconds);
    }
    const segmentProgress = Math.max(0, Math.min(1, (current - segment * clipSeconds) / clipSeconds));
    for (const model of ["small", "coats"]) {
      rowNodes[model][segment].style.setProperty("--clip-progress", String(segmentProgress));
    }
    paintWave(current);
  }
  function paintWave(time) {
    if (!dataset || !waveform.getContext) return;
    const rect = waveform.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = rect.width;
    const height = rect.height;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (waveform.width !== w || waveform.height !== h) {
      waveform.width = w;
      waveform.height = h;
    }
    const ctx = waveform.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const data = dataset.waveform || [];
    const max = Math.max(.025, ...data);
    const usable = height - 13;
    const pitch = width / Math.max(1, data.length);
    const barWidth = Math.max(1, pitch - 1.4);
    for (let i = 0; i < data.length; i++) {
      const amp = Math.min(1, Math.max(.1, Math.sqrt(data[i] / max)));
      const bar = Math.max(4, amp * usable);
      ctx.fillStyle = (i / data.length) * dataset.durationSeconds <= time ? color.played : color.waiting;
      ctx.fillRect(i * pitch, (height - bar) / 2, barWidth, bar);
    }
    for (let i = 1; i < 4; i++) {
      const x = width * (i / 4);
      ctx.strokeStyle = "#ffffff40";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();ctx.moveTo(x, 3);ctx.lineTo(x, height - 2);ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = color.cursor;
    ctx.lineWidth = 2;
    const x = width * Math.max(0, Math.min(1, time / dataset.durationSeconds));
    ctx.beginPath();ctx.moveTo(x, 2);ctx.lineTo(x, height - 2);ctx.stroke();
  }
  function jumpTo(seconds, play) {
    if (!dataset) return;
    const target = Math.max(0, Math.min(dataset.durationSeconds - .08, Number(seconds) || 0));
    try { player.currentTime = target; } catch (e) { /* wait for media metadata */ }
    updatePlayback();
    if (play) startPlayback();
  }
  function updatePlayIcon() {
    const playing = !player.paused && !player.ended;
    $("playGlyph").textContent = playing ? "❚❚" : "▶";
    playButton.setAttribute("aria-label", playing ? "Pause recording" : "Play recording");
  }
  async function startPlayback() {
    try {
      await player.play();
    } catch (error) {
      status.textContent = "Playback could not start. Use the play control or check audio loading.";
    }
    updatePlayIcon();
  }
  function wire() {
    playButton.addEventListener("click", () => {
      if (player.paused) startPlayback();
      else player.pause();
    });
    seekSlider.addEventListener("input", () => jumpTo(Number(seekSlider.value), false));
    $("speedSelect").addEventListener("change", event => {
      player.playbackRate = Number(event.target.value) || 1;
    });
    $("autoFollow").addEventListener("change", event => {
      if (event.target.checked && activeIndex >= 0) {
        followPane("small", activeIndex);
        followPane("coats", activeIndex);
      }
    });
    $("showDiff").addEventListener("change", repaintDifferences);
    player.addEventListener("timeupdate", updatePlayback);
    player.addEventListener("seeked", updatePlayback);
    player.addEventListener("durationchange", updatePlayback);
    player.addEventListener("play", updatePlayIcon);
    player.addEventListener("pause", updatePlayIcon);
    player.addEventListener("ended", updatePlayIcon);
    player.addEventListener("error", () => {
      status.textContent = "Original audio could not load. The transcripts remain independently viewable.";
    });
    window.addEventListener("resize", () => {if (dataset) paintWave(player.currentTime || 0);});
  }
  function loadData(data) {
    if (data.schema !== "hl-public-singlish-head-to-head-v1" ||
        data.sourceSession !== "20261120T182048_569395Z_huatzaitcg" ||
        data.status !== "UNREVIEWED_MODEL_TRANSCRIPTS" ||
        data.wordTimestampsVerified !== false ||
        data.durationSeconds !== 60 ||
        !Array.isArray(data.clips) || data.clips.length !== 4 ||
        !data.modelMetrics || !Array.isArray(data.waveform) ||
        data.audioFile !== "comparison-audio.mp3") {
      throw Error("The comparison source is incomplete or has an unexpected revision.");
    }
    for (let i = 0; i < 4; i++) {
      const clip = data.clips[i];
      if (clip.index !== i || clip.id !== "clip0" + i ||
          clip.timelineStart !== i * 15 || clip.timelineEnd !== (i+1)*15 ||
          typeof clip.singlish !== "string" || typeof clip.coats !== "string" ||
          !Number.isFinite(clip.sourcePartOffsetSeconds)) {
        throw Error("Clip source boundaries do not match the comparison contract.");
      }
    }
    dataset = data;
    const small = data.modelMetrics["singlish-small"];
    const coats = data.modelMetrics["coats-large-v2"];
    if (!small || !coats || small.inferenceSeconds <= 0 || coats.inferenceSeconds <= 0) {
      throw Error("The model timing comparison is unavailable.");
    }
    $("heroRatio").replaceChildren(document.createTextNode((coats.inferenceSeconds / small.inferenceSeconds).toFixed(1)),
      node("span", "", "×"));
    $("metricInference").textContent = small.inferenceSeconds.toFixed(1) + " / " + coats.inferenceSeconds.toFixed(1);
    $("smallTime").textContent = small.inferenceSeconds.toFixed(2) + "s";
    $("coatsTime").textContent = coats.inferenceSeconds.toFixed(2) + "s";
    $("smallRevision").textContent = "revision " + small.revision.slice(0,9);
    $("coatsRevision").textContent = "revision " + coats.revision.slice(0,9);
    const maximum = Math.max(small.inferenceSeconds, coats.inferenceSeconds);
    $("smallBar").style.width = (100 * small.inferenceSeconds / maximum) + "%";
    $("coatsBar").style.width = (100 * coats.inferenceSeconds / maximum) + "%";
    $("provenance").textContent = "SOURCE SESSION " + data.sourceSession +
      " · SOURCE PART SHA-256 " + data.sourcePartSha256.slice(0,20) + "… " +
      " · DATASET MANIFEST " + data.manifestSha256.slice(0,20) + "… " +
      " · MODEL REVISIONS " + small.revision.slice(0,12) + " / " + coats.revision.slice(0,12);
    for (const clip of data.clips) {
      buildMoment(clip);
      buildRow("small", clip);
      buildRow("coats", clip);
    }
    player.src = data.audioFile;
    player.load();
    seekSlider.max = String(data.durationSeconds);
    seekSlider.disabled = false;
    playButton.disabled = false;
    status.textContent = "Ready · four source clips / 60 seconds";
    updatePlayback();
  }
  async function init() {
    wire();
    try {
      const response = await fetch("comparison.json", {cache: "no-store"});
      if (!response.ok) throw Error("Could not read comparison data (" + response.status + ").");
      const data = await response.json();
      loadData(data);
    } catch (error) {
      status.textContent = "Comparison temporarily unavailable: " + String(error.message || error);
      $("smallScroll").appendChild(node("p", "chunk-text", "Transcript data could not be loaded."));
      $("coatsScroll").appendChild(node("p", "chunk-text", "Transcript data could not be loaded."));
      console.error("Human LAIer comparison source error", error);
    }
  }
  init();
})();
