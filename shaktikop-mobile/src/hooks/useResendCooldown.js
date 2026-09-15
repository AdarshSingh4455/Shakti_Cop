import { useState, useEffect, useRef } from 'react';

const RESEND_SECONDS = 45;

// OTP भेजने के बाद इसे शुरू करें (startCooldown()) — जब तक गिनती खत्म न हो, resend बटन disabled रहेगा।
export function useResendCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [secondsLeft > 0]);

  const startCooldown = () => setSecondsLeft(RESEND_SECONDS);
  const canResend = secondsLeft <= 0;

  return { secondsLeft, canResend, startCooldown };
}
