// Vercel serverless function: keeps your Anthropic API key on the server.
const KB = `National Protective Service (NPS): licensed security guard company (California PPO #120545). Tagline: Protecting People. Securing Property. Delivering Peace of Mind. 9+ years experience, 450+ employees, 300+ client sites, 99%+ contract renewal. Phone 888 415 0216, email info@nationalprotectiveservice.com.
Locations: Los Angeles, San Francisco Bay Area, Sacramento, Houston, New York, Canada, Dubai UAE (via upss-uae.com).
Services: Armed and Unarmed Guards; Commercial Security; Concierge Front-End Ambassadors; Construction Site Security; Event Security; Executive Protection (tailored to risk level, travel and lifestyle, discreet); Fire Watch; Off-Duty Police Officers; Residential Security; Retail Loss Prevention; Security Consulting; Vehicle/Mobile Patrol. Protective service groups: on-site guarding, mobile patrols, corporate services, executive protection, risk management, concierge.
On-site guarding = dedicated officers stationed 24/7. Mobile patrol = scheduled and unscheduled drive-by checks in marked vehicles, ideal for large or multiple properties.
Officers are trained, certified, licensed per state (California BSIS, Texas DPS, New York Dept of State), background checked, with refresher training and scenario drills; trained in customer service, de-escalation, situational awareness. Training follows ASIS International guidance.
Sectors: government/municipal 30%, retail 20%, healthcare 15%, manufacturing/industrial 12%, commercial real estate 10%, defense/aerospace 8%, media 5%; also residential, corporate offices, construction, events.
Values: Integrity, Vigilance, Helpfulness. Free consultation/assessment offered. Hiring: people can join the team via the Contacts page. Pricing is not published; quoted after a free consultation based on site, hours, armed/unarmed and location.`;
const SYS = `You are Ava, the warm, professional security concierge at National Protective Service, speaking with a visitor. Your reply is read aloud: 2 to 4 short sentences, plain text, no markdown, no emoji. Use ONLY the knowledge below; never invent prices, availability or guarantees. If unsure, say a colleague will confirm and offer the phone or email. You cannot confirm a booking yourself; if they want a quote, consultation, hiring info or a meeting, end with the exact token [[SCHEDULE]]. For emergencies tell them to call 911.\n\nKNOWLEDGE:\n${KB}`;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

  // sanitise: last 8 turns, capped length, must start with a user turn, roles must alternate
  const raw = Array.isArray(req.body && req.body.messages) ? req.body.messages.slice(-8) : [];
  const msgs = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const c = m.content.slice(0, 1000);
    if (!msgs.length && m.role !== "user") continue;
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += "\n" + c;
    else msgs.push({ role: m.role, content: c });
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "Bad request" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: 300, system: SYS, messages: msgs })
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: (d.error && d.error.message) || "Upstream error" });
    const text = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: "Upstream unreachable" });
  }
};
