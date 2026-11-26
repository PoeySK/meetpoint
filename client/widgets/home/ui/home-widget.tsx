"use client";

import { CreateRoomForm } from "@/features/create-room";
import { MeetPointBrand } from "@/shared/ui/meetpoint-brand";
import Link from "next/link";
import { useRef } from "react";
import styles from "./home-widget.module.css";

const sampleCandidates = [
  { name: "성수 골목 식당", time: "금요일 오후 7:00", cost: "25,000원", tag: "조용한 곳" },
  { name: "서울숲 브런치", time: "토요일 오후 12:30", cost: "22,000원", tag: "야외 좌석" },
];

export function HomeWidget() {
  const createDialog = useRef<HTMLDialogElement>(null);
  const sampleDialog = useRef<HTMLDialogElement>(null);
  const featuredCandidate = sampleCandidates[0];

  return (
    <div className="mp-appointment mp-page">
      <header className="mp-shell flex items-center justify-between gap-3 py-4 sm:py-6">
        <MeetPointBrand />
        <Link className="mp-button mp-button-secondary text-center" href="/join">
          방 코드로 입장하기
        </Link>
      </header>

      <main className="mp-shell">
        <section aria-labelledby="home-intro-heading" className={styles.hero}>
          <div>
            <h1 className={styles.title} id="home-intro-heading">
              이번엔,<br /><span>어디서 만날까?</span>
            </h1>
            <p className={`${styles.intro} max-w-sm text-balance`}>
              친구들과 시간·장소 후보를 같이 보고, 우리 모임에 맞는 약속을 골라요.
            </p>
            <button
              className="mp-button mp-button-primary min-h-12 px-5 text-base"
              onClick={() => {
                const dialog = createDialog.current;
                dialog?.showModal();
                dialog?.querySelector("input")?.focus();
              }}
              type="button"
            >
              약속 방 만들기
            </button>
          </div>

          <div className={styles.scene}>
            <div aria-hidden="true" className={styles.map}>
              <span className={styles.road} />
              <span className={styles.secondRoad} />
              <span className={styles.route} />
              <span className={styles.park} />
              <span className={`mp-map-pin ${styles.marker}`} />
              <span className={`mp-map-pin ${styles.marker} ${styles.markerLow}`} />
            </div>
            <span aria-hidden="true" className={`${styles.bubble} ${styles.bubbleTop}`}>
              <strong>✓</strong> 지우 · 저녁 OK!
            </span>
            <article aria-label="예시 약속 방 미리보기" className={styles.preview}>
              <div className={styles.previewHeading}>
                <strong>퇴근하고 한 끼</strong>
                <span className="mp-status">예시 방</span>
              </div>
              <h2>{featuredCandidate.name}</h2>
              <p>{featuredCandidate.time} · 1인 {featuredCandidate.cost}</p>
              <div className={styles.previewProgress}>
                <span aria-hidden="true" className={styles.avatars}>
                  <span>지</span><span>현</span><span>민</span><span>수</span>
                </span>
                <span>4명 중 2명 응답</span>
              </div>
              <button
                className={`mp-button ${styles.sampleButton}`}
                onClick={() => sampleDialog.current?.showModal()}
                type="button"
              >
                예시 방 둘러보기
              </button>
            </article>
            <span aria-hidden="true" className={`${styles.bubble} ${styles.bubbleBottom}`}>
              현우 · 가기 편해요
            </span>
          </div>
        </section>
      </main>

      <dialog aria-labelledby="create-room-heading" className="mp-dialog" ref={createDialog}>
        <button
          aria-label="방 만들기 닫기"
          className="mp-button mp-button-secondary absolute right-4 top-4 min-h-11 min-w-11 p-0 text-xl sm:right-6 sm:top-6"
          onClick={() => createDialog.current?.close()}
          type="button"
        >
          ×
        </button>
        <CreateRoomForm />
      </dialog>

      <dialog aria-labelledby="sample-room-heading" className="mp-dialog" ref={sampleDialog}>
        <div className="space-y-4 p-4 sm:p-6">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="mp-status">예시 방</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight" id="sample-room-heading">
                퇴근하고 한 끼
              </h2>
              <p className="mt-1 text-sm text-[var(--mp-muted)]">4명 중 2명 응답</p>
            </div>
            <button
              aria-label="예시 방 닫기"
              className="mp-button mp-button-secondary min-h-11 min-w-11 p-0 text-xl"
              onClick={() => sampleDialog.current?.close()}
              type="button"
            >
              ×
            </button>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            {sampleCandidates.map((candidate) => (
              <article className="mp-card mp-candidate space-y-2 p-3" key={candidate.name}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <h3 className="text-lg font-bold tracking-tight">{candidate.name}</h3>
                  <p className="mp-candidate-tag">{candidate.tag}</p>
                </div>
                <p className="text-sm leading-5 text-[var(--mp-muted)]">
                  {candidate.time} · 1인 {candidate.cost}
                </p>
              </article>
            ))}
          </div>
        </div>
      </dialog>
    </div>
  );
}
