import type { RoomLoadError } from '../model/use-room-session';
import Link from 'next/link';

export function LoadingView() {
  return (
    <div className='flex min-h-[48vh] items-center justify-center'>
      <div className='mp-card px-5 py-4 text-center'>
        <div className='mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600' />
        <p className='text-sm font-medium text-slate-600'>
          방을 준비하는 중...
        </p>
      </div>
    </div>
  );
}

export function ErrorView({
  error,
  onRetry,
}: {
  error: RoomLoadError;
  onRetry: () => void;
}) {
  return (
    <div className='mx-auto flex min-h-[48vh] w-full max-w-lg items-center justify-center'>
      <section
        aria-live='polite'
        className='mp-card mp-card-raised w-full border-rose-100 p-5 text-center sm:p-7'
      >
        <div className='mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-lg text-rose-600'>
          !
        </div>
        <h1 className='text-2xl font-semibold tracking-tight text-slate-950'>
          {error.title}
        </h1>
        <p className='mt-3 text-sm leading-6 text-slate-500'>{error.message}</p>
        <div className='mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center'>
          <button
            className='mp-button mp-button-primary'
            onClick={onRetry}
            type='button'
          >
            다시 불러오기
          </button>
          <Link
            className='mp-button mp-button-secondary'
            href='/'
          >
            새 방 만들기
          </Link>
          <Link
            className='mp-button mp-button-secondary'
            href='/join'
          >
            새 MEMBER로 입장
          </Link>
        </div>
      </section>
    </div>
  );
}
