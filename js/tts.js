/**
 * TTS 语音播报模块
 * 包含流式 TTS、Web Speech API、Toast 提示等功能
 */
 
import { CONFIG } from './config.js?v=1.3.1';
import { stripMarkdown, splitIntoSentences } from './utils.js?v=1.3.1';

export var _currentSpeakBtn = null;
export var _streamTTS = null;
var _currentBubbleEl = null;
var _highlightRAF = null;
var _lastHighlightIdx = -1;

// 句子字数信息缓存：按字数加权映射高亮，避免长短句不同步
// （旧方案按句子数均分进度，长句读完前高亮就跳走，短句读完后高亮停留）
var _charInfoCache = null;

/** 统计有效发音字符数（中文、英文、数字），过滤标点、符号、空白
 *  这些字符在朗读时基本不占时间，计入字数会导致加权比例偏差 */
function countPronouncedChars(str) {
  if (!str) return 0;
  var count = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0x4E00 && c <= 0x9FFF) { count++; continue; }          // 中文
    if (c >= 0x3400 && c <= 0x4DBF) { count++; continue; }          // 中文扩展A
    if (c >= 65 && c <= 90) { count++; continue; }                   // 大写英文
    if (c >= 97 && c <= 122) { count++; continue; }                  // 小写英文
    if (c >= 48 && c <= 57) { count++; continue; }                   // 数字
    if (c >= 0xFF10 && c <= 0xFF19) { count++; continue; }           // 全角数字
    if (c >= 0xFF21 && c <= 0xFF3A) { count++; continue; }           // 全角大写英文
    if (c >= 0xFF41 && c <= 0xFF5A) { count++; continue; }           // 全角小写英文
    // 其他（标点、符号、空白、特殊字符等）不计入
  }
  return count;
}

/** 从 DOM 元素计算有效字数（优先使用 data-tts-chars，确保与 TTS 纯文本侧字数一致） */
function countPronouncedCharsFromEl(el) {
  if (!el) return 0;
  var total = 0;

  function walk(node) {
    if (node.nodeType === 3) {
      total += countPronouncedChars(node.nodeValue || '');
      return;
    }
    if (node.nodeType !== 1) return;
    var elNode = node;
    var ttsChars = elNode.getAttribute && elNode.getAttribute('data-tts-chars');
    if (ttsChars !== null && !isNaN(Number(ttsChars))) {
      total += Number(ttsChars);
      return;
    }
    var children = node.childNodes;
    for (var i = 0; i < children.length; i++) {
      walk(children[i]);
    }
  }

  walk(el);
  return total;
}

/** 计算并缓存每个 TTS 句子的有效字数累计信息
 *  返回 { cumulative: [0, len1, len1+len2, ...], total: 总有效字数 }
 *  缓存键为当前 bubble 引用 + 句子数量，bubble 不变时复用，避免每帧重复遍历 DOM */
function getCharInfo(sentences) {
  if (_charInfoCache &&
      _charInfoCache.bubble === _currentBubbleEl &&
      _charInfoCache.sentenceCount === sentences.length) {
    return _charInfoCache;
  }
  var cumulative = [0];
  var total = 0;
  for (var i = 0; i < sentences.length; i++) {
    var len = countPronouncedCharsFromEl(sentences[i]);
    if (len < 1) len = 1;
    total += len;
    cumulative.push(total);
  }
  _charInfoCache = {
    bubble: _currentBubbleEl,
    sentenceCount: sentences.length,
    cumulative: cumulative,
    total: total
  };
  return _charInfoCache;
}

/** 根据全局进度（0~1）按字数加权定位目标句子索引
 *  长句字数多，占的进度区间大，停留更久，更贴合实际朗读时间 */
