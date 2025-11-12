import "dotenv/config";
import express, { Request, Response } from "express";
import { z } from "zod";
import { Network, paymentMiddleware } from "x402-express";
import { facilitator as mainnetFacilitator } from "@coinbase/x402";
import { FacilitatorConfig } from "x402/types";

const app = express();
app.use(express.json());

// ─── Configure CDP keys ───────────────────────────────────────────
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
  throw new Error("Missing CDP_API_KEY_ID or CDP_API_KEY_SECRET in env");
}

// ─── ENV ───────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4021;
const RECEIVER = (process.env.X402_PAY_TO ?? "") as `0x${string}`;
const NETWORK = (process.env.X402_NETWORK || "base-sepolia") as Network;
const FACILITATOR_URL = process.env.FACILITATOR_URL;
const PRICE = process.env.TW_FOLLOW_PRICE || "$0.10";
const ASSET = process.env.X402_ASSET || "USDC";

const EXTERNAL_API_URL = process.env.EXTERNAL_FOLLOW_API_URL!;
const EXTERNAL_API_KEY = process.env.EXTERNAL_FOLLOW_API_KEY!;

if (!RECEIVER) throw new Error("Missing X402_PAY_TO in .env");

if (!EXTERNAL_API_URL)
  throw new Error("Missing EXTERNAL_FOLLOW_API_URL in .env");
if (!EXTERNAL_API_KEY)
  throw new Error("Missing EXTERNAL_FOLLOW_API_KEY in .env");

const facilitatorOption: FacilitatorConfig | undefined = FACILITATOR_URL
  ? { url: FACILITATOR_URL as `${string}://${string}` }
  : mainnetFacilitator; // hoặc undefined

app.use(
  paymentMiddleware(
    RECEIVER,
    {
      "POST /x402/twitter/following": {
        price: PRICE,
        network: NETWORK,
        config: {
          discoverable: true,
          description: "Checks if one Twitter X account follows another on X.",

          inputSchema: {
            bodyType: "json",
            bodyFields: {
              source_username: {
                type: "string",
                required: true,
                description: "Twitter username of the follower",
              },
              target_username: {
                type: "string",
                required: true,
                description: "Twitter username of the account being followed",
              },
            },
          },

          outputSchema: {
            type: "object",
            properties: {
              follow: {
                type: "boolean",
                description:
                  "True if the source account follows the target account",
              },
            },
            example: { follow: true },
          },
        },
      },
    },
    facilitatorOption
  )
);

// ─── Schema ────────────────────────────────────────────────
const FollowCheckSchema = z.object({
  source_username: z.string().min(1),
  target_username: z.string().min(1),
});

// ─── Internal check (hidden external provider) ─────────────
async function internalFollowCheck(
  source: string,
  target: string
): Promise<boolean> {
  const res = await fetch(EXTERNAL_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: EXTERNAL_API_KEY,
    },
    body: JSON.stringify({
      // mapping sang provider
      user_handle: source,
      project_handle: target,
    }),
  });

  // Provider returns { message: string } with 400/403/404/500
  if (!res.ok) {
    let message = "External service error";
    try {
      const errBody = await res.json();
      if (typeof errBody?.message === "string") message = errBody.message;
    } catch {}
    // log ẩn danh
    console.warn(`[External Error ${res.status}] ${message}`);
    throw { status: res.status, message };
  }

  // Provider success: { follow: boolean } (or fallback to is_following)
  const data = await res.json().catch(() => ({}));
  const follow =
    (typeof data?.follow === "boolean" ? data.follow : undefined) ??
    (typeof data?.is_following === "boolean" ? data.is_following : false);
  return !!follow;
}

// ─── Route ────────────────────────────────────────────────
app.post("/x402/twitter/following", async (req: Request, res: Response) => {
  try {
    const { source_username, target_username } = FollowCheckSchema.parse(
      req.body
    );
    const follow = await internalFollowCheck(source_username, target_username);
    return res.status(200).json({ follow });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request body" });
    }
    if (err?.status) {
      return res
        .status(err.status)
        .json({ message: err.message || "External error" });
    }
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Health (free) ────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// ─── Root ─────────────────────────────────────────────────
// ... các import & config phía trên giữ nguyên
const BASE_URL = process.env.BASE_URL || "https://x402-xapi.onrender.com";

app.use(
  "/assets",
  express.static("public/assets", { maxAge: "30d", immutable: true })
);

app.get("/", (_req: Request, res: Response) => {
  const url = `${BASE_URL}/`;
  const img = `${BASE_URL}/assets/twitterx_thumbnail_icon.png`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />

<title>Twitter X Verification — Verify Follows via API | x402scan</title>
<meta name="description" content="Twitter X Verification instantly checks if one X (Twitter) account follows another via API. Ideal for airdrop tasks, campaign verification, and gated systems." />
<meta name="keywords" content="twitter verification, x verification, verify follow, proof of follow, twitter api, x api, airdrop verification, x402, x402scan" />
<meta name="author" content="x402scan Team" />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Twitter X Verification — Verify Follows via API" />
<meta property="og:description" content="Check if users follow specific Twitter/X accounts instantly. Powered by x402scan." />
<meta property="og:image" content="${img}" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="${url}" />
<meta name="twitter:title" content="Twitter X Verification — Verify Follows via API" />
<meta name="twitter:description" content="Check if one Twitter/X account follows another — simple API for campaigns and quests." />
<meta name="twitter:image" content="${img}" />

<link rel="canonical" href="${url}" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#0A0E14" />

<!-- Favicons -->
<link rel="icon" href="${BASE_URL}/assets/twitterx_thumbnail_icon.png" type="image/png" />
<link rel="shortcut icon" href="${BASE_URL}/assets/twitterx_verification_icon.png" type="image/png" />
<link rel="apple-touch-icon" href="${BASE_URL}/assets/twitterx_thumbnail_icon.png" />

</head>
<body style="margin:0;background:#0A0E14;color:#FFF;font-family:system-ui,Roboto,Inter,Helvetica,Arial,sans-serif;">
  <main style="max-width:900px;margin:48px auto;padding:0 20px;">
    <h1 style="font-size:2.5rem;margin-bottom:0.5em;">Twitter X Verification</h1>
    <p style="opacity:0.85;max-width:720px;">
      Instantly verify if one Twitter/X account follows another via API and webhook.<br/>
      Built on x402scan — ideal for airdrops, quests, or gated access systems.
    </p>
    <img src="${img}" alt="Twitter X Verification cover" style="max-width:100%;border-radius:12px;margin-top:28px;" />
    <section style="margin-top:32px;opacity:.9">
      <code>POST /x402/twitter/following</code> — Paid via x402<br/>
      <code>GET /health</code> — Free health check
    </section>
  </main>
</body>
</html>`;

  res.set("Cache-Control", "public, max-age=300");
  res.status(200).type("html").send(html);
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
