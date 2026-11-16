import JobBoard from "@/components/job-board";
import snapshot from "@/public/jobs.json";
import { parseFeed } from "@/lib/jobs";

export default function Home() {
  return <JobBoard initialFeed={parseFeed(snapshot)} />;
}
