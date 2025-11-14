<template>
  <div class="card">
    <section class="section-header">
      <div class="section-title">
        <h2>扫描者工具</h2>
        <p>创建频道、扫描二维码并实时推送数据。</p>
      </div>
      <div class="section-actions">
        <label class="field">
          <span>频道模式</span>
          <select class="input" v-model="mode" :disabled="channelCreated">
            <option value="raw">原始文本</option>
            <option value="matrix">矩阵数据</option>
          </select>
        </label>
        <label class="field">
          <span>TTL（秒）</span>
          <input class="input" type="number" min="10" max="3600" step="10" v-model.number="ttl" :disabled="channelCreated" />
        </label>
        <button class="button" @click="createChannel" :disabled="loading || channelCreated">
          {{ channelCreated ? '频道已创建' : loading ? '创建中…' : '创建频道' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section v-if="channelCreated" class="channel-details">
      <div class="detail-grid">
        <div>
          <h3>频道 ID</h3>
          <code>{{ channel.id }}</code>
        </div>
        <div>
          <h3>推送密钥</h3>
          <code>{{ channel.secret }}</code>
        </div>
        <div>
          <h3>频道模式</h3>
          <span class="tag">{{ channel.mode }}</span>
        </div>
        <div>
          <h3>TTL</h3>
          <span class="tag">{{ channel.ttl }} s</span>
        </div>
      </div>
      <div class="share-box">
        <label>接收者链接</label>
        <div class="share-link">
          <input class="input" readonly :value="receiverLink" @focus="$event.target.select()" />
          <button class="button" @click="copyLink" type="button">复制链接</button>
        </div>
        <p class="hint">分享给接收者，接收者无需密钥即可轮询数据。</p>
      </div>
    </section>

    <section v-if="channelCreated" class="scanner-section">
      <div class="scanner-grid">
        <div class="preview" :class="{ 'preview--active': scanning }">
          <video ref="videoEl" playsinline muted></video>
          <div v-if="!cameraReady" class="preview-overlay">{{ previewHint }}</div>
        </div>
        <div class="status-panel">
          <h3>推送状态</h3>
          <ul class="status-list">
            <li>
              <span class="status-label">最新扫描</span>
              <span class="status-value">{{ lastScanned || '尚未识别' }}</span>
            </li>
            <li>
              <span class="status-label">已推送数据</span>
              <span class="status-value">{{ lastPushed || '尚未推送' }}</span>
            </li>
            <li>
              <span class="status-label">版本号</span>
              <span class="status-value">{{ version ?? '未返回' }}</span>
            </li>
          </ul>
          <p class="status-message" :class="statusState">{{ statusMessage }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/browser';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const mode = ref('raw');
const ttl = ref(180);
const channel = ref(null);
const loading = ref(false);
const error = ref('');
const statusMessage = ref('准备就绪');
const statusState = ref('info');
const lastScanned = ref('');
const lastPushed = ref('');
const version = ref(null);
const cameraReady = ref(false);
const scanning = ref(false);
const videoEl = ref(null);
let controls = null;
let currentStream = null;
const reader = new BrowserMultiFormatReader();

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

const channelCreated = computed(() => Boolean(channel.value));

const receiverLink = computed(() => {
  if (!channel.value || typeof window === 'undefined') return '';
  const url = new URL(window.location.origin + '/receiver');
  url.searchParams.set('id', channel.value.id);
  return url.toString();
});

const previewHint = computed(() => {
  if (!channel.value) return '创建频道以启动摄像头';
  if (!cameraReady.value) return '等待摄像头授权…';
  return '扫描二维码以自动推送数据';
});

const resetStatus = () => {
  statusMessage.value = '准备就绪';
  statusState.value = 'info';
};

const setStatus = (message, state = 'info') => {
  statusMessage.value = message;
  statusState.value = state;
};

const stopScanner = () => {
  if (controls) {
    controls.stop();
    controls = null;
  }
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
  scanning.value = false;
  cameraReady.value = false;
};

onBeforeUnmount(() => {
  stopScanner();
});

const startScanner = async () => {
  if (!channel.value || !videoEl.value) return;

  try {
    stopScanner();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('当前浏览器不支持摄像头访问', 'error');
      return;
    }

    setStatus('请求摄像头权限…', 'info');
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }
      },
      audio: false
    });
    videoEl.value.srcObject = currentStream;
    await videoEl.value.play();
    cameraReady.value = true;

    controls = await reader.decodeFromVideoDevice(
      null,
      videoEl.value,
      async (result, err) => {
        if (result) {
          const text = result.getText();
          if (text && text !== lastScanned.value) {
            lastScanned.value = text;
            await pushPayload(text);
          }
        } else if (err && !(err instanceof NotFoundException)) {
          console.error(err);
          setStatus('扫描错误：' + err.message, 'error');
        }
      }
    );
    scanning.value = true;
    setStatus('正在扫描…', 'success');
  } catch (err) {
    console.error(err);
    setStatus(err?.message || '无法启动摄像头', 'error');
    stopScanner();
  }
};