function getTargetSentenceByCharProgress(sentences, globalProgress) {
  if (sentences.length === 0) return -1;
  if (sentences.length === 1) return 0;
  var info = getCharInfo(sentences);
  if (info.total <= 0) return 0;
  var targetCharPos = globalProgress * info.total;
  // 在 cumulative 中线性查找目标字符位置落在哪个句子区间
  // （句子数通常几十个以内，线性查找足够）
  var idx = 0;
  for (var i = 0; i < info.cumulative.length - 1; i++) {
    if (targetCharPos < info.cumulative[i + 1]) {
      idx = i;
      break;
    }
    idx = i; // 兜底：到达末尾
  }
  if (idx >= sentences.length) idx = sentences.length - 1;
  if (idx < 0) idx = 0;
  return idx;
}

function getMessageBubble(btnEl) {
  if (!btnEl) return null;
  var bubble = btnEl.closest('.bubble, .bubble-ai, .msg-bubble');
  if (!bubble) {
    bubble = btnEl.closest('.message-ai, .ai-message, .chat-msg-ai');
  }
  return bubble;
}

function getTtsSentences(bubbleEl) {
  if (!bubbleEl) return [];
  var nodes = bubbleEl.querySelectorAll('.tts-sentence');
  return Array.prototype.slice.call(nodes);
}

function clearTtsHighlight() {
  if (_highlightRAF) {
    cancelAnimationFrame(_highlightRAF);
    _highlightRAF = null;
  }
  _lastHighlightIdx = -1;
  _charInfoCache = null; // 清除字数缓存，下次重新计算
  if (!_currentBubbleEl) return;
  var sentences = getTtsSentences(_currentBubbleEl);
  for (var i = 0; i < sentences.length; i++) {
    sentences[i].classList.remove('tts-highlight');
  }
  _currentBubbleEl = null;
}

function applyHighlight(sentences, targetIdx) {
  if (targetIdx === _lastHighlightIdx) return;
  _lastHighlightIdx = targetIdx;
  for (var i = 0; i < sentences.length; i++) {
    sentences[i].classList.remove('tts-highlight');
  }
  if (targetIdx >= 0 && targetIdx < sentences.length) {
    var target = sentences[targetIdx];
    target.classList.add('tts-highlight');
    try {
      var rect = target.getBoundingClientRect();
      var viewTop = window.innerHeight * 0.25;
      var viewBottom = window.innerHeight * 0.75;
      if (rect.top < viewTop || rect.bottom > viewBottom) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {}
  }
}

function getAudioDuration(blob) {
  return new Promise(function (resolve) {
    var audio = new Audio();
    audio.onloadedmetadata = function () {
      resolve(audio.duration || 0);
    };
    audio.onerror = function () {
      resolve(0);
    };
    audio.src = URL.createObjectURL(blob);
  });
}

function highlightTtsSentence(bubbleEl, playIndex, totalSegments) {
  if (!bubbleEl) return;
  var sentences = getTtsSentences(bubbleEl);
  if (sentences.length === 0) return;
  var total = totalSegments || 1;
  var domIndex = Math.floor((playIndex / total) * sentences.length);
  if (domIndex >= sentences.length) domIndex = sentences.length - 1;
  if (domIndex < 0) domIndex = 0;
  applyHighlight(sentences, domIndex);
}
 
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
    segmentSentenceRanges: [],
    totalSentences: 0,
    synthesizedBlobs: [],
    segmentDurations: [],
    segmentTimeRanges: [],
    totalDuration: 0,
    currentPlayIndex: 0,
    currentSegmentStartTime: 0,
    isPlaying: false,
    isPaused: false,
    isStopped: false,
    btnEl: null,
    totalSegments: 0,
    allReceived: false,
    audioEl: null,
    abortControllers: [],
    pendingDurationChecks: 0,
  };
}
 
