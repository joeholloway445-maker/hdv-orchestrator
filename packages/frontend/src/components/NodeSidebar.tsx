import { useState } from "react";

interface NodeTypeConfig {
  type: string;
  label: string;
  color: string;
  description: string;
  category?: string;
}

interface Props {
  nodeTypes: NodeTypeConfig[];
}

export function NodeSidebar({ nodeTypes }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function onDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  }

  function toggleCategory(cat: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const filtered = search
    ? nodeTypes.filter(
        (nt) =>
          nt.label.toLowerCase().includes(search.toLowerCase()) ||
          nt.description.toLowerCase().includes(search.toLowerCase()),
      )
    : nodeTypes;

  const grouped: Record<string, NodeTypeConfig[]> = {};
  for (const nt of filtered) {
    const cat = nt.category || "Other";
    (grouped[cat] = grouped[cat] || []).push(nt);
  }

  return (
    <aside className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 overflow-hidden">
      <div className="p-4 pb-2">
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Nodes</h3>
        <input
          className="w-full bg-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {filtered.length === 0 ? (
          <p className="text-gray-600 text-xs px-4 mt-2">No nodes match</p>
        ) : search ? (
          <div className="px-4 flex flex-col gap-2 mt-2">
            {filtered.map((nt) => (
              <NodeCard key={nt.type} nt={nt} onDragStart={onDragStart} />
            ))}
          </div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full px-4 py-1.5 flex items-center justify-between text-xs text-gray-500 hover:text-gray-300 transition"
              >
                <span className="font-semibold uppercase tracking-wide">{cat}</span>
                <span className="opacity-60">{collapsed.has(cat) ? "▸" : "▾"}</span>
              </button>
              {!collapsed.has(cat) && (
                <div className="px-4 flex flex-col gap-2 pb-2">
                  {items.map((nt) => (
                    <NodeCard key={nt.type} nt={nt} onDragStart={onDragStart} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <p className="text-xs text-gray-600 px-4 mt-3 leading-relaxed">
          Drag onto canvas, connect outputs to inputs.
        </p>
      </div>
    </aside>
  );
}

function NodeCard({ nt, onDragStart }: { nt: NodeTypeConfig; onDragStart: (e: React.DragEvent, t: string) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, nt.type)}
      className={`${nt.color} text-white rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none`}
    >
      <div className="text-sm font-medium">{nt.label}</div>
      <div className="text-xs opacity-75 mt-0.5">{nt.description}</div>
    </div>
  );
}
