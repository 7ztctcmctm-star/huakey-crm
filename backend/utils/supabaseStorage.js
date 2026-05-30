/**
 * Supabase Storage 客户端
 * 当 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 配置时启用
 * 否则回退到本地文件存储（开发环境）
 */

let storageClient = null;

const getSupabaseStorage = async () => {
  if (storageClient !== null) return storageClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Storage] SUPABASE_URL/SUPABASE_SERVICE_KEY 未配置，使用本地文件存储');
    storageClient = undefined; // 标记为已检查但未配置
    return null;
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 确保 attachments bucket 存在
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'attachments');
    if (!bucketExists) {
      await supabase.storage.createBucket('attachments', { public: true });
      console.log('[Storage] 已创建 attachments bucket');
    }

    storageClient = supabase.storage.from('attachments');
    console.log('[Storage] Supabase Storage 已就绪');
    return storageClient;
  } catch (error) {
    console.error('[Storage] Supabase Storage 初始化失败:', error.message);
    storageClient = undefined;
    return null;
  }
};

module.exports = { getSupabaseStorage };
