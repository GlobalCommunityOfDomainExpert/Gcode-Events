export interface PasswordRule {
  label: string;
  test: (password: string) => boolean;
}


// use zxcvbn to measure password strength

export const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number", test: (pw) => /[0-9]/.test(pw) },
  { label: "One symbol", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function passwordScore(password: string): number {
  return PASSWORD_RULES.filter((rule) => rule.test(password)).length;
}

export function isPasswordValid(password: string): boolean {
  return passwordScore(password) === PASSWORD_RULES.length;
}
