import { isGuestWallet } from "./solana/address";

export { isGuestWallet };

/** Anonymous player id for free play (localStorage). Not a Solana address. */
export function getGuestWallet(): string {
  if (typeof window === "undefined") return "";
  const key = "cybersol_guest_id";
  const fresh = () => `guest_${crypto.randomUUID().replace(/-/g, "")}`;
  try {
    let id = window.localStorage.getItem(key);
    if (!id || !isGuestWallet(id)) {
      id = fresh();
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return fresh();
  }
}
