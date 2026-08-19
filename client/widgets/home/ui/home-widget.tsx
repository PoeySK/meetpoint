import { CreateRoomForm } from "@/features/create-room";
import { HomeHero } from "./home-hero";

export function HomeWidget() {
  return (
    <main className="min-h-screen bg-[#f6f7f3] px-4 py-8 font-sans text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <HomeHero />
        <CreateRoomForm />
      </div>
    </main>
  );
}
