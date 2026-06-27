/**
 * TTS 语音播报模块
 * 包含流式 TTS、Web Speech API、Toast 提示等功能
 */
 
import { CONFIG } from './config.js?v=55';
import { stripMarkdown } from './utils.js?v=55';

export var _currentSpeakBtn = null;
export var _streamTTS = null;
 
// ================================================================
// Toast 提示
// ================================================================
 
var _toastTimer = null;
 
export function showToast(msg, duration) {
  var toast = document.getElementById("ttsToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ttsToast";
    toast.className = "tts-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  if (_toastTimer) clearTimeout(_toastTimer);
  if (duration) {
    _toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, duration);
  }
  return toast;
}
 
export function hideToast() {
  var toast = document.getElementById("ttsToast");
  if (toast) toast.classList.remove("show");
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
}
 
// ================================================================
// TTS 检测
// ================================================================
 
export function isWeChatBrowser() {
  try {
    var ua = (navigator.userAgent || "").toLowerCase();
    return ua.indexOf("micromessenger") !== -1;
  } catch (e) { return false; }
}
 
export function hasTTSAPI() {
  return typeof window.speechSynthesis !== "undefined" &&
         typeof window.SpeechSynthesisUtterance !== "undefined";
}
 
export function hasWorkerTTS() {
  return !!CONFIG.TTS_WORKER_URL;
}
 
export function showTTSUnavailable() {
  if (isWeChatBrowser()) {
    showToast("微信内暂不支持语音播报，请点右上角「···」→「在浏览器打开」，用系统浏览器打开后即可朗读");
  } else {
    showToast("当前浏览器不支持语音播报，可长按消息复制文字");
  }
}
 
// ================================================================
// 中文语音初始化
// ================================================================
 
var _zhVoice = null;
var _voicesReady = false;
 
export function initVoices() {
  if (!hasTTSAPI()) return;
  var synth = window.speechSynthesis;
  function loadVoices() {
    try {
      var voices = synth.getVoices() || [];
      if (voices.length === 0) return;
      _voicesReady = true;
      for (var i = 0; i < voices.length; i++) {
        var lang = (voices[i].lang || "").toLowerCase();
        if (lang.indexOf("zh") === 0 || lang.indexOf("cmn") === 0) {
          _zhVoice = voices[i];
          break;
        }
      }
    } catch (e) {}
  }
  loadVoices();
  try {
    if (synth.addEventListener) {
      synth.addEventListener("voiceschanged", loadVoices);
    } else if ("onvoiceschanged" in synth) {
      synth.onvoiceschanged = loadVoices;
    }
  } catch (e) {}
}
 
// ================================================================
// 流式 TTS
// ================================================================
 
export function initStreamTTS() {
  _streamTTS = {
    segments: [],
    synthesizedBlobs: [],
    currentPlayIndex: 0,
    isPlaying: false,
    isPaused: false,
    isStopped: false,
    btnEl: null,
    totalSegments: 0,
    allReceived: false,
    audioEl: null,
    abortControllers: [],
  };
}
 
export function resetStreamTTS() {
  if (!_streamTTS) return;
  _streamTTS.segments = [];
  _streamTTS.synthesizedBlobs = [];
  _streamTTS.currentPlayIndex = 0;
  _streamTTS.isPlaying = false;
  _streamTTS.isPaused = false;
  _streamTTS.isStopped = false;
  _streamTTS.btnEl = null;
  _streamTTS.totalSegments = 0;
  _streamTTS.allReceived = false;
  if (_streamTTS.audioEl) {
    try { _streamTTS.audioEl.pause(); _streamTTS.audioEl.src = ''; } catch (e) {}
    _streamTTS.audioEl = null;
  }
  for (var i = 0; i < _streamTTS.abortControllers.length; i++) {
    try { _streamTTS.abortControllers[i].abort(); } catch (e) {}
  }
  _streamTTS.abortControllers = [];
  document.querySelectorAll('.speak-btn.is-speaking, .speak-btn.is-paused').forEach(function (b) {
    b.classList.remove('is-speaking', 'is-paused');
  });
  _currentSpeakBtn = null;
  _synthesisQueue = null;
  hideToast();
  updateHeaderPlayBtn();
}
 
