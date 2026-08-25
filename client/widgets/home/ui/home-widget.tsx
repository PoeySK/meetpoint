import { CreateRoomForm } from "@/features/create-room";
import { HomeHero } from "./home-hero";

export function HomeWidget() {
  return (
    <main className="mp-page px-4 py-5 font-sans text-slate-950 sm:px-6 sm:py-8">
      <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <HomeHero />
        <CreateRoomForm />
      </div>
    </main>
  );
}
