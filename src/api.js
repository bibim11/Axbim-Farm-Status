function normalizeBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function validateConfig(config) {
  const supabaseUrl = normalizeBaseUrl(config?.supabaseUrl);
  const publishableKey = String(config?.publishableKey ?? '').trim();

  if (!supabaseUrl || !publishableKey) {
    throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับเว็บไซต์');
  }

  return { supabaseUrl, publishableKey };
}

async function postRpc(config, rpcName, fetchImpl, userSafeError) {
  const { supabaseUrl, publishableKey } = validateConfig(config);

  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/${rpcName}`,
    {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    }
  );

  if (!response.ok) {
    throw new Error(userSafeError);
  }

  return response.json();
}

export async function fetchPublicFarms(config, fetchImpl = fetch) {
  const data = await postRpc(
    config,
    'get_public_farms',
    fetchImpl,
    'ไม่สามารถโหลดสถานะได้ กรุณาลองใหม่อีกครั้ง'
  );

  return Array.isArray(data) ? data : [];
}

export async function fetchPublicFarmStats(config, fetchImpl = fetch) {
  const data = await postRpc(
    config,
    'get_public_farm_stats',
    fetchImpl,
    'ไม่สามารถโหลดสถิติได้ กรุณาลองใหม่อีกครั้ง'
  );

  const row = Array.isArray(data) ? data[0] : null;
  const completedCount = Number(row?.completed_count ?? 0);

  return {
    completedCount: Number.isFinite(completedCount) ? completedCount : 0
  };
}
