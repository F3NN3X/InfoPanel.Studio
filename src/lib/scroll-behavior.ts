/** "smooth" unless the OS asks for reduced motion (CSS `scroll-behavior` doesn't govern a scripted `behavior`). */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
