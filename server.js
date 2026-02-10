import "dotenv/config";
import { fileURLToPath } from "url";
import supabase, { isServiceRole } from "./public/scripts/lib/supabase.js";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import path from "path";

// 익스프레스 앱 초기화
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 미들웨어 설정
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

const globalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  message: { message: "Too many requests, please try again later." },
});
app.use("/api/", globalLimiter);

app.use(cors());
app.use(express.json({ limit: "10kb" }));

app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }),
);

// 정적 파일 서빙 및 캐싱 최적화
const CACHE_TIME = 86400000 * 7;
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: CACHE_TIME,
    index: false,
    etag: true,
    lastModified: true,
  }),
);

// [페이지 라우트 등록]
let emailCache = new Set();
const getPage = (fileName) =>
  path.join(__dirname, `public/pages/${fileName}.html`);

app.get("/", async (req, res) => {
  console.log("🏠 Main page requested");

  emailCache.clear();
  fetchPreReservationEmails();
  console.log("♻️ Email Cache Data :", emailCache);

  res.sendFile(getPage("main"));
});

app.get("/privacy", (req, res) => res.sendFile(getPage("privacy")));

// [API 라우트: 사전예약 데이터 조회]
async function fetchPreReservationEmails() {
  const { data, error } = await supabase
    .from("pre_reservations_list")
    .select("email");

  if (error) {
    console.error("❌ DB 조회 실패:", error);
    return;
  }

  data.forEach((row) => emailCache.add(row.email));
}

// [API 라우트: 사전예약 데이터 추가]
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    message: "Too many registration attempts. Please try again after an hour.",
  },
});

app.post("/api/pre-register", registerLimiter, async (req, res) => {
  console.log("📩 API Start");
  console.log("💾 Email Cache Data:", emailCache);
  console.log("📝 Received Data:", req.body);

  const { email, source } = req.body;

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format." });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. 캐시를 먼저 확인하여 중복 요청을 빠르게 처리 (최적화)
    if (emailCache.has(normalizedEmail)) {
      return res.status(409).json({
        message: "This email is already registered.",
      });
    }

    // 2. 데이터베이스에 이메일 삽입 시도
    const { data, error: insErr } = await supabase
      .from("pre_reservations_list")
      .insert([{ email: normalizedEmail, source: source || "founders_register" }]);

    // 3. 삽입 중 에러 처리
    if (insErr) {
      // PostgreSQL의 'unique_violation' 에러 코드 '23505'
      // 동시 요청으로 인해 DB에 먼저 저장된 경우, 중복으로 처리
      if (insErr.code === "23505") {
        console.warn(`⚠️ 중복 저장 시도 감지 (Race Condition): ${normalizedEmail}`);
        emailCache.add(normalizedEmail); // 캐시를 최신 상태로 업데이트
        return res.status(409).json({ message: "This email is already registered." });
      }
      // 그 외 다른 DB 에러는 서버 에러로 처리
      throw insErr;
    }

    // 4. 성공 시 캐시 업데이트 및 성공 응답 반환
    emailCache.add(normalizedEmail);
    console.log("✅ New registration added:", normalizedEmail);
    return res.status(201).json({ message: "Registration successful!", data });
  } catch (err) {
    console.error("❌ Registration Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// 404 핸들러
app.use((req, res) => {
  res
    .status(404)
    .sendFile(path.join(__dirname, "public/pages/404.html"));
});

// 서버 시작
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  emailCache.clear();
  console.log("♻️ Email cache cleared on server start.");
  console.log(`🚀 Server is running on: http://localhost:${PORT}`);
  console.log(`🛡️ Security: Helmet & Rate-limit active`);
  console.log(`📦 Optimization: Gzip compression & Static caching active`);
});
