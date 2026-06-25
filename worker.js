// Edge TTS Worker - Microsoft Edge Read Aloud API
// 基于 RichLiao1112/cloudflare-edge-tts 的实现

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const READALOUD_BASE = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
const VOICE_LIST_URL = `https://${READALOUD_BASE}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
const SYNTHESIS_URL = `https://${READALOUD_BASE}/edge/v1`;
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const DEFAULT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

const VOICE_CACHE = { data: null, timestamp: 0, TTL: 3600000 };

const BASE_HEADERS = {
  'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  'Accept-Language': 'en-US,en;q=0.9',
};

const VOICE_HEADERS = {
  ...BASE_HEADERS,
  'Authority': 'speech.platform.bing.com',
  'Accept': '*/*',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
};

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function removeInvalidXmlCharacters(text) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
}

function makeConnectionId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function makeMuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function makeSecMsGec() {
  const winEpoch = 11644473600;
  const secondsToNs = 1e9;
  let ticks = Date.now() / 1000;
  ticks += winEpoch;
  ticks -= ticks % 300;
  ticks *= secondsToNs / 100;
  const payload = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function buildSynthesisUrl(secMsGec, connectionId) {
  const url = new URL(SYNTHESIS_URL);
  url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN);
  url.searchParams.set('Sec-MS-GEC', secMsGec);
  url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION);
  url.searchParams.set('ConnectionId', connectionId);
  return url.toString();
}

function buildSpeechConfigMessage(format) {
  return (
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"${format}"}}}}\r\n`
  );
}

function buildSsmlMessage(requestId, voice, text, rate, pitch) {
  const rateStr = rate >= 0 ? `+${rate}%` : `${rate}%`;
  const pitchStr = pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`;
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
    `<voice name='${voice}'><prosody pitch='${pitchStr}' rate='${rateStr}' volume='+0%'>${escapeXml(removeInvalidXmlCharacters(text))}</prosody></voice></speak>`;
  return (
    `X-RequestId:${requestId}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    'Path:ssml\r\n\r\n' + ssml
  );
}

function parseTextHeaders(message) {
  const separator = message.indexOf('\r\n\r\n');
  const headerText = separator >= 0 ? message.slice(0, separator) : message;
  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    const key = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function parseBinaryAudioFrame(data) {
  if (data.length < 2) throw new Error('binary websocket frame missing header length');
  const headerLength = (data[0] << 8) | data[1];
  if (data.length < 2 + headerLength) throw new Error('binary websocket frame truncated');
  const headerText = new TextDecoder().decode(data.slice(2, 2 + headerLength));
  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    const key = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1).trim();
    headers[key] = value;
  }
  return { headers, body: data.slice(2 + headerLength) };
}

async function fetchVoices() {
  const now = Date.now();
  if (VOICE_CACHE.data && (now - VOICE_CACHE.timestamp) < VOICE_CACHE.TTL) {
    return VOICE_CACHE.data;
  }
  const secMsGec = await makeSecMsGec();
  const url = `${VOICE_LIST_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
  const response = await fetch(url, { headers: VOICE_HEADERS });
  if (!response.ok) {
    throw new Error(`Voice list request failed with status ${response.status}`);
  }
  const data = await response.json();
  VOICE_CACHE.data = data;
  VOICE_CACHE.timestamp = now;
  return data;
}

function getContentType(format) {
  if (format.includes('mp3')) return 'audio/mpeg';
  if (format.includes('ogg')) return 'audio/ogg';
  if (format.includes('webm')) return 'audio/webm';
  if (format.includes('pcm') || format.includes('riff')) return 'audio/wav';
  return 'audio/basic';
}

async function createAudioStream(text, voice, format, rate, pitch) {
  const secMsGec = await makeSecMsGec();
  const connectionId = makeConnectionId();
  const websocketUrl = buildSynthesisUrl(secMsGec, connectionId);
  const muid = makeMuid();

  const response = await fetch(websocketUrl, {
    headers: {
      ...BASE_HEADERS,
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Sec-WebSocket-Version': '13',
      'Upgrade': 'websocket',
      'Cookie': `muid=${muid};`,
    }
  });

  if (response.status !== 101 || !response.webSocket) {
    throw new Error(`WebSocket upgrade failed with status ${response.status}`);
  }

  const socket = response.webSocket;
  const audioChunks = [];
  const contentType = getContentType(format);

  return new Promise((resolve, reject) => {
    let settled = false;
    let audioReceived = false;

    const cleanup = () => {
      try { socket.removeEventListener('message', onMessage); } catch (e) {}
      try { socket.removeEventListener('close', onClose); } catch (e) {}
      try { socket.removeEventListener('error', onError); } catch (e) {}
    };

    const finishWithError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.close(); } catch (e) {}
      reject(err);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.close(); } catch (e) {}
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        combined.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      resolve({ data: combined.buffer, contentType });
    };

    const onMessage = (event) => {
      if (settled) return;
      const data = event.data;

      if (typeof data === 'string') {
        const headers = parseTextHeaders(data);
        const path = headers.Path;
        if (path === 'turn.end') {
          try { socket.close(); } catch (e) { finish(); }
          return;
        }
        if (path === 'response' || path === 'turn.start' || path === 'audio.metadata') {
          return;
        }
        return;
      }

      let binary = null;
      if (data instanceof Uint8Array) {
        binary = data;
      } else if (data instanceof ArrayBuffer) {
        binary = new Uint8Array(data);
      }

      if (!binary) {
        finishWithError(new Error('unsupported websocket message type'));
        return;
      }

      try {
        const { headers, body } = parseBinaryAudioFrame(binary);
        if (headers.Path !== 'audio') {
          return;
        }
        if (body.length === 0) {
          return;
        }
        audioReceived = true;
        audioChunks.push(body);
      } catch (e) {
        finishWithError(e);
      }
    };

    const onClose = () => {
      if (!audioReceived) {
        finishWithError(new Error('no audio received'));
        return;
      }
      finish();
    };

    const onError = () => {
      finishWithError(new Error('websocket error'));
    };

    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    socket.addEventListener('error', onError);

    socket.accept();
    socket.send(buildSpeechConfigMessage(format));
    socket.send(buildSsmlMessage(makeConnectionId(), voice, text, rate, pitch));

    setTimeout(() => {
      if (!settled) finishWithError(new Error('Synthesis timeout'));
    }, 30000);
  });
}

