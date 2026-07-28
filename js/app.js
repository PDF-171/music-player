/* =========================================================
   WAMOYO MUSIC — app.js
   Vanilla JS music player: loads data/songs.json + LRC lyrics,
   renders the UI, and drives the <audio> element.
   ========================================================= */

(() => {
  'use strict';

  /* ---------- Fallback data ----------
     Used only if fetch() is blocked (e.g. opening index.html
     directly as a file:// URL instead of via a local server). */
  const FALLBACK_SONGS = [
    { id:1, title:"Wamoyo Wangu", artist:"Khris", album:"Wamoyo", genre:"Afro Soul / R&B", year:2024, cover:"assets/images/covers/wamoyo-wangu.jpg", audio:"assets/music/wamoyo-wangu.mp3", lyrics:"lyrics/wamoyo-wangu.lrc", duration:"4:21" },
    { id:2, title:"Sunset", artist:"Khris", album:"Sunset Diaries", genre:"Afro Soul / R&B", year:2024, cover:"assets/images/covers/sunset.jpg", audio:"assets/music/sunset.mp3", lyrics:"lyrics/sunset.lrc", duration:"3:45" },
    { id:3, title:"My Everything", artist:"Khris", album:"My Everything", genre:"Afro Soul / R&B", year:2023, cover:"assets/images/covers/my-everything.jpg", audio:"assets/music/my-everything.mp3", lyrics:"lyrics/my-everything.lrc", duration:"3:50" },
    { id:4, title:"Dream With Me", artist:"Khris", album:"Dreamscape", genre:"Afro Soul / R&B", year:2023, cover:"assets/images/covers/dream-with-me.jpg", audio:"assets/music/dream-with-me.mp3", lyrics:"lyrics/dream-with-me.lrc", duration:"4:02" },
    { id:5, title:"Forever Love", artist:"Khris", album:"Timeless", genre:"Afro Soul / R&B", year:2022, cover:"assets/images/covers/forever-love.jpg", audio:"assets/music/forever-love.mp3", lyrics:"lyrics/forever-love.lrc", duration:"4:18" },
    { id:6, title:"You & I", artist:"Khris", album:"You & I", genre:"Afro Soul / R&B", year:2022, cover:"assets/images/covers/you-and-i.jpg", audio:"assets/music/you-and-i.mp3", lyrics:"lyrics/you-and-i.lrc", duration:"3:33" }
  ];

  const PLAYLISTS = [
    { name: "My Favorites", count: 24 },
    { name: "Afro Soul Vibes", count: 18 },
    { name: "Chill & Relax", count: 30 },
    { name: "Romantic Mix", count: 15 }
  ];

  /* ---------- State ---------- */
  const state = {
    songs: [],
    filtered: [],
    currentIndex: 0,
    liked: new Set(),
    shuffle: false,
    repeat: false, // false -> "off" ; true -> "repeat all"; 'one' -> repeat one
    lyricsCache: {},
    lyricsLines: [],
    activeLyricIndex: -1,
    isSeeking: false
  };

  /* ---------- DOM refs ---------- */
  const $ = (sel) => document.querySelector(sel);
  const audioEl        = $('#audioEl');
  const songListEl     = $('#songList');
  const playlistListEl = $('#playlistList');
  const searchInput    = $('#searchInput');

  const npCover = $('#npCover'), npTitle = $('#npTitle'), npArtist = $('#npArtist');
  const npDuration = $('#npDuration'), npYear = $('#npYear'), npGenre = $('#npGenre');
  const mainPlayBtn = $('#mainPlayBtn'), mainPlayIcon = $('#mainPlayIcon'), mainPlayLabel = $('#mainPlayLabel');
  const likeBtn = $('#likeBtn');

  const pbCover = $('#pbCover'), pbTitle = $('#pbTitle'), pbArtist = $('#pbArtist'), pbLikeBtn = $('#pbLikeBtn');
  const pbPlayBtn = $('#pbPlayBtn'), pbPlayIcon = $('#pbPlayIcon');
  const prevBtn = $('#prevBtn'), nextBtn = $('#nextBtn'), shuffleBtn = $('#shuffleBtn'), repeatBtn = $('#repeatBtn');
  const seekBar = $('#seekBar'), pbCurrentTime = $('#pbCurrentTime'), pbDuration = $('#pbDuration');
  const volumeBar = $('#volumeBar'), muteBtn = $('#muteBtn'), volIcon = $('#volIcon');

  const lyricsScroll = $('#lyricsScroll'), detailsList = $('#detailsList');
  const panelTabs = document.querySelectorAll('.panel-tab');
  const lyricsPanel = $('#lyricsPanel'), detailsPanel = $('#detailsPanel');

  const themeToggle = $('#themeToggle'), themeIcon = $('#themeIcon');

  /* ---------- Helpers ---------- */
  const fmtTime = (secs) => {
    if (!isFinite(secs) || secs < 0) secs = 0;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const durationToSeconds = (d) => {
    const [m, s] = d.split(':').map(Number);
    return m * 60 + s;
  };

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    return res.json();
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    return res.text();
  }

  /* ---------- LRC parsing ---------- */
  function parseLRC(text) {
    const lines = text.split(/\r?\n/);
    const out = [];
    const timeRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]/g;
    for (const line of lines) {
      const matches = [...line.matchAll(timeRe)];
      if (!matches.length) continue;
      const textPart = line.replace(timeRe, '').trim();
      for (const m of matches) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
        const time = min * 60 + sec + ms / 1000;
        out.push({ time, text: textPart || '♪' });
      }
    }
    out.sort((a, b) => a.time - b.time);
    return out;
  }

  async function loadLyricsFor(song) {
    if (state.lyricsCache[song.id]) return state.lyricsCache[song.id];
    try {
      const raw = await fetchText(song.lyrics);
      const parsed = parseLRC(raw);
      state.lyricsCache[song.id] = parsed;
      return parsed;
    } catch (e) {
      state.lyricsCache[song.id] = [];
      return [];
    }
  }

  function renderLyrics(lines) {
    if (!lines.length) {
      lyricsScroll.innerHTML = `<p class="lyrics-empty">No synced lyrics available for this song yet.</p>`;
      return;
    }
    lyricsScroll.innerHTML = lines.map((l, i) => `
      <p class="lyric-line" data-index="${i}">
        <span class="lyric-time">${fmtTime(l.time)}</span>${escapeHTML(l.text)}
      </p>
    `).join('');
    state.lyricsLines = lines;
    state.activeLyricIndex = -1;
  }

  function updateLyricsHighlight(currentTime) {
    if (!state.lyricsLines.length) return;
    let idx = -1;
    for (let i = 0; i < state.lyricsLines.length; i++) {
      if (state.lyricsLines[i].time <= currentTime) idx = i;
      else break;
    }
    if (idx === state.activeLyricIndex) return;
    state.activeLyricIndex = idx;
    const nodes = lyricsScroll.querySelectorAll('.lyric-line');
    nodes.forEach((n, i) => {
      n.classList.toggle('active', i === idx);
      n.classList.toggle('passed', i < idx);
    });
    if (idx >= 0 && nodes[idx]) {
      nodes[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------- Rendering: playlists ---------- */
  function renderPlaylists() {
    playlistListEl.innerHTML = PLAYLISTS.map((p, i) => `
      <div class="playlist-item" data-index="${i}">
        <img src="${state.songs[i % state.songs.length]?.cover || ''}" alt="">
        <div class="playlist-item-text">
          <span class="pname">${escapeHTML(p.name)}</span>
          <span class="pcount">${p.count} songs</span>
        </div>
      </div>
    `).join('');
  }

  /* ---------- Rendering: song list ---------- */
  function renderSongList() {
    const list = state.filtered;
    if (!list.length) {
      songListEl.innerHTML = `<p class="lyrics-empty" style="padding:20px 12px;">No songs match your search.</p>`;
      return;
    }
    songListEl.innerHTML = list.map((song) => {
      const realIndex = state.songs.indexOf(song);
      const isPlaying = realIndex === state.currentIndex;
      const liked = state.liked.has(song.id);
      return `
        <div class="song-row song-row--item ${isPlaying ? 'playing' : ''}" data-index="${realIndex}">
          <span class="col-idx">
            ${isPlaying ? `<span class="eq-bars"><span></span><span></span><span></span></span>` : `<span class="row-number">${realIndex + 1}</span>`}
          </span>
          <span class="song-title-cell">
            <img src="${song.cover}" alt="">
            <span class="song-text">
              <span class="stitle">${escapeHTML(song.title)}</span>
              <span class="sartist">${escapeHTML(song.artist)}</span>
            </span>
          </span>
          <span class="col-album">${escapeHTML(song.album)}</span>
          <span class="col-time">
            <button class="row-like ${liked ? 'liked' : ''}" data-like="${song.id}" aria-label="Like">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.4-9.4-8.8C1.2 8 2.6 5 6 4.6c2-.2 3.6.9 4.6 2.6C11.6 5.5 13.2 4.4 15.2 4.6c3.4.4 4.8 3.4 3.4 6.6C16.2 15.6 12 20 12 20z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
            </button>
            <span>${song.duration}</span>
            <button class="row-more" aria-label="More">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
            </button>
          </span>
        </div>
      `;
    }).join('');
  }

  /* ---------- Rendering: details tab ---------- */
  function renderDetails(song) {
    detailsList.innerHTML = `
      <div class="drow"><span class="dt">Title</span><span class="dd">${escapeHTML(song.title)}</span></div>
      <div class="drow"><span class="dt">Artist</span><span class="dd">${escapeHTML(song.artist)}</span></div>
      <div class="drow"><span class="dt">Album</span><span class="dd">${escapeHTML(song.album)}</span></div>
      <div class="drow"><span class="dt">Genre</span><span class="dd">${escapeHTML(song.genre)}</span></div>
      <div class="drow"><span class="dt">Year</span><span class="dd">${song.year}</span></div>
      <div class="drow"><span class="dt">Duration</span><span class="dd">${song.duration}</span></div>
    `;
  }

  /* ---------- Core: load + play a song ---------- */
  async function loadSong(index, autoplay) {
    if (!state.songs.length) return;
    index = ((index % state.songs.length) + state.songs.length) % state.songs.length;
    state.currentIndex = index;
    const song = state.songs[index];

    npCover.src = song.cover; pbCover.src = song.cover;
    npTitle.textContent = song.title; npArtist.textContent = song.artist;
    npDuration.textContent = song.duration; npYear.textContent = song.year; npGenre.textContent = song.genre;
    pbTitle.textContent = song.title; pbArtist.textContent = song.artist;
    document.title = `${song.title} · ${song.artist} — Wamoyo Music`;

    const liked = state.liked.has(song.id);
    likeBtn.classList.toggle('liked', liked);
    pbLikeBtn.classList.toggle('liked', liked);

    renderDetails(song);
    renderSongList();

    audioEl.src = song.audio;
    seekBar.value = 0;
    pbCurrentTime.textContent = '0:00';
    pbDuration.textContent = song.duration;

    const lines = await loadLyricsFor(song);
    renderLyrics(lines);

    if (autoplay) {
      try { await audioEl.play(); } catch (e) { /* autoplay may be blocked */ }
    }
    updatePlayButtons();
  }

  function updatePlayButtons() {
    const playing = !audioEl.paused && !audioEl.ended;
    mainPlayLabel.textContent = playing ? 'Pause' : 'Play';
    mainPlayIcon.innerHTML = playing
      ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
      : '<path d="M8 5v14l11-7z"/>';
    pbPlayIcon.innerHTML = playing
      ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }

  function togglePlay() {
    if (audioEl.paused) audioEl.play().catch(()=>{});
    else audioEl.pause();
  }

  function playNext(userInitiated) {
    if (state.shuffle && state.songs.length > 1) {
      let next;
      do { next = Math.floor(Math.random() * state.songs.length); }
      while (next === state.currentIndex);
      loadSong(next, true);
    } else {
      const atEnd = state.currentIndex === state.songs.length - 1;
      if (atEnd && !state.repeat && !userInitiated) return; // stop at end of list
      loadSong(state.currentIndex + 1, true);
    }
  }

  function playPrev() {
    if (audioEl.currentTime > 3) { audioEl.currentTime = 0; return; }
    loadSong(state.currentIndex - 1, true);
  }

  /* ---------- Search / filter ---------- */
  function applyFilter(query) {
    const q = query.trim().toLowerCase();
    state.filtered = !q ? [...state.songs] : state.songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.album.toLowerCase().includes(q)
    );
    renderSongList();
  }

  /* ---------- Event wiring ---------- */
  function wireEvents() {
    songListEl.addEventListener('click', (e) => {
      const likeBtnEl = e.target.closest('[data-like]');
      if (likeBtnEl) {
        e.stopPropagation();
        const id = Number(likeBtnEl.dataset.like);
        toggleLike(id);
        return;
      }
      const row = e.target.closest('.song-row--item');
      if (row) {
        const idx = Number(row.dataset.index);
        if (idx === state.currentIndex) { togglePlay(); }
        else loadSong(idx, true);
      }
    });

    mainPlayBtn.addEventListener('click', togglePlay);
    pbPlayBtn.addEventListener('click', togglePlay);
    nextBtn.addEventListener('click', () => playNext(true));
    prevBtn.addEventListener('click', playPrev);

    shuffleBtn.addEventListener('click', () => {
      state.shuffle = !state.shuffle;
      shuffleBtn.classList.toggle('active-toggle', state.shuffle);
    });
    repeatBtn.addEventListener('click', () => {
      state.repeat = !state.repeat;
      repeatBtn.classList.toggle('active-toggle', state.repeat);
    });

    likeBtn.addEventListener('click', () => toggleLike(state.songs[state.currentIndex].id));
    pbLikeBtn.addEventListener('click', () => toggleLike(state.songs[state.currentIndex].id));

    audioEl.addEventListener('timeupdate', () => {
      if (state.isSeeking) return;
      const dur = audioEl.duration || durationToSeconds(state.songs[state.currentIndex].duration);
      seekBar.value = dur ? (audioEl.currentTime / dur) * 100 : 0;
      pbCurrentTime.textContent = fmtTime(audioEl.currentTime);
      updateLyricsHighlight(audioEl.currentTime);
    });
    audioEl.addEventListener('loadedmetadata', () => {
      pbDuration.textContent = fmtTime(audioEl.duration);
    });
    audioEl.addEventListener('play', updatePlayButtons);
    audioEl.addEventListener('pause', updatePlayButtons);
    audioEl.addEventListener('ended', () => {
      if (state.repeat === 'one') { audioEl.currentTime = 0; audioEl.play(); return; }
      playNext(false);
    });

    seekBar.addEventListener('input', () => { state.isSeeking = true; });
    seekBar.addEventListener('change', () => {
      const dur = audioEl.duration || durationToSeconds(state.songs[state.currentIndex].duration);
      audioEl.currentTime = (seekBar.value / 100) * dur;
      state.isSeeking = false;
    });

    volumeBar.addEventListener('input', () => {
      audioEl.volume = volumeBar.value / 100;
      updateVolumeIcon();
    });
    muteBtn.addEventListener('click', () => {
      audioEl.muted = !audioEl.muted;
      updateVolumeIcon();
    });

    searchInput.addEventListener('input', () => applyFilter(searchInput.value));

    panelTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        panelTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isLyrics = tab.dataset.tab === 'lyrics';
        lyricsPanel.classList.toggle('panel-body--hidden', !isLyrics);
        detailsPanel.classList.toggle('panel-body--hidden', isLyrics);
      });
    });

    themeToggle.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight' && e.shiftKey) playNext(true);
      if (e.code === 'ArrowLeft' && e.shiftKey) playPrev();
    });
  }

  function updateVolumeIcon() {
    const muted = audioEl.muted || Number(volumeBar.value) === 0;
    volIcon.innerHTML = muted
      ? '<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 9l5 6M20 9l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
      : '<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 9a4.2 4.2 0 010 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  }

  function toggleLike(id) {
    if (state.liked.has(id)) state.liked.delete(id);
    else state.liked.add(id);
    const isCurrent = state.songs[state.currentIndex].id === id;
    if (isCurrent) {
      likeBtn.classList.toggle('liked', state.liked.has(id));
      pbLikeBtn.classList.toggle('liked', state.liked.has(id));
    }
    renderSongList();
  }

  /* ---------- Init ---------- */
  async function init() {
    try {
      state.songs = await fetchJSON('data/songs.json');
    } catch (e) {
      state.songs = FALLBACK_SONGS;
    }
    state.filtered = [...state.songs];

    renderPlaylists();
    renderSongList();
    wireEvents();
    audioEl.volume = volumeBar.value / 100;

    await loadSong(0, false);
  }

  init();
})();
