import type { User } from "firebase/auth";

/** Ask the trusted server to apply the one-time referral signup bonus. */
export async function requestReferralSignupReward(user: User): Promise<boolean> {
  try {
    const idToken = await user.getIdToken();
    const response = await fetch("/api/referrals/signup-reward", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.success === true;
  } catch {
    return false;
  }
}
