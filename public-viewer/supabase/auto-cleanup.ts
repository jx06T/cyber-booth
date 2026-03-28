// 導入 Supabase Edge Runtime 的型別定義
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    // 建立 Supabase Client
    // 注意：清理任務必須使用 SERVICE_ROLE_KEY 才能繞過 RLS 權限並刪除檔案
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log("Cleanup Task Started: Searching for records older than 24 hours...");

    // 1. 計算 24 小時前的時間點
    const expiryTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 2. 從 'collages' 資料表找出過期的 session_id
    const { data: expiredRecords, error: fetchError } = await supabase
      .from('collages')
      .select('session_id')
      .lt('created_at', expiryTime);

    if (fetchError) throw fetchError;

    // 如果沒有過期資料，直接回傳
    if (!expiredRecords || expiredRecords.length === 0) {
      return new Response(JSON.stringify({ message: "No expired photos found." }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const sessionIds = expiredRecords.map(r => r.session_id);
    const filePaths = sessionIds.map(id => `${id}.jpg`);

    console.log(`Found ${sessionIds.length} expired items. Deleting...`);

    // 3. [合併刪除 A] 從 Storage 'photos' Bucket 刪除實體檔案
    const { data: storageData, error: storageError } = await supabase.storage
      .from('photos')
      .remove(filePaths);

    if (storageError) {
      console.warn("Storage deletion partial failure or error:", storageError);
    }

    // 4. [合併刪除 B] 從 'collages' 資料表刪除紀錄
    const { error: dbDeleteError } = await supabase
      .from('collages')
      .delete()
      .in('session_id', sessionIds);

    if (dbDeleteError) throw dbDeleteError;

    // 成功回傳結果
    return new Response(JSON.stringify({ 
      message: "Cleanup successful", 
      deleted_count: sessionIds.length,
      details: storageData 
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err) {
    // 錯誤處理
    console.error("Cleanup Task Failed:", err);
    return new Response(JSON.stringify({ error: err?.message ?? err }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500 
    })
  }
})