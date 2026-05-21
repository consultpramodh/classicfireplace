export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN || "2JhBST2peN5oKJL4Y4OjuR7jKuubohhfkKN_AAJoIMQ";
  return new Response(token, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
