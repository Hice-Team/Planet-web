// lib/supabase.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export function decrypt(cipherText, secretKey) {
  const key = Buffer.isBuffer(secretKey)
    ? secretKey
    : Buffer.from(secretKey, 'hex');

  const [ivHex, tagHex, encryptedHex] = cipherText.split(':');

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, 'hex')
  );

  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

const SUPABASE_URL = decrypt(process.env.CIPHER_SUPABASE_URL, process.env.CIPHER_KEY);
const SUPABASE_SERVICE_ROLE_KEY = decrypt(process.env.CIPHER_SUPABASE_KEY, process.env.CIPHER_KEY);
const SUPABASE_ANON_KEY = decrypt(process.env.CIPHER_SUPABASE_ANON_KEY, process.env.CIPHER_KEY);

// ...basic checks...
if (!SUPABASE_URL) {
  console.error('환경변수 SUPABASE_URL이 설정되어 있지 않습니다.');
}

const looksLikePublishable = key => typeof key === 'string' && key.startsWith('sb_publishable_');

// 우선: service role 키가 유효해 보이면 이를 사용. 아니면 anon 키로 생성(쓰기 권한 없음).
let supabase;
export const isServiceRole = !!(SUPABASE_SERVICE_ROLE_KEY && !looksLikePublishable(SUPABASE_SERVICE_ROLE_KEY));

if (isServiceRole) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
} else {
  if (SUPABASE_SERVICE_ROLE_KEY && looksLikePublishable(SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn('경고: SUPABASE_SERVICE_ROLE_KEY에 publishable 키가 들어있는 것 같습니다. 서버에서는 실제 service_role 키를 사용해야 합니다.');
  }
  if (SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.warn('서비스 롤 키가 없으므로 ANON 키로 Supabase 클라이언트를 생성했습니다. RLS가 활성화된 테이블에는 쓰기 권한이 없을 수 있습니다.');
  } else {
    console.error('SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY가 필요합니다. .env를 확인하세요.');
    // 최소 안전하게 빈 클라이언트 생성 시 예외 대신 null export를 피하기 위해 빈 문자열로 생성
    supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || '');
  }
}

export default supabase;
