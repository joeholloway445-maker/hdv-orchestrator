import { useRef, useState, useEffect } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suggestions?: string[];
  className?: string;
  multiline?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  "$input",
  "$input.body",
  "$input.headers",
  "$input.query",
  "$input._error",
  "$input._branch",
  "$input._switch",
];

export function ExpressionInput({ value, onChange, placeholder, suggestions, className, multiline }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [cursorPos, setCursorPos] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const allSuggestions = suggestions?.length ? suggestions : DEFAULT_SUGGESTIONS;

  function handleInput(raw: string, pos: number) {
    onChange(raw);
    // Check if we're inside {{ }}
    const before = raw.slice(0, pos);
    const m = before.match(/\{\{([^}]*)$/);
    if (m) {
      const partial = m[1].trim();
      const filtered = allSuggestions.filter((s) => s.startsWith(partial) && s !== partial);
      setMenuItems(filtered);
      setShowMenu(filtered.length > 0);
      setActiveIdx(0);
    } else {
      setShowMenu(false);
    }
    setCursorPos(pos);
  }

  function applySuggestion(suggestion: string) {
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);
    // Replace the partial expression after {{
    const m = before.match(/^([\s\S]*\{\{)([^}]*)$/);
    if (m) {
      const newVal = m[1] + suggestion + "}}" + after;
      onChange(newVal);
    }
    setShowMenu(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showMenu) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, menuItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySuggestion(menuItems[activeIdx]); }
    if (e.key === "Escape") setShowMenu(false);
  }

  useEffect(() => {
    if (!showMenu) return;
    function handler(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const sharedProps = {
    ref: inputRef as any,
    value,
    placeholder: placeholder ?? "value or {{$input.field}}",
    onKeyDown: handleKeyDown,
    onBlur: () => setTimeout(() => setShowMenu(false), 150),
    className: className ?? "w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500",
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          {...sharedProps}
          rows={3}
          onChange={(e) => handleInput(e.target.value, e.target.selectionStart ?? 0)}
        />
      ) : (
        <input
          {...sharedProps}
          type="text"
          onChange={(e) => handleInput(e.target.value, e.target.selectionStart ?? 0)}
        />
      )}
      {showMenu && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 w-full bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto">
          {menuItems.map((item, idx) => (
            <li
              key={item}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(item); }}
              className={`px-3 py-1.5 text-xs cursor-pointer font-mono ${idx === activeIdx ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