export function resetStreamTTS() {
  if (!_streamTTS) return;
  _streamTTS.segments = [];
  _streamTTS.segmentSentenceRanges = [];
  _streamTTS.totalSentences = 0;
  _streamTTS.synthesizedBlobs = [];
  _streamTTS.segmentDurations = [];
  _streamTTS.segmentTimeRanges = [];
  _streamTTS.totalDuration = 0;
  _streamTTS.currentPlayIndex = 0;
  _streamTTS.currentSegmentStartTime = 0;
  _streamTTS.isPlaying = false;
  _streamTTS.isPaused = false;
  _streamTTS.isStopped = false;
  _streamTTS.btnEl = null;
  _streamTTS.totalSegments = 0;
  _streamTTS.allReceived = false;
  _streamTTS.pendingDurationChecks = 0;
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
  clearTtsHighlight();
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
    if (_highlightRAF) {
      cancelAnimationFrame(_highlightRAF);
      _highlightRAF = null;
    }
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
      }).then(function () {
        startHighlightSyncLoop();
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
  clearTtsHighlight();
  updateHeaderPlayBtn();
  hideToast();
}
 
// ================================================================
// 文本分段
// ================================================================
 
export function splitTextIntoSentenceSegments(text) {
  if (!text) return { segments: [], sentenceRanges: [], totalSentences: 0 };
  var cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return { segments: [], sentenceRanges: [], totalSentences: 0 };

  var sentences = splitIntoSentences(cleaned);
  if (sentences.length === 0) return { segments: [], sentenceRanges: [], totalSentences: 0 };

  var MIN_SEG_LEN = 20;
  var MAX_SEG_LEN = 120;

  var segments = [];
  var sentenceRanges = [];
  var sentenceCharCounts = [];
  var currentText = '';
  var startSentenceIdx = 0;
  var segCharCounts = [];

  for (var i = 0; i < sentences.length; i++) {
    var sent = sentences[i];
    var sentChars = countPronouncedChars(sent);
    if (sentChars < 1) sentChars = 1;
    sentenceCharCounts.push(sentChars);
    var newLen = currentText.length + sent.length;

    if (currentText.length > 0 && newLen > MAX_SEG_LEN) {
      segments.push(currentText);
      sentenceRanges.push({ start: startSentenceIdx, end: i - 1, charCounts: segCharCounts.slice(), totalChars: currentText.length });
      currentText = sent;
      startSentenceIdx = i;
      segCharCounts = [sentChars];
    } else {
      currentText += sent;
      segCharCounts.push(sentChars);
      if (currentText.length >= MIN_SEG_LEN && sentences.length - i > 1) {
        segments.push(currentText);
        sentenceRanges.push({ start: startSentenceIdx, end: i, charCounts: segCharCounts.slice(), totalChars: currentText.length });
        currentText = '';
        startSentenceIdx = i + 1;
        segCharCounts = [];
      }
    }
  }

  if (currentText.length > 0) {
    segments.push(currentText);
    sentenceRanges.push({ start: startSentenceIdx, end: sentences.length - 1, charCounts: segCharCounts.slice(), totalChars: currentText.length });
  }

  return {
    segments: segments,
    sentenceRanges: sentenceRanges,
    totalSentences: sentences.length,
    sentenceCharCounts: sentenceCharCounts
  };
}

export function splitTextIntoSegments(text) {
  var result = splitTextIntoSentenceSegments(text);
  return result.segments;
}
 
// ================================================================
// 合成与播放
// ================================================================

function updateSegmentTimeRanges() {
  var ranges = [];
  var acc = 0;
  for (var i = 0; i < _streamTTS.segmentDurations.length; i++) {
    var dur = _streamTTS.segmentDurations[i] || 0;
    ranges.push({ start: acc, end: acc + dur, duration: dur });
    acc += dur;
  }
  _streamTTS.segmentTimeRanges = ranges;
  _streamTTS.totalDuration = acc;
}

function estimateRemainingDuration() {
  if (!_streamTTS) return 0;
  var durations = _streamTTS.segmentDurations;
  var totalSegs = _streamTTS.totalSegments;
  var knownDurations = [];
  var knownTotal = 0;
  var knownCount = 0;

  for (var i = 0; i < totalSegs; i++) {
    if (typeof durations[i] === 'number' && durations[i] > 0) {
      knownDurations.push(durations[i]);
      knownTotal += durations[i];
      knownCount++;
    }
  }

  var avgDuration = knownCount > 0 ? knownTotal / knownCount : 3;
  var unknownCount = totalSegs - knownCount;
  return knownTotal + unknownCount * avgDuration;
}

function startHighlightSyncLoop() {
  if (_highlightRAF) {
    cancelAnimationFrame(_highlightRAF);
  }

  function syncHighlight() {
    if (!_streamTTS || _streamTTS.isStopped || _streamTTS.isPaused) {
      _highlightRAF = null;
      return;
    }

    var audioEl = _streamTTS.audioEl;
    if (!audioEl || audioEl.paused) {
      _highlightRAF = requestAnimationFrame(syncHighlight);
      return;
    }

    var sentences = getTtsSentences(_currentBubbleEl);
    if (sentences.length === 0) {
      _highlightRAF = requestAnimationFrame(syncHighlight);
      return;
    }

    var currentTime = audioEl.currentTime || 0;
    var currentIdx = _streamTTS.currentPlayIndex;
    var timeRanges = _streamTTS.segmentTimeRanges;
    var segRanges = _streamTTS.segmentSentenceRanges;
    var totalSegs = _streamTTS.totalSegments;

    var targetSentenceIdx = -1;

    // 段级精确计算：基于已读有效字数定位高亮位置
    // TTS 侧和 DOM 侧都用 countPronouncedChars 统计有效字数，确保两边一致
    if (segRanges && segRanges.length > 0 && currentIdx < segRanges.length) {
      // 1. 累加已播放完的所有段的有效字数
      var totalPlayedChars = 0;
      for (var si = 0; si < currentIdx; si++) {
        if (segRanges[si] && segRanges[si].charCounts) {
          for (var ci = 0; ci < segRanges[si].charCounts.length; ci++) {
            totalPlayedChars += segRanges[si].charCounts[ci];
          }
        }
      }

      // 2. 当前段内按时间比例估算已读字数
      var curSegProgress = 0;
      if (timeRanges && timeRanges[currentIdx] && timeRanges[currentIdx].duration > 0) {
        curSegProgress = currentTime / timeRanges[currentIdx].duration;
      } else {
        curSegProgress = 0.5;
      }
      curSegProgress = Math.max(0, Math.min(0.999, curSegProgress));

      // 3. 当前段内按字数加权计算已读字数
      var curSegCharCounts = segRanges[currentIdx] && segRanges[currentIdx].charCounts ? segRanges[currentIdx].charCounts : [];
      var curSegTotalChars = 0;
      for (var cj = 0; cj < curSegCharCounts.length; cj++) {
        curSegTotalChars += curSegCharCounts[cj];
      }
      var curSegPlayedChars = curSegProgress * curSegTotalChars;
      totalPlayedChars += curSegPlayedChars;

      // 4. 用总已读字数在 DOM 句子中查找对应的句子（两边都是有效字数，直接对比即可）
      var charInfo = getCharInfo(sentences);
      var targetCharPos = totalPlayedChars;
      for (var di = 0; di < charInfo.cumulative.length - 1; di++) {
        if (targetCharPos < charInfo.cumulative[di + 1]) {
          targetSentenceIdx = di;
          break;
        }
      }
      if (targetSentenceIdx < 0) {
        targetSentenceIdx = sentences.length - 1;
      }
    }

    // Fallback：全局进度比例 + 字数加权
    if (targetSentenceIdx < 0) {
      var playedDuration = 0;
      if (timeRanges && timeRanges.length > 0 && currentIdx < timeRanges.length) {
        playedDuration = timeRanges[currentIdx].start || 0;
      } else {
        var estimatedSegDuration = 3;
        if (timeRanges && timeRanges.length > 0) {
          var sum2 = 0;
          for (var k2 = 0; k2 < timeRanges.length; k2++) {
            sum2 += timeRanges[k2].duration || 0;
          }
          estimatedSegDuration = sum2 / timeRanges.length;
        }
        playedDuration = currentIdx * estimatedSegDuration;
      }

      var currentTotalTime = playedDuration + currentTime;
      var estimatedTotalDuration = estimateRemainingDuration();
      var globalProgress = currentTotalTime / Math.max(0.1, estimatedTotalDuration);
      globalProgress = Math.max(0, Math.min(0.999, globalProgress));

      var delay = CONFIG.TTS_HIGHLIGHT_DELAY || 0;
      if (delay !== 0) {
        var adjustedTime = currentTotalTime - delay;
        if (adjustedTime < 0) adjustedTime = 0;
        globalProgress = adjustedTime / Math.max(0.1, estimatedTotalDuration);
        globalProgress = Math.max(0, Math.min(0.999, globalProgress));
      }

      targetSentenceIdx = getTargetSentenceByCharProgress(sentences, globalProgress);
    }

    targetSentenceIdx = Math.max(0, Math.min(sentences.length - 1, targetSentenceIdx));
    applyHighlight(sentences, targetSentenceIdx);

    if (CONFIG.TTS_DEBUG) {
      console.log('[TTS-Highlight]', {
        segIdx: currentIdx + '/' + totalSegs,
        audioTime: currentTime.toFixed(3) + 's',
        targetSentence: targetSentenceIdx + '/' + sentences.length
      });
    }

    _highlightRAF = requestAnimationFrame(syncHighlight);
  }

  _highlightRAF = requestAnimationFrame(syncHighlight);
}
 
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
      if (_highlightRAF) {
        cancelAnimationFrame(_highlightRAF);
        _highlightRAF = null;
      }
      clearTtsHighlight();
      updateHeaderPlayBtn();
    }
    return;
  }

  _streamTTS.isPlaying = true;
  updateBubblePlayBtn(_streamTTS.btnEl, 'playing');
  updateHeaderPlayBtn();

  if (!_currentBubbleEl && _streamTTS.btnEl) {
    _currentBubbleEl = getMessageBubble(_streamTTS.btnEl);
  }

  var ranges = _streamTTS.segmentTimeRanges;
  if (ranges.length > 0 && idx < ranges.length) {
    _streamTTS.currentSegmentStartTime = ranges[idx].start || 0;
  } else {
    _streamTTS.currentSegmentStartTime = 0;
  }

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
      URL.revokeObjectURL(url);
      _streamTTS.currentPlayIndex++;
      playNextSegment();
    });
    _streamTTS.audioEl.addEventListener('play', function () {
      startHighlightSyncLoop();
    });
  }
  _streamTTS.audioEl.src = url;
  _streamTTS.audioEl.play().catch(function (e) {
    console.error('[StreamTTS] 播放错误：', e);
    URL.revokeObjectURL(url);
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

      getAudioDuration(result.blob).then(function (dur) {
        if (_streamTTS.isStopped) return;
        _streamTTS.segmentDurations[result.index] = dur || 0;
        updateSegmentTimeRanges();
        console.log('[StreamTTS] 第' + result.index + '段时长: ' + (dur || 0).toFixed(2) + 's');
      });

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
  var segResult = splitTextIntoSentenceSegments(plainText);
  if (segResult.segments.length === 0) return;

  _streamTTS.totalSegments = segResult.segments.length;
  _streamTTS.segmentSentenceRanges = segResult.sentenceRanges;
  _streamTTS.totalSentences = segResult.totalSentences;
  _streamTTS.allReceived = true;
  _streamTTS.segments = segResult.segments;

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
  clearTtsHighlight();
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

  var wsBubble = getMessageBubble(btnEl);
  var wsSentences = wsBubble ? getTtsSentences(wsBubble) : [];
  var wsStartTime = 0;
  var wsEstimatedDuration = trimmed.length * 0.12;
  var wsRAF = null;
  var wsLastIdx = -1;
  var wsEnded = false;

  // 预计算每句有效发音字数累计，用于按字数加权定位高亮（与 worker 路径保持一致）
  // 只统计中文/英文/数字，过滤标点符号，避免大量符号的句子加权虚胖
  // 公式等特殊元素优先使用 data-tts-chars，确保与 TTS 纯文本侧字数一致
  var wsCumulative = [0];
  var wsTotalChars = 0;
  for (var wi = 0; wi < wsSentences.length; wi++) {
    var wlen = countPronouncedCharsFromEl(wsSentences[wi]);
    if (wlen < 1) wlen = 1;
    wsTotalChars += wlen;
    wsCumulative.push(wsTotalChars);
  }
  // 按字数加权定位：ratio(0~1) → 目标字符位置 → 句子索引
  function wsCharIndexToSentence(ratio) {
    if (wsSentences.length === 0) return -1;
    if (wsSentences.length === 1 || wsTotalChars <= 0) return 0;
    var pos = ratio * wsTotalChars;
    var di = 0;
    for (var ci = 0; ci < wsCumulative.length - 1; ci++) {
      if (pos < wsCumulative[ci + 1]) { di = ci; break; }
      di = ci;
    }
    if (di >= wsSentences.length) di = wsSentences.length - 1;
    if (di < 0) di = 0;
    return di;
  }

  function wsClearHighlight() {
    if (wsRAF) {
      cancelAnimationFrame(wsRAF);
      wsRAF = null;
    }
    for (var i = 0; i < wsSentences.length; i++) {
      wsSentences[i].classList.remove('tts-highlight');
    }
  }

  function wsSyncLoop() {
    if (wsEnded || !synth.speaking) {
      wsRAF = null;
      return;
    }
    if (synth.paused) {
      wsRAF = requestAnimationFrame(wsSyncLoop);
      return;
    }
    var elapsed = (Date.now() - wsStartTime) / 1000;
    var ratio = elapsed / wsEstimatedDuration;
    ratio = Math.max(0, Math.min(1, ratio));
    var domIdx = wsCharIndexToSentence(ratio);
    if (domIdx !== wsLastIdx) {
      wsLastIdx = domIdx;
      for (var i = 0; i < wsSentences.length; i++) {
        wsSentences[i].classList.remove('tts-highlight');
      }
      if (domIdx >= 0 && domIdx < wsSentences.length) {
        wsSentences[domIdx].classList.add('tts-highlight');
      }
    }
    wsRAF = requestAnimationFrame(wsSyncLoop);
  }

  var started = false;
  var startTimeout = setTimeout(function () {
    if (!started) {
      wsEnded = true;
      wsClearHighlight();
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
    wsStartTime = Date.now();
    wsEnded = false;
    _currentBubbleEl = wsBubble;
    if (wsSentences.length > 0) {
      wsSentences[0].classList.add('tts-highlight');
      wsLastIdx = 0;
      wsRAF = requestAnimationFrame(wsSyncLoop);
    }
  };
  utter.onboundary = function (e) {
    if (wsEnded || !wsBubble || wsSentences.length === 0) return;
    var charIndex = e.charIndex || 0;
    var totalChars = trimmed.length || 1;
    var ratio = charIndex / totalChars;
    // 按字数加权定位：charIndex 即字符位置，直接映射到句子区间
    var domIdx = wsCharIndexToSentence(ratio);
    if (domIdx < 0) domIdx = 0;
    wsLastIdx = domIdx;
    for (var i = 0; i < wsSentences.length; i++) {
      wsSentences[i].classList.remove('tts-highlight');
    }
    if (domIdx >= 0 && domIdx < wsSentences.length) {
      wsSentences[domIdx].classList.add('tts-highlight');
    }
  };
  utter.onend = function () {
    wsEnded = true;
    clearTimeout(startTimeout);
    wsClearHighlight();
    if (btnEl) btnEl.classList.remove("is-speaking");
    if (_currentSpeakBtn === btnEl) _currentSpeakBtn = null;
  };
  utter.onerror = function () {
    wsEnded = true;
    clearTimeout(startTimeout);
    wsClearHighlight();
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
    wsEnded = true;
    clearTimeout(startTimeout);
    wsClearHighlight();
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
