import cors from "cors";
import express from "express";
import { z } from "zod";
import { runSimulation } from "./simulation.js";
import type { SimulationRequest } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "braess-api" });
});

const requestSchema = z.object({
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
    routes: z
      .array(
        z.object({
          distanceKm: z.number().positive(),
          durationMin: z.number().positive(),
          geometry: z.array(z.tuple([z.number(), z.number()])).min(2),
          segments: z
            .array(
              z.object({
                distanceKm: z.number().min(0),
                durationMin: z.number().min(0),
                name: z.string().optional(),
                geometry: z.array(z.tuple([z.number(), z.number()])).min(2)
              })
            )
            .optional()
        })
      )
      .optional(),
    reverseRoutes: z
      .array(
        z.object({
          distanceKm: z.number().positive(),
          durationMin: z.number().positive(),
          geometry: z.array(z.tuple([z.number(), z.number()])).min(2),
          segments: z
            .array(
              z.object({
                distanceKm: z.number().min(0),
                durationMin: z.number().min(0),
                name: z.string().optional(),
                geometry: z.array(z.tuple([z.number(), z.number()])).min(2)
              })
            )
            .optional()
        })
      )
      .optional()
  }),
  toggles: z
    .object({
      trafficLight: z.boolean().optional(),
      emergencyPriority: z.boolean().optional()
    })
    .optional()
});

app.post("/api/simulate", (req, res) => {
  const parsed = requestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Geçersiz istek",
      issues: parsed.error.issues
    });
  }

  try {
    const response = runSimulation(parsed.data as SimulationRequest);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({
      message: "Simülasyon hesaplanırken hata oluştu",
      detail: error instanceof Error ? error.message : "Bilinmeyen hata"
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Braess API çalışıyor: http://localhost:${port}`);
});
