<template>
  <el-dialog v-model="visible" title="导入客户Excel" width="700px" @closed="resetImport">
    <el-steps :active="step" finish-status="success" simple style="margin-bottom:20px">
      <el-step title="选择文件" />
      <el-step title="预览数据" />
      <el-step title="导入完成" />
    </el-steps>

    <div v-if="step === 0">
      <el-upload
        ref="uploadRef" :auto-upload="false" :limit="1"
        accept=".xlsx,.xls" :on-change="handleFileChange" :on-remove="handleFileRemove" drag
      >
        <el-icon :size="48"><UploadFilled /></el-icon>
        <div style="margin-top:8px">将Excel文件拖拽到此处，或<em>点击上传</em></div>
        <template #tip>
          <div style="margin-top:8px;color:#909399">支持 .xlsx / .xls 格式，表头需包含"公司名称"列</div>
        </template>
      </el-upload>
      <el-progress v-if="uploadProgress > 0 && uploadProgress < 100" :percentage="uploadProgress" style="margin-top:12px" />
      <div style="text-align:right;margin-top:16px">
        <el-button v-if="loading" @click="cancelUpload">取消</el-button>
        <el-button type="primary" :disabled="!file" :loading="loading" @click="previewImport">下一步：预览</el-button>
      </div>
    </div>

    <div v-else-if="step === 1" v-loading="loading">
      <el-alert type="success" :closable="false" show-icon style="margin-bottom:12px">
        共 {{ preview.length }} 条数据（仅展示前10条）
      </el-alert>
      <el-table :data="preview" border stripe max-height="350" size="small">
        <el-table-column type="index" width="50" />
        <el-table-column prop="company_name" label="公司名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="contact_name" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="120" />
        <el-table-column prop="industry" label="行业" width="100" />
        <el-table-column prop="source" label="来源" width="80" />
        <el-table-column prop="level" label="等级" width="60" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="!row.valid" :content="row.errors?.map(e => e.message).join('；')" placement="top">
              <el-tag type="danger" size="small">无效</el-tag>
            </el-tooltip>
            <el-tag v-else type="success" size="small">有效</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="invalidCount > 0" style="margin-top:8px">
        <el-alert type="warning" :closable="false" show-icon>
          有 {{ invalidCount }} 条数据验证不通过，导入时将自动跳过
        </el-alert>
      </div>
      <div style="text-align:right;margin-top:16px">
        <el-button @click="step = 0">返回</el-button>
        <el-button type="primary" :loading="loading" @click="confirmImport">确认导入 ({{ preview.length }}条)</el-button>
      </div>
    </div>

    <div v-else>
      <el-result
        :icon="result.fail === 0 ? 'success' : 'warning'"
        :title="'导入完成'"
        :sub-title="`成功 ${result.success} 条，失败 ${result.fail} 条`"
      >
        <template #extra>
          <el-button type="primary" @click="finishImport">完成</el-button>
        </template>
      </el-result>
      <div v-if="result.errors?.length" style="margin-top:12px">
        <el-alert v-for="(e, i) in result.errors" :key="i" :title="e" type="error" :closable="false" style="margin-bottom:4px" />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import request from '@/utils/request'

const emit = defineEmits(['imported'])
const visible = defineModel({ type: Boolean, default: false })

const step = ref(0)
const file = ref(null)
const preview = ref([])
const loading = ref(false)
const uploadProgress = ref(0)
const abortController = ref(null)
const result = reactive({ success: 0, fail: 0, errors: [] })
const uploadRef = ref(null)

const invalidCount = computed(() => preview.value.filter(r => r.valid === false).length)

const handleFileChange = (f) => { file.value = f.raw }
const handleFileRemove = () => { file.value = null }

const cancelUpload = () => { abortController.value?.abort(); loading.value = false }
const previewImport = async () => {
  if (!file.value) return
  loading.value = true; uploadProgress.value = 0
  abortController.value = new AbortController()
  try {
    const fd = new FormData(); fd.append('file', file.value)
    const res = await request.post('/customer/import-preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: abortController.value.signal,
      onUploadProgress: (e) => { if (e.total) uploadProgress.value = Math.round(e.loaded / e.total * 100) }
    })
    if (res.code === 200) { preview.value = res.data.preview; step.value = 1 }
    else ElMessage.error(res.message)
  } catch (e) { if (e.code !== 'ERR_CANCELED') ElMessage.error('预览失败') }
  finally { loading.value = false; uploadProgress.value = 0 }
}

const confirmImport = async () => {
  if (!file.value) return
  loading.value = true; uploadProgress.value = 0
  abortController.value = new AbortController()
  try {
    const fd = new FormData(); fd.append('file', file.value)
    const res = await request.post('/customer/import-confirm', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: abortController.value.signal,
      onUploadProgress: (e) => { if (e.total) uploadProgress.value = Math.round(e.loaded / e.total * 100) }
    })
    if (res.code === 200) {
      result.success = res.data.success; result.fail = res.data.fail
      result.errors = res.data.errors || []; step.value = 2
    } else ElMessage.error(res.message)
  } catch (e) { if (e.code !== 'ERR_CANCELED') ElMessage.error('导入失败') }
  finally { loading.value = false; uploadProgress.value = 0 }
}

const finishImport = () => {
  visible.value = false
  emit('imported')
}

const resetImport = () => {
  file.value = null; preview.value = []; step.value = 0
  result.success = 0; result.fail = 0; result.errors = []
}
</script>
