// Receives one menu photo, asks Claude to extract the menu as JSON.
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";

const PROMPT = `Extract the menu from this photo. Respond with ONLY a JSON object, no prose, shaped like:
{"restaurant": string|null, "sections": [{"name": string, "dishes": [{"name": string, "description": string, "price": string}]}]}
Rules: keep the menu's own section names (Appetizers, Entrees, Desserts, Drinks, etc.); use "" for missing description/price; do not invent dishes; skip legal text and slogans; if a section continues from another page, still list it by name.`;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const pass = process.env.APP_PASSWORD;
  if (pass && req.headers.get("x-app-key") !== pass) return json(401, { error: "Wrong passphrase" });
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: "ANTHROPIC_API_KEY not set on server" });

  let image;
  try {
    ({ image } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!image) return json(400, { error: "No image" });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  const data = await r.json();
  if (!r.ok) return json(502, { error: data?.error?.message || "Claude API error" });

  const text = data.content?.map((c) => c.text || "").join("") || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return json(502, { error: "Couldn't read a menu from that photo" });
  try {
    return json(200, JSON.parse(match[0]));
  } catch {
    return json(502, { error: "Menu came back malformed, try again" });
  }
};
