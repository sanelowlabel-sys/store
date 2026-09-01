import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // AI Shopping Assistant Endpoint using @google/genai
  app.post("/api/ai-shopping-assistant", async (req, res) => {
    try {
      const { userQuery, products } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.json({
          text: "I am Sanelow Label's Merch Concierge! Here are some top recommendations from our official merchandise collection based on your request.",
          recommendedProductIds: ["prod-1", "prod-2", "prod-4"]
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const catalogSummary = (products || []).map((p: any) => `- ID: ${p.id}, Name: ${p.name}, Category: ${p.category}, Price: $${p.price}, Tagline: ${p.tagline}`).join("\n");

      const systemInstruction = `You are "Sanelow Merch Concierge", an expert apparel consultant for Sanelow Label official merchandise store.
Analyze the user's prompt and recommend 1 to 3 relevant products from the provided store catalog.
Your response MUST be JSON format with the following structure:
{
  "reply": "Your friendly, enthusiastic, 2-3 sentence personalized recommendation explaining why these items match their style or size request.",
  "recommendedProductIds": ["prod-id-1", "prod-id-2"]
}
Keep recommendedProductIds strictly to valid product IDs from the list provided.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Store Catalog:\n${catalogSummary}\n\nUser Question/Request: "${userQuery}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        },
      });

      try {
        const parsed = JSON.parse(response.text || "{}");
        return res.json({
          text: parsed.reply || "Here are my top curated recommendations for you.",
          recommendedProductIds: parsed.recommendedProductIds || []
        });
      } catch (parseErr) {
        return res.json({
          text: response.text || "Here are some items from our catalog that match your style preferences.",
          recommendedProductIds: ["prod-1", "prod-2"]
        });
      }
    } catch (err: any) {
      console.error("AI Assistant error:", err);
      return res.json({
        text: "I'd be happy to help you discover our finest pieces! Take a look at these popular customer favorites.",
        recommendedProductIds: ["prod-1", "prod-4"]
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`WooCommerce POD Architect server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
