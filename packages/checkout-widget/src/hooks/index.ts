/**
 * Issue #272: Headless React hooks package exports.
 *
 * Zero CSS overhead — export unstyled primitives so merchants can style
 * with their own Tailwind / CSS modules.
 */

export {
  useOrbitCheckout,
  default,
  type CheckoutStatus,
  type CheckoutError,
  type VaultData,
  type UseOrbitCheckoutOptions,
  type UseOrbitCheckoutReturn,
} from "./useOrbitCheckout";
