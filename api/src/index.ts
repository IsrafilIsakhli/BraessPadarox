import cors from "cors";
import express from "express";
import { z } from "zod";
import { runSimulation } from "./simulation.js";
import type { Language, SimulationRequest } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "braess-api" });
});

const routeSegmentSchema = z.object({
  distanceKm: z.number().min(0),
  durationMin: z.number().min(0),
  name: z.string().optional(),
  geometry: z.array(z.tuple([z.number(), z.number()])).min(2)
});

const routeSchema = z.object({
  distanceKm: z.number().positive(),
  durationMin: z.number().positive(),
  geometry: z.array(z.tuple([z.number(), z.number()])).min(2),
  segments: z.array(routeSegmentSchema).optional()
});

const requestSchema = z.object({
  language: z.enum(["en", "tr"]).optional(),
  start: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180)
  }),
  end: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180)
  }),
  routeMeta: z.object({
    distanceKm: z.number().positive(),
    durationMin: z.number().positive(),
    alternativeDurationMin: z.number().positive().optional(),
    routes: z.array(routeSchema).optional(),
    reverseRoutes: z.array(routeSchema).optional()
  }),
  toggles: z
    .object({
      trafficLight: z.boolean().optional(),
      emergencyPriority: z.boolean().optional()
    })
    .optional()
});

const apiMessages: Record<Language, { invalid: string; failed: string; unknown: string }> = {
  en: {
    invalid: "Invalid request",
    failed: "Simulation failed",
    unknown: "Unknown error"
  },
  tr: {
    invalid: "Geçersiz istek",
    failed: "Simülasyon başarısız oldu",
    unknown: "Bilinmeyen hata"
  }
};

function requestLanguage(body: unknown): Language {
  if (body && typeof body === "object" && "language" in body) {
    return (body as { language?: unknown }).language === "tr" ? "tr" : "en";
  }

  return "en";
}

app.post("/api/simulate", (req, res) => {
  const language = requestLanguage(req.body);
  const messages = apiMessages[language];
  const parsed = requestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: messages.invalid,
      issues: parsed.error.issues
    });
  }

  try {
    const response = runSimulation(parsed.data as SimulationRequest);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      message: messages.failed,
      detail: error instanceof Error ? error.message : messages.unknown
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Braess API running: http://localhost:${port}`);
});
