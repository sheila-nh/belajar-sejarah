import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConfirmation } from "@/lib/quizFeedback";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { questionId, wasCorrect } = (await req.json()) as { questionId: string; wasCorrect: boolean };
  return NextResponse.json(await getConfirmation(questionId, Boolean(wasCorrect)));
}
