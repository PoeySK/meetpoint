import { CreateRoomForm } from "@/features/create-room";
import { HomeHero } from "./home-hero";

export function HomeWidget() {
  return (
    <main className="mp-page px-4 py-5 font-sans text-slate-950 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-lg space-y-5 sm:pt-8">
        <HomeHero />
        <CreateRoomForm />
      </div>
    </main>
  );
}
