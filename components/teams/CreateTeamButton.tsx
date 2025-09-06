'use client';
import { useState } from 'react';
import CreateTeamDialog from './CreateTeamDialog';

export default function CreateTeamButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={['rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700', className].join(' ')}>
        Создать команду
      </button>
      {open && <CreateTeamDialog onClose={() => setOpen(false)} />}
    </>
  );
}