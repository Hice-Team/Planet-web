// 스크롤 애니메이션 초기화
const initScrollReveal = () => {
  const observerOptions = {
    threshold: 0.1,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document
    .querySelectorAll(".scroll-reveal")
    .forEach((el) => observer.observe(el));
};

// 네비게이션 바 스크롤 효과 초기화
const initNavigation = () => {
  const nav = document.getElementById("main-nav");
  if (!nav) return;

  let isScrolled = false;

  const handleScroll = () => {
    const scrollY = window.scrollY;

    // 50px 기준으로 상태 변경
    if (scrollY > 50 && !isScrolled) {
      nav.classList.add("nav-scrolled");
      isScrolled = true;
    } else if (scrollY <= 50 && isScrolled) {
      nav.classList.remove("nav-scrolled");
      isScrolled = false;
    }
  };

  // passive: true는 모바일 스크롤 성능을 향상시킵니다.
  window.addEventListener("scroll", handleScroll, { passive: true });
};
// 사전예약 관련 요소들
const emailInput = document.getElementById("userEmail");
const checkbox = document.getElementById("privacyAgree");
const btn = document.getElementById("submitBtn");
const btnText = document.getElementById("btnText");
const errorSpan = document.getElementById("errorMessage"); // 새로 추가한 span
let isProcessing = false; // 중복 제출 방지 플래그

// 전역 캐시 (기존 코드 유지)
const registeredEmailsCache = new Set();

// 공통: 버튼 상태 초기화 함수
function restoreButtonState() {
  btn.disabled = false;
  btn.classList.remove(
    "bg-red-600",
    "bg-green-500",
    "bg-orange-500",
    "opacity-80",
    "cursor-not-allowed",
  );
  btn.classList.add("bg-[#1e293b]");
  btnText.innerText = "지금 사전예약 하기";
  isProcessing = false; // 처리 완료 후 플래그 리셋
}

// 성공 시 UI 복구
function resetSuccessState() {
  console.log("Resetting success state...");
  setTimeout(restoreButtonState, 3000);
}

// 실패 시 UI 복구
function resetErrorState() {
  setTimeout(() => {
    restoreButtonState();
    if (errorSpan) {
      errorSpan.classList.add("hidden");
      errorSpan.innerText = "";
    }
  }, 3000);
}

// 에러 발생 시 UI 처리 함수
function setErrorUI(message) {
  // 1. 버튼 변경: [저장 실패] & Red Color
  btn.disabled = true;
  btn.classList.remove("bg-[#1e293b]", "bg-green-500");
  btn.classList.add("bg-red-600", "cursor-not-allowed");
  btnText.innerText = "저장실패";

  // 2. 인라인 피드백: 입력창 아래 메시지 표시
  if (errorSpan) {
    errorSpan.innerText = message;
    errorSpan.classList.remove("hidden");
  }

  // 3. 3초 후 원상 복구
  resetErrorState();
}

async function handleRegistration(event) {
  // 브라우저의 기본 폼 제출 및 기본 팝업(말풍선) 동작 차단
  if (event) event.preventDefault();

  // 중복 실행 방지
  if (isProcessing) {
    return;
  }

  if (!emailInput || !checkbox || !btn) {
    console.error("Registration form elements not found.");
    return;
  }

  isProcessing = true; // 실제 처리 시작 직전에 플래그 설정
  const email = emailInput.value.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // --- 유효성 검사 시작 (alert 제거) ---

  // 1. 개인정보 동의 체크
  if (!checkbox.checked) {
    setErrorUI("개인정보 이용 및 수집에 동의해주세요.");
    return;
  }

  // 2. 이메일 형식 체크
  if (!emailRegex.test(email)) {
    setErrorUI("올바른 이메일 형식이 아닙니다.");
    emailInput.focus();
    return;
  }

  // 3. 중복 신청 체크 (캐시 확인)
  if (registeredEmailsCache.has(email)) {
    setErrorUI("이미 신청 완료된 이메일입니다.");
    return;
  }

  // --- API 요청 시작 ---
  btn.disabled = true;
  btnText.innerText = "처리 중...";

  let response;
  let result;

  try {
    response = await fetch("/api/pre-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "founders_register" }),
    });

    result = await response.json();
  } catch (err) {
    console.error("Network Error:", err);
    setErrorUI("네트워크 연결을 확인해주세요.");
    return;
  }

  // 상태 코드별 처리 (try-catch 외부에서 실행하여 성공 후 에러 UI로 넘어가는 것 방지)
  if (response.status === 201) {
    registeredEmailsCache.add(email);
    btnText.innerText = "등록 완료";
    btn.classList.remove("bg-[#1e293b]");
    btn.classList.add("bg-green-500");
    emailInput.value = "";
    resetSuccessState();
    return;
  }

  // 에러 응답 처리
  switch (response.status) {
    case 409:
      registeredEmailsCache.add(email);
      btn.disabled = true;
      btn.classList.remove("bg-[#1e293b]");
      btn.classList.add("bg-orange-500"); // 중복은 주황색으로 표시
      btnText.innerText = "이미 등록됨";

      if (errorSpan) {
        errorSpan.innerText = result.message || "이미 등록된 이메일입니다.";
        errorSpan.classList.remove("hidden");
      }
      resetErrorState();
      return;

    case 400:
    case 429:
    case 500:
    default:
      let message;
      if (response.status === 400)
        message = "유효하지 않은 이메일입니다. 다시 한 번 확인해주세요.";
      else if (response.status === 429)
        message =
          "너무 많은 요청이 감지되었습니다. 1시간 후에 다시 시도해주세요.";
      else if (response.status === 500)
        message = "서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
      else message = result.message || "알 수 없는 오류가 발생했습니다.";
      setErrorUI(message);
      break;
  }
}

// 버튼 클릭 이벤트 바인딩
btn.addEventListener("click", handleRegistration);

// 모든 초기화 실행
document.addEventListener("DOMContentLoaded", () => {
  initScrollReveal();
  initNavigation();
});

// 모바일 네비게이션 토글
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileSidebar = document.getElementById("mobile-sidebar");
const navLinks = document.querySelectorAll(".mobile-nav-link");

function toggleMobileMenu() {
  const isOpen = mobileSidebar.classList.contains("translate-x-0");
  if (isOpen) {
    mobileSidebar.classList.remove("translate-x-0");
    mobileSidebar.classList.add("translate-x-full");
    mobileMenuBtn.classList.remove("menu-active");
    document.body.style.overflow = "";
  } else {
    mobileSidebar.classList.remove("translate-x-full");
    mobileSidebar.classList.add("translate-x-0");
    mobileMenuBtn.classList.add("menu-active");
    document.body.style.overflow = "hidden";
  }
}

mobileMenuBtn.addEventListener("click", toggleMobileMenu);
navLinks.forEach((link) => link.addEventListener("click", toggleMobileMenu));
