<template>
  <div class="card receiver-card">
    <section class="receiver-header">
      <div class="header-text">
        <h2>接收者工具</h2>
        <p>输入频道 ID 或通过分享链接自动填充，实时接收最新数据。</p>
      </div>
      <div class="channel-inputs">
        <label class="field">
          <span>频道 ID</span>
          <input class="input" v-model="channelIdInput" placeholder="例如：8 字节 ID" />
        </label>
        <button
          class="button"
          @click="connectChannel"
          :disabled="!channelIdInput || connecting"
        >
          {{ connecting ? "连接中…" : activeChannel ? "重新连接" : "连接频道" }}
        </button>
      </div>
      <p v-if="pollError" class="error">{{ pollError }}</p>
    </section>

    <section v-if="activeChannel" class="polling-section">
      <div class="status-banner" :class="{ online: polling, offline: !polling }">
        <span class="indicator"></span>
        <span>{{ polling ? "轮询进行中" : "已停止轮询" }}</span>
        <span v-if="lastUpdated" class="timestamp">最近更新：{{ lastUpdated }}</span>
      </div>
      <div class="payload-grid">
        <div class="payload-card">
          <h3>最新原始数据</h3>
          <div class="payload-content" v-if="latestPayload">
            <code>{{ latestPayload.data }}</code>
            <span class="payload-meta"
              >类型：{{ latestPayload.type }} · 时间：{{
                formatTime(latestPayload.ts)
              }}</span
            >
          </div>
          <div class="placeholder" v-else>暂未收到任何数据</div>
        </div>
        <div class="payload-card">
          <h3>二维码预览</h3>
          <div class="qr-preview" v-if="qrImage">
            <img :src="qrImage" alt="二维码预览" />
          </div>
          <div class="placeholder" v-else>等待数据以生成二维码</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const POLL_DELAY = 2000;

const channelIdInput = ref("");
const activeChannel = ref("");
const since = ref(0);
const polling = ref(false);
const connecting = ref(false);
const pollError = ref("");
const latestPayload = ref(null);
const qrImage = ref("");
const lastUpdated = ref("");
let stop = false;
let timer = null;

const formatTime = (ts) => {
  if (!ts) return "未知";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString();
};

const syncQr = async () => {
  if (!latestPayload.value?.data) {
    qrImage.value = "";
    return;
  }
  try {
    qrImage.value = await QRCode.toDataURL(latestPayload.value.data, {
      errorCorrectionLevel: "M",
      width: 280,
      margin: 1,
    });
  } catch (err) {
    console.error(err);
    qrImage.value = "";
  }
};

watch(latestPayload, (val) => {
  syncQr();
  lastUpdated.value = val ? new Date().toLocaleTimeString() : "";
});

const pollOnce = async () => {
  if (!activeChannel.value) return;
  try {
    const res = await fetch(
      `${apiBase}/channels/${activeChannel.value}/poll?since=${since.value}`,
      {
        method: "GET",
      }
    );

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      if (res.status === 404) {
        throw new Error("频道不存在或已删除");
      }
      if (res.status === 410) {
        throw new Error("频道已过期，请重新获取链接");
      }
      throw new Error(errorBody.message || `轮询失败：${res.status}`);
    }

    const data = await res.json();
    const payload = data.data?.payload ?? data.payload;
    const version = data.data?.version ?? data.version ?? 0;
    const updated = data.data?.updated ?? data.updated;

    since.value = version;
    if (updated && payload) {
      latestPayload.value = payload;
    }
    pollError.value = "";
  } catch (err) {
    pollError.value = err?.message || "轮询失败";
    polling.value = false;
    stop = true;
  }
};

const schedulePoll = async () => {
  if (stop) return;
  polling.value = true;
  await pollOnce();
  if (stop) return;
  timer = setTimeout(schedulePoll, POLL_DELAY);
};

const connectChannel = async () => {
  if (!channelIdInput.value) return;
  connecting.value = true;
  pollError.value = "";
  stopPolling();
  latestPayload.value = null;
  qrImage.value = "";
  since.value = 0;
  try {
    activeChannel.value = channelIdInput.value.trim();
    stop = false;
    polling.value = true;
    await pollOnce();
    if (!stop) {
      timer = setTimeout(schedulePoll, POLL_DELAY);
    }
  } finally {
    connecting.value = false;
  }
};

const stopPolling = () => {
  stop = true;
  polling.value = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

onBeforeUnmount(() => {
  stopPolling();
});

onMounted(() => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const id = url.searchParams.get("id");
  if (id) {
    channelIdInput.value = id;
    connectChannel();
  }
});
</script>

<style scoped>
.receiver-card {
  gap: 2rem;
}

.receiver-header {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.header-text h2 {
  margin: 0;
  font-size: 1.75rem;
}

.header-text p {
  margin: 0.5rem 0 0;
  color: #475569;
}

.channel-inputs {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
  gap: 1rem;
}

@media (max-width: 720px) {
  .channel-inputs {
    grid-template-columns: 1fr;
  }
}

.error {
  margin: 0;
  color: #dc2626;
  font-weight: 600;
}

.polling-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.status-banner {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-weight: 600;
}

.status-banner.online {
  background: #dcfce7;
  border-color: #bbf7d0;
  color: #166534;
}

.status-banner.offline {
  background: #fee2e2;
  border-color: #fecaca;
  color: #b91c1c;
}

.status-banner .indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.05);
}

.status-banner .timestamp {
  margin-left: auto;
  font-size: 0.85rem;
}

.payload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

.payload-card {
  background: #f8fafc;
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.payload-card h3 {
  margin: 0;
}

.payload-content code {
  display: block;
  background: white;
  border-radius: 12px;
  padding: 1rem;
  word-break: break-word;
  font-size: 0.95rem;
  line-height: 1.6;
}

.payload-meta {
  font-size: 0.85rem;
  color: #64748b;
}

.placeholder {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #94a3b8;
}

.qr-preview {
  display: flex;
  justify-content: center;
  align-items: center;
}

.qr-preview img {
  width: 240px;
  height: 240px;
  border-radius: 20px;
  background: white;
  padding: 1.25rem;
  box-shadow: 0 12px 24px rgba(148, 163, 184, 0.25);
}
</style>
