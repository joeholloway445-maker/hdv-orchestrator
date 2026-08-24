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
  function onDragStart(e: React.DragEvent, type: string) {
    e.dataTransfer.setData("application/reactflow", type);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="w-56 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-2 shrink-0 overflow-y-auto">
      <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
        Node Types
      </h3>
      {nodeTypes.map((nt) => (
        <div
          key={nt.type}
          draggable
          onDragStart={(e) => onDragStart(e, nt.type)}
          className={`${nt.color} text-white rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none`}
        >
          <div className="text-sm font-medium">{nt.label}</div>
          <div className="text-xs opacity-75 mt-0.5">{nt.description}</div>
        </div>
      ))}
      <p className="text-xs text-gray-600 mt-3 leading-relaxed">
        Drag a node onto the canvas, then connect outputs to inputs.
      </p>
    </aside>
  );
}
