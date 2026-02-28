import { Users } from 'lucide-react';

export type ParticipantEntry = {
  faceId: number;
  name: string;
  firstSeen: string;
};

interface ParticipantListProps {
  participants: ParticipantEntry[];
  faceCount?: number;
  selectedFaceId: number | null;
  onSelectFaceId: (faceId: number | null) => void;
}

const FACE_COLORS: Record<number, { ring: string; bg: string; text: string; dot: string }> = {
  0: { ring: 'ring-cyan-500', bg: 'bg-cyan-900/30', text: 'text-cyan-300', dot: 'bg-cyan-400' },
  1: { ring: 'ring-violet-500', bg: 'bg-violet-900/30', text: 'text-violet-300', dot: 'bg-violet-400' },
  2: { ring: 'ring-amber-500', bg: 'bg-amber-900/30', text: 'text-amber-300', dot: 'bg-amber-400' },
  3: { ring: 'ring-emerald-500', bg: 'bg-emerald-900/30', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  4: { ring: 'ring-pink-500', bg: 'bg-pink-900/30', text: 'text-pink-300', dot: 'bg-pink-400' },
  5: { ring: 'ring-orange-500', bg: 'bg-orange-900/30', text: 'text-orange-300', dot: 'bg-orange-400' },
};

const getFaceColor = (faceId: number) => FACE_COLORS[faceId] ?? FACE_COLORS[0];

export function ParticipantList({ participants, faceCount, selectedFaceId, onSelectFaceId }: ParticipantListProps) {
  const MAX_PARTICIPANTS = 20;
  const totalSlots = Math.min(Math.max(participants.length, faceCount ?? 0), MAX_PARTICIPANTS);
  const slots: ParticipantEntry[] = Array.from({ length: totalSlots }, (_, i) =>
    participants.find((p) => p.faceId === i) ?? { faceId: i, name: `Participant ${i + 1}`, firstSeen: new Date().toISOString() }
  );

  if (slots.length === 0) return null;

  return (
    <div className="col-span-3 bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-gray-400" />
        <h3 className="text-white text-lg">Participants</h3>
        {selectedFaceId !== null && (
          <button onClick={() => onSelectFaceId(null)} className="ml-auto text-xs text-gray-400 hover:text-white transition-colors">
            Clear filter
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {slots.map((p) => {
          const colors = getFaceColor(p.faceId);
          const isSelected = selectedFaceId === p.faceId;
          const isFiltering = selectedFaceId !== null;
          return (
            <button
              key={p.faceId}
              onClick={() => onSelectFaceId(isSelected ? null : p.faceId)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 cursor-pointer ${colors.bg} ${colors.text} ${isSelected ? `ring-2 ${colors.ring} border-transparent` : 'border-gray-700 hover:border-gray-500'} ${isFiltering && !isSelected ? 'opacity-50' : 'opacity-100'}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
              <span className="truncate max-w-[160px]">{p.name}</span>
              <span className="text-gray-500 text-xs font-mono ml-1">F{p.faceId}</span>
            </button>
          );
        })}
      </div>
      {selectedFaceId !== null && (
        <p className="text-gray-500 text-xs mt-3">
          Showing alerts for <span className="text-gray-300">{slots.find((p) => p.faceId === selectedFaceId)?.name ?? `Participant ${selectedFaceId + 1}`}</span> only
        </p>
      )}
    </div>
  );
}