const SUPPORTED_FORMATS = [
  'audio-24khz-160kbitrate-mono-mp3',
  'audio-24khz-96kbitrate-mono-mp3',
  'audio-24khz-48kbitrate-mono-mp3',
  'audio-16khz-128kbitrate-mono-mp3',
  'audio-16khz-64kbitrate-mono-mp3',
  'audio-16khz-32kbitrate-mono-mp3',
  'ogg-24khz-16bit-mono-opus',
  'webm-24khz-16bit-mono-opus',
  'audio-16khz-16kbps-mono-siren',
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}

function parseBody(request) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    return {
      text: url.searchParams.get('text'),
      voice: url.searchParams.get('voice') || DEFAULT_VOICE,
      format: url.searchParams.get('format') || DEFAULT_FORMAT,
      rate: parseInt(url.searchParams.get('rate')) || 0,
      pitch: parseInt(url.searchParams.get('pitch')) || 0,
    };
  }
  return request.json();
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/voices' || path === '/api/voices') {
        const voices = await fetchVoices();
        return jsonResponse(voices);
      }

      if (path === '/tts' || path === '/api/tts' || path === '/synthesize') {
        const params = await parseBody(request);

        if (!params.text || params.text.trim().length === 0) {
          return jsonResponse({ error: 'Text parameter is required' }, 400);
        }
        if (!SUPPORTED_FORMATS.includes(params.format)) {
          return jsonResponse({ error: 'Unsupported format', supportedFormats: SUPPORTED_FORMATS }, 400);
        }

        const result = await createAudioStream(
          params.text, params.voice, params.format, params.rate, params.pitch
        );

        return new Response(result.data, {
          headers: {
            ...corsHeaders(),
            'Content-Type': result.contentType,
            'Content-Length': result.data.byteLength.toString(),
            'Accept-Ranges': 'bytes',
          }
        });
      }

      if (path === '/' || path === '/health') {
        return jsonResponse({
          status: 'ok',
          service: 'Edge TTS Worker',
          endpoints: {
            voices: '/voices',
            tts: '/tts?text=hello&voice=zh-CN-XiaoxiaoNeural',
            health: '/health'
          }
        });
      }

      return jsonResponse({ error: 'Not found' }, 404);

    } catch (error) {
      return jsonResponse({ error: error.message, stack: error.stack }, 500);
    }
  }
};
