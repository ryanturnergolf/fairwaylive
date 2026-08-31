"use client";

export default function FavoriteStar({ selected, label, onToggle, className = "" }: { selected: boolean; label: string; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`${selected ? "Remove" : "Add"} ${label} ${selected ? "from" : "to"} favorites`}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`flex min-h-12 min-w-12 items-center justify-center rounded-full text-2xl text-[#B8892D] hover:bg-[#F6F1E6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D2E] ${className}`}
    >
      <span aria-hidden>{selected ? "★" : "☆"}</span>
    </button>
  );
}
