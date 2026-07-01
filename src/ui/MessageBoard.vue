<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getPlayerName, setPlayerName, fetchMessages, postMessage, deleteMessage, type Msg } from '../game/api'

defineEmits<{ (e: 'back'): void }>()

const name = ref(getPlayerName())
const text = ref('')
const messages = ref<Msg[]>([])
const replyTo = ref<Msg | null>(null)
const loading = ref(false)
const sending = ref(false)
const offline = ref(false)
const error = ref('')

const canSend = computed(() => name.value.trim().length > 0 && text.value.trim().length > 0)

const threads = computed(() => {
  const tops = messages.value.filter((m) => !m.parentId)
  const byParent = new Map<number, Msg[]>()
  for (const m of messages.value) {
    if (m.parentId) { if (!byParent.has(m.parentId)) byParent.set(m.parentId, []); byParent.get(m.parentId)!.push(m) }
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.id - b.id)
  return tops.map((msg) => ({ msg, replies: byParent.get(msg.id) ?? [] }))
})

function fmt(ms: number) { try { return new Date(ms).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

async function refresh() {
  loading.value = true
  const m = await fetchMessages()
  offline.value = m === null
  messages.value = m || []
  loading.value = false
}
async function onSend() {
  if (!canSend.value || sending.value) return
  sending.value = true; error.value = ''
  setPlayerName(name.value)
  const ok = await postMessage(name.value.trim(), text.value.trim(), replyTo.value?.id ?? 0)
  sending.value = false
  if (ok) { text.value = ''; replyTo.value = null; await refresh() }
  else error.value = offline.value ? '留言板需連線到全球後端（本地模式無法留言）' : '送出失敗，請稍後再試'
}
async function onDelete(m: Msg) {
  const key = prompt('輸入管理鍵以刪除此留言：')
  if (!key) return
  const ok = await deleteMessage(m.id, key)
  if (ok) await refresh(); else error.value = '刪除失敗（管理鍵錯誤或離線）'
}
onMounted(refresh)
</script>

<template>
  <div class="absolute inset-0 overflow-auto bg-black/80 backdrop-blur-sm z-40 flex flex-col items-center py-8 px-4">
    <div class="w-full max-w-2xl">
      <div class="flex items-center justify-between mb-4">
        <button @click="$emit('back')" class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer">← 返回</button>
        <h2 class="text-3xl font-black text-yellow-400">💬 留言板</h2>
        <span class="w-16"></span>
      </div>

      <!-- 輸入 -->
      <div class="bg-zinc-900/80 rounded-xl border border-white/10 p-4 mb-4">
        <div v-if="replyTo" class="text-xs text-cyan-300 mb-2">回覆 @{{ replyTo.name }} <button @click="replyTo = null" class="text-white/40 ml-2 cursor-pointer">✕ 取消</button></div>
        <input v-model="name" maxlength="16" placeholder="暱稱"
          class="w-40 rounded-lg bg-black/40 px-3 py-1.5 text-white text-sm outline-none ring-1 ring-white/15 mb-2" />
        <textarea v-model="text" maxlength="200" rows="2" placeholder="留言…（最多 200 字）"
          class="w-full rounded-lg bg-black/40 px-3 py-2 text-white text-sm outline-none ring-1 ring-white/15 resize-none"></textarea>
        <div class="flex items-center justify-between mt-2">
          <span class="text-[11px] text-white/40 tabular-nums">{{ text.length }}/200</span>
          <button @click="onSend" :disabled="!canSend || sending"
            class="px-5 py-2 rounded-lg font-bold transition"
            :class="canSend && !sending ? 'bg-yellow-400 text-black hover:bg-yellow-300 cursor-pointer' : 'bg-white/10 text-white/40 cursor-not-allowed'">
            {{ sending ? '送出中…' : '送出' }}
          </button>
        </div>
        <p v-if="error" class="text-rose-300 text-xs mt-2">{{ error }}</p>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="text-center text-white/40 py-8">載入中…</div>
      <div v-else-if="offline" class="text-center text-white/40 py-8">留言板需連線到全球後端；目前為離線模式。</div>
      <div v-else-if="!threads.length" class="text-center text-white/40 py-8">還沒有留言，來搶頭香！</div>
      <div v-else class="space-y-3">
        <div v-for="t in threads" :key="t.msg.id" class="bg-zinc-900/60 rounded-xl border border-white/10 p-3">
          <div class="flex items-baseline justify-between">
            <span class="font-bold text-lime-300">{{ t.msg.name }}</span>
            <span class="text-[10px] text-white/30">{{ fmt(t.msg.at) }}</span>
          </div>
          <p class="text-white/90 text-sm mt-1 break-words whitespace-pre-wrap">{{ t.msg.text }}</p>
          <div class="flex gap-3 mt-1 text-[11px]">
            <button @click="replyTo = t.msg" class="text-cyan-300/70 hover:text-cyan-200 cursor-pointer">回覆</button>
            <button @click="onDelete(t.msg)" class="text-rose-300/50 hover:text-rose-300 cursor-pointer">刪除</button>
          </div>
          <!-- 回覆 -->
          <div v-for="rp in t.replies" :key="rp.id" class="mt-2 ml-3 pl-3 border-l border-white/10">
            <div class="flex items-baseline justify-between">
              <span class="font-bold text-cyan-300 text-sm">{{ rp.name }}</span>
              <span class="text-[10px] text-white/30">{{ fmt(rp.at) }}</span>
            </div>
            <p class="text-white/80 text-sm mt-0.5 break-words whitespace-pre-wrap">{{ rp.text }}</p>
            <button @click="onDelete(rp)" class="text-rose-300/40 hover:text-rose-300 text-[11px] mt-0.5 cursor-pointer">刪除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
