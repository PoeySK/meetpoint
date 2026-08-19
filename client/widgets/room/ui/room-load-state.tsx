import type { RoomLoadError } from '../model/use-room-session';
import Link from 'next/link';

export function LoadingView() {
  return (
    <div className='flex min-h-[60vh] items-center justify-center'>
      <div className='rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm'>
        <div className='mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600' />
        <p className='text-sm font-medium text-slate-600'>
          방 정보를 불러오는 중...
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
    <div className='mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center'>
      <section
        aria-live='polite'
        className='w-full rounded-4xl border border-rose-100 bg-white p-6 text-center shadow-xl shadow-slate-200/50 sm:p-10'
      >
        <div className='mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-xl text-rose-600'>
          !
        </div>
        <h1 className='text-2xl font-semibold tracking-tight text-slate-950'>
          {error.title}
        </h1>
        <p className='mt-3 text-sm leading-6 text-slate-500'>{error.message}</p>
        <div className='mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center'>
          <button
            className='rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200'
            onClick={onRetry}
            type='button'
          >
            다시 시도
          </button>
          <Link
            className='rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950'
            href='/join'
          >
            방 코드로 다시 입장
          </Link>
        </div>
      </section>
    </div>
  );
}
