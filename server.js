// server.js
import "dotenv/config";
import { fileURLToPath } from "url";
import supabase, { isServiceRole } from "./lib/supabase.js";
import express from "express";
import cors from "cors";
import path from "path";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 서버 시작 전에 Supabase 키 상태 로깅
console.log(`Supabase client initialized (${isServiceRole ? 'service_role 사용' : 'anon/publishable 사용 — 쓰기 권한 제한 있을 수 있음'})`);

// [페이지 라우트 등록]
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/pages/index.html"));
});

app.get("/privacy", (req, res) => {
  res.sendFile(path.join(__dirname, "public/pages/privacy.html"));
});

// [API 라우트 등록]
app.post("/api/pre-register", async (req, res) => {
  const { email, source } = req.body;

  if (!email) {
    return res.status(400).json({ message: "이메일이 필요합니다." });
  }

  try {
    // 중복 체크
    const { data: existing, error: selErr } = await supabase
      .from("pre_reservations_list")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (selErr) {
      console.error('❌ Supabase SELECT 에러:', {
        code: selErr.code,
        message: selErr.message,
        details: selErr.details
      });
      return res.status(500).json({ 
        message: "조회 중 오류 발생", 
        error: selErr.message 
      });
    }

    if (existing) {
      return res.status(409).json({ message: "이미 사전예약된 이메일입니다." });
    }

    // 저장
    const { data, error: insErr } = await supabase
      .from("pre_reservations_list")
      .insert([{ email, source }]);

    if (insErr) {
      console.error('❌ Supabase INSERT 에러:', {
        code: insErr.code,
        message: insErr.message,
        details: insErr.details,
        hint: insErr.hint,
        isServiceRole
      });
      
      // RLS 관련 오류 감지
      if (insErr.code === '42501' || insErr.message.includes('permission')) {
        return res.status(403).json({ 
          message: "권한 오류: service_role 키를 확인하세요.",
          details: insErr.message
        });
      }
      
      return res.status(500).json({ 
        message: "저장 중 오류 발생",
        details: insErr.message
      });
    }

    console.log('✅ 사전예약 성공:', { email, source });
    return res.status(201).json({ message: "사전예약 완료!", data });
  } catch (err) {
    console.error("❌ 예상치 못한 에러:", err);
    return res.status(500).json({ message: "서버 오류", error: err.message });
  }
});

// 404 핸들러를 API 라우트 뒤로 이동
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public/pages/404.html"));
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행: http://localhost:${PORT}`));
