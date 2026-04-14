const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY
});

// ─── DevCenter Company Context (baked into every AI call) ────────
const COMPANY_CONTEXT = `
You are writing emails on behalf of Jubair, CEO of DevCenter.

ABOUT DEVCENTER:
- Dev agency based in Bangladesh, 5+ years, 20+ projects, 40+ clients
- CEO: Md. Jubair Hossain (DevOps, AI/ML, Flutter, backend)
- CTO: Md. Bulbul Hossain (Lead Flutter Developer)
- Team of 8+ Flutter and AI developers

SERVICES (pick only the ONE most relevant per email):
1. AI & Machine Learning — custom AI agents, NLP, chatbots (LangChain, TensorFlow, OpenAI)
2. Mobile App Development — Flutter cross-platform iOS/Android (Flutter, Firebase)
3. Web Development — full-stack web apps (Next.js, React, Node.js, Laravel, Spring Boot)
4. Backend & Cloud — APIs, microservices, AWS, Docker, Kubernetes
5. Workflow Automation — n8n, Make.com

NOTABLE PROJECTS:
- AI-Powered Virtual Assistant (React Native, Python, TensorFlow)
- AshFriendly — AI health/fitness app (Flutter, Firebase)
- Geniuso — online learning platform (React, Node.js, MongoDB)

TRUSTED BY: Klokbox (Don Culotty), brainsy.ai (Laura), racquit.com (Akshay), finallyfreeproductions (Saj)

PROCESS: Discovery → Design & Prototyping → Development & Testing → Deployment & Support

ANTI-SPAM RULES (critical — violating these gets emails BLOCKED):
- NEVER include any URLs, links, or web addresses in outreach or follow-up emails
- NEVER mention Calendly, WhatsApp, or any booking links
- NEVER list multiple services — pick ONE
- NEVER list client names in outreach emails
- NEVER use marketing buzzwords like "game-changer", "revolutionary", "cutting-edge"
- Keep sentences short and plain

TONE:
- Write like a real person, not a marketing bot
- Never start with "I hope this email finds you well"
- No exclamation marks. No ALL CAPS.
- Warm, direct, brief
- Sign off: "Best,\\nJubair\\nCEO - DevCenter"
`.trim();

// ─── Helper ──────────────────────────────────────────────────────

async function callAI(prompt, maxTokens = 500) {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Wait longer between retries to avoid rate limits
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
      }
      const response = await client.chat.completions.create({
        model: 'minimax/minimax-m2.5:free',
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: 'You output ONLY valid JSON. No thinking, no explanation, no markdown, no code fences. Just the raw JSON object.' },
          { role: 'user', content: prompt }
        ]
      });
      return response.choices[0].message.content;
    } catch (err) {
      if (err.status === 429 && attempt < maxRetries - 1) {
        console.log(`[AI] Rate limited, retrying in ${(attempt + 2) * 5}s...`);
        continue;
      }
      throw err;
    }
  }
}

