import type { APIRoute } from "astro";

type ChatBody = {
    message?: unknown;
    history?: unknown;
};

export const POST: APIRoute = async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as ChatBody;

    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
        return new Response(JSON.stringify({ error: "message is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const reply = `受け取ったよ: ${message}`;

    return new Response(JSON.stringify({ reply }), {
        headers: { "Content-Type": "application/json" },
    });
};

// curl -X POST "http://localhost:4321/api/chat"   -H "Content-Type: application/json"   -d '{"message":"test","history":[]}'