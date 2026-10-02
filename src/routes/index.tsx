import { createFileRoute } from "@tanstack/react-router";
import { CellonApp } from "@/components/cellon-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <CellonApp />;
}