function titleCase(str) {
  // Capitalize first letter of each word, then return as-is
  // This ensures subject lines look professional
  return str.split(' ').map((word, i) => {
    if (!word) return word;
    // Always capitalize first word
    if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1);
    // Keep short common words lowercase (unless first word)
    const lower = ['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','with','is'];
    if (lower.includes(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

function parseJsonResponse(text) {
  let result;
  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    result = JSON.parse(clean);
  } catch {
    const subjectMatch = text.match(/"subject"\s*:\s*"([^"]+)"/);
    const bodyMatch = text.match(/"body"\s*:\s*"([\s\S]+?)"\s*[},]/);
    result = {
      subject: subjectMatch?.[1] || 'Quick Question',
      body: bodyMatch?.[1]?.replace(/\\n/g, '\n') || text
    };
  }
  // Ensure subject line uses title case
  if (result.subject) result.subject = titleCase(result.subject);
  return result;
}

// ─── Email Writers ────────────────────────────────────────────────

async function writeOutreachEmail(contact) {
  const prompt = `${COMPANY_CONTEXT}

Write a cold outreach email for this prospect:
- Name: ${contact.Name}
- Company: ${contact.Company || 'their company'}
- Role: ${contact['Role/Title'] || 'not specified'}
- Industry: ${contact.Industry || 'not specified'}
- Extra notes: ${contact.Notes || 'none'}

RULES:
- 3-5 sentences max. Under 60 words.
- Subject line: short, natural, lowercase feel
- Structure:
  1) Reference their specific company/situation in one line
  2) State a specific solution we can build for them (e.g. "a booking app", "a portfolio site with client dashboard", "an AI chatbot for customer support") — be concrete, not vague
  3) Briefly say WHY it helps them (e.g. "so customers can book slots without calling", "so you can convert visitors into paying clients")
  4) Offer to show demos of similar projects we've built before
- NEVER say "happy to share ideas" — instead offer demos of previous work (e.g. "Can share demos of similar projects we built if you'd like a look")
- NEVER say generic things like "we build web and mobile apps" — always name the EXACT solution for THEIR situation
- No URLs. No links. No booking pages.
- Sign off: "Best,\\nJubair\\nCEO - DevCenter"

EXAMPLE OF THE EXACT STYLE TO FOLLOW:
"Hi,\n\nSaw you're running [company] — [specific observation].\n\nWe can build you a [specific solution] so [specific benefit for them].\n\nCan show you demos of similar work we've done if you'd like a look.\n\nBest,\nJubair\nCEO - DevCenter"

Respond ONLY with valid JSON, no markdown, no extra text:
{"subject": "...", "body": "..."}`;

  const text = await callAI(prompt, 500);
  return parseJsonResponse(text);
}

async function writeFollowUpEmail(contact, attempt, state) {
  const prevEmails = state?.conversation
    ?.filter(m => m.direction === 'sent')
    ?.map(m => `Subject: ${m.subject}\n${m.body}`)
    ?.join('\n\n---\n\n') || 'No previous emails on record';

  const prompt = `${COMPANY_CONTEXT}

Write follow-up email #${attempt} for a prospect who hasn't replied:
- Name: ${contact.Name}
- Company: ${contact.Company || 'their company'}
- Role: ${contact['Role/Title'] || 'not specified'}

Previous emails we sent them:
${prevEmails}

RULES:
- Maximum 40 words. Shorter is better.
- Subject line: 2-4 words, lowercase, casual (like "quick follow up" or "still curious")
- Do NOT repeat anything from previous emails
- If attempt #2: keep the door open gracefully, no pressure
- CTA: just ask them to reply. No links. No URLs.

Respond ONLY with valid JSON, no markdown, no extra text:
{"subject": "...", "body": "..."}`;

  const text = await callAI(prompt, 400);
  return parseJsonResponse(text);
}

async function writeReply(contact, incomingEmailText, state) {
  const history = state?.conversation
    ?.map(m => `[${m.direction.toUpperCase()} — ${m.date}]\n${m.subject ? `Subject: ${m.subject}\n` : ''}${m.body}`)
    ?.join('\n\n---\n\n') || 'No prior conversation history';

  const prompt = `${COMPANY_CONTEXT}

A prospect just replied to one of our emails. Write a response.

PROSPECT:
- Name: ${contact.Name}
- Company: ${contact.Company || 'their company'}
- Role: ${contact['Role/Title'] || 'not specified'}

THEIR MESSAGE:
"${incomingEmailText}"

FULL CONVERSATION HISTORY:
${history}

RULES:
- Directly address exactly what they said — don't be generic
- If they asked about services, samples, previous work, or portfolio: include this link naturally: https://www.devcenter.dev/projects
- If they expressed interest or want to discuss: suggest replying to set up a quick call
- If they pushed back or objected, acknowledge it respectfully and keep the door open
- Keep it short — 3-5 sentences max
- Sound like a real person, not a template
- Sign off: "Best,\\nJubair\\nCEO - DevCenter"
- Do NOT include a subject line — write only the email body`;

  return await callAI(prompt, 700);
}

module.exports = { writeOutreachEmail, writeFollowUpEmail, writeReply };