export function updateHeaderPlayBtn() {
  var btn = document.getElementById('chatAutoPlayBtn');
  if (!btn) return;
  var iconSpan = btn.querySelector('.auto-play-icon');
  if (_streamTTS && _streamTTS.isPlaying) {
    btn.classList.add('is-active');
    btn.title = '暂停播报';
    if (iconSpan) iconSpan.textContent = '⏸';
  } else if (_streamTTS && _streamTTS.isPaused) {
    btn.classList.add('is-active');
    btn.title = '继续播报';
    if (iconSpan) iconSpan.textContent = '▶';
  } else {
    btn.classList.remove('is-active');
    btn.title = '语音播报';
    if (iconSpan) iconSpan.textContent = '🔊';
  }
}
 
export function updateBubblePlayBtn(btnEl, state) {
  if (!btnEl) return;
  btnEl.classList.remove('is-speaking', 'is-paused');
  if (state === 'playing') {
    btnEl.classList.add('is-speaking');
    btnEl.innerHTML = '⏸';
    btnEl.title = '暂停';
  } else if (state === 'paused') {
    btnEl.classList.add('is-paused');
    btnEl.innerHTML = '▶';
    btnEl.title = '继续';
  } else {
    btnEl.innerHTML = '🔊';
    btnEl.title = '朗读';
  }
}
 
export function pauseStreamTTS() {
  if (_streamTTS && _streamTTS.audioEl) {
    try { _streamTTS.audioEl.pause(); } catch (e) {}
  }
  if (_streamTTS) {
    _streamTTS.isPaused = true;
    _streamTTS.isPlaying = false;
    updateBubblePlayBtn(_streamTTS.btnEl, 'paused');
    updateHeaderPlayBtn();
  }
}
 
export function resumeStreamTTS() {
  if (_streamTTS) {
    _streamTTS.isPaused = false;
    _streamTTS.isPlaying = true;
    if (_streamTTS.audioEl) {
      _streamTTS.audioEl.play().catch(function (e) {
        console.error('[StreamTTS] 恢复播放失败：', e);
      });
    }
    updateBubblePlayBtn(_streamTTS.btnEl, 'playing');
    updateHeaderPlayBtn();
  }
}
 
export function stopStreamTTS() {
  if (!_streamTTS) return;
  _streamTTS.isStopped = true;
  _streamTTS.isPaused = false;
  for (var i = 0; i < _streamTTS.abortControllers.length; i++) {
    try { _streamTTS.abortControllers[i].abort(); } catch (e) {}
  }
  if (_streamTTS.audioEl) {
    try { _streamTTS.audioEl.pause(); } catch (e) {}
  }
  updateBubblePlayBtn(_streamTTS.btnEl, 'stopped');
  _currentSpeakBtn = null;
  updateHeaderPlayBtn();
  hideToast();
}
 
// ================================================================
// 文本分段
// ================================================================
 
export function splitTextIntoSegments(text) {
  if (!text) return [];
  var cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
 
  var segments = [];
  var current = '';
  var MIN_SEG_LEN = 20;
  var MAX_SEG_LEN = 100;
  var STRONG_ENDING_MIN_LEN = 8;
  var sentenceEndings = ['。', '！', '？', '!', '?', '；', ';', '，', ','];
  var strongEndings = ['。', '！', '？', '!', '?'];
 
  function isStrongEnding(ch) {
    for (var k = 0; k < strongEndings.length; k++) {
      if (ch === strongEndings[k]) return true;
    }
    return false;
  }
 
  for (var i = 0; i < cleaned.length; i++) {
    var ch = cleaned[i];
    current += ch;
 
    var isSentenceEnd = false;
    for (var j = 0; j < sentenceEndings.length; j++) {
      if (ch === sentenceEndings[j]) {
        isSentenceEnd = true;
        break;
      }
    }
 
    if (isSentenceEnd) {
      var curLen = current.trim().length;
      var canSplit = false;
      if (curLen >= MIN_SEG_LEN) {
        canSplit = true;
      } else if (curLen >= STRONG_ENDING_MIN_LEN && isStrongEnding(ch)) {
        canSplit = true;
      }
      if (canSplit) {
        segments.push(current.trim());
        current = '';
      }
    }
 
    if (current.length >= MAX_SEG_LEN) {
      var trimmed = current.trim();
      if (trimmed) {
        segments.push(trimmed);
      }
      current = '';
    }
  }
 
  var tail = current.trim();
  if (tail && tail.length >= 5) {
    segments.push(tail);
  }
 
  return segments;
}
 
