import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getHints } from "@/lib/quizFeedback";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { questionId } = (await req.json()) as { questionId: string };
  return NextResponse.json(await getHints(questionId));
}
