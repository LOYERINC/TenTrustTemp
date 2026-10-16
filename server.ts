import express from "express";
import path from "path";
import { createServer as createViteServer, loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const env = { ...loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""), ...process.env };
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  app.use(express.json());

  // The public key can only insert because the waitlist table has insert-only RLS.
  app.post("/api/waitlist", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const role = typeof req.body?.role === "string" ? req.body.role : "not-specified";
    const validRoles = new Set(["tenant", "landlord", "agent", "other", "not-specified"]);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

    if (!name || name.length > 100 || !emailPattern.test(email) || email.length > 254 || !validRoles.has(role)) {
      return res.status(400).json({ error: "Enter a valid name, email, and role." });
    }

    if (!supabase) {
      return res.status(503).json({ error: "Waitlist storage is not configured." });
    }

    try {
      const { error } = await supabase.from("waitlist").insert({
        name,
        email,
        role,
        submitted_at: new Date().toISOString(),
        utm: req.body?.utm && typeof req.body.utm === "object" ? req.body.utm : {},
      });
      if (error?.code === "23505") return res.status(409).json({ error: "Email is already registered." });
      if (error) throw error;
      return res.status(201).json({ success: true });
    } catch (error) {
      console.error("Supabase waitlist insert failed:", error);
      return res.status(500).json({ error: "We couldn't save your signup. Please try again." });
    }
  });

  // Serve the standalone Coming Soon page on the main site's origin.
  app.use("/comingsoon", express.static(path.join(process.cwd(), "comingsoon"), { extensions: ["html"] }));

  // API endpoints
  app.post("/api/estimate", async (req, res) => {
    try {
      const { propertyDetails } = req.body;
      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Act as a real estate pricing AI for Lagos, Nigeria. The user will provide property details. Give a realistic estimated rent range in NGN per year, a short 2-sentence market analysis, and a confidence score out of 100%. Return only a JSON object matching this structure: {"estimatedRange": "₦X,XXX,XXX - ₦Y,YYY,YYY", "analysis": "...", "confidence": 85}. Details: ${propertyDetails}`,
        config: {
          responseMimeType: "application/json",
        }
      });
      res.json(JSON.parse(response.text || '{}'));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message, context } = req.body;
      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
      
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: message,
        config: {
          systemInstruction: `You are an AI assistant for TenTrust, a real estate platform. 
          Use this context about properties and the platform to answer questions: ${context}.
          Be helpful to both landlords and tenants. Keep answers concise.
          IMPORTANT: Always reply in the exact language requested in the user context.`,
        }
      });
      res.json({ reply: response.text });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: { usePolling: true, interval: 1000 },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Notice Express version in prompt says to use * for v4 and *all for v5
    // Actually the package.json has express ^4.22.2 so * is fine. Let's use *
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
