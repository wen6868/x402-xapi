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
          discoverable: false,
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
app.get("/", (_req, res) => {
  res.send(
    `<h3>x402-xapi</h3>
     <ul>
       <li>POST <code>/x402/twitter/following</code> – Paid via x402</li>
       <li>GET <code>/health</code> – Free health check</li>
     </ul>`
  );
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
