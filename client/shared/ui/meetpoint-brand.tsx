import Link from "next/link";

export function MeetPointBrand() {
  return (
    <Link aria-label="MeetPoint 홈" className="mp-brand" href="/">
      <span aria-hidden="true" className="mp-brand-mark">
        <span className="mp-map-pin" />
      </span>
      MeetPoint
    </Link>
  );
}