// ================================================================
// 合成与播放
// ================================================================
 
function synthesizeSegmentWorker(text, index) {
  return new Promise(function (resolve, reject) {
    if (_streamTTS.isStopped) { reject(new Error('stopped')); return; }
 
    var ac = new AbortController();
    _streamTTS.abortControllers.push(ac);
 
    var MAX_RETRIES = 2;
    var retryDelay = 1000;
 
    function attempt(attemptNum) {
      if (_streamTTS.isStopped) { reject(new Error('stopped')); return; }
 
      var tid = setTimeout(function () { ac.abort(); }, 15000);
 
      fetch(CONFIG.TTS_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        signal: ac.signal,
        body: JSON.stringify({
          text: text,
          voice: 'zh-CN-YunxiNeural',
          rate: 0,
          pitch: 0,
          format: 'audio-24khz-48kbitrate-mono-mp3',
        }),
      }).then(function (resp) {
        clearTimeout(tid);
        if (_streamTTS.isStopped) { reject(new Error('stopped')); return; }
        if (!resp.ok) {
          return resp.text().then(function (errText) {
            console.error('[StreamTTS] 第' + index + '段合成失败：', resp.status, errText);
            throw new Error('HTTP ' + resp.status);
          }).catch(function (e) {
            if (e.name === 'Error') throw e;
            throw new Error('HTTP ' + resp.status);
          });
        }
        return resp.blob();
      }).then(function (blob) {
        if (_streamTTS.isStopped) { reject(new Error('stopped')); return; }
        if (!blob || blob.size === 0) throw new Error('空音频');
        console.log('[StreamTTS] 第' + index + '段合成完成，' + blob.size + '字节');
        resolve({ index: index, blob: blob });
      }).catch(function (err) {
        clearTimeout(tid);
        if (_streamTTS.isStopped) { reject(new Error('stopped')); return; }
        if (err.name === 'AbortError') { reject(new Error('stopped')); return; }
        if (attemptNum < MAX_RETRIES) {
          setTimeout(function () { attempt(attemptNum + 1); }, retryDelay * attemptNum);
        } else {
          reject(err);
        }
      });
    }
 
    attempt(1);
  });
}
 
function playNextSegment() {
  if (_streamTTS.isStopped) return;
  if (_streamTTS.isPaused) return;
 
  var idx = _streamTTS.currentPlayIndex;
  var blob = _streamTTS.synthesizedBlobs[idx];
 
  if (!blob) {
    if (_streamTTS.allReceived && idx >= _streamTTS.totalSegments) {
      updateBubblePlayBtn(_streamTTS.btnEl, 'stopped');
      _currentSpeakBtn = null;
      hideToast();
      _streamTTS.isPlaying = false;
      updateHeaderPlayBtn();
    }
    return;
  }
 
  _streamTTS.isPlaying = true;
  updateBubblePlayBtn(_streamTTS.btnEl, 'playing');
  updateHeaderPlayBtn();
 
  var url = URL.createObjectURL(blob);
  if (!_streamTTS.audioEl) {
    _streamTTS.audioEl = new Audio();
    _streamTTS.audioEl.addEventListener('ended', function () {
      URL.revokeObjectURL(url);
      _streamTTS.currentPlayIndex++;
      playNextSegment();
    });
    _streamTTS.audioEl.addEventListener('error', function () {
      console.error('[StreamTTS] 播放失败');
      _streamTTS.currentPlayIndex++;
      playNextSegment();
    });
  }
  _streamTTS.audioEl.src = url;
  _streamTTS.audioEl.play().catch(function (e) {
    console.error('[StreamTTS] 播放错误：', e);
    _streamTTS.currentPlayIndex++;
    playNextSegment();
  });
}
 
var _synthesisQueue = null;
 
