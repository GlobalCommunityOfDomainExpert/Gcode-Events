import { NextRequest, NextResponse } from "next/server";
import { checkReplaySig, recordingObject } from "@/server/portal/live";
import { getRecordingObject } from "@/lib/oci/object-storage";

type P = { id: string };

// Streams the stored recording. The URL carries a short-lived signature made
// for one signed-in ticket holder (see liveAccess), because a <video> tag
// cannot send a bearer token. There is no public link to the file.
export async function GET(req: NextRequest, ctx: { params: Promise<P> }) {
  const eventId = Number((await ctx.params).id);
  const q = req.nextUrl.searchParams;
  if (
    !Number.isInteger(eventId) ||
    !checkReplaySig(
      eventId,
      q.get("u") ?? "",
      Number(q.get("e")),
      q.get("s") ?? "",
    )
  )
    return NextResponse.json(
      { error: "This replay link has expired" },
      { status: 403 },
    );
  const object = await recordingObject(eventId);
  if (!object)
    return NextResponse.json({ error: "No replay available" }, { status: 404 });
  try {
    const f = await getRecordingObject(object, req.headers.get("range"));
    const headers = new Headers({
      "Content-Type": f.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    });
    if (f.contentLength) headers.set("Content-Length", f.contentLength);
    if (f.contentRange) headers.set("Content-Range", f.contentRange);
    return new Response(f.body, { status: f.status, headers });
  } catch (err) {
    console.error("[replay]", err);
    return NextResponse.json(
      { error: "Couldn't load the replay" },
      { status: 502 },
    );
  }
}
