import { useState } from "react";

interface NodeTypeConfig {
  type: string;
  label: string;
  color: string;
  description: string;
}

interface Props {
  nodeTypes: NodeTypeConfig[];
}

export function NodeSidebar({ nodeTypes }: Props) {
  const [search, setSearch] = useState("");

  function onDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  }

  const filtered = search
    ? nodeTypes.filter(
        (nt) =>
          nt.label.toLowerCase().includes(search.toLowerCase()) ||
          nt.description.toLowerCase().includes(search.toLowerCase()),
      )
    : nodeTypes;

  return (
    <aside className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 overflow-hidden">
      <div className="p-4 pb-2">
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Node Types</h3>
        <input
          className="w-full bg-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="text-gray-600 text-xs mt-2">No nodes match</p>
        ) : (
          filtered.map((nt) => (
            <div
              key={nt.type}
              draggable
              onDragStart={(e) => onDragStart(e, nt.type)}
              className={`${nt.color} text-white rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none`}
            >
              <div className="text-sm font-medium">{nt.label}</div>
              <div className="text-xs opacity-75 mt-0.5">{nt.description}</div>
            </div>
          ))
        )}
        <p className="text-xs text-gray-600 mt-2 leading-relaxed">
          Drag onto canvas, connect outputs to inputs.
        </p>
      </div>
    </aside>
  );
}
