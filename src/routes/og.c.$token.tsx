import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FALLBACK_OG_IMAGE =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/4bcdb372-0e17-41c3-bfed-2e3aa64605e7";
const SITE_URL = "https://figurarte.app";

const BOT_UA_REGEX =
  /facebookexternalhit|facebookcatalog|Facebot|Twitterbot|WhatsApp|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|SkypeUriPreview|Embedly|redditbot|Applebot|Googlebot|bingbot|DuckDuckBot|YandexBot|baiduspider|vkShare|W3C_Validator|Iframely|Mastodon/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

async function loadMeta(token: string) {
  if (!/^[a-f0-9]{20,128}$/i.test(token)) return null;
  const { data: participant } = await supabaseAdmin
    .from("event_participants")
    .select(
      "id, event_sessions(name, starts_at, location_name, location_address), events(name, location_name, location_address, cover_image_url, status)",
    )
    .eq("confirmation_token", token)
    .maybeSingle();
  if (!participant) return null;
  const event = participant.events as {
    name: string;
    location_name: string | null;
    location_address: string | null;
    cover_image_url: string | null;
    status: string;
  } | null;
  const session = participant.event_sessions as {
    name: string;
    starts_at: string;
    location_name: string | null;
    location_address: string | null;
  } | null;
  if (!event || !session) return null;

  const startsAt = new Date(session.starts_at);
  const dateStr = startsAt.toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const location = session.location_name ?? event.location_name ?? null;
  return {
    title: event.name,
    description: `Tu invitación para ${session.name} · ${dateStr}${location ? ` · ${location}` : ""}`,
    image: event.cover_image_url || FALLBACK_OG_IMAGE,
  };
}

function renderHtml(meta: { title: string; description: string; image: string }, url: string): string {
  const title = `${meta.title} — Tu entrada`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(meta.description)}" />
<meta name="robots" content="noindex" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeAttr(title)}" />
<meta property="og:description" content="${escapeAttr(meta.description)}" />
<meta property="og:image" content="${escapeAttr(meta.image)}" />
<meta property="og:url" content="${escapeAttr(url)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeAttr(title)}" />
<meta name="twitter:description" content="${escapeAttr(meta.description)}" />
<meta name="twitter:image" content="${escapeAttr(meta.image)}" />
<link rel="canonical" href="${escapeAttr(url)}" />
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(meta.description)}</p>
</body>
</html>`;
}

function renderFallbackHtml(url: string): string {
  const title = "Tu entrada — FIGURARTE";
  const description = "Tu invitación de FIGURARTE";
  return renderHtml({ title, description, image: FALLBACK_OG_IMAGE }, url);
}

export const Route = createFileRoute("/og/c/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = params.token;
        const ua = request.headers.get("user-agent") ?? "";
        const isBot = BOT_UA_REGEX.test(ua);
        const publicUrl = `${SITE_URL}/og/c/${token}`;

        if (!isBot) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/c/${encodeURIComponent(token)}/entrada`,
              "Cache-Control": "no-store",
            },
          });
        }

        const meta = await loadMeta(token);
        const html = meta ? renderHtml(meta, publicUrl) : renderFallbackHtml(publicUrl);
        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
          },
        });
      },
    },
  },
});