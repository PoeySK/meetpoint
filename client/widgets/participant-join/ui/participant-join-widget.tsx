import { ParticipantJoinForm } from "@/features/participant-join";
import { MeetPointBrand } from "@/shared/ui/meetpoint-brand";

type ParticipantJoinWidgetProps = {
  initialRoomCode?: string;
};

export function ParticipantJoinWidget({
  initialRoomCode,
}: ParticipantJoinWidgetProps) {
  return (
    <div className="mp-appointment mp-page">
      <header className="mp-shell py-4 sm:py-6">
        <MeetPointBrand />
      </header>
      <main className="mp-shell pb-10">
        <div className="mx-auto max-w-lg">
          <ParticipantJoinForm initialRoomCode={initialRoomCode} />
        </div>
      </main>
    </div>
  );
}
