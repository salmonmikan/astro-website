import type { APIRoute } from "astro";
import { GoogleGenAI } from "@google/genai";

type SearchBody = {
    query?: unknown;
    debug?: unknown; // boolean
    raw?: unknown;   // boolean
    model?: unknown; // string (optional)
};

const normalize = (s: unknown) =>
    String(s ?? "")
        .replace(/\s+/g, " ")
        .trim();

const truncate = (s: unknown, n = 220) => {
    const t = normalize(s);
    return t.length > n ? t.slice(0, n) + "…" : t;
};

export const POST: APIRoute = async (ctx) => {
    const { request, locals } = ctx as unknown as {
        request: Request;
        locals: {
            runtime?: {
                env?: Record<string, string | undefined>;
            };
        };
    };

    // Cloudflare adapter 経由だと env は locals.runtime.env に入る想定
    const env = locals?.runtime?.env ?? {};

    const apiKey = env.GEMINI_API_KEY;
    const storeName = env.GEMINI_FILE_SEARCH_STORE;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY is required" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
    if (!storeName) {
        return new Response(
            JSON.stringify({
                error: "GEMINI_FILE_SEARCH_STORE is required (e.g. fileSearchStores/xxxx)",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    const body = (await request.json().catch(() => ({}))) as SearchBody;

    const query = typeof body.query === "string" ? body.query.trim() : "";
    const debug = body.debug === true;
    const raw = body.raw === true;
    const model = typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "gemini-2.5-flash";

    if (!query) {
        return new Response(JSON.stringify({ error: "query is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const ai = new GoogleGenAI({ apiKey });

    const res = await ai.models.generateContent({
        model,
        contents: query,
        config: {
            tools: [
                {
                    fileSearch: {
                        fileSearchStoreNames: [storeName],
                    },
                },
            ],
        },
    });

    const answer = res.text ?? "(no text)";
    const gm = res?.candidates?.[0]?.groundingMetadata;

    // raw指定なら groundingMetadata をそのまま返す
    if (raw) {
        return new Response(
            JSON.stringify(
                {
                    answer,
                    groundingMetadata: gm ?? null,
                },
                null,
                2
            ),
            { headers: { "Content-Type": "application/json" } }
        );
    }

    // debug指定なら pretty を返す（node版に寄せる）
    if (debug && gm) {
        const chunks = (gm.groundingChunks ?? []).map((c: any, i: number) => {
            const rc = c?.retrievedContext ?? {};
            return {
                idx: i,
                title: rc.title ?? "(no title)",
                store: rc.fileSearchStore ?? "",
                text: rc.text ?? "",
                snippet: truncate(rc.text ?? "", 260),
            };
        });

        const supports = (gm.groundingSupports ?? []).map((s: any, i: number) => {
            const segText = s?.segment?.text ?? "";
            const inds = s?.groundingChunkIndices ?? [];
            return {
                idx: i,
                segment: truncate(segText, 180),
                chunkIndices: inds,
            };
        });

        return new Response(
            JSON.stringify(
                {
                    answer,
                    sources: chunks.map((c) => ({
                        idx: c.idx,
                        title: c.title,
                        snippet: c.snippet,
                    })),
                    supports: supports.map((s) => ({
                        idx: s.idx,
                        segment: s.segment,
                        refs: (s.chunkIndices ?? []).map((ci: number) => ({
                            chunkIndex: ci,
                            title: chunks[ci]?.title ?? `chunk#${ci}`,
                        })),
                    })),
                },
                null,
                2
            ),
            { headers: { "Content-Type": "application/json" } }
        );
    }

    // 通常は回答だけ
    return new Response(JSON.stringify({ answer }), {
        headers: { "Content-Type": "application/json" },
    });
};