const createChannel = async () => {
  if (channel.value) return;
  loading.value = true;
  error.value = '';
  resetStatus();
  try {
    const res = await fetch(`${apiBase}/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ttl: ttl.value, mode: mode.value })
    });

    if (!res.ok) {
      throw new Error(`创建失败：${res.status}`);
    }

    const data = await res.json();
    channel.value = {
      id: data.data?.id ?? data.id,
      secret: data.data?.secret ?? data.secret,
      ttl: data.data?.ttl ?? data.ttl,
      mode: mode.value
    };
    await startScanner();
  } catch (err) {
    console.error(err);
    error.value = err?.message || '创建频道失败';
    stopScanner();
  } finally {
    loading.value = false;
  }
};

const pushPayload = async (payload) => {
  if (!channel.value) return;
  if (payload === lastPushed.value) {
    setStatus('内容未变化，跳过推送', 'info');
    return;
  }

  setStatus('推送中…', 'info');
  try {
    const res = await fetch(`${apiBase}/channels/${channel.value.id}/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        secret: channel.value.secret,
        data: payload,
        type: channel.value.mode
      })
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.message || `推送失败：${res.status}`);
    }

    const result = await res.json();
    const newVersion = result.data?.version ?? result.version;
    lastPushed.value = payload;
    version.value = newVersion;
    setStatus(`推送成功，版本 ${newVersion}`, 'success');
  } catch (err) {
    console.error(err);
    setStatus(err?.message || '推送失败', 'error');
  }
};

const copyLink = async () => {
  if (!receiverLink.value) return;
  try {
    await navigator.clipboard.writeText(receiverLink.value);
    setStatus('接收者链接已复制', 'success');
  } catch (err) {
    console.error(err);
    setStatus('复制失败，请手动复制链接', 'error');
  }
};

watch(channelCreated, (created) => {
  if (!created) {
    stopScanner();
  }
});
</script>

<style scoped>
.section-header {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-title h2 {
  margin: 0;
  font-size: 1.75rem;
}

.section-title p {
  margin: 0.5rem 0 0;
  color: #475569;
}

.section-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: #334155;
}

.error {
  margin: 0;
  color: #dc2626;
  font-weight: 600;
}

.channel-details {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.detail-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.detail-grid h3 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: #475569;
}

.detail-grid code {
  display: block;
  background: #f8fafc;
  border-radius: 10px;
  padding: 0.75rem;
  word-break: break-all;
}

.share-box {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.share-box label {
  font-weight: 600;
}

.share-link {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.share-link .input {
  flex: 1;
  min-width: 220px;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.scanner-section {
  display: flex;
  flex-direction: column;
}

.scanner-grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 1.5rem;
  align-items: stretch;
}

@media (max-width: 960px) {
  .scanner-grid {
    grid-template-columns: 1fr;
  }
}

.preview {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #0f172a;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.3);
}

.preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.68);
  color: #e2e8f0;
  font-size: 1rem;
  text-align: center;
  padding: 1.5rem;
}

.preview--active::after {
  content: '';
  position: absolute;
  inset: 12%;
  border: 3px solid rgba(94, 234, 212, 0.8);
  border-radius: 18px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    opacity: 0.2;
  }
  50% {
    opacity: 0.8;
  }
  100% {
    opacity: 0.2;
  }
}

.status-panel {
  background: #f8fafc;
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border: 1px solid #e2e8f0;
}

.status-panel h3 {
  margin: 0;
}

.status-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.status-label {
  display: block;
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.25rem;
}

.status-value {
  font-weight: 600;
  color: #1e293b;
  word-break: break-all;
}

.status-message {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.9rem;
}

.status-message.info {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-message.success {
  background: #dcfce7;
  color: #166534;
}

.status-message.error {
  background: #fee2e2;
  color: #b91c1c;
}
</style>
