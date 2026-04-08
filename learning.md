# Learning Notes

Notes and concepts learned while building the Twitter/X Research Scraper. Updated as questions come up during development.

---

## Modular Architecture (Files per Responsibility)

Each file in a Node.js project should have **one job**. This makes code easier to debug, test, and swap out. For example:
- `scorer.js` only scores tweets
- `telegram.js` only sends Telegram messages
- `index.js` is the "glue" that connects everything

**Rule of thumb:** If your logic has distinct responsibilities that could change independently, split them into separate files. If it fits in your head as one thing, keep it in one file.

---

## Monolith vs Microservices — When to Split

**The scale ladder:**
```
Small project:  separate FUNCTIONS in one file
Medium project: separate FILES in one codebase        ← this project
Large project:  separate SERVICES with own databases
Huge project:   separate TEAMS owning separate services
```

**Start with a monolith.** Even Stripe started as one codebase. Only split when you feel real pain — like one feature slowing down everything else, or different teams needing to deploy independently.

**Example:** A car dealership SaaS with a voice engine. At 10 users, everything in one codebase works fine. At 5,000 users, the voice engine (CPU-heavy) starts slowing down the dashboard. Solution: pull the voice engine into its own service (own repo, own server). The main app and voice service talk to each other via:

1. **Synchronous API** — "transcribe this clip now, I'll wait" (good for quick operations)
2. **Message queue** — "here's a recording, process it when you can" (good for heavy/slow work where the user doesn't need an instant answer)
3. **Webhooks** — the voice service calls BACK when done: "that transcription you asked for? Here it is" (good for long-running tasks)

Most real setups use a mix of all three.

**Key benefit of splitting:** each service runs on its own server with its own resources. The voice engine can be on a beefy machine with lots of CPU. The dashboard can be on a cheap server optimised for fast web responses. They don't compete for resources anymore.

---

## Softmax Selection (Smart Randomised Picking)

Instead of always picking the top-scoring items (boring, predictable), **softmax** converts scores into probabilities. Higher score = higher chance of being picked, but lower scores still have a shot.

**Temperature** controls randomness:
- Low (0.5) = almost always picks the top scorers
- High (3.0) = nearly random
- Ours (1.5) = balanced — favours high scores with occasional surprises

This is a technique from machine learning, used here to surface unexpected but still good tweets.

---

## Factory Pattern (Swappable Components)

`createScraper('apify')` returns a scraper that uses Apify. If we switch to SocialData.tools, we add a new implementation and change one line. The rest of the app doesn't know or care which provider is behind it.

This is called the **factory pattern** — a function that creates objects based on a parameter. Useful when you might need to swap out a component later.

---

## Environment Variables and dotenv

API keys and secrets live in a `.env` file (never committed to git). The `dotenv` library reads this file at startup and puts the values into `process.env.WHATEVER`. This way:
- Secrets never end up in your code
- Different environments (local, VPS) can have different values
- You can share the codebase without sharing credentials

---

## Upsert (Insert or Skip)

"Upsert" = "insert this row, but if it already exists, skip it." We use this because the same tweet might appear in multiple keyword searches. Instead of crashing on duplicates, the database quietly ignores the second copy. The `ON CONFLICT DO NOTHING` SQL clause handles this.
