import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const intakeSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  preferredDays: z.string().optional(),
  makeModelAge: z.string().optional(),
  details: z.string().optional(),
  anythingElse: z.string().optional(),
  pipelineState: z.string().optional(),
  lastError: z.string().optional(),
  needsReview: z.boolean().optional()
});

const aiReadSchema = z.object({
  summary: z.string(),
  likelyCategory: z.string(),
  urgency: z.enum(["low", "normal", "high"]),
  suggestedNextStep: z.string(),
  questionsToAsk: z.array(z.string()).max(3),
  caution: z.string()
});

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const parsed = intakeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid intake payload." }, { status: 400 });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You help Classic Fireplace ServiceOps staff understand webform intakes. You are assistant-only, never the final decision-maker. Return compact JSON only."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Summarize this fireplace service intake for a non-technical operations employee.",
            complexityRules: {
              L1: "Complex or safety/diagnostic work. Gas smell, no heat, pilot will not stay lit, shutdowns, valves, thermocouple/thermopile, ignition module, older unit with repair symptoms. Travis only.",
              L2: "Intermediate diagnosis or targeted repair. Igniter, remote, fan/blower, soot, glass, smell without clear gas leak, inspection. Chris or Matt.",
              L3: "Standard maintenance or routine cleaning/service. Chris or Matt."
            },
            outputShape: {
              summary: "Plain-English one sentence.",
              likelyCategory: "Short service category.",
              urgency: "low | normal | high",
              suggestedNextStep: "One operational next step. Do not claim that a real action was completed.",
              questionsToAsk: ["Up to 3 clarifying customer questions."],
              caution: "One assistant-only disclaimer."
            },
            intake: parsed.data
          })
        }
      ]
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = aiReadSchema.safeParse(JSON.parse(content));
    if (!result.success) {
      return NextResponse.json({ error: "AI response was not in the expected format." }, { status: 502 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI intake summary failed." },
      { status: 500 }
    );
  }
}
