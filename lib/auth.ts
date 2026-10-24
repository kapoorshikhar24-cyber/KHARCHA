import crypto from "crypto";

export interface PasswordStrengthResult {
  isValid: boolean;
  score: number; // 0 to 4
  label: "Too Weak" | "Weak" | "Fair" | "Good" | "Strong";
  errors: string[];
}

/**
 * Validates email address format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates international phone numbers e.g. +91 9876543210 or 9876543210
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  const cleaned = phone.replace(/[\s\-().]/g, "");
  return /^\+?[0-9]{7,15}$/.test(cleaned);
}

/**
 * Normalizes phone numbers with country code prefix
 */
export function normalizePhoneNumber(phone: string, defaultCountryCode = "+91"): string {
  if (!phone) return "";
  let cleaned = phone.trim().replace(/[\s\-().]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.length === 10) {
      cleaned = `${defaultCountryCode}${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

/**
 * Evaluates password strength according to security standards:
 * - Minimum 8 characters
 * - Contains lowercase and uppercase letters
 * - Contains at least one number
 * - Contains at least one special character
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];
  if (!password || typeof password !== "string") {
    return {
      isValid: false,
      score: 0,
      label: "Too Weak",
      errors: ["Password is required"],
    };
  }

  if (password.length < 8) {
    errors.push("Must be at least 8 characters long");
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasLower || !hasUpper) {
    errors.push("Must contain both uppercase and lowercase letters");
  }
  if (!hasDigit) {
    errors.push("Must contain at least one number (0-9)");
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (hasLower && hasUpper) score++;
  if (hasDigit) score++;
  if (hasSpecial) score++;
  if (password.length >= 12) score = Math.min(score + 1, 4);

  let label: PasswordStrengthResult["label"] = "Too Weak";
  if (score === 1) label = "Weak";
  else if (score === 2) label = "Fair";
  else if (score === 3) label = "Good";
  else if (score >= 4) label = "Strong";

  return {
    isValid: errors.length === 0,
    score,
    label,
    errors,
  };
}

/**
 * Hashes a password using crypto.scrypt with a random 16-byte salt
 */
export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

/**
 * Verifies a password against a stored salt and hash using timing-safe comparison
 */
export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  try {
    const computedHash = crypto.scryptSync(password, salt, 64).toString("hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    const computedBuf = Buffer.from(computedHash, "hex");
    if (storedBuf.length !== computedBuf.length) return false;
    return crypto.timingSafeEqual(storedBuf, computedBuf);
  } catch {
    return false;
  }
}

/**
 * Generates a secure numeric 6-digit verification / reset code
 */
export function generateSixDigitCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * In-memory sliding-window rate limiter
 */
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60 * 1000
): { isAllowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return { isAllowed: true, remaining: maxRequests - 1, retryAfterSec: 0 };
  }

  if (record.count >= maxRequests) {
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
    return { isAllowed: false, remaining: 0, retryAfterSec };
  }

  record.count++;
  return { isAllowed: true, remaining: maxRequests - record.count, retryAfterSec: 0 };
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

