const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const validRoles = new Set(["tenant", "landlord", "agent", "other", "not-specified"]);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: "Invalid request body." });
    }
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const role = typeof payload.role === "string" ? payload.role : "not-specified";
  if (!name || name.length > 100 || !emailPattern.test(email) || email.length > 254 || !validRoles.has(role)) {
    return res.status(400).json({ error: "Enter a valid name, email, and role." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return res.status(503).json({ error: "Waitlist storage is not configured." });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/waitlist`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        name,
        email,
        role,
        utm: payload.utm && typeof payload.utm === "object" && !Array.isArray(payload.utm) ? payload.utm : {},
      }),
    });

    if (response.status === 409) {
      return res.status(409).json({ error: "Email is already registered." });
    }
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      if (details.code === "23505") {
        return res.status(409).json({ error: "Email is already registered." });
      }
      console.error("Supabase waitlist insert failed:", response.status, details.code);
      return res.status(500).json({ error: "We couldn't save your signup. Please try again." });
    }

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Supabase waitlist request failed:", error);
    return res.status(500).json({ error: "We couldn't save your signup. Please try again." });
  }
}
