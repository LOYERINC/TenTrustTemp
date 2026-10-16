const FORM_ENDPOINT = "/api/waitlist";
const COOLDOWN_MS = 3000;
let lastSubmissionAt = 0;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const forms = document.querySelectorAll("[data-signup-form]");

function setError(form, message) {
  const error = form.querySelector(".form-error");
  if (error) error.textContent = message;
}

function getUtmParameters() {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
    .map((key) => [key, params.get(key)])
    .filter(([, value]) => value));
}

forms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError(form, "");
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const roleInput = form.querySelector('input[name="role"]:checked');
    const roleRequired = Boolean(form.querySelector('input[name="role"]'));
    const honeypot = form.elements.website?.value.trim();
    const button = form.querySelector('button[type="submit"]');

    if (honeypot) return;
    if (!name || name.length > 100) {
      setError(form, "Enter your name (up to 100 characters). ");
      form.elements.name.focus();
      return;
    }
    if (!emailPattern.test(email)) {
      setError(form, "Enter a valid email address so we know where to reach you.");
      form.elements.email.focus();
      return;
    }
    if (roleRequired && !roleInput) {
      setError(form, "Choose the option that best describes you.");
      form.querySelector('input[name="role"]')?.focus();
      return;
    }
    if (Date.now() - lastSubmissionAt < COOLDOWN_MS) {
      setError(form, "One moment — please wait before trying again.");
      return;
    }
    lastSubmissionAt = Date.now();
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
    const label = button.querySelector(".button-label");
    const originalLabel = label.textContent;
    label.textContent = "Joining…";

    const payload = {
      name,
      email,
      role: roleInput?.value || "not-specified",
      submitted_at: new Date().toISOString(),
      utm: getUtmParameters()
    };

    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.status === 409) {
        setError(form, "That email is already on the list. Thanks for your interest!");
        return;
      }
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const success = form.parentElement.querySelector(".success-panel");
      if (success) {
        form.hidden = true;
        success.hidden = false;
        success.focus?.();
      } else {
        form.reset();
        setError(form, "Thanks — you're on the early access list!");
      }
    } catch (error) {
      console.error("Waitlist submission failed:", error);
      setError(form, "We couldn't send that just now. Please try again in a moment.");
      lastSubmissionAt = 0;
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
      label.textContent = originalLabel;
    }
  });
});

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
