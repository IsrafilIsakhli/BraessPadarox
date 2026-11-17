import "./env.js";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { runAdvancedSimulation } from "./advancedSimulation.js";
import { validateRoadScenarios } from "./roadRouting.js";
import { analyzeLiveTraffic, LiveTrafficError } from "./liveTraffic.js";
import { runSimulation } from "./simulation.js";
import type {
  AdvancedSimulationRequest,
  Language,
  SimulationRequest
} from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed"));
    }
  })
);
app.use(express.json({ limit: "2mb" }));

const rateWindows = new Map<string, { startedAt: number; count: number }>();

function liveTrafficRateLimit(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const now = Date.now();
  const key = req.ip || "unknown";
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= 30) {
    return res.status(429).json({
      message: "Live traffic request limit reached. Please wait one minute.",
      code: "LOCAL_RATE_LIMIT"
    });
  }
  current.count += 1;
  return next();
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "braess-api",
    liveTrafficConfigured: Boolean(process.env.TOMTOM_API_KEY?.trim())
  });
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

const legacyRequestSchema = z.object({
  language: z.enum(["en", "tr"]).optional(),
  demandVehPerHour: z.number().min(100).max(12000).optional(),
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
    reverseRoutes: z.array(routeSchema).optional(),
    candidateConnector: z
      .object({
        from: z.object({
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180)
        }),
        to: z.object({
          lat: z.number().min(-90).max(90),
          lon: z.number().min(-180).max(180)
        }),
        route: routeSchema
      })
      .optional()
  }),
  toggles: z
    .object({
      trafficLight: z.boolean().optional(),
      emergencyPriority: z.boolean().optional()
    })
    .optional()
});

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
});

const newRoadScenarioSchema = z.object({
  type: z.literal("newRoad"),
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(120).optional(),
  geometry: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).min(2).max(20000),
  waypoints: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).min(2).max(12).optional(),
  direction: z.enum(["one-way", "two-way"]),
  laneCount: z.number().int().min(1).max(8),
  speedLimitKmh: z.number().min(10).max(160),
  capacityVehPerHour: z.number().min(100).max(20_000).optional()
});

const closureScenarioSchema = z.object({
  type: z.literal("closure"),
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(120).optional(),
  edgeId: z.string().min(1).max(180).optional()
  ,location: coordinatesSchema.optional()
});

const signalScenarioSchema = z.object({
  type: z.literal("signal"),
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(120).optional(),
  nodeId: z.string().min(1).max(180).optional(),
  location: coordinatesSchema.optional(),
  cycleSeconds: z.number().min(30).max(240).optional(),
  greenRatio: z.number().min(0.15).max(0.85).optional()
});

const emergencyScenarioSchema = z.object({
  type: z.literal("emergencyPriority"),
  id: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(120).optional()
});

const advancedRequestSchema = z.object({
  mode: z.enum(["static", "live-calibrated"]),
  language: z.enum(["en", "tr"]).optional(),
  start: coordinatesSchema,
  end: coordinatesSchema,
  demand: z
    .object({
      forwardVehPerHour: z.number().min(0).max(12_000).optional(),
      reverseVehPerHour: z.number().min(0).max(12_000).optional()
    })
    .optional(),
  routeMeta: z
    .object({
      routes: z.array(routeSchema).max(6).optional(),
      reverseRoutes: z.array(routeSchema).max(6).optional()
    })
    .optional(),
  scenarios: z
    .array(
      z.discriminatedUnion("type", [
        newRoadScenarioSchema,
        closureScenarioSchema,
        signalScenarioSchema,
        emergencyScenarioSchema
      ])
    )
    .max(8)
});

const liveTrafficRequestSchema = z.object({
  language: z.enum(["en", "tr"]).optional(),
  start: coordinatesSchema,
  end: coordinatesSchema,
  departAt: z.union([z.literal("now"), z.string().datetime()]).optional()
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

app.post("/api/live-traffic/analyze", liveTrafficRateLimit, async (req, res) => {
  const language = requestLanguage(req.body);
  const parsed = liveTrafficRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: apiMessages[language].invalid,
      issues: parsed.error.issues
    });
  }

  try {
    const result = await analyzeLiveTraffic(
      parsed.data.start,
      parsed.data.end,
      parsed.data.language ?? "en"
    );
    return res.json(result);
  } catch (error) {
    if (error instanceof LiveTrafficError) {
      return res.status(error.status).json({ message: error.message, code: error.code });
    }
    return res.status(500).json({ message: apiMessages[language].failed });
  }
});

app.post("/api/simulate", liveTrafficRateLimit, async (req, res) => {
  const language = requestLanguage(req.body);
  const messages = apiMessages[language];
  const isAdvancedRequest =
    req.body && typeof req.body === "object" && ("mode" in req.body || "scenarios" in req.body);

  if (isAdvancedRequest) {
    const advanced = advancedRequestSchema.safeParse(req.body);
    if (!advanced.success) {
      return res.status(400).json({
        message: messages.invalid,
        issues: advanced.error.issues
      });
    }

    try {
      let liveTraffic;
      if (advanced.data.mode === "live-calibrated") {
        try {
          liveTraffic = await analyzeLiveTraffic(
            advanced.data.start,
            advanced.data.end,
            advanced.data.language ?? "en"
          );
        } catch (error) {
          const hasStaticFallback = Boolean(advanced.data.routeMeta?.routes?.length);
          if (!hasStaticFallback) throw error;
        }
      }
      const verified = await validateRoadScenarios(advanced.data as AdvancedSimulationRequest);
      return res.json(runAdvancedSimulation(verified, liveTraffic));
    } catch (error) {
      if (error instanceof LiveTrafficError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      return res.status(500).json({
        message: messages.failed,
        detail: error instanceof Error ? error.message : messages.unknown
      });
    }
  }

  const parsed = legacyRequestSchema.safeParse(req.body);

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
