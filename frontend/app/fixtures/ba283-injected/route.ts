import { fixtureResponse } from "../../../lib/fixtures";

export const dynamic = "force-dynamic";

export function GET() {
  return fixtureResponse("ba283-injected");
}