function startSynthesisQueue() {
  var MAX_CONCURRENT = 2;
  var activeCount = 0;
  var nextIndex = 0;
  var waitingForMore = false;
 
  function processOne() {
    if (_streamTTS.isStopped) return;
    if (_streamTTS.segments.length === 0) {
      if (_streamTTS.allReceived) return;
      if (!waitingForMore) {
        waitingForMore = true;
        setTimeout(function () {
          waitingForMore = false;
          tryFill();
        }, 200);
      }
      return;
    }
 
    var seg = _streamTTS.segments.shift();
    var idx = nextIndex++;
    _streamTTS.synthesizedBlobs.push(null);
    activeCount++;
 
    synthesizeSegmentWorker(seg, idx).then(function (result) {
      if (_streamTTS.isStopped) return;
      _streamTTS.synthesizedBlobs[result.index] = result.blob;
      console.log('[StreamTTS] 第' + result.index + '段就绪');
 
      var curIdx = _streamTTS.currentPlayIndex;
      var curBlob = _streamTTS.synthesizedBlobs[curIdx];
 
      if (!_streamTTS.isPlaying) {
        if (curBlob) {
          _streamTTS.isPlaying = true;
          hideToast();
          playNextSegment();
        } else if (result.index === curIdx) {
          _streamTTS.isPlaying = true;
          hideToast();
          playNextSegment();
        }
      } else if (result.index === curIdx) {
        playNextSegment();
      }
    }).catch(function (err) {
      if (err.message === 'stopped') return;
      console.error('[StreamTTS] 合成失败：', err);
      _streamTTS.synthesizedBlobs[idx] = null;
 
      if (_streamTTS.isPlaying && idx === _streamTTS.currentPlayIndex) {
        skipToNextAvailable();
      } else if (!_streamTTS.isPlaying && idx === _streamTTS.currentPlayIndex) {
        skipToNextAvailable();
      }
    }).then(function () {
      activeCount--;
      tryFill();
    });
  }
 
  function skipToNextAvailable() {
    var idx = _streamTTS.currentPlayIndex;
    var total = _streamTTS.totalSegments || 0;
    var found = false;
    while (idx < total || !_streamTTS.allReceived) {
      var blob = _streamTTS.synthesizedBlobs[idx];
      if (blob) {
        _streamTTS.currentPlayIndex = idx;
        _streamTTS.isPlaying = true;
        hideToast();
        found = true;
        playNextSegment();
        break;
      }
      if (blob === null && _streamTTS.synthesizedBlobs.hasOwnProperty(idx)) {
        idx++;
        continue;
      }
      break;
    }
    if (!found && _streamTTS.allReceived) {
      updateBubblePlayBtn(_streamTTS.btnEl, 'stopped');
      _currentSpeakBtn = null;
      hideToast();
      _streamTTS.isPlaying = false;
      updateHeaderPlayBtn();
    }
  }
 
  function tryFill() {
    if (_streamTTS.isStopped) return;
    waitingForMore = false;
    while (activeCount < MAX_CONCURRENT) {
      if (_streamTTS.segments.length === 0 && !_streamTTS.allReceived) {
        if (!waitingForMore) {
          waitingForMore = true;
          setTimeout(function () {
            waitingForMore = false;
            tryFill();
          }, 200);
        }
        break;
      }
      if (_streamTTS.segments.length === 0 && _streamTTS.allReceived) break;
      processOne();
    }
  }
 
  _synthesisQueue = { tryFill: tryFill };
  tryFill();
}
 
function wakeSynthesisQueue() {
  if (_synthesisQueue && _synthesisQueue.tryFill) {
    _synthesisQueue.tryFill();
  }
}
 
// ================================================================
// 导出给外部调用的 TTS 函数
// ================================================================
 
export function streamSpeakWorker(text, btnEl) {
  stopAllSpeak();
  resetStreamTTS();
  _streamTTS.btnEl = btnEl;
  if (btnEl) {
    updateBubblePlayBtn(btnEl, 'playing');
    _currentSpeakBtn = btnEl;
  }
 
  var plainText = stripMarkdown(text);
  var segments = splitTextIntoSegments(plainText);
  if (segments.length === 0) return;
 
  _streamTTS.totalSegments = segments.length;
  _streamTTS.allReceived = true;
  _streamTTS.segments = segments;
 
  showToast('正在合成语音...');
  startSynthesisQueue();
}
 
