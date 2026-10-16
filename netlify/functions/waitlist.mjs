const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const validRoles = new Set(["tenant", "landlord", "agent", "other", "not-specified"]);

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const role = typeof payload?.role === "string" ? payload.role : "not-specified";
  if (!name || name.length > 100 || !emailPattern.test(email) || email.length > 254 || !validRoles.has(role)) {
    return Response.json({ error: "Enter a valid name, email, and role." }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: "Waitlist storage is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/waitlist`, {
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
        utm: payload?.utm && typeof payload.utm === "object" && !Array.isArray(payload.utm) ? payload.utm : {},
      }),
    });

    if (response.status === 409) {
      return Response.json({ error: "Email is already registered." }, { status: 409 });
    }
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      if (details.code === "23505") {
        return Response.json({ error: "Email is already registered." }, { status: 409 });
      }
      console.error("Supabase waitlist insert failed:", response.status, details.code);
      return Response.json({ error: "We couldn't save your signup. Please try again." }, { status: 500 });
    }

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Supabase waitlist request failed:", error);
    return Response.json({ error: "We couldn't save your signup. Please try again." }, { status: 500 });
  }
};
