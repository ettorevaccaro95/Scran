# Scran website

Scran with its own AI planner, ready to put online with Netlify.

```
public/index.html            the app
netlify/functions/plan.mjs   the AI planner (runs on the server, keeps your API key secret)
netlify.toml                 tells Netlify where things are
```

## How the AI works
The app builds the meal-plan request in the browser (your answers, your kitchen, the price list) and sends it to `/api/plan`. The server function adds your Claude API key, asks Claude, and streams the plan back line by line, so meals appear as they're written. If the AI can't be reached, the app fills the week with its 38 built-in dinners and 16 lunches, so it never breaks.

The function only accepts Scran's own meal-plan requests, caps the size of each answer, and limits each visitor to 20 plans an hour.

## Put it online (about 5 minutes)

1. **Deploy to Netlify.** Either:
   - put this folder in a GitHub repo, then in Netlify choose *Add new site > Import an existing project* and pick the repo, or
   - from this folder run `npx netlify-cli deploy --prod` and follow the prompts.

   Dragging the folder onto Netlify Drop only uploads the page, not the AI function, so use one of the two options above.
2. **That's it for the AI.** Netlify's AI Gateway gives the function a Claude key automatically and bills usage as Netlify credits, so you don't need your own API key. Keep an eye on credit use in Netlify, and set up auto recharge or a credit pack if lots of people use it.

**Using your own Claude API key instead:** add `ANTHROPIC_API_KEY` under *Project configuration > Environment variables* (scope: Functions) and redeploy. Netlify then leaves it alone and the function calls Claude directly, billed to your Claude Console account.

Optional settings (also environment variables):
- `ANTHROPIC_MODEL`: defaults to `claude-haiku-5-5`, which is fast and cheap. `claude-sonnet-5-5` writes better recipes but is slower, and Netlify stops a streamed reply after 60 seconds, so a full week with lunches may get cut short (the app fills any gaps with built-in recipes).
- `PLANS_PER_HOUR`: plans each visitor can make an hour. Default 20.

## Cost
A week's plan is roughly 5,000 tokens in and up to 8,000 out. At Claude Haiku 5.5's listed starting price (from $0.10 per million input tokens and $0.50 per million output tokens) that's well under a penny a plan. Through Netlify's AI Gateway, $1 of model use costs 180 Netlify credits, and the Free plan allows up to 90 credits of AI use a minute across your team. See https://docs.netlify.com/build/ai-gateway/overview for details.

## Prices, postcodes and calories
- Prices: real Tesco shelf prices checked on 21 October 2026. Other supermarkets are estimated from Which?'s September 2026 basket comparison. They don't update by themselves.
- Postcodes: ONS Postcode Directory data (Open Government Licence v3.0), built into the page.
- Calories: estimates from standard UK nutrition values.