export function getStreamTTSState() {
  if (!_streamTTS) return null;
  return {
    isPlaying: _streamTTS.isPlaying,
    isPaused: _streamTTS.isPaused,
    isStopped: _streamTTS.isStopped,
  };
}
 
export function stopAllSpeak() {
  stopStreamTTS();
  if (hasTTSAPI()) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  if (_ttsAudio) {
    try { _ttsAudio.pause(); _ttsAudio.currentTime = 0; } catch (e) {}
  }
  document.querySelectorAll(".speak-btn.is-speaking").forEach(function (b) {
    b.classList.remove("is-speaking");
  });
  _currentSpeakBtn = null;
  hideToast();
}
 
var _ttsAudio = null;
var _ttsVerified = false;
var _ttsBroken = false;
 
export function speakViaWebSpeech(plainText, btnEl) {
  var synth = window.speechSynthesis;
 
  var trimmed = (plainText || "").trim();
  if (!trimmed) return;
  if (trimmed.length > 2000) trimmed = trimmed.slice(0, 2000);
 
  var utter;
  try {
    utter = new SpeechSynthesisUtterance(trimmed);
  } catch (e) { showTTSUnavailable(); return; }
  utter.rate = 1;
  utter.pitch = 1;
  utter.volume = 1;
  utter.lang = "zh-CN";
  if (_zhVoice) utter.voice = _zhVoice;
 
  var started = false;
  var startTimeout = setTimeout(function () {
    if (!started) {
      try { synth.cancel(); } catch (e) {}
      if (btnEl) btnEl.classList.remove("is-speaking");
      if (_currentSpeakBtn === btnEl) _currentSpeakBtn = null;
      _ttsBroken = true;
      showTTSUnavailable();
    }
  }, 1500);
 
  if (btnEl) {
    btnEl.classList.add("is-speaking");
    _currentSpeakBtn = btnEl;
  }
  utter.onstart = function () {
    started = true;
    _ttsVerified = true;
    clearTimeout(startTimeout);
  };
  utter.onend = function () {
    clearTimeout(startTimeout);
    if (btnEl) btnEl.classList.remove("is-speaking");
    if (_currentSpeakBtn === btnEl) _currentSpeakBtn = null;
  };
  utter.onerror = function () {
    clearTimeout(startTimeout);
    if (btnEl) btnEl.classList.remove("is-speaking");
    if (_currentSpeakBtn === btnEl) _currentSpeakBtn = null;
    if (!started) {
      _ttsBroken = true;
      showTTSUnavailable();
    }
  };
 
  try {
    synth.speak(utter);
    if (synth.paused) synth.resume();
  } catch (e) {
    clearTimeout(startTimeout);
    if (btnEl) btnEl.classList.remove("is-speaking");
    _ttsBroken = true;
    showTTSUnavailable();
  }
}
 
export function speakText(plainText, btnEl) {
  if (btnEl && _currentSpeakBtn === btnEl) {
    stopAllSpeak();
    return;
  }
  stopAllSpeak();
 
  var trimmed = (plainText || "").trim();
  if (!trimmed) return;
 
  if (hasWorkerTTS()) {
    streamSpeakWorker(trimmed, btnEl);
    return;
  }
 
  if (!hasTTSAPI()) { showTTSUnavailable(); return; }
  if (_ttsBroken) { showTTSUnavailable(); return; }
  speakViaWebSpeech(trimmed, btnEl);
}
 
// ================================================================
// 朗读按钮挂载
// ================================================================
 
export function attachSpeakButton(bubble, rawText) {
  if (!bubble) return;
  if (!hasWorkerTTS() && !hasTTSAPI()) return;
 
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "speak-btn";
  btn.title = "朗读";
  btn.innerHTML = "🔊";
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
 
    var plain;
    if (typeof rawText === "string" && rawText.length > 0) {
      plain = stripMarkdown(rawText);
    } else {
      plain = bubble.textContent || bubble.innerText || "";
    }
 
    if (_currentSpeakBtn === btn) {
      if (_streamTTS && _streamTTS.isPlaying) {
        pauseStreamTTS();
      } else if (_streamTTS && _streamTTS.isPaused) {
        resumeStreamTTS();
      }
      return;
    }
 
    stopAllSpeak();
    speakText(plain, btn);
  });
  bubble.appendChild(btn);
}